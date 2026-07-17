from django.db.models import Count, Sum

from entries.models import BreakdownLog


def downtime_pareto(site_id, date_from=None, date_to=None, section_id=None):
    """Breakdown frequency/duration grouped by reason code, ordered
    descending by total downtime minutes — the downtime Pareto chart.
    """
    qs = BreakdownLog.objects.filter(site_id=site_id)
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_at__date__lte=date_to)
    if section_id:
        qs = qs.filter(section_id=section_id)

    rows = (
        qs.values("reason_code_id", "reason_code__description", "reason_code__category")
        .annotate(count=Count("id"), total_minutes=Sum("duration_minutes"))
        .order_by("-total_minutes")
    )
    return [
        {
            "reason_code": r["reason_code_id"],
            "description": r["reason_code__description"] or "Unspecified",
            "category": r["reason_code__category"] or "",
            "count": r["count"],
            "total_minutes": r["total_minutes"] or 0,
        }
        for r in rows
    ]
