from django.db import IntegrityError, models, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from shiftmgmt.services import get_or_create_open_instance

from .models import Machine, MachineAssignment, MachineTypeQualification


class MachineConflictError(APIException):
    status_code = 409
    default_detail = "Machine is already claimed for this shift instance."
    default_code = "machine_conflict"


def _check_qualified(operator, machine):
    qualified = (
        MachineTypeQualification.objects.filter(
            user=operator, machine_type=machine.machine_type, active=True
        )
        .filter(models.Q(site=machine.site) | models.Q(site__isnull=True))
        .exists()
    )
    if not qualified:
        raise PermissionDenied("Operator is not qualified for this machine type.")


def claim_machine(machine, operator, section, sub_section=None):
    """The machine-activation workflow entry point. DB-first concurrency
    safety: MachineAssignment's partial unique constraints are the
    race-proof source of truth; select_for_update() here just turns a lost
    race into a clean 409 instead of a raw IntegrityError bubbling up.
    """
    if machine.status != Machine.STATUS_ACTIVE:
        raise ValidationError({"detail": f"Machine is not available (status={machine.status})."})

    _check_qualified(operator, machine)

    shift_instance = get_or_create_open_instance(machine.site)
    if shift_instance is None:
        raise ValidationError({"detail": "No open shift covers the current time for this site."})

    with transaction.atomic():
        locked_machine = Machine.objects.select_for_update().get(pk=machine.pk)
        conflict = MachineAssignment.objects.filter(
            machine=locked_machine,
            shift_instance=shift_instance,
            status=MachineAssignment.STATUS_ACTIVE,
        ).exists()
        if conflict:
            raise MachineConflictError()
        operator_conflict = MachineAssignment.objects.filter(
            operator=operator,
            shift_instance=shift_instance,
            status=MachineAssignment.STATUS_ACTIVE,
        ).exists()
        if operator_conflict:
            raise ValidationError({"detail": "You already have an active machine for this shift."})

        try:
            assignment = MachineAssignment.objects.create(
                machine=locked_machine,
                operator=operator,
                shift_instance=shift_instance,
                section=section,
                sub_section=sub_section,
                status=MachineAssignment.STATUS_ACTIVE,
            )
        except IntegrityError as exc:
            raise MachineConflictError() from exc

        locked_machine.current_section = section
        locked_machine.save(update_fields=["current_section", "updated_at"])

    return assignment


def release_machine(assignment, reason=""):
    if assignment.status != MachineAssignment.STATUS_ACTIVE:
        raise ValidationError({"detail": "Assignment is not active."})
    assignment.status = MachineAssignment.STATUS_RELEASED
    assignment.ended_at = timezone.now()
    assignment.release_reason = reason
    assignment.save(update_fields=["status", "ended_at", "release_reason", "updated_at"])
    return assignment


def handover_machine(assignment, new_operator, section=None, sub_section=None):
    if assignment.status != MachineAssignment.STATUS_ACTIVE:
        raise ValidationError({"detail": "Assignment is not active."})
    _check_qualified(new_operator, assignment.machine)

    with transaction.atomic():
        assignment.status = MachineAssignment.STATUS_HANDED_OVER
        assignment.ended_at = timezone.now()
        assignment.save(update_fields=["status", "ended_at", "updated_at"])

        new_assignment = MachineAssignment.objects.create(
            machine=assignment.machine,
            operator=new_operator,
            shift_instance=assignment.shift_instance,
            section=section or assignment.section,
            sub_section=sub_section or assignment.sub_section,
            status=MachineAssignment.STATUS_ACTIVE,
            handed_over_from=assignment,
        )
    return new_assignment
