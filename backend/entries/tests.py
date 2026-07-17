import pytest
from rest_framework.exceptions import ValidationError

from entries import services
from masterdata.models import UOM, Parameter


@pytest.fixture
def number_parameter(db, machine_type):
    uom = UOM.objects.create(name="Tonnes", abbreviation="t")
    param = Parameter.objects.create(
        name="Tonnes Hauled",
        code="tonnes-hauled",
        uom=uom,
        scope=Parameter.SCOPE_MACHINE,
        data_type=Parameter.DATA_TYPE_NUMBER,
        min_value=0,
        max_value=100,
    )
    param.applicable_machine_types.add(machine_type)
    return param


@pytest.mark.django_db
def test_coerce_value_accepts_valid_number(number_parameter):
    result = services.coerce_value(number_parameter, "42.5")
    assert result == {"value_number": 42.5}


@pytest.mark.django_db
def test_coerce_value_rejects_out_of_range(number_parameter):
    with pytest.raises(ValidationError):
        services.coerce_value(number_parameter, "500")


@pytest.mark.django_db
def test_coerce_value_rejects_non_numeric(number_parameter):
    with pytest.raises(ValidationError):
        services.coerce_value(number_parameter, "not-a-number")


@pytest.mark.django_db
def test_resolve_parameter_by_code(number_parameter):
    assert services.resolve_parameter("tonnes-hauled") == number_parameter


@pytest.mark.django_db
def test_resolve_parameter_unknown_code_raises():
    with pytest.raises(ValidationError):
        services.resolve_parameter("does-not-exist")


@pytest.mark.django_db
def test_operator_can_see_own_entry_without_site_access(
    api_client, machines, sections, all_day_shifts, django_user_model
):
    """Regression test: SiteScopedOrOwnQuerySetMixin must let an operator
    with zero UserSiteAccess rows (the normal case) still see and edit an
    entry they themselves submitted — a plain SiteScopedQuerySetMixin
    filters such rows out entirely, previously causing a spurious 404.
    """
    from machines.models import MachineAssignment
    from shiftmgmt.services import get_or_create_open_instance

    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")

    instance = get_or_create_open_instance(m_a.site)
    assignment = MachineAssignment.objects.create(
        machine=m_a, operator=operator, shift_instance=instance, section=sec_a, status=MachineAssignment.STATUS_ACTIVE
    )

    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/production-entries/",
        {"machine_assignment": assignment.id, "entry_type": "shift_total", "values": []},
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    entry_id = create_resp.data["id"]

    detail_resp = api_client.get(f"/api/production-entries/{entry_id}/")
    assert detail_resp.status_code == 200


@pytest.mark.django_db
def test_operator_cannot_change_own_entry_status(
    api_client, machines, sections, all_day_shifts, django_user_model
):
    """Flagging/correcting/approving is a Supervisor+ action, even on an
    entry the operator owns and can otherwise freely edit.
    """
    from machines.models import MachineAssignment
    from shiftmgmt.services import get_or_create_open_instance

    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")

    instance = get_or_create_open_instance(m_a.site)
    assignment = MachineAssignment.objects.create(
        machine=m_a, operator=operator, shift_instance=instance, section=sec_a, status=MachineAssignment.STATUS_ACTIVE
    )

    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/production-entries/",
        {"machine_assignment": assignment.id, "entry_type": "shift_total", "values": []},
        format="json",
    )
    entry_id = create_resp.data["id"]

    flag_resp = api_client.patch(
        f"/api/production-entries/{entry_id}/", {"status": "flagged"}, format="json"
    )
    assert flag_resp.status_code == 403
