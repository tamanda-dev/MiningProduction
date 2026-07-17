import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import BreakdownIncident
from .reporting import breakdown_pareto_by_cause, mttr_mtbf_trend


def build_crusher_plant_report_pdf(site, date_from, date_to):
    """Tabular-only PDF (no embedded charts), matching the existing XLSX
    export's tabular approach: summary Pareto table, MTTR/MTBF trend
    table, and an open-incidents table.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Crusher Plant Report — {site.name}", styles["Title"]),
        Paragraph(f"{date_from} to {date_to}", styles["Normal"]),
        Spacer(1, 16),
    ]

    story.append(Paragraph("Breakdown Pareto by Cause", styles["Heading2"]))
    pareto_rows = breakdown_pareto_by_cause(site.id, date_from, date_to)
    pareto_table = [["Cause", "Hourly Ticks", "Incidents", "Incident Minutes"]] + [
        [r["cause_name"], r["hourly_tick_count"], r["incident_count"], r["incident_total_minutes"]]
        for r in pareto_rows
    ]
    story.append(_styled_table(pareto_table))
    story.append(Spacer(1, 16))

    story.append(Paragraph("MTTR / MTBF Trend", styles["Heading2"]))
    trend_rows = mttr_mtbf_trend(site.id, date_from=date_from, date_to=date_to)
    trend_table = [["Period", "MTTR (min)", "MTBF (min)", "Incidents"]] + [
        [r["period"], r["mttr_minutes"], r["mtbf_minutes"], r["incident_count"]] for r in trend_rows
    ]
    story.append(_styled_table(trend_table))
    story.append(Spacer(1, 16))

    story.append(Paragraph("Open Incidents", styles["Heading2"]))
    open_incidents = BreakdownIncident.objects.filter(
        site=site, status__in=[BreakdownIncident.STATUS_OPEN, BreakdownIncident.STATUS_IN_PROGRESS]
    ).select_related("crusher", "artisan")
    incidents_table = [["Crusher", "Occurred", "Status", "Artisan"]] + [
        [str(i.crusher), i.time_occurred.strftime("%Y-%m-%d %H:%M"), i.status, str(i.artisan or "Unassigned")]
        for i in open_incidents
    ]
    story.append(_styled_table(incidents_table))

    doc.build(story)
    buffer.seek(0)
    return buffer


def _styled_table(data):
    table = Table(data, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#9ca3af")),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table
