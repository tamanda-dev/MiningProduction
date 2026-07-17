from rest_framework.viewsets import ModelViewSet

from core.mixins import SiteScopedQuerySetMixin
from core.permissions import ReadOnlyOrSupervisorOrAbove

from .models import ShiftPattern, Team, TeamMember
from .serializers import ShiftPatternSerializer, TeamMemberSerializer, TeamSerializer


class ShiftPatternViewSet(ModelViewSet):
    queryset = ShiftPattern.objects.all()
    serializer_class = ShiftPatternSerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = ("active",)


class TeamViewSet(SiteScopedQuerySetMixin, ModelViewSet):
    queryset = Team.objects.select_related("site", "section", "shift_pattern").prefetch_related("members").all()
    serializer_class = TeamSerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = ("site", "section", "active")
    search_fields = ("name",)
    site_lookup = "site_id"


class TeamMemberViewSet(SiteScopedQuerySetMixin, ModelViewSet):
    queryset = TeamMember.objects.select_related("team", "user").all()
    serializer_class = TeamMemberSerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = ("team", "user", "active")
    site_lookup = "team__site_id"
