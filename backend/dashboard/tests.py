import pytest
from openpyxl import load_workbook

from dashboard.services.aggregation import act_vs_plan_for_shift_instance
from dashboard.services.export import (
    build_daily_production_report_xlsx,
    build_daily_report_xlsx,
    build_mtd_report_xlsx,
    build_shift_report_xlsx,
)
from entries.models import ParameterValue, ProductionEntry
from masterdata.models import UOM, Parameter
from shiftmgmt.services import get_or_create_open_instance


@pytest.mark.django_db
def test_average_aggregation_parameter_is_averaged_not_summed(
    machines, sections, all_day_shifts, django_user_model
):
    """Regression test: a Parameter.aggregation="average" parameter (e.g.
    Machine Availability %) must roll up hourly readings by averaging them,
    not summing — three hourly readings of 99/99/100% must produce ~99.33,
    not the meaningless "298" a plain Sum would give.
    """
    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    uom = UOM.objects.create(name="Percent", abbreviation="%")
    parameter = Parameter.objects.create(
        name="Machine Availability",
        code="machine-availability",
        uom=uom,
        scope=Parameter.SCOPE_MACHINE,
        data_type=Parameter.DATA_TYPE_NUMBER,
        aggregation=Parameter.AGGREGATION_AVERAGE,
    )
    parameter.applicable_machine_types.add(m_a.machine_type)

    instance = get_or_create_open_instance(m_a.site)
    for slot_index, value in enumerate([99, 99, 100]):
        entry = ProductionEntry.objects.create(
            shift_instance=instance,
            site=m_a.site,
            section=sec_a,
            machine=m_a,
            entry_type=ProductionEntry.ENTRY_TYPE_HOURLY,
            slot_index=slot_index,
            operator=operator,
            recorded_by=operator,
        )
        ParameterValue.objects.create(production_entry=entry, parameter=parameter, value_number=value)

    results = act_vs_plan_for_shift_instance(instance)
    row = next(r for r in results if r["parameter"] == parameter.id)
    assert float(row["act"]) == pytest.approx(99.333, abs=0.01)


@pytest.mark.django_db
def test_sum_aggregation_parameter_still_sums(machines, sections, all_day_shifts, django_user_model):
    """The default/unset aggregation ("sum") must keep behaving exactly as
    before this field existed — additive quantities like tonnes hauled are
    genuinely a total across the shift's hourly entries."""
    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    parameter = Parameter.objects.create(
        name="Tonnes Hauled", code="tonnes-hauled-sum-test", scope=Parameter.SCOPE_MACHINE,
        data_type=Parameter.DATA_TYPE_NUMBER,
    )
    parameter.applicable_machine_types.add(m_a.machine_type)

    instance = get_or_create_open_instance(m_a.site)
    for slot_index, value in enumerate([40, 45, 50]):
        entry = ProductionEntry.objects.create(
            shift_instance=instance,
            site=m_a.site,
            section=sec_a,
            machine=m_a,
            entry_type=ProductionEntry.ENTRY_TYPE_HOURLY,
            slot_index=slot_index,
            operator=operator,
            recorded_by=operator,
        )
        ParameterValue.objects.create(production_entry=entry, parameter=parameter, value_number=value)

    results = act_vs_plan_for_shift_instance(instance)
    row = next(r for r in results if r["parameter"] == parameter.id)
    assert row["act"] == 135


@pytest.fixture
def act_vs_plan_data(machines, sections, all_day_shifts, django_user_model):
    """One hourly entry + a same-shift PlanTarget, so every export builder
    below has at least one real Act/Plan/Var/%Var row to format."""
    from planning.models import PlanTarget

    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="op_export", password="pass12345")
    parameter = Parameter.objects.create(
        name="Tonnes Hauled", code="tonnes-hauled-export-test", scope=Parameter.SCOPE_MACHINE,
        data_type=Parameter.DATA_TYPE_NUMBER,
    )
    parameter.applicable_machine_types.add(m_a.machine_type)

    from entries.services import resolve_slot_datetimes

    instance = get_or_create_open_instance(m_a.site)
    slot_start_at, slot_end_at = resolve_slot_datetimes(instance, 0)
    entry = ProductionEntry.objects.create(
        shift_instance=instance, site=m_a.site, section=sec_a, machine=m_a,
        entry_type=ProductionEntry.ENTRY_TYPE_HOURLY, slot_index=0,
        slot_start_at=slot_start_at, slot_end_at=slot_end_at,
        operator=operator, recorded_by=operator,
    )
    ParameterValue.objects.create(production_entry=entry, parameter=parameter, value_number=55)
    PlanTarget.objects.create(
        parameter=parameter, site=m_a.site, section=sec_a,
        period_type=PlanTarget.PERIOD_SHIFT, shift_instance=instance, target_value=100,
    )
    return instance, m_a.site


@pytest.mark.django_db
def test_shift_report_xlsx_is_formatted(act_vs_plan_data):
    instance, _site = act_vs_plan_data
    wb = load_workbook(build_shift_report_xlsx(instance))
    ws = wb.active

    header = ws["A1"]
    assert header.font.bold is True
    assert header.fill.fgColor.rgb == "001F4E78"
    assert ws["D2"].number_format == "#,##0.0"  # Act
    assert ws["G2"].number_format == '0.0"%"'  # %Var
    assert ws.freeze_panes == "A2"
    assert ws.column_dimensions["B"].width > 8  # "Parameter" header auto-sized, not left at default


@pytest.mark.django_db
def test_daily_report_xlsx_is_formatted(act_vs_plan_data):
    instance, site = act_vs_plan_data
    wb = load_workbook(build_daily_report_xlsx(site, instance.date))
    ws = wb.active
    assert ws["A1"].font.bold is True
    assert ws["D2"].number_format == "#,##0.0"


@pytest.mark.django_db
def test_mtd_report_xlsx_is_formatted(act_vs_plan_data):
    instance, site = act_vs_plan_data
    wb = load_workbook(build_mtd_report_xlsx(site, instance.date.year, instance.date.month))
    ws = wb.active
    assert ws["A1"].font.bold is True
    assert ws["D2"].number_format == "#,##0.0"


@pytest.mark.django_db
def test_daily_production_report_xlsx_is_formatted(act_vs_plan_data):
    instance, site = act_vs_plan_data
    wb = load_workbook(build_daily_production_report_xlsx(site, instance.date))
    ws = wb.active

    # Row 4/5 are the merged group headers + column sub-headers; data starts row 6.
    assert ws["A4"].font.bold is True
    assert ws["C4"].fill.fgColor.rgb in {"00F4B183", "00A9D18E"}  # Day/Night shift band color
    assert ws["C6"].number_format == "#,##0.0"  # first shift's Act column
    assert ws.freeze_panes == "C6"
