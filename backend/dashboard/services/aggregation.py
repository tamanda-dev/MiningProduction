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


def _parameter_totals(value_qs, plan_qs):
    """Act (sum of ParameterValue.value_number) and Plan (sum of matching
    PlanTarget.target_value) per parameter, collapsed across every section —
    the grain the source "Daily Production Report" spreadsheet uses (one row
    per parameter for the whole site, not broken out by section). Shared by
    both the per-shift and the date-range branches of
    daily_production_report_rows below.
    """
    act_rows = value_qs.values(
        "parameter_id", "parameter__code", "parameter__name", "parameter__uom__abbreviation", "parameter__display_order"
    ).annotate(act=Sum("value_number"))

    plan_by_parameter = defaultdict(lambda: Decimal("0"))
    for pt in plan_qs:
        plan_by_parameter[pt.parameter_id] += pt.target_value

    totals = {}
    for row in act_rows:
        parameter_id = row["parameter_id"]
        totals[parameter_id] = {
            "parameter": parameter_id,
            "parameter_code": row["parameter__code"],
            "parameter_name": row["parameter__name"],
            "uom": row["parameter__uom__abbreviation"],
            "display_order": row["parameter__display_order"],
            "act": row["act"] or Decimal("0"),
            "plan": plan_by_parameter.get(parameter_id),
        }
    # A parameter with a Plan target but zero Act this period still belongs
    # on the report (e.g. nothing logged yet for an hour that just started).
    for parameter_id, plan_total in plan_by_parameter.items():
        totals.setdefault(
            parameter_id,
            {
                "parameter": parameter_id,
                "parameter_code": None,
                "parameter_name": None,
                "uom": None,
                "display_order": 0,
                "act": Decimal("0"),
                "plan": plan_total,
            },
        )
    return totals


def daily_production_report_rows(site_id, date):
    """Per-parameter Act/Plan/%Var for every ShiftInstance on `date` (keyed
    by that instance's Shift name — whatever a site calls its shifts, e.g.
    "Day"/"Night" — not hardcoded), plus Daily Total and Month-to-Date
    columns, matching the source "Daily Production Report" spreadsheet's
    layout: one row per parameter, with a Act/Plan/%Var column-group per
    shift plus Daily Total and MTD column-groups. Reuses
    act_vs_plan_for_shift_instance's per-shift PlanTarget lookup convention
    (PERIOD_SHIFT) and act_vs_plan_for_date_range's day/month convention,
    just collapsed across sections via _parameter_totals above.
    """
    from shiftmgmt.models import ShiftInstance

    date = parse_date(date) if isinstance(date, str) else date
    month_start = date.replace(day=1)

    instances = list(
        ShiftInstance.objects.filter(site_id=site_id, date=date).select_related("shift").order_by("shift__start_time")
    )

    by_shift = {}
    for instance in instances:
        value_qs = ParameterValue.objects.filter(
            production_entry__shift_instance=instance, value_number__isnull=False
        )
        plan_qs = PlanTarget.objects.filter(shift_instance=instance, period_type=PlanTarget.PERIOD_SHIFT)
        by_shift[instance.shift.name] = _parameter_totals(value_qs, plan_qs)

    daily_value_qs = ParameterValue.objects.filter(
        production_entry__site_id=site_id, production_entry__slot_start_at__date=date, value_number__isnull=False
    )
    daily_plan_qs = PlanTarget.objects.filter(site_id=site_id, period_type=PlanTarget.PERIOD_DAY, period_date=date)
    daily_total = _parameter_totals(daily_value_qs, daily_plan_qs)

    mtd_value_qs = ParameterValue.objects.filter(
        production_entry__site_id=site_id,
        production_entry__slot_start_at__date__gte=month_start,
        production_entry__slot_start_at__date__lte=date,
        value_number__isnull=False,
    )
    mtd_plan_qs = PlanTarget.objects.filter(site_id=site_id, period_type=PlanTarget.PERIOD_MONTH, period_date=month_start)
    mtd = _parameter_totals(mtd_value_qs, mtd_plan_qs)

    parameter_ids = set(daily_total) | set(mtd)
    for shift_totals in by_shift.values():
        parameter_ids |= set(shift_totals)

    def _display_order(pid):
        for source in (daily_total, mtd, *by_shift.values()):
            if pid in source:
                return source[pid]["display_order"]
        return 0

    rows = []
    for parameter_id in sorted(parameter_ids, key=_display_order):
        base = daily_total.get(parameter_id) or mtd.get(parameter_id) or next(
            s[parameter_id] for s in by_shift.values() if parameter_id in s
        )
        by_shift_row = {}
        for shift_name, totals in by_shift.items():
            entry = totals.get(parameter_id)
            act = entry["act"] if entry else Decimal("0")
            plan = entry["plan"] if entry else None
            var = (act - plan) if plan is not None else None
            by_shift_row[shift_name] = {"act": act, "plan": plan, "var": var, "pct_var": _pct_var(act, plan)}

        daily_entry = daily_total.get(parameter_id)
        daily_act = daily_entry["act"] if daily_entry else Decimal("0")
        daily_plan = daily_entry["plan"] if daily_entry else None
        daily_var = (daily_act - daily_plan) if daily_plan is not None else None

        mtd_entry = mtd.get(parameter_id)
        mtd_act = mtd_entry["act"] if mtd_entry else Decimal("0")
        mtd_plan = mtd_entry["plan"] if mtd_entry else None
        mtd_var = (mtd_act - mtd_plan) if mtd_plan is not None else None

        # base's code/name/uom can be None if every source that mentioned
        # this parameter only did so via the plan-only fallback in
        # _parameter_totals (a Plan target with zero Act logged anywhere
        # today) — fall back to the Parameter row directly rather than show
        # a blank label on the report.
        parameter_code, parameter_name, uom = base["parameter_code"], base["parameter_name"], base["uom"]
        if parameter_code is None:
            from masterdata.models import Parameter

            param = Parameter.objects.select_related("uom").filter(pk=parameter_id).first()
            if param:
                parameter_code = param.code
                parameter_name = param.name
                uom = param.uom.abbreviation if param.uom else None

        rows.append(
            {
                "parameter": parameter_id,
                "parameter_code": parameter_code,
                "parameter_name": parameter_name,
                "uom": uom,
                "by_shift": by_shift_row,
                "daily_total": {"act": daily_act, "plan": daily_plan, "var": daily_var, "pct_var": _pct_var(daily_act, daily_plan)},
                "mtd": {"act": mtd_act, "plan": mtd_plan, "var": mtd_var, "pct_var": _pct_var(mtd_act, mtd_plan)},
            }
        )
    return {"shift_names": [i.shift.name for i in instances], "rows": rows}


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
