from django.db.models import Count
from django.utils.dateparse import parse_date

from machines.models import Machine
from planning.models import PlanTarget

from .aggregation import act_vs_plan_for_date_range
from .availability import availability_utilization
from .pareto import downtime_pareto

STATUS_GREEN = "green"
STATUS_AMBER = "amber"
STATUS_BLACK = "black"
STATUS_RED = "red"


def _status_for_pct_of_target(pct):
    """Cascading, most-severe-first thresholds for a generic "Act as % of
    Target" KPI — mirrors the Shift KPI Dashboard spec's "Other" status
    table (Green >=100%, Amber 90-99%, Black <90%, Red <70%). Applied
    uniformly to every KPI row rather than branching per parameter, since
    Parameter has no "category" (production/other) or "lower is better"
    field yet to distinguish them — a known simplification.
    """
    if pct is None:
        return None
    if pct < 70:
        return STATUS_RED
    if pct < 90:
        return STATUS_BLACK
    if pct < 100:
        return STATUS_AMBER
    return STATUS_GREEN


def _status_for_availability_pct(pct):
    """Cascading thresholds for Availability specifically (Green >90%,
    Amber 85-90%, Black <85%, Red <60%) — a separate, more lenient table
    than production KPIs per the spec.
    """
    if pct is None:
        return None
    if pct < 60:
        return STATUS_RED
    if pct < 85:
        return STATUS_BLACK
    if pct <= 90:
        return STATUS_AMBER
    return STATUS_GREEN


def landing_dashboard(site_id, date):
    """The Admin/Supervisor landing page: a whole-site, whole-day
    Shift-at-a-glance summary that never depends on a specific
    ShiftInstance existing yet (unlike the per-shift Live Shift View) —
    production Act vs Plan per section/parameter (day-level PlanTargets),
    fleet availability by machine type, live machine-status counts, and
    today's downtime, each colour-coded per the Shift KPI Dashboard
    spec's status thresholds.
    """
    date = parse_date(date) if isinstance(date, str) else date

    kpi_rows = []
    for row in act_vs_plan_for_date_range(site_id, date, date, PlanTarget.PERIOD_DAY, date):
        pct_of_target = float(row["act"] / row["plan"] * 100) if row["plan"] not in (None, 0) else None
        kpi_rows.append({**row, "pct_of_target": pct_of_target, "status": _status_for_pct_of_target(pct_of_target)})

    availability_rows = []
    for row in availability_utilization(site_id, date):
        status = _status_for_availability_pct(row["average"]["availability_pct"])
        availability_rows.append({**row, "status": status})

    fleet_status_counts = {
        row["status"]: row["count"]
        for row in (
            Machine.objects.filter(site_id=site_id)
            .exclude(status=Machine.STATUS_RETIRED)
            .values("status")
            .annotate(count=Count("id"))
        )
    }
    fleet_total = sum(fleet_status_counts.values())
    fleet_down = sum(
        count for status, count in fleet_status_counts.items() if status not in Machine.CLAIMABLE_STATUSES
    )

    downtime_rows = downtime_pareto(site_id, date_from=date, date_to=date)
    downtime_total_minutes = sum(r["total_minutes"] for r in downtime_rows)

    return {
        "site": site_id,
        "date": date.isoformat(),
        "kpi_rows": kpi_rows,
        "availability_rows": availability_rows,
        "fleet_status_counts": fleet_status_counts,
        "fleet_total": fleet_total,
        "fleet_down": fleet_down,
        "downtime_total_minutes": downtime_total_minutes,
        "downtime_top_causes": downtime_rows[:5],
    }
