from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from core.permissions import IsAdmin, IsSupervisorOrAbove

from .models import User, UserSiteAccess
from .serializers import (
    AssignRoleSerializer,
    ChangeOwnPasswordSerializer,
    MeSerializer,
    ROLE_GROUP_MAP,
    SetPasswordSerializer,
    UserCreateSerializer,
    UserDetailSerializer,
    UserSiteAccessSerializer,
)


class MeView(RetrieveAPIView):
    serializer_class = MeSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        return self.request.user


class ChangeOwnPasswordView(APIView):
    """Every authenticated user — Admin, Supervisor, Operator —
    may change their own password here, current-password-verified. This is
    distinct from UserViewSet.reset_password (Admin-only, no current
    password needed, for resetting someone else's forgotten password).
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = ChangeOwnPasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password changed."})


class UserViewSet(ModelViewSet):
    """Read: Supervisor+ (existing pickers elsewhere in the app — assigning
    team members, machine-type qualifications, plan-target owners — depend
    on this staying broadly readable). Write (create/update, and every
    custom action below): Admin only — this is account/access management,
    stricter than ordinary master data.

    No hard DELETE: users are referenced everywhere (entries, machine
    assignments, audit-log actors), so a real delete would either be
    blocked by PROTECT constraints or destroy history. "Disable user"
    means `is_active=False`, not a row deletion.
    """

    queryset = User.objects.filter(is_active=True).order_by("username")
    filterset_fields = ("is_staff", "maintenance_technician", "is_active")
    search_fields = ("username", "email", "first_name", "last_name")

    def get_queryset(self):
        # The default-active-only filter above is right for the read-only
        # pickers (grep the rest of the app: only active users should be
        # assignable to teams/qualifications), but the User Management
        # page itself needs to see disabled accounts too, e.g. to re-enable
        # them — Admins get the unfiltered queryset.
        from core import scoping

        if scoping.is_admin(self.request.user):
            return User.objects.all().order_by("username")
        return super().get_queryset()

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        # UserDetailSerializer is a superset of UserSummarySerializer (adds
        # is_active/roles/date_joined/last_login) — safe to return for every
        # read, existing callers that only touched the summary fields are
        # unaffected, and it saves the User Management page a second
        # endpoint shape just for its own table.
        return UserDetailSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "disable", "enable", "reset_password", "assign_role"):
            return [IsAdmin()]
        return [IsSupervisorOrAbove()]

    def create(self, request, *args, **kwargs):
        # UserCreateSerializer's own fields (username/email/.../password/role)
        # are right for validating input but too thin for the response — the
        # caller (the User Management page) wants the same shape it gets
        # from every other read, roles/is_active included, without a second
        # round-trip just to render the new row.
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserDetailSerializer(user).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def disable(self, request, pk=None):
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response(UserDetailSerializer(user).data)

    @action(detail=True, methods=["post"])
    def enable(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response(UserDetailSerializer(user).data)

    @action(detail=True, methods=["post"])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Password reset."})

    @action(detail=True, methods=["post"])
    def assign_role(self, request, pk=None):
        from django.contrib.auth.models import Group

        user = self.get_object()
        serializer = AssignRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = Group.objects.get(name=ROLE_GROUP_MAP[serializer.validated_data["role"]])
        user.groups.set([group])
        return Response(UserDetailSerializer(user).data)


class UserSiteAccessViewSet(ModelViewSet):
    """Grants a user access to a Site (or one Section within it) — the
    User Management module's "assign departments" feature (Department ==
    masterdata.Section per this session's scoping). Admin-only throughout:
    unlike UserViewSet's read side, no other part of the app needs to read
    other users' access grants, only the Admin managing them.
    """

    queryset = UserSiteAccess.objects.select_related("user", "site", "section").all()
    serializer_class = UserSiteAccessSerializer
    permission_classes = (IsAdmin,)
    filterset_fields = ("user", "site", "section")

    def perform_create(self, serializer):
        try:
            serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "This user already has an access grant for that site/section."})

    def perform_update(self, serializer):
        try:
            serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "This user already has an access grant for that site/section."})
