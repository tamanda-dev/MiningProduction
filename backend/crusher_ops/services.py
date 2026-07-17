from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from entries.models import CrusherEntry

from .models import BreakdownIncident, HourlyBreakdownEntry, HourlySlot, ShiftCrushingSummary


def validate_crusher_machine(machine):
    """A "crusher" is a machines.Machine of machine_type.code == 'cru' —
    NOT masterdata.CrusherUnit (a separate model used only by
    entries.CrusherEntry for throughput bookkeeping). See crusher_ops app
    docstring / project plan for why these stay distinct.
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


def recompute_shift_crushing_summary(summary):
    """Refreshes the derived fields on a ShiftCrushingSummary:
    - crushed_tonnage: summed at site+shift_instance granularity from the
      existing CrusherEntry throughput data (hourly rows only, to avoid
      double-counting against shift_total rows) — there is no FK between
      machines.Machine and masterdata.CrusherUnit, and the spec says not
      to add one, so this is the same figure for every crusher Machine at
      this site/shift rather than inventing a per-machine tonnage fact the
      system doesn't otherwise record.
    - down_time_minutes / stoppage_instances: genuinely per-crusher-machine,
      derived from BreakdownIncident (resolved incidents overlapping this
      shift) plus HourlyBreakdownEntry.downtime_minutes for the same shift.
    - availability_pct: crushing_time / (crushing_time + down_time) * 100.
    """
    tonnage = CrusherEntry.objects.filter(
        site=summary.site, shift_instance=summary.shift_instance, entry_type="hourly"
    ).aggregate(total=Sum("throughput_tonnes"))["total"] or Decimal("0")
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

    if summary.crushing_time_minutes:
        denominator = summary.crushing_time_minutes + summary.down_time_minutes
        summary.availability_pct = (
            Decimal(summary.crushing_time_minutes) / Decimal(denominator) * 100 if denominator else None
        )
    else:
        summary.availability_pct = None

    summary.save(
        update_fields=[
            "crushed_tonnage",
            "down_time_minutes",
            "stoppage_instances",
            "availability_pct",
            "updated_at",
        ]
    )
    return summary
