from django.db.models import Avg, Count, F, Sum
from django.db.models.functions import TruncDay, TruncWeek
from django.utils import timezone

from shiftmgmt.models import ShiftInstance

from . import services
from .models import (
    BreakdownIncident,
    ChecklistItem,
    HourlyBreakdownEntry,
    HourlyChecklistEntry,
    HourlySlot,
    ShiftCrushingSummary,
)


def breakdown_pareto_by_cause(site_id, date_from=None, date_to=None):
    """Two honestly-separate figures per cause rather than one blended
    number: `hourly_tick_count` comes from the HourlyBreakdownEntry.causes
    M2M (a single row's downtime_minutes can't be safely apportioned across
    multiple simultaneously-ticked causes), while `incident_count`/
    `incident_total_minutes` come from BreakdownIncident.cause, a single
    FK, where summing duration is safe.
    """
    matrix_qs = HourlyBreakdownEntry.objects.filter(site_id=site_id)
    incident_qs = BreakdownIncident.objects.filter(site_id=site_id, time_completed__isnull=False)
    if date_from:
        matrix_qs = matrix_qs.filter(slot_start_at__date__gte=date_from)
        incident_qs = incident_qs.filter(time_occurred__date__gte=date_from)
    if date_to:
        matrix_qs = matrix_qs.filter(slot_start_at__date__lte=date_to)
        incident_qs = incident_qs.filter(time_occurred__date__lte=date_to)

    tick_rows = {
        r["causes__id"]: r
        for r in matrix_qs.values("causes__id", "causes__name").annotate(hourly_tick_count=Count("id"))
        if r["causes__id"] is not None
    }
    incident_rows = {
        r["cause_id"]: r
        for r in incident_qs.values("cause_id", "cause__name").annotate(
            incident_count=Count("id"),
            incident_total_minutes=Sum(F("time_completed") - F("time_reported")),
        )
        if r["cause_id"] is not None
    }

    cause_ids = set(tick_rows) | set(incident_rows)
    results = []
    for cause_id in cause_ids:
        tick = tick_rows.get(cause_id, {})
        incident = incident_rows.get(cause_id, {})
        total_minutes = incident.get("incident_total_minutes")
        results.append(
            {
                "cause": cause_id,
                "cause_name": tick.get("causes__name") or incident.get("cause__name") or "Unknown",
                "hourly_tick_count": tick.get("hourly_tick_count", 0),
                "incident_count": incident.get("incident_count", 0),
                "incident_total_minutes": int(total_minutes.total_seconds() // 60) if total_minutes else 0,
            }
        )
    results.sort(key=lambda r: r["incident_count"] + r["hourly_tick_count"], reverse=True)
    return results


def mttr_mtbf_trend(site_id, crusher_id=None, date_from=None, date_to=None, group_by="day"):
    """MTTR (Avg(time_completed - time_attended), the repair-time-proper
    figure) and MTBF (Sum(crushing_time_minutes) / Count(incidents), the
    real uptime-based formula) per period bucket.
    """
    trunc = TruncWeek if group_by == "week" else TruncDay

    incidents = BreakdownIncident.objects.filter(
        site_id=site_id, time_attended__isnull=False, time_completed__isnull=False
    )
    summaries = ShiftCrushingSummary.objects.filter(site_id=site_id, crushing_time_minutes__isnull=False)
    if crusher_id:
        incidents = incidents.filter(crusher_id=crusher_id)
        summaries = summaries.filter(crusher_id=crusher_id)
    if date_from:
        incidents = incidents.filter(time_occurred__date__gte=date_from)
        summaries = summaries.filter(shift_instance__date__gte=date_from)
    if date_to:
        incidents = incidents.filter(time_occurred__date__lte=date_to)
        summaries = summaries.filter(shift_instance__date__lte=date_to)

    mttr_rows = {
        r["period"]: r
        for r in incidents.annotate(period=trunc("time_occurred"))
        .values("period")
        .annotate(
            mttr_minutes=Avg(F("time_completed") - F("time_attended")),
            resolution_minutes=Avg(F("time_completed") - F("time_reported")),
            incident_count=Count("id"),
        )
    }
    mtbf_rows = {
        r["period"]: r
        for r in summaries.annotate(period=trunc("shift_instance__date"))
        .values("period")
        .annotate(uptime_minutes=Sum("crushing_time_minutes"))
    }

    periods = sorted(set(mttr_rows) | set(mtbf_rows))
    results = []
    for period in periods:
        mttr = mttr_rows.get(period, {})
        mtbf = mtbf_rows.get(period, {})
        incident_count = mttr.get("incident_count", 0)
        uptime_minutes = mtbf.get("uptime_minutes", 0) or 0
        mttr_minutes = mttr.get("mttr_minutes")
        resolution_minutes = mttr.get("resolution_minutes")
        results.append(
            {
                "period": period.isoformat() if hasattr(period, "isoformat") else str(period),
                "mttr_minutes": int(mttr_minutes.total_seconds() // 60) if mttr_minutes else None,
                "resolution_minutes": int(resolution_minutes.total_seconds() // 60) if resolution_minutes else None,
                "mtbf_minutes": (uptime_minutes / incident_count) if incident_count else None,
                "incident_count": incident_count,
            }
        )
    return results


def checklist_compliance_heatmap(site_id, shift_instance_id, crusher_id=None):
    """3-state grid (done/missed/pending) per slot x checklist item —
    categorical, not a continuous-scale heatmap, since compliance is a
    state rather than a magnitude. "pending" means the slot's window
    hasn't ended yet (still fair game to complete); "missed" means the
    window closed with no completed entry.
    """
    shift_instance = ShiftInstance.objects.filter(pk=shift_instance_id).first()
    if shift_instance is None:
        return []

    qs = HourlyChecklistEntry.objects.filter(site_id=site_id, shift_instance_id=shift_instance_id)
    if crusher_id:
        qs = qs.filter(crusher_id=crusher_id)
    entries_by_slot_item = {(e.hourly_slot_id, e.checklist_item_id): e.is_completed for e in qs}

    slots = HourlySlot.objects.filter(site_id=site_id, active=True).order_by("slot_index")
    items = ChecklistItem.objects.filter(active=True).order_by("display_order")
    now = timezone.localtime()

    grid = []
    for slot in slots:
        _, slot_end_at = services.resolve_slot_datetimes(slot, shift_instance)
        slot_is_open = now < slot_end_at
        row_items = []
        for item in items:
            key = (slot.id, item.id)
            if key in entries_by_slot_item:
                status = "done" if entries_by_slot_item[key] else "missed"
            else:
                status = "pending" if slot_is_open else "missed"
            row_items.append({"checklist_item": item.id, "checklist_item_name": item.name, "status": status})
        grid.append({"hourly_slot": slot.id, "slot_index": slot.slot_index, "items": row_items})
    return grid
