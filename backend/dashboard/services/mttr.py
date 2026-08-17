from django.db.models import Avg, Count


def general_fleet_mttr(site_id, section_id, date_from, date_to):
    """Actual Mean Time to Repair for the general fleet (non-crusher —
    crushers have their own MTTR via crusher_ops.reporting.mttr_mtbf_trend)
    over [date_from, date_to], plus the relevant Plan Target for the
    "mttr-minutes" parameter, if an admin has set one — same target-vs-
    actual shape as the Availability page, for repair speed instead of
    uptime %.

    Only BreakdownLogs that have actually been fixed (repair_status is
    "fixed" or "confirmed", so duration_minutes is set) count — an open or
    merely-acknowledged breakdown has no repair time yet to average in.
    """
    from entries.models import BreakdownLog
    from masterdata.models import Parameter
    from planning.models import PlanTarget

    qs = BreakdownLog.objects.filter(
        site_id=site_id,
        repair_status__in=[BreakdownLog.REPAIR_FIXED, BreakdownLog.REPAIR_CONFIRMED],
        duration_minutes__isnull=False,
        start_at__date__gte=date_from,
        start_at__date__lte=date_to,
    )
    if section_id:
        qs = qs.filter(section_id=section_id)

    agg = qs.aggregate(avg_minutes=Avg("duration_minutes"), count=Count("id"))

    target_mttr_minutes = None
    parameter = Parameter.objects.filter(code="mttr-minutes").first()
    if parameter is not None:
        plan_qs = PlanTarget.objects.filter(parameter=parameter, site_id=site_id)
        if section_id:
            plan_qs = plan_qs.filter(section_id=section_id)
        # A Month target covering the range wins over a Day target, since
        # this is usually queried over a date range rather than one day —
        # fall back to any Day target that falls inside the range.
        plan = plan_qs.filter(
            period_type=PlanTarget.PERIOD_MONTH,
            period_date__year=date_from.year,
            period_date__month=date_from.month,
        ).first()
        if plan is None:
            plan = plan_qs.filter(
                period_type=PlanTarget.PERIOD_DAY, period_date__gte=date_from, period_date__lte=date_to
            ).first()
        target_mttr_minutes = plan.target_value if plan else None

    return {
        "site": site_id,
        "section": section_id,
        "date_from": date_from,
        "date_to": date_to,
        "actual_mttr_minutes": agg["avg_minutes"],
        "target_mttr_minutes": target_mttr_minutes,
        "breakdown_count": agg["count"],
    }
