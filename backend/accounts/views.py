from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from core.permissions import IsSupervisorOrAbove

from .models import User
from .serializers import MeSerializer, UserSummarySerializer


class MeView(RetrieveAPIView):
    serializer_class = MeSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        return self.request.user


class UserViewSet(ReadOnlyModelViewSet):
    """Read-only user picker for admin screens (assigning team members,
    machine-type qualifications, plan-target owners, etc.) — Supervisor+
    only, since it lists other users' basic identity info.
    """

    queryset = User.objects.filter(is_active=True).order_by("username")
    serializer_class = UserSummarySerializer
    permission_classes = (IsSupervisorOrAbove,)
    filterset_fields = ("is_staff", "maintenance_technician")
    search_fields = ("username", "email", "first_name", "last_name")
