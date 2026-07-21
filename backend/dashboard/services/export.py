import io

from openpyxl import Workbook

from .aggregation import act_vs_plan_for_date_range, act_vs_plan_for_shift_instance


def _write_act_vs_plan_rows(ws, rows):
    ws.append(["Section", "Parameter", "UOM", "Act", "Plan", "Var", "%Var"])
    for row in rows:
        ws.append(
            [
                row["section_name"],
                row["parameter_name"],
                row["uom"] or "",
                float(row["act"]),
                float(row["plan"]) if row["plan"] is not None else None,
                float(row["var"]) if row["var"] is not None else None,
                row["pct_var"],
            ]
        )


def build_shift_report_xlsx(shift_instance):
    """Formats close to the source Daily Production Report layout: one
    Act/Plan/Var/%Var row per section+parameter for the shift.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = f"Shift {shift_instance.date}"
    _write_act_vs_plan_rows(ws, act_vs_plan_for_shift_instance(shift_instance))

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def build_daily_report_xlsx(site, date):
    """Same Act/Plan/Var/%Var shape as the shift report, widened to every
    shift instance on one calendar day — matched against PlanTarget's
    PERIOD_DAY figures for that date.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = f"Daily {date}"
    rows = act_vs_plan_for_date_range(site.id, date, date, plan_period_type="day", plan_period_date=date)
    _write_act_vs_plan_rows(ws, rows)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def build_mtd_report_xlsx(site, year, month):
    """Month-to-date Act/Plan/Var/%Var: every shift instance from the 1st of
    the month through today (or the month's end, if generated later),
    matched against PlanTarget's PERIOD_MONTH figure keyed to the month's
    first day (the seed data / admin UI convention for a monthly target).
    """
    import datetime as dt

    month_start = dt.date(year, month, 1)
    today = dt.date.today()
    month_end = (
        today if (today.year, today.month) == (year, month) else dt.date(year, month, 28) + dt.timedelta(days=4)
    )
    if month_end.month != month:
        # rolled into next month via the day-28-plus-4 trick — clamp back
        month_end = month_end.replace(day=1) - dt.timedelta(days=1)

    wb = Workbook()
    ws = wb.active
    ws.title = f"MTD {year}-{month:02d}"
    rows = act_vs_plan_for_date_range(
        site.id, month_start, month_end, plan_period_type="month", plan_period_date=month_start
    )
    _write_act_vs_plan_rows(ws, rows)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
