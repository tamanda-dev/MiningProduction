from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ModelViewSet

from core import scoping
from core.permissions import IsSupervisorOrAbove, ReadOnlyOrAdmin, ReadOnlyOrSupervisorOrAbove

from . import services
from .models import Machine, MachineAssignment, MachineTypeQualification
from .serializers import (
    ActivateMachineSerializer,
    AssignMachineSerializer,
    HandoverMachineSerializer,
    MachineAssignmentSerializer,
    MachineSerializer,
    MachineTypeQualificationSerializer,
    ReleaseMachineSerializer,
)


class MachineViewSet(ModelViewSet):
    queryset = Machine.objects.select_related("machine_type", "site", "current_section").all()
    serializer_class = MachineSerializer
    permission_classes = (ReadOnlyOrAdmin,)
    filterset_fields = ("site", "machine_type", "status", "current_section")
    search_fields = ("fleet_number", "name")

    def get_permissions(self):
        if self.action in ("activate", "release", "handover"):
            return [IsAuthenticated()]
        if self.action == "assign":
            return [IsSupervisorOrAbove()]
        return super().get_permissions()

    def get_queryset(self):
        """Supervisor+ are scoped by UserSiteAccess as usual (any machine
        type at their accessible sites). Operators typically have no
        UserSiteAccess rows at all — their visibility into the
        machine-activation picker instead comes from
        MachineTypeQualification, and critically that's a (site,
        machine_type) PAIR, not just a site: a DUT-qualified operator must
        not see BOR/CRU/DRR/LHD machines at the same site just because
        they're qualified for something there.
        """
        qs = super().get_queryset()
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()

        site_ids = scoping.accessible_site_ids(user)
        if site_ids is None:
            return qs

        site_filter = Q(site_id__in=site_ids) if site_ids else Q(pk__in=[])

        qualification_filter = Q(pk__in=[])
        for qual in MachineTypeQualification.objects.filter(user=user, active=True):
            if qual.machine_id is not None:  # assigned to this one specific unit, not the whole type
                qualification_filter |= Q(pk=qual.machine_id)
            elif qual.site_id is None:  # null site == qualified for this machine type at any site
                qualification_filter |= Q(machine_type_id=qual.machine_type_id)
            else:
                qualification_filter |= Q(machine_type_id=qual.machine_type_id, site_id=qual.site_id)

        return qs.filter(site_filter | qualification_filter)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        machine = self.get_object()
        serializer = ActivateMachineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = services.claim_machine(
            machine=machine,
            operator=request.user,
            section=serializer.validated_data["section"],
            sub_section=serializer.validated_data.get("sub_section"),
        )
        return Response(MachineAssignmentSerializer(assignment).data, status=201)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """Supervisor+ push-assigns a machine to a named operator — the
        counterpart to `activate` (which always claims for request.user).
        Reuses claim_machine as-is: it already takes `operator` as a plain
        parameter rather than assuming request.user, so the exact same
        qualification check, shift-instance resolution, and 409-on-conflict
        behavior apply here too — an unqualified operator still can't be
        assigned a machine type they're not certified for.
        """
        machine = self.get_object()
        serializer = AssignMachineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = services.claim_machine(
            machine=machine,
            operator=serializer.validated_data["operator"],
            section=serializer.validated_data["section"],
            sub_section=serializer.validated_data.get("sub_section"),
        )
        return Response(MachineAssignmentSerializer(assignment).data, status=201)

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        machine = self.get_object()
        serializer = ReleaseMachineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        qs = MachineAssignment.objects.filter(machine=machine, status=MachineAssignment.STATUS_ACTIVE)
        if not scoping.is_supervisor(request.user):
            qs = qs.filter(operator=request.user)
        assignment = qs.first()
        if assignment is None:
            raise ValidationError({"detail": "No active assignment found for this machine."})

        assignment = services.release_machine(assignment, reason=serializer.validated_data.get("reason", ""))
        return Response(MachineAssignmentSerializer(assignment).data)

    @action(detail=True, methods=["post"])
    def handover(self, request, pk=None):
        machine = self.get_object()
        serializer = HandoverMachineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        assignment = MachineAssignment.objects.filter(
            machine=machine, operator=request.user, status=MachineAssignment.STATUS_ACTIVE
        ).first()
        if assignment is None:
            raise ValidationError({"detail": "You have no active assignment for this machine to hand over."})

        new_assignment = services.handover_machine(
            assignment,
            new_operator=serializer.validated_data["new_operator"],
            section=serializer.validated_data.get("section"),
            sub_section=serializer.validated_data.get("sub_section"),
        )
        return Response(MachineAssignmentSerializer(new_assignment).data, status=201)


class MachineTypeQualificationViewSet(ModelViewSet):
    """Write (assigning a machine-type qualification to an operator) is
    Supervisor+, not just Admin — a Supervisor is the one who actually
    knows which operators on their site are certified on which machine
    types, and this is exactly the "assign machines to operators" workflow
    they need day to day.
    """

    queryset = MachineTypeQualification.objects.select_related("user", "machine_type", "site", "machine").all()
    serializer_class = MachineTypeQualificationSerializer
    permission_classes = (ReadOnlyOrSupervisorOrAbove,)
    filterset_fields = ("user", "machine_type", "machine", "site", "active")

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "This user is already assigned/qualified for that machine."})

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "This user is already assigned/qualified for that machine."})

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not scoping.is_supervisor(user):
            return qs.filter(user=user)
        # A site-restricted Supervisor (accessible_site_ids returns
        # a set, not None) must not see every other site's qualification
        # rows just because is_supervisor() is True — mirror
        # MachineViewSet's scoping. site=null rows are global ("qualified
        # anywhere") qualifications, visible regardless of site restriction.
        site_ids = scoping.accessible_site_ids(user)
        if site_ids is None:
            return qs
        return qs.filter(Q(site_id__in=site_ids) | Q(site__isnull=True))


class MachineAssignmentViewSet(RetrieveModelMixin, ListModelMixin, GenericViewSet):
    """Read-only: assignments are only ever created/ended via the
    activate/release/handover actions on MachineViewSet, never directly.
    Operators see only their own assignments (e.g. to restore session state
    on app restart); Supervisor+ see everything within their site scope.
    """

    queryset = MachineAssignment.objects.select_related(
        "machine", "machine__site", "operator", "shift_instance", "section", "sub_section"
    ).all()
    serializer_class = MachineAssignmentSerializer
    permission_classes = (IsAuthenticated,)
    filterset_fields = ("machine", "operator", "shift_instance", "section", "status")

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not scoping.is_supervisor(user):
            return qs.filter(operator=user)
        site_ids = scoping.accessible_site_ids(user)
        if site_ids is not None:
            qs = qs.filter(machine__site_id__in=site_ids)
        return qs
