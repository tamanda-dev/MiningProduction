import io

from openpyxl import Workbook

from .aggregation import act_vs_plan_for_shift_instance


def build_shift_report_xlsx(shift_instance):
    """Formats close to the source Daily Production Report layout: one
    Act/Plan/Var/%Var row per section+parameter for the shift.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = f"Shift {shift_instance.date}"
    ws.append(["Section", "Parameter", "UOM", "Act", "Plan", "Var", "%Var"])

    for row in act_vs_plan_for_shift_instance(shift_instance):
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

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
