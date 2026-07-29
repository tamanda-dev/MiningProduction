from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import BreakdownIncident, HourlyBreakdownEntry, HourlySlot, ShiftCrushingSummary

# The Parameter that carries crushed tonnage for a crusher Machine's
# hourly Production Entries — see recompute_shift_crushing_summary. A
# stable code (not a name lookup) so renaming the Parameter in Master Data
# doesn't silently break the crushing-summary computation.
TONNES_CRUSHED_PARAMETER_CODE = "tonnes-crushed"


def validate_crusher_machine(machine):
    """A "crusher" is a machines.Machine of machine_type.code == 'cru'.
    There is deliberately only ever one such Machine in normal operation
    (a single crushing plant) — Master Data > Machines is where it's
    configured, same as any other machine.
    """
    if machine.machine_type.code != "cru":
        raise ValidationError({"crusher": "Machine must be of machine type 'Crusher'."})


def current_slot_for(site, at=None):
    """Resolves the active HourlySlot for `site` whose window contains
    `at` (default now) — mirrors shiftmgmt.services.resolve_current_shift's
    overnight-aware matching, but against the independently-configurable
    HourlySlot table rather than Shift.slot_length_minutes.
    """
    at = at or timezone.localtime()
    current_time = at.time()
    for slot in HourlySlot.objects.filter(site=site, active=True):
        if slot.is_overnight:
            if current_time >= slot.start_time or current_time < slot.end_time:
                return slot
        else:
            if slot.start_time <= current_time < slot.end_time:
                return slot
    return None


def resolve_slot_datetimes(hourly_slot, shift_instance):
    """Anchors an HourlySlot's start/end TimeFields to the ShiftInstance's
    date, handling the overnight case the same way
    core.utils.timeslots.generate_time_slots does for production Shifts.
    """
    tzinfo = timezone.get_current_timezone()
    slot_date = shift_instance.date
    start_dt = datetime.combine(slot_date, hourly_slot.start_time, tzinfo=tzinfo)
    end_date = slot_date + timedelta(days=1) if hourly_slot.is_overnight else slot_date
    end_dt = datetime.combine(end_date, hourly_slot.end_time, tzinfo=tzinfo)
    return start_dt, end_dt


def _site_daily_window_minutes(site):
    """Total tracked minutes/day for `site`'s crushing plant, summed across
    its active HourlySlot rows (overnight-aware, same rule as is_overnight
    elsewhere). A site configured with one slot spanning the full day (e.g.
    00:00-00:00) sums to 1440; this is what "crushing is done daily" means
    operationally — one HourlySlot covering the day, not one per hour.
    """
    total = 0
    for slot in HourlySlot.objects.filter(site=site, active=True):
        start = datetime.combine(datetime.min, slot.start_time)
        end = datetime.combine(datetime.min, slot.end_time)
        if slot.is_overnight:
            end += timedelta(days=1)
        total += int((end - start).total_seconds() // 60)
    return total


def recompute_shift_crushing_summary(summary):
    """Refreshes every derived field on a ShiftCrushingSummary — nothing
    here is manually typed in by a Supervisor:
    - crushed_tonnage: summed from ParameterValue for the
      TONNES_CRUSHED_PARAMETER_CODE Parameter, scoped to this crusher
      Machine + shift instance (hourly rows only, avoiding double-counting
      against a shift_total row — though Parameter.scope="machine" already
      forbids submitting one that way, see ProductionEntrySerializer).
      Submitted through the ordinary Production Entry form like any other
      machine parameter — there is no separate "crusher throughput" screen.
    - down_time_minutes / stoppage_instances: from BreakdownIncident
      (resolved incidents overlapping this shift) plus
      HourlyBreakdownEntry.downtime_minutes for the same shift.
    - crushing_time_minutes: the site's configured daily window (see
      _site_daily_window_minutes) minus down_time_minutes.
    - availability_pct: crushing_time / (crushing_time + down_time) * 100.
    """
    from entries.models import ParameterValue  # local: avoids an entries<->crusher_ops import cycle

    tonnage = ParameterValue.objects.filter(
        parameter__code=TONNES_CRUSHED_PARAMETER_CODE,
        production_entry__machine=summary.crusher,
        production_entry__shift_instance=summary.shift_instance,
        production_entry__entry_type="hourly",
    ).aggregate(total=Sum("value_number"))["total"] or Decimal("0")
    summary.crushed_tonnage = tonnage

    incidents = BreakdownIncident.objects.filter(
        crusher=summary.crusher, shift_instance=summary.shift_instance
    )
    incident_minutes = sum(
        (i.resolution_minutes or 0) if i.time_completed else 0 for i in incidents
    )
    matrix_minutes = HourlyBreakdownEntry.objects.filter(
        crusher=summary.crusher, shift_instance=summary.shift_instance
    ).aggregate(total=Sum("downtime_minutes"))["total"] or 0

    summary.down_time_minutes = incident_minutes + matrix_minutes
    summary.stoppage_instances = incidents.count()

    window_minutes = _site_daily_window_minutes(summary.site)
    summary.crushing_time_minutes = max(0, window_minutes - summary.down_time_minutes)

    denominator = summary.crushing_time_minutes + summary.down_time_minutes
    summary.availability_pct = (
        Decimal(summary.crushing_time_minutes) / Decimal(denominator) * 100 if denominator else None
    )

    summary.save(
        update_fields=[
            "crushed_tonnage",
            "down_time_minutes",
            "stoppage_instances",
            "crushing_time_minutes",
            "availability_pct",
            "updated_at",
        ]
    )
    return summary


def refresh_summary_for(crusher, shift_instance, user):
    """Get-or-creates the ShiftCrushingSummary for this crusher/shift and
    recomputes it — called from every crusher_ops write (checklist tick,
    breakdown-matrix tick, resolved incident) and from ProductionEntry
    writes carrying TONNES_CRUSHED_PARAMETER_CODE, so the Crusher Plant
    Summary dashboard reflects activity in real time without a Supervisor
    ever having to manually create the summary row first.
    """
    summary, _created = ShiftCrushingSummary.objects.get_or_create(
        crusher=crusher,
        shift_instance=shift_instance,
        defaults={"site": crusher.site, "recorded_by": user},
    )
    return recompute_shift_crushing_summary(summary)
