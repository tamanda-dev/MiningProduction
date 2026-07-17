from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from entries.models import BreakdownLog
from machines.models import Machine, MachineAssignment
from shiftmgmt.models import ShiftInstance


def _shift_duration_minutes(shift):
    start = datetime.combine(datetime.today(), shift.start_time)
    end = datetime.combine(datetime.today(), shift.end_time)
    if shift.end_time <= shift.start_time:
        end += timedelta(days=1)
    return Decimal(str((end - start).total_seconds() / 60))


def availability_utilization(site_id, date, machine_type_id=None):
    """Availability %/Utilization % per machine type, broken out by Shift
    (Day/Night, or whatever a site names its shifts) plus a combined
    Average — mirrors the source Daily Production Report's
    "Availabilities/Utilization" block.

    Availability = (scheduled machine-minutes - downtime minutes) /
    scheduled machine-minutes. Downtime only counts *closed* BreakdownLogs
    (duration_minutes is null until end_at is set) — an open breakdown
    doesn't yet contribute, which understates downtime for a
    still-ongoing breakdown; acceptable for a same-day live view, revisit
    if retroactive accuracy on open breakdowns matters.

    Utilization = active-MachineAssignment-minutes / scheduled
    machine-minutes — a proxy for "productive" time, since there's no
    separate idle-time log in the source data.
    """
    instances = list(ShiftInstance.objects.filter(site_id=site_id, date=date).select_related("shift"))

    machines_qs = Machine.objects.filter(
        site_id=site_id, status__in=[Machine.STATUS_ACTIVE, Machine.STATUS_BREAKDOWN]
    )
    if machine_type_id:
        machines_qs = machines_qs.filter(machine_type_id=machine_type_id)
    type_counts = {
        row["machine_type_id"]: (row["machine_type__name"], row["count"])
        for row in machines_qs.values("machine_type_id", "machine_type__name").annotate(count=Count("id"))
    }

    now = timezone.now()
    buckets = defaultdict(
        lambda: {
            "scheduled_minutes": Decimal("0"),
            "breakdown_minutes": Decimal("0"),
            "active_minutes": Decimal("0"),
        }
    )

    for instance in instances:
        duration = _shift_duration_minutes(instance.shift)
        for mt_id, (_, count) in type_counts.items():
            buckets[(mt_id, instance.shift.name)]["scheduled_minutes"] += duration * count

        breakdown_qs = BreakdownLog.objects.filter(shift_instance=instance, end_at__isnull=False)
        if machine_type_id:
            breakdown_qs = breakdown_qs.filter(machine__machine_type_id=machine_type_id)
        for row in breakdown_qs.values("machine__machine_type_id").annotate(total=Sum("duration_minutes")):
            mt_id = row["machine__machine_type_id"]
            if mt_id in type_counts:
                buckets[(mt_id, instance.shift.name)]["breakdown_minutes"] += Decimal(row["total"] or 0)

        assignment_qs = MachineAssignment.objects.filter(shift_instance=instance).select_related("machine")
        if machine_type_id:
            assignment_qs = assignment_qs.filter(machine__machine_type_id=machine_type_id)
        for assignment in assignment_qs:
            mt_id = assignment.machine.machine_type_id
            if mt_id not in type_counts:
                continue
            end = assignment.ended_at or now
            minutes = Decimal(str((end - assignment.started_at).total_seconds() / 60))
            buckets[(mt_id, instance.shift.name)]["active_minutes"] += max(minutes, Decimal("0"))

    by_type = defaultdict(list)
    for (mt_id, shift_name), b in buckets.items():
        scheduled = b["scheduled_minutes"]
        availability_pct = float((scheduled - b["breakdown_minutes"]) / scheduled * 100) if scheduled else None
        utilization_pct = float(b["active_minutes"] / scheduled * 100) if scheduled else None
        by_type[mt_id].append(
            {
                "shift_name": shift_name,
                "availability_pct": availability_pct,
                "utilization_pct": utilization_pct,
                "scheduled_minutes": scheduled,
                "breakdown_minutes": b["breakdown_minutes"],
                "active_minutes": b["active_minutes"],
            }
        )

    results = []
    for mt_id, rows in by_type.items():
        total_scheduled = sum((r["scheduled_minutes"] for r in rows), Decimal("0"))
        total_breakdown = sum((r["breakdown_minutes"] for r in rows), Decimal("0"))
        total_active = sum((r["active_minutes"] for r in rows), Decimal("0"))
        avg_availability = (
            float((total_scheduled - total_breakdown) / total_scheduled * 100) if total_scheduled else None
        )
        avg_utilization = float(total_active / total_scheduled * 100) if total_scheduled else None
        results.append(
            {
                "machine_type": mt_id,
                "machine_type_name": type_counts[mt_id][0],
                "by_shift": rows,
                "average": {"availability_pct": avg_availability, "utilization_pct": avg_utilization},
            }
        )
    return results
