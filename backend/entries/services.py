from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from core import scoping
from machines.models import Machine
from masterdata.models import Parameter
from shiftmgmt.models import ShiftInstance
from shiftmgmt.services import time_slots_for_instance

from .models import ParameterValue


def resolve_parameter(parameter_ref):
    if isinstance(parameter_ref, Parameter):
        return parameter_ref
    lookup = {"pk": parameter_ref} if isinstance(parameter_ref, int) else {"code": parameter_ref}
    try:
        return Parameter.objects.get(**lookup)
    except Parameter.DoesNotExist as exc:
        raise ValidationError({"parameter": f"Unknown parameter '{parameter_ref}'."}) from exc


def coerce_value(parameter: Parameter, raw_value):
    """Routes a raw client-submitted value into the correct typed
    ParameterValue column per Parameter.data_type, applying
    min/max/choice validation. Returns kwargs for ParameterValue(**kwargs).
    """
    if parameter.data_type in (Parameter.DATA_TYPE_NUMBER, Parameter.DATA_TYPE_INTEGER):
        try:
            number = Decimal(str(raw_value))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError({parameter.code: "Must be a number."}) from exc
        if parameter.data_type == Parameter.DATA_TYPE_INTEGER and number != number.to_integral_value():
            raise ValidationError({parameter.code: "Must be an integer."})
        if parameter.min_value is not None and number < parameter.min_value:
            raise ValidationError({parameter.code: f"Must be >= {parameter.min_value}."})
        if parameter.max_value is not None and number > parameter.max_value:
            raise ValidationError({parameter.code: f"Must be <= {parameter.max_value}."})
        return {"value_number": number}

    if parameter.data_type == Parameter.DATA_TYPE_BOOLEAN:
        if isinstance(raw_value, bool):
            value = raw_value
        elif str(raw_value).strip().lower() in ("true", "1", "yes"):
            value = True
        elif str(raw_value).strip().lower() in ("false", "0", "no"):
            value = False
        else:
            raise ValidationError({parameter.code: "Must be a boolean."})
        return {"value_boolean": value}

    if parameter.data_type == Parameter.DATA_TYPE_SELECT:
        valid_choices = set(parameter.choices.values_list("value", flat=True))
        if str(raw_value) not in valid_choices:
            raise ValidationError({parameter.code: f"Must be one of {sorted(valid_choices)}."})
        return {"value_text": str(raw_value)}

    return {"value_text": "" if raw_value is None else str(raw_value)}


@transaction.atomic
def set_parameter_values(parent_field_name, parent_instance, values):
    """Replaces all ParameterValue rows for `parent_instance` with a freshly
    validated set — idempotent, so it works the same for create and update.
    `values` is a list of {"parameter": <id|code>, "value": <raw>}.
    """
    ParameterValue.objects.filter(**{parent_field_name: parent_instance}).delete()
    rows = []
    for item in values:
        parameter = resolve_parameter(item["parameter"])
        kwargs = coerce_value(parameter, item["value"])
        rows.append(
            ParameterValue.objects.create(
                parameter=parameter, **{parent_field_name: parent_instance}, **kwargs
            )
        )
    return rows


def resolve_slot_datetimes(shift_instance, slot_index):
    for idx, start, end in time_slots_for_instance(shift_instance):
        if idx == slot_index:
            return start, end
    raise ValidationError({"slot_index": "Invalid slot_index for this shift instance."})


def enforce_shift_window(shift_instance, user, override_reason=""):
    """Supervisors/Operators may only write while the shift instance is
    open. Once closed/approved, only Manager/Admin may write, and only
    with a non-blank override_reason, which is logged to AuditLog here
    (the entry itself doesn't persist override_reason as a column, so this
    is the only durable record of why a closed shift instance was edited).
    """
    if shift_instance.status == ShiftInstance.STATUS_OPEN:
        return
    if not scoping.is_manager(user):
        raise PermissionDenied(
            f"Shift instance is '{shift_instance.status}'; only a Manager/Admin can edit it, with an override reason."
        )
    if not override_reason:
        raise ValidationError(
            {"override_reason": "Required to edit an entry in a closed/approved shift instance."}
        )

    from audit.services import log_event

    log_event(
        action="entry.override_edit",
        actor=user,
        target=shift_instance,
        changes={"override_reason": override_reason},
        reason=override_reason,
    )


DEFAULT_ENTRY_STATUS = "submitted"


def enforce_status_change_permission(instance, new_status, user):
    """Operators can freely edit their own entry's values/comments (while
    the shift is open), but changing status away from the default
    "submitted" (flag/correct/approve) is a Supervisor+ action — an
    Operator marking their own entry "approved" would defeat the point of
    the review workflow. Applies on both create (new_status vs the
    model's default) and update (new_status vs the existing instance).
    """
    if new_status is None:
        return
    current_status = instance.status if instance is not None else DEFAULT_ENTRY_STATUS
    if new_status == current_status:
        return
    if not scoping.is_supervisor(user):
        raise PermissionDenied("Only a Supervisor/Manager/Admin may change an entry's status.")


def apply_breakdown_side_effects(breakdown_log):
    """Flips Machine.status to/from 'breakdown' based on whether the
    machine currently has any open (end_at is null) breakdown log. Never
    overrides an admin-set 'maintenance'/'retired' status.
    """
    machine = breakdown_log.machine
    has_open_breakdown = machine.breakdown_logs.filter(end_at__isnull=True).exists()
    target_status = Machine.STATUS_BREAKDOWN if has_open_breakdown else Machine.STATUS_ACTIVE
    if machine.status in (Machine.STATUS_ACTIVE, Machine.STATUS_BREAKDOWN) and machine.status != target_status:
        machine.status = target_status
        machine.save(update_fields=["status", "updated_at"])
