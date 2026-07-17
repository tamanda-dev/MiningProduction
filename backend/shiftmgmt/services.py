from datetime import timedelta

from django.utils import timezone

from core.utils.timeslots import generate_time_slots

from .models import Shift, ShiftInstance


def time_slots_for_instance(shift_instance: ShiftInstance):
    """Server-authoritative (slot_index, start_datetime, end_datetime)
    tuples for a shift instance, in the current Django timezone. Both the
    entries app (to validate/resolve submitted slots) and the
    GET .../time-slots/ read endpoint use this single source of truth.
    """
    shift = shift_instance.shift
    tzinfo = timezone.get_current_timezone()
    return generate_time_slots(
        shift_date=shift_instance.date,
        start_time=shift.start_time,
        end_time=shift.end_time,
        slot_length_minutes=shift.slot_length_minutes,
        tzinfo=tzinfo,
    )


def resolve_current_shift(site, at=None):
    """Returns the active Shift for `site` whose time window contains `at`
    (a timezone-aware datetime, default now), or None if no shift's window
    covers that time. Handles overnight shifts (window crossing midnight).
    """
    at = at or timezone.localtime()
    current_time = at.time()

    for shift in Shift.objects.filter(site=site, active=True):
        if shift.is_overnight:
            if current_time >= shift.start_time or current_time < shift.end_time:
                return shift
        else:
            if shift.start_time <= current_time < shift.end_time:
                return shift
    return None


def get_or_create_open_instance(site, at=None):
    """Resolves the current Shift for `site` and returns (creating if
    necessary) today's ShiftInstance for it — the instance new production
    entries and machine activations should be tagged against. For overnight
    shifts that started "yesterday", the instance date is anchored to the
    shift's start date, not the current calendar date.
    """
    at = at or timezone.localtime()
    shift = resolve_current_shift(site, at)
    if shift is None:
        return None

    instance_date = at.date()
    if shift.is_overnight and at.time() < shift.end_time:
        instance_date -= timedelta(days=1)

    instance, _ = ShiftInstance.objects.get_or_create(
        shift=shift,
        date=instance_date,
        defaults={"site": site, "status": ShiftInstance.STATUS_OPEN},
    )
    return instance
