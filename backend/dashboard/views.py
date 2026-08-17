from celery.result import AsyncResult
from django.conf import settings
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import scoping
from core.export_tracking import is_export_owner, record_export_owner
from shiftmgmt.models import ShiftInstance

from .serializers import (
    ActVsPlanRowSerializer,
    AvailabilityRowSerializer,
    DowntimeParetoRowSerializer,
    ExportStatusSerializer,
    ExportTriggerRequestSerializer,
    HourlyCurvePointSerializer,
    LandingDashboardSerializer,
    MachineStatusRowSerializer,
    TrendPointSerializer,
)
from .services.aggregation import act_vs_plan_for_shift_instance, daily_trend, hourly_curve
from .services.availability import availability_utilization
from .services.hourly_machine_status import hourly_machine_status
from .services.landing import landing_dashboard
from .services.machine_status import machine_status_board
from .services.mttr import general_fleet_mttr
from .services.production_summary import production_summary
from .services.pareto import downtime_pareto
from .tasks import (
    generate_daily_production_report,
    generate_daily_report,
    generate_mtd_report,
    generate_shift_report,
)


def _require_site_access(request, site_id):
    if not site_id:
        raise ValidationError({"site": "Required query parameter."})
    site_id = int(site_id)
    accessible = scoping.accessible_site_ids(request.user)
    if accessible is not None and site_id not in accessible:
        raise PermissionDenied("You do not have access to this site.")
    return site_id


@extend_schema(
    parameters=[OpenApiParameter("shift_instance", OpenApiTypes.INT, required=True)],
    responses=ActVsPlanRowSerializer(many=True),
)
class DashboardSummaryView(APIView):
    """Live shift view: Act vs Plan vs Var vs %Var per section/parameter."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        shift_instance_id = request.query_params.get("shift_instance")
        if not shift_instance_id:
            raise ValidationError({"shift_instance": "Required query parameter."})
        shift_instance = ShiftInstance.objects.select_related("site").filter(pk=shift_instance_id).first()
        if shift_instance is None:
            raise ValidationError({"shift_instance": "Unknown shift instance."})
        _require_site_access(request, shift_instance.site_id)
        return Response(act_vs_plan_for_shift_instance(shift_instance))


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("section", OpenApiTypes.INT, required=True),
        OpenApiParameter("parameter", OpenApiTypes.INT, required=True),
        OpenApiParameter("date_from", OpenApiTypes.DATE, required=True),
        OpenApiParameter("date_to", OpenApiTypes.DATE, required=True),
    ],
    responses=TrendPointSerializer(many=True),
)
class DashboardTrendsView(APIView):
    """Daily/MTD trend series (Act vs Plan vs Var) for one section+parameter."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        section_id = request.query_params.get("section")
        parameter_id = request.query_params.get("parameter")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if not all([section_id, parameter_id, date_from, date_to]):
            raise ValidationError(
                {"detail": "section, parameter, date_from, and date_to are all required."}
            )
        return Response(daily_trend(site_id, section_id, parameter_id, date_from, date_to))


@extend_schema(
    parameters=[
        OpenApiParameter("shift_instance", OpenApiTypes.INT, required=True),
        OpenApiParameter("section", OpenApiTypes.INT, required=True),
        OpenApiParameter("parameter", OpenApiTypes.INT, required=True),
    ],
    responses=HourlyCurvePointSerializer(many=True),
)
class DashboardHourlyCurveView(APIView):
    """Cumulative Act vs cumulative target per time slot within one shift."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        shift_instance_id = request.query_params.get("shift_instance")
        section_id = request.query_params.get("section")
        parameter_id = request.query_params.get("parameter")
        if not all([shift_instance_id, section_id, parameter_id]):
            raise ValidationError({"detail": "shift_instance, section, and parameter are all required."})
        shift_instance = ShiftInstance.objects.filter(pk=shift_instance_id).first()
        if shift_instance is None:
            raise ValidationError({"shift_instance": "Unknown shift instance."})
        _require_site_access(request, shift_instance.site_id)
        return Response(hourly_curve(shift_instance, section_id, parameter_id))


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("date", OpenApiTypes.DATE, required=True),
        OpenApiParameter("machine_type", OpenApiTypes.INT, required=False),
    ],
    responses=AvailabilityRowSerializer(many=True),
)
class DashboardAvailabilityView(APIView):
    """Availability %/Utilization % per machine type, Day/Night/Average."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        date = request.query_params.get("date")
        if not date:
            raise ValidationError({"date": "Required query parameter."})
        machine_type_id = request.query_params.get("machine_type")
        return Response(availability_utilization(site_id, date, machine_type_id))


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("date_from", OpenApiTypes.DATE, required=False),
        OpenApiParameter("date_to", OpenApiTypes.DATE, required=False),
        OpenApiParameter("section", OpenApiTypes.INT, required=False),
    ],
    responses=DowntimeParetoRowSerializer(many=True),
)
class DashboardDowntimeParetoView(APIView):
    """Downtime frequency/duration by reason code, most costly first."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        return Response(
            downtime_pareto(
                site_id,
                date_from=request.query_params.get("date_from"),
                date_to=request.query_params.get("date_to"),
                section_id=request.query_params.get("section"),
            )
        )


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("machine_type", OpenApiTypes.INT, required=False),
    ],
    responses=MachineStatusRowSerializer(many=True),
)
class DashboardMachineStatusView(APIView):
    """Which machines are active/idle/in breakdown, and by whom."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        machine_type_id = request.query_params.get("machine_type")
        return Response(machine_status_board(site_id, machine_type_id))


class DashboardHourlyMachineStatusView(APIView):
    """Per-machine, per-hour-slot ok/breakdown-reason grid for one shift,
    grouped by machine type — the general-fleet (LHD/DUT/DRR/water bowser/
    etc.) Availability & Breakdown Report. Crushers are excluded; see
    hourly_machine_status()'s docstring for why.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        shift_instance_id = request.query_params.get("shift_instance")
        if not shift_instance_id:
            raise ValidationError({"shift_instance": "Required query parameter."})
        shift_instance = ShiftInstance.objects.filter(pk=shift_instance_id).first()
        if shift_instance is None:
            raise ValidationError({"shift_instance": "Unknown shift instance."})
        _require_site_access(request, shift_instance.site_id)
        machine_type_id = request.query_params.get("machine_type")
        return Response(hourly_machine_status(shift_instance, machine_type_id))


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("date_from", OpenApiTypes.DATE, required=True),
        OpenApiParameter("date_to", OpenApiTypes.DATE, required=True),
        OpenApiParameter("section", OpenApiTypes.INT, required=False),
    ],
)
class DashboardMttrView(APIView):
    """General-fleet (non-crusher) Mean Time to Repair, actual vs the
    "mttr-minutes" Plan Target if one's been set — see
    dashboard/services/mttr.py.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        date_from = parse_date(request.query_params.get("date_from") or "")
        date_to = parse_date(request.query_params.get("date_to") or "")
        if date_from is None or date_to is None:
            raise ValidationError({"detail": "date_from and date_to are both required, as YYYY-MM-DD."})
        section_id = request.query_params.get("section")
        return Response(general_fleet_mttr(site_id, section_id, date_from, date_to))


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("parameter", OpenApiTypes.INT, required=True),
        OpenApiParameter("date_from", OpenApiTypes.DATE, required=True),
        OpenApiParameter("date_to", OpenApiTypes.DATE, required=True),
        OpenApiParameter("group_by", OpenApiTypes.STR, required=True, enum=["machine", "operator", "supervisor", "shift"]),
        OpenApiParameter("section", OpenApiTypes.INT, required=False),
    ],
)
class DashboardProductionSummaryView(APIView):
    """"How many tonnes did this operator/machine/shift/supervisor
    produce" — Act totals for one parameter over a date range, grouped by
    one dimension, instead of filtering the raw entry list. See
    dashboard/services/production_summary.py.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        parameter_id = request.query_params.get("parameter")
        if not parameter_id:
            raise ValidationError({"parameter": "Required query parameter."})
        date_from = parse_date(request.query_params.get("date_from") or "")
        date_to = parse_date(request.query_params.get("date_to") or "")
        if date_from is None or date_to is None:
            raise ValidationError({"detail": "date_from and date_to are both required, as YYYY-MM-DD."})
        group_by = request.query_params.get("group_by")
        if group_by not in ("machine", "operator", "supervisor", "shift"):
            raise ValidationError({"group_by": "Must be one of machine, operator, supervisor, shift."})
        section_id = request.query_params.get("section")
        return Response(production_summary(site_id, parameter_id, date_from, date_to, group_by, section_id))


@extend_schema(
    parameters=[
        OpenApiParameter("site", OpenApiTypes.INT, required=True),
        OpenApiParameter("date", OpenApiTypes.DATE, required=True),
    ],
    responses=LandingDashboardSerializer,
)
class DashboardLandingView(APIView):
    """The Admin/Supervisor landing page: a whole-site, whole-day
    Shift-at-a-glance KPI summary. Unlike Live Shift View, this never
    depends on a specific ShiftInstance existing yet for the selected
    date — see dashboard/services/landing.py.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        site_id = _require_site_access(request, request.query_params.get("site"))
        date = request.query_params.get("date")
        if not date:
            raise ValidationError({"date": "Required query parameter."})
        return Response(landing_dashboard(site_id, date))


@extend_schema(request=ExportTriggerRequestSerializer, responses=ExportStatusSerializer)
class DashboardExportView(APIView):
    """Enqueues an Act/Plan/Var XLSX report export, formatted close to the
    source report layout — either for one shift instance, one calendar day
    (site-wide), or month-to-date (site-wide), selected by `report_type`.
    Async-job pattern: XLSX generation shouldn't block the request/response
    cycle, matching how the mobile/web clients already expect long-running
    work (bulk sync) to be handled. Poll
    GET /api/dashboard/export/{task_id}/ for the download URL.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = ExportTriggerRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        report_type = data["report_type"]

        if report_type == "shift":
            shift_instance = ShiftInstance.objects.filter(pk=data["shift_instance"]).first()
            if shift_instance is None:
                raise ValidationError({"shift_instance": "Unknown shift instance."})
            _require_site_access(request, shift_instance.site_id)
            if not scoping.is_supervisor(request.user):
                raise PermissionDenied("Only a Supervisor/Admin may export reports.")
            task = generate_shift_report.delay(shift_instance.id)
        elif report_type == "daily":
            site_id = _require_site_access(request, data["site"])
            if not scoping.is_supervisor(request.user):
                raise PermissionDenied("Only a Supervisor/Admin may export reports.")
            task = generate_daily_report.delay(site_id, str(data["date"]))
        elif report_type == "mtd":
            site_id = _require_site_access(request, data["site"])
            if not scoping.is_supervisor(request.user):
                raise PermissionDenied("Only a Supervisor/Admin may export reports.")
            task = generate_mtd_report.delay(site_id, data["year"], data["month"])
        else:  # "daily_production"
            site_id = _require_site_access(request, data["site"])
            if not scoping.is_supervisor(request.user):
                raise PermissionDenied("Only a Supervisor/Admin may export reports.")
            task = generate_daily_production_report.delay(site_id, str(data["date"]))

        record_export_owner(task.id, request.user.id)
        payload = {"task_id": task.id, "status": "queued"}
        # In eager dev mode (no Redis broker) the task already ran
        # synchronously inside .delay() and its result isn't persisted
        # anywhere for a later poll, so return it inline. In real
        # deployments (Docker Compose, real Celery worker + Redis) this
        # branch is inactive and the client polls DashboardExportStatusView.
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            payload["status"] = "success"
            payload["download_url"] = task.result
        return Response(payload, status=202)


@extend_schema(responses=ExportStatusSerializer)
class DashboardExportStatusView(APIView):
    """Poll the status/result of a previously triggered export task."""

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
