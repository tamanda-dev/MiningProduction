from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from core import scoping
from core.permissions import ReadOnlyOrSupervisorOrAbove, IsSupervisorOrAbove
from masterdata.models import Site

from .models import Shift, ShiftInstance
from .serializers import ShiftInstanceSerializer, ShiftSerializer, TimeSlotSerializer
from .services import get_or_create_open_instance, time_slots_for_instance


class ShiftViewSet(ModelViewSet):
    queryset = Shift.objects.select_related("site").all()
    serializer_class = ShiftSerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = ("site", "active")

    def get_queryset(self):
        qs = super().get_queryset()
        site_ids = scoping.accessible_site_ids_including_qualifications(self.request.user)
        if site_ids is not None:
            qs = qs.filter(site_id__in=site_ids)
        return qs

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        site_id = request.query_params.get("site")
        if not site_id:
            raise ValidationError({"site": "Required query parameter."})
        site = Site.objects.filter(pk=site_id).first()
        if site is None:
            raise ValidationError({"site": "Unknown site."})
        instance = get_or_create_open_instance(site)
        if instance is None:
            return Response({"detail": "No shift covers the current time for this site."}, status=404)
        return Response(ShiftInstanceSerializer(instance).data)


class ShiftInstanceViewSet(ModelViewSet):
    queryset = ShiftInstance.objects.select_related("shift", "site", "closed_by", "approved_by").all()
    serializer_class = ShiftInstanceSerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = {
        "site": ["exact"],
        "shift": ["exact"],
        "status": ["exact"],
        # gte/lte power a From/To date range filter — exact stays for
        # ShiftInstanceDatePicker's "just this one date" lookup.
        "date": ["exact", "gte", "lte"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        site_ids = scoping.accessible_site_ids_including_qualifications(self.request.user)
        if site_ids is not None:
            qs = qs.filter(site_id__in=site_ids)
        return qs

    @action(detail=True, methods=["post"], permission_classes=(IsSupervisorOrAbove,))
    def close(self, request, pk=None):
        instance = self.get_object()
        if instance.status != ShiftInstance.STATUS_OPEN:
            raise ValidationError({"detail": f"Shift instance is already '{instance.status}'."})
        instance.status = ShiftInstance.STATUS_CLOSED
        instance.closed_at = timezone.now()
        instance.closed_by = request.user
        instance.save(update_fields=["status", "closed_at", "closed_by", "updated_at"])
        return Response(ShiftInstanceSerializer(instance).data)

    @action(detail=True, methods=["post"], permission_classes=(IsSupervisorOrAbove,))
    def approve(self, request, pk=None):
        instance = self.get_object()
        if instance.status != ShiftInstance.STATUS_CLOSED:
            raise ValidationError({"detail": "Only a closed shift instance can be approved."})
        instance.status = ShiftInstance.STATUS_APPROVED
        instance.approved_at = timezone.now()
        instance.approved_by = request.user
        instance.save(update_fields=["status", "approved_at", "approved_by", "updated_at"])
        return Response(ShiftInstanceSerializer(instance).data)

    @action(detail=True, methods=["get"], url_path="time-slots")
    def time_slots(self, request, pk=None):
        instance = self.get_object()
        slots = [
            {"slot_index": idx, "start_at": start, "end_at": end}
            for idx, start, end in time_slots_for_instance(instance)
        ]
        return Response(TimeSlotSerializer(slots, many=True).data)
