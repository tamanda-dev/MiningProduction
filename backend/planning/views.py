from rest_framework.viewsets import ModelViewSet

from core.mixins import SiteScopedQuerySetMixin
from core.permissions import ReadOnlyOrManagerOrAdmin

from .models import PlanTarget
from .serializers import PlanTargetSerializer


class PlanTargetViewSet(SiteScopedQuerySetMixin, ModelViewSet):
    queryset = PlanTarget.objects.select_related(
        "parameter", "site", "section", "machine", "shift_instance"
    ).all()
    serializer_class = PlanTargetSerializer
    permission_classes = (ReadOnlyOrManagerOrAdmin,)
    filterset_fields = ("site", "section", "machine", "parameter", "period_type", "period_date", "shift_instance")
    site_lookup = "site_id"
