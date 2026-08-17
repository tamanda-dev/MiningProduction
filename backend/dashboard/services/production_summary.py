from decimal import Decimal

from django.utils.dateparse import parse_date

from entries.models import ParameterValue

from .aggregation import _act_rows

# Which dimension a summary report groups by, and how to get from a
# ParameterValue queryset (already filtered to one site/parameter/date
# range) to a (group_id, group_label) pair for each row. "supervisor" here
# means whoever the entry is attributed to as recorded_by — the operator's
# own self-service entries attribute to themselves, but most entries a
# Supervisor reviews/re-keys attribute to that Supervisor.
GROUP_BY_CONFIG = {
    "machine": {
        "fields": ["production_entry__machine_id", "production_entry__machine__fleet_number"],
        "id_field": "production_entry__machine_id",
        "label": lambda row: row["production_entry__machine__fleet_number"] or "—",
    },
    "operator": {
        "fields": [
            "production_entry__operator_id",
            "production_entry__operator__first_name",
            "production_entry__operator__last_name",
            "production_entry__operator__username",
        ],
        "id_field": "production_entry__operator_id",
        "label": lambda row: _user_label(
            row["production_entry__operator__first_name"],
            row["production_entry__operator__last_name"],
            row["production_entry__operator__username"],
        ),
    },
    "supervisor": {
        "fields": [
            "production_entry__recorded_by_id",
            "production_entry__recorded_by__first_name",
            "production_entry__recorded_by__last_name",
            "production_entry__recorded_by__username",
        ],
        "id_field": "production_entry__recorded_by_id",
        "label": lambda row: _user_label(
            row["production_entry__recorded_by__first_name"],
            row["production_entry__recorded_by__last_name"],
            row["production_entry__recorded_by__username"],
        ),
    },
    "shift": {
        "fields": ["production_entry__shift_instance__shift__name"],
        "id_field": "production_entry__shift_instance__shift__name",
        "label": lambda row: row["production_entry__shift_instance__shift__name"] or "—",
    },
}


def _user_label(first_name, last_name, username):
    full_name = " ".join(part for part in (first_name, last_name) if part)
    return full_name or username


def production_summary(site_id, parameter_id, date_from, date_to, group_by, section_id=None):
    """"How many tonnes did this operator/machine/shift/supervisor
    produce" — Act totals for one parameter over a date range, grouped by
    one dimension, rather than filtering the raw entry list down to
    individual rows. Respects Parameter.aggregation the same way every
    other Act computation in this module does (via _act_rows) — an
    averaged parameter like Machine Availability is averaged per group,
    not meaninglessly summed.
    """
    if group_by not in GROUP_BY_CONFIG:
        raise ValueError(f"Unknown group_by '{group_by}'; expected one of {sorted(GROUP_BY_CONFIG)}.")
    config = GROUP_BY_CONFIG[group_by]

    date_from = parse_date(date_from) if isinstance(date_from, str) else date_from
    date_to = parse_date(date_to) if isinstance(date_to, str) else date_to

    value_qs = ParameterValue.objects.filter(
        parameter_id=parameter_id,
        production_entry__site_id=site_id,
        production_entry__slot_start_at__date__gte=date_from,
        production_entry__slot_start_at__date__lte=date_to,
        value_number__isnull=False,
    )
    if section_id:
        value_qs = value_qs.filter(production_entry__section_id=section_id)

    rows = _act_rows(value_qs, config["fields"])

    results = [
        {
            "group": row[config["id_field"]],
            "label": config["label"](row),
            "act": row["act"] or Decimal("0"),
        }
        for row in rows
        if row[config["id_field"]] is not None
    ]
    results.sort(key=lambda r: r["act"], reverse=True)
    return results
