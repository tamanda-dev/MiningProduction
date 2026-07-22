from celery.result import AsyncResult
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from audit.services import log_event
from core import scoping
from core.export_tracking import is_export_owner, record_export_owner
from core.mixins import SiteScopedOrOwnQuerySetMixin, SiteScopedQuerySetMixin
from core.permissions import ReadOnlyOrAdmin, ReadOnlyOrSupervisorOrAbove
from dashboard.serializers import ExportStatusSerializer
from dashboard.views import _require_site_access
from entries.views import BulkSyncMixin

from . import services
from .models import (
    BreakdownCause,
    BreakdownIncident,
    ChecklistItem,
    HourlyBreakdownEntry,
    HourlyChecklistEntry,
    HourlySlot,
    ShiftCrushingSummary,
)
from .permissions import CanWriteBreakdownIncident, CanWriteCrusherOpsEntry
from .reporting import breakdown_pareto_by_cause, checklist_compliance_heatmap, mttr_mtbf_trend
from .serializers import (
    BreakdownCauseSerializer,
    BreakdownIncidentAssignSerializer,
    BreakdownIncidentResolveSerializer,
    BreakdownIncidentSerializer,
    BreakdownParetoRowSerializer,
    ChecklistHeatmapRowSerializer,
    ChecklistItemSerializer,
    HourlyBreakdownEntrySerializer,
    HourlyChecklistEntrySerializer,
    HourlySlotSerializer,
    MttrMtbfTrendPointSerializer,
    ShiftCrushingSummarySerializer,
)
from .tasks import generate_crusher_plant_report


class BreakdownCauseViewSet(ModelViewSet):
    queryset = BreakdownCause.objects.all()
    serializer_class = BreakdownCauseSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("active", "is_other")
    search_fields = ("name", "code")


class ChecklistItemViewSet(ModelViewSet):
    queryset = ChecklistItem.objects.all()
    serializer_class = ChecklistItemSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("active",)
    search_fields = ("name", "code")


class HourlySlotViewSet(ModelViewSet):
    queryset = HourlySlot.objects.select_related("site").all()
    serializer_class = HourlySlotSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("site", "active")


class HourlyChecklistEntryViewSet(BulkSyncMixin, SiteScopedOrOwnQuerySetMixin, ModelViewSet):
    queryset = HourlyChecklistEntry.objects.select_related(
        "site", "crusher", "hourly_slot", "checklist_item", "shift_instance", "operator", "recorded_by"
    ).all()
    serializer_class = HourlyChecklistEntrySerializer
    permission_classes = (CanWriteCrusherOpsEntry,)
    filterset_fields = ("site", "crusher", "shift_instance", "hourly_slot", "checklist_item", "status")
    site_lookup = "site_id"


class HourlyBreakdownEntryViewSet(BulkSyncMixin, SiteScopedOrOwnQuerySetMixin, ModelViewSet):
    queryset = HourlyBreakdownEntry.objects.select_related(
        "site", "crusher", "hourly_slot", "shift_instance", "operator", "recorded_by"
    ).prefetch_related("causes").all()
    serializer_class = HourlyBreakdownEntrySerializer
    permission_classes = (CanWriteCrusherOpsEntry,)
    filterset_fields = ("site", "crusher", "shift_instance", "hourly_slot", "status")
    site_lookup = "site_id"


class BreakdownIncidentViewSet(BulkSyncMixin, ModelViewSet):
    """Not SiteScopedOrOwnQuerySetMixin — that mixin ORs in a single owner
    field, but a BreakdownIncident has *two* legitimate non-site-access
    reasons to be visible: the reporting operator (who may hold no
    UserSiteAccess at all, same as any operator) AND the assigned artisan
    (who likewise typically holds none and isn't the reporter). Both are
    handled explicitly below.
    """

    queryset = BreakdownIncident.objects.select_related(
        "site", "section", "crusher", "shift_instance", "artisan", "cause", "reported_by", "recorded_by"
    ).all()
    serializer_class = BreakdownIncidentSerializer
    permission_classes = (CanWriteBreakdownIncident,)
    filterset_fields = {
        "site": ["exact"],
        "crusher": ["exact"],
        "shift_instance": ["exact"],
        "artisan": ["exact"],
        "status": ["exact", "in"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()

        site_ids = scoping.accessible_site_ids(user)
        if site_ids is None:
            return qs
        return qs.filter(Q(site_id__in=site_ids) | Q(reported_by_id=user.id) | Q(artisan_id=user.id))

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """Supervisor+-only, even though CanWriteBreakdownIncident's object
        check might otherwise let the reporting operator through while the
        incident is still 'open' — assigning an artisan is a supervisory
        call, not a reporter action.
        """
        if not scoping.is_supervisor(request.user):
            raise PermissionDenied("Only a Supervisor/Admin may assign an artisan.")
        incident = self.get_object()
        serializer = BreakdownIncidentAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        artisan = serializer.validated_data["artisan"]

        incident.artisan = artisan
        if incident.status == BreakdownIncident.STATUS_OPEN:
            incident.status = BreakdownIncident.STATUS_IN_PROGRESS
        incident.save(update_fields=["artisan", "status", "updated_at"])
        log_event(
            action="breakdownincident.assign", actor=request.user, target=incident, changes={"artisan": artisan.id}
        )
        return Response(BreakdownIncidentSerializer(incident).data)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Supervisor+ or the assigned artisan (enforced by
        CanWriteBreakdownIncident's object check, since a non-resolved
        incident is writable by both). Requires root_cause_of_failure and
        remedial_action_taken; sets time_completed + status='resolved';
        recomputes the affected ShiftCrushingSummary if one exists.
        """
        incident = self.get_object()
        serializer = BreakdownIncidentResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data.get("time_completed") and not scoping.is_supervisor(request.user):
            raise PermissionDenied("Only a Supervisor/Admin may set an explicit (backdated) completion time.")

        incident.root_cause_of_failure = data["root_cause_of_failure"]
        incident.remedial_action_taken = data["remedial_action_taken"]
        incident.time_completed = data.get("time_completed") or timezone.now()
        incident.status = BreakdownIncident.STATUS_RESOLVED
        incident.save(
            update_fields=["root_cause_of_failure", "remedial_action_taken", "time_completed", "status", "updated_at"]
        )

        summary = ShiftCrushingSummary.objects.filter(
            crusher=incident.crusher, shift_instance=incident.shift_instance
        ).first()
        if summary is not None:
            services.recompute_shift_crushing_summary(summary)

        return Response(BreakdownIncidentSerializer(incident).data)


class ShiftCrushingSummaryViewSet(SiteScopedQuerySetMixin, ModelViewSet):
    queryset = ShiftCrushingSummary.objects.select_related("site", "crusher", "shift_instance", "recorded_by").all()
    serializer_class = ShiftCrushingSummarySerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = ("site", "crusher", "shift_instance", "status")
    site_lookup = "site_id"

    @action(detail=True, methods=["post"])
    def recompute(self, request, pk=None):
        summary = self.get_object()
        services.recompute_shift_crushing_summary(summary)
        return Response(ShiftCrushingSummarySerializer(summary).data)


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("date_from", OpenApiTypes.DATE, required=False),
        OpenApiParameter("date_to", OpenApiTypes.DATE, required=False),
    ],
    responses=BreakdownParetoRowSerializer(many=True),
)
class CrusherBreakdownParetoView(APIView):
    """Breakdown Pareto by cause — see crusher_ops.reporting.breakdown_pareto_by_cause."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        return Response(
            breakdown_pareto_by_cause(
                site_id,
                date_from=request.query_params.get("date_from"),
                date_to=request.query_params.get("date_to"),
            )
        )


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("crusher", OpenApiTypes.INT, required=False),
        OpenApiParameter("date_from", OpenApiTypes.DATE, required=False),
        OpenApiParameter("date_to", OpenApiTypes.DATE, required=False),
        OpenApiParameter("group_by", OpenApiTypes.STR, required=False),
    ],
    responses=MttrMtbfTrendPointSerializer(many=True),
)
class CrusherMttrMtbfTrendView(APIView):
    """MTTR/MTBF trend — see crusher_ops.reporting.mttr_mtbf_trend."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        return Response(
            mttr_mtbf_trend(
                site_id,
                crusher_id=request.query_params.get("crusher"),
                date_from=request.query_params.get("date_from"),
                date_to=request.query_params.get("date_to"),
                group_by=request.query_params.get("group_by", "day"),
            )
        )


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("shift_instance", OpenApiTypes.INT, required=True),
        OpenApiParameter("crusher", OpenApiTypes.INT, required=False),
    ],
    responses=ChecklistHeatmapRowSerializer(many=True),
)
class CrusherChecklistHeatmapView(APIView):
    """Checklist compliance heat-map — see crusher_ops.reporting.checklist_compliance_heatmap."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        shift_instance_id = request.query_params.get("shift_instance")
        if not shift_instance_id:
            raise ValidationError({"shift_instance": "Required query parameter."})
        return Response(
            checklist_compliance_heatmap(
                site_id, shift_instance_id, crusher_id=request.query_params.get("crusher")
            )
        )


class CrusherPlantExportRequestSerializer(serializers.Serializer):
    site = serializers.IntegerField()
    date_from = serializers.DateField()
    date_to = serializers.DateField()


@extend_schema(request=CrusherPlantExportRequestSerializer, responses=ExportStatusSerializer)
class CrusherPlantExportView(APIView):
    """Async PDF export, mirroring dashboard.views.DashboardExportView's
    trigger/poll shape exactly."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = CrusherPlantExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        _require_site_access(request, data["site"])
        if not scoping.is_supervisor(request.user):
            raise PermissionDenied("Only a Supervisor/Admin may export reports.")

        task = generate_crusher_plant_report.delay(data["site"], str(data["date_from"]), str(data["date_to"]))
        record_export_owner(task.id, request.user.id)
        payload = {"task_id": task.id, "status": "queued"}
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            payload["status"] = "success"
            payload["download_url"] = task.result
        return Response(payload, status=202)


@extend_schema(responses=ExportStatusSerializer)
class CrusherPlantExportStatusView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, task_id=None):
        if not is_export_owner(task_id, request.user.id):
            raise PermissionDenied("You did not trigger this export.")
        result = AsyncResult(task_id)
        payload = {"task_id": task_id, "status": result.status}
        if result.successful():
            payload["download_url"] = result.result
        elif result.failed():
            payload["error"] = str(result.result)
        return Response(payload)
