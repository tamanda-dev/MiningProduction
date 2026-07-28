import pytest

from dashboard.services.aggregation import act_vs_plan_for_shift_instance
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
