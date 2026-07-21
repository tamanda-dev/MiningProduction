from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils.dateparse import parse_date

from entries.models import ParameterValue
from planning.models import PlanTarget


def _pct_var(act, plan):
    if plan in (None, 0):
        return None
    return float((act - plan) / plan * 100)


def act_vs_plan_for_shift_instance(shift_instance):
    """Act vs Plan vs Var vs %Var per (section, parameter) for one shift
    instance — the "live shift view" KPI. Act is the sum of every numeric
    ParameterValue tagged to a ProductionEntry in this shift instance,
    grouped by section+parameter (this deliberately aggregates across every
    machine in a section, matching how the source Excel reports total a
    section's fleet against one Plan figure). Plan is looked up as a
    PlanTarget for that parameter+section+shift_instance; only section-level
    (or section-aggregate) targets are matched here — per-machine targets
    are available via the drill-down endpoint, not rolled up automatically.
    """
    rows = (
        ParameterValue.objects.filter(
            production_entry__shift_instance=shift_instance, value_number__isnull=False
        )
        .values(
            "production_entry__section_id",
            "production_entry__section__name",
            "parameter_id",
            "parameter__code",
            "parameter__name",
            "parameter__uom__abbreviation",
        )
        .annotate(act=Sum("value_number"))
    )

    plan_lookup = {
        (pt.parameter_id, pt.section_id): pt.target_value
        for pt in PlanTarget.objects.filter(
            shift_instance=shift_instance, period_type=PlanTarget.PERIOD_SHIFT
        )
    }

    results = []
    for row in rows:
        section_id = row["production_entry__section_id"]
        parameter_id = row["parameter_id"]
        act = row["act"] or Decimal("0")
        plan = plan_lookup.get((parameter_id, section_id))
        var = (act - plan) if plan is not None else None
        results.append(
            {
                "section": section_id,
                "section_name": row["production_entry__section__name"],
                "parameter": parameter_id,
                "parameter_code": row["parameter__code"],
                "parameter_name": row["parameter__name"],
                "uom": row["parameter__uom__abbreviation"],
                "act": act,
                "plan": plan,
                "var": var,
                "pct_var": _pct_var(act, plan),
            }
        )
    return results


def act_vs_plan_for_date_range(site_id, date_from, date_to, plan_period_type, plan_period_date):
    """Act vs Plan vs Var vs %Var per (section, parameter) across every
    shift instance in a date range — the same shape as
    act_vs_plan_for_shift_instance, widened from "one shift" to "one day"
    or "month-to-date" for the daily/MTD report exports. `plan_period_type`
    / `plan_period_date` select which PlanTarget row counts as the Plan
    figure (PlanTarget.PERIOD_DAY + that date for a daily report;
    PlanTarget.PERIOD_MONTH + the month's first day for an MTD report) —
    unlike the per-shift case, a date range has no single ShiftInstance to
    look targets up against.
    """
    date_from = parse_date(date_from) if isinstance(date_from, str) else date_from
    date_to = parse_date(date_to) if isinstance(date_to, str) else date_to

    rows = (
        ParameterValue.objects.filter(
            production_entry__site_id=site_id,
            production_entry__slot_start_at__date__gte=date_from,
            production_entry__slot_start_at__date__lte=date_to,
            value_number__isnull=False,
        )
        .values(
            "production_entry__section_id",
            "production_entry__section__name",
            "parameter_id",
            "parameter__code",
            "parameter__name",
            "parameter__uom__abbreviation",
        )
        .annotate(act=Sum("value_number"))
    )

    plan_lookup = {
        (pt.parameter_id, pt.section_id): pt.target_value
        for pt in PlanTarget.objects.filter(
            site_id=site_id, period_type=plan_period_type, period_date=plan_period_date
        )
    }

    results = []
    for row in rows:
        section_id = row["production_entry__section_id"]
        parameter_id = row["parameter_id"]
        act = row["act"] or Decimal("0")
        plan = plan_lookup.get((parameter_id, section_id))
        var = (act - plan) if plan is not None else None
        results.append(
            {
                "section": section_id,
                "section_name": row["production_entry__section__name"],
                "parameter": parameter_id,
                "parameter_code": row["parameter__code"],
                "parameter_name": row["parameter__name"],
                "uom": row["parameter__uom__abbreviation"],
                "act": act,
                "plan": plan,
                "var": var,
                "pct_var": _pct_var(act, plan),
            }
        )
    return results


def daily_trend(site_id, section_id, parameter_id, date_from, date_to):
    """Daily Act vs Plan series between two dates for one section+parameter
    — feeds the daily/MTD trend graphs and variance-over-time chart.
    """
    date_from = parse_date(date_from) if isinstance(date_from, str) else date_from
    date_to = parse_date(date_to) if isinstance(date_to, str) else date_to

    qs = ParameterValue.objects.filter(
        parameter_id=parameter_id,
        value_number__isnull=False,
        production_entry__site_id=site_id,
        production_entry__section_id=section_id,
        production_entry__slot_start_at__date__gte=date_from,
        production_entry__slot_start_at__date__lte=date_to,
    )
    act_by_day = defaultdict(lambda: Decimal("0"))
    for entry in qs.values("production_entry__slot_start_at__date").annotate(act=Sum("value_number")):
        act_by_day[entry["production_entry__slot_start_at__date"]] = entry["act"] or Decimal("0")

    plan_by_day = {
        pt.period_date: pt.target_value
        for pt in PlanTarget.objects.filter(
            parameter_id=parameter_id,
            section_id=section_id,
            period_type=PlanTarget.PERIOD_DAY,
            period_date__gte=date_from,
            period_date__lte=date_to,
        )
    }

    series = []
    day = date_from
    while day <= date_to:
        act = act_by_day.get(day, Decimal("0"))
        plan = plan_by_day.get(day)
        var = (act - plan) if plan is not None else None
        series.append(
            {
                "date": day.isoformat(),
                "act": act,
                "plan": plan,
                "var": var,
                "pct_var": _pct_var(act, plan),
            }
        )
        day += timedelta(days=1)
    return series


def hourly_curve(shift_instance, section_id, parameter_id):
    """Cumulative Act tonnes vs cumulative target per time slot — the
    "Cumulative Tonnes vs Cumulative Target" chart from the source haulage
    report. The shift's PlanTarget (period_type='shift') is spread evenly
    across the shift's time slots for the cumulative-target line, since the
    source reports don't define per-slot targets independently.
    """
    from shiftmgmt.services import time_slots_for_instance

    slots = time_slots_for_instance(shift_instance)
    act_by_slot = defaultdict(lambda: Decimal("0"))
    qs = (
        ParameterValue.objects.filter(
            parameter_id=parameter_id,
            value_number__isnull=False,
            production_entry__shift_instance=shift_instance,
            production_entry__section_id=section_id,
            production_entry__entry_type="hourly",
        )
        .values("production_entry__slot_index")
        .annotate(act=Sum("value_number"))
    )
    for row in qs:
        act_by_slot[row["production_entry__slot_index"]] = row["act"] or Decimal("0")

    plan = PlanTarget.objects.filter(
        parameter_id=parameter_id,
        section_id=section_id,
        shift_instance=shift_instance,
        period_type=PlanTarget.PERIOD_SHIFT,
    ).first()
    target_per_slot = (plan.target_value / len(slots)) if (plan and slots) else None

    cumulative_act = Decimal("0")
    cumulative_target = Decimal("0")
    curve = []
    for slot_index, start, end in slots:
        cumulative_act += act_by_slot.get(slot_index, Decimal("0"))
        if target_per_slot is not None:
            cumulative_target += target_per_slot
        curve.append(
            {
                "slot_index": slot_index,
                "start_at": start,
                "end_at": end,
                "cumulative_act": cumulative_act,
                "cumulative_target": cumulative_target if target_per_slot is not None else None,
            }
        )
    return curve
