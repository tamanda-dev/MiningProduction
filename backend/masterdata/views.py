from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from core.permissions import ReadOnlyOrAdmin

from .models import (
    CrusherUnit,
    DeliveryDestination,
    DowntimeReasonCode,
    MachineType,
    Parameter,
    ParameterChoice,
    Section,
    Site,
    SubSection,
    UOM,
)
from .signals import FORM_SCHEMA_VERSION_KEY
from .serializers import (
    CrusherUnitSerializer,
    DeliveryDestinationSerializer,
    DowntimeReasonCodeSerializer,
    MachineTypeSerializer,
    ParameterChoiceSerializer,
    ParameterSerializer,
    SectionSerializer,
    SiteSerializer,
    SubSectionSerializer,
    UOMSerializer,
)


class SiteViewSet(ModelViewSet):
    queryset = Site.objects.all()
    serializer_class = SiteSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("active",)
    search_fields = ("name", "code")


class SectionViewSet(ModelViewSet):
    queryset = Section.objects.select_related("site").all()
    serializer_class = SectionSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("site", "active")
    search_fields = ("name", "code")


class SubSectionViewSet(ModelViewSet):
    queryset = SubSection.objects.select_related("section", "section__site").all()
    serializer_class = SubSectionSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("section", "active")
    search_fields = ("name", "code")


class MachineTypeViewSet(ModelViewSet):
    queryset = MachineType.objects.all()
    serializer_class = MachineTypeSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("active",)
    search_fields = ("name", "code")

    @action(detail=True, methods=["get"], url_path="form-schema")
    def form_schema(self, request, pk=None):
        """The dynamic-parameter contract both the web dashboard and the
        mobile app render entry forms from: the ordered list of Parameters
        applicable to this machine type (scope='machine') plus any
        section-level/shift-total parameters for the given section, so
        neither client ever hardcodes field names. Redis/locmem-cached and
        invalidated whenever a Parameter/ParameterChoice changes (see
        masterdata/signals.py).
        """
        machine_type = self.get_object()
        section_id = request.query_params.get("section")

        version = cache.get(FORM_SCHEMA_VERSION_KEY, 1)
        cache_key = f"form_schema:{machine_type.id}:{section_id}:{version}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        scope_filter = Q(scope=Parameter.SCOPE_MACHINE, applicable_machine_types=machine_type)
        if section_id:
            scope_filter |= Q(scope__in=[Parameter.SCOPE_SECTION, Parameter.SCOPE_SHIFT], section_id=section_id)

        parameters = (
            Parameter.objects.filter(scope_filter, active=True)
            .distinct()
            .order_by("display_order", "name")
            .select_related("uom")
            .prefetch_related("choices")
        )

        data = [
            {
                "id": p.id,
                "code": p.code,
                "name": p.name,
                "scope": p.scope,
                "data_type": p.data_type,
                "uom": p.uom.abbreviation if p.uom else None,
                "is_required": p.is_required,
                "min_value": p.min_value,
                "max_value": p.max_value,
                "display_order": p.display_order,
                "choices": [{"value": c.value, "label": c.label} for c in p.choices.all()],
            }
            for p in parameters
        ]
        cache.set(cache_key, data, timeout=settings.FORM_SCHEMA_CACHE_SECONDS)
        return Response(data)


class UOMViewSet(ModelViewSet):
    queryset = UOM.objects.all()
    serializer_class = UOMSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    search_fields = ("name", "abbreviation")


class ParameterViewSet(ModelViewSet):
    queryset = Parameter.objects.prefetch_related("choices", "applicable_machine_types").all()
    serializer_class = ParameterSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("scope", "data_type", "active", "section", "applicable_machine_types")
    search_fields = ("name", "code")


class ParameterChoiceViewSet(ModelViewSet):
    """Writable endpoint for managing a select-type Parameter's choices —
    ParameterSerializer.choices is read-only (nested), so admin screens use
    this dedicated endpoint to add/edit/remove individual choices.
    """

    queryset = ParameterChoice.objects.select_related("parameter").all()
    serializer_class = ParameterChoiceSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("parameter",)


class CrusherUnitViewSet(ModelViewSet):
    queryset = CrusherUnit.objects.select_related("site").all()
    serializer_class = CrusherUnitSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("site", "active")


class DeliveryDestinationViewSet(ModelViewSet):
    queryset = DeliveryDestination.objects.select_related("site").all()
    serializer_class = DeliveryDestinationSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("site", "active")


class DowntimeReasonCodeViewSet(ModelViewSet):
    queryset = DowntimeReasonCode.objects.all()
    serializer_class = DowntimeReasonCodeSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("category", "active")
