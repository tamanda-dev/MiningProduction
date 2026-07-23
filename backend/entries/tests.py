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


@pytest.mark.django_db
def test_update_conflicting_slot_returns_400_not_500(
    api_client, machines, sections, all_day_shifts, django_user_model
):
    """Regression test: ProductionEntrySerializer.update() must catch the
    IntegrityError raised by the partial uniq_hourly_slot constraint the
    same way create() does, returning a clean 400 slot_conflict instead of
    an unhandled 500 when a PATCH would collide with another entry's slot.
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
    first_resp = api_client.post(
        "/api/production-entries/",
        {"machine_assignment": assignment.id, "entry_type": "hourly", "slot_index": 0, "values": []},
        format="json",
    )
    assert first_resp.status_code == 201, first_resp.data

    second_resp = api_client.post(
        "/api/production-entries/",
        {"machine_assignment": assignment.id, "entry_type": "hourly", "slot_index": 1, "values": []},
        format="json",
    )
    assert second_resp.status_code == 201, second_resp.data
    second_id = second_resp.data["id"]

    conflict_resp = api_client.patch(
        f"/api/production-entries/{second_id}/", {"slot_index": 0}, format="json"
    )
    assert conflict_resp.status_code == 400
    assert "already exists" in conflict_resp.data.get("detail", "")


@pytest.mark.django_db
def test_failed_value_validation_does_not_orphan_the_entry(
    api_client, machines, sections, all_day_shifts, django_user_model
):
    """Regression test: ProductionEntrySerializer.create() used to insert
    the ProductionEntry row *before* processing `values`, with no shared
    transaction — an invalid parameter code/value left a permanently
    committed entry with zero ParameterValue rows: invisible in every Act
    total (Live Shift View, Downtime Pareto, etc.) yet still occupying its
    (machine, section, slot_index) slot, blocking a legitimate retry.
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
    bad_resp = api_client.post(
        "/api/production-entries/",
        {
            "machine_assignment": assignment.id,
            "entry_type": "hourly",
            "slot_index": 0,
            "values": [{"parameter": "does-not-exist", "value": 1}],
        },
        format="json",
    )
    assert bad_resp.status_code == 400

    from entries.models import ProductionEntry

    assert ProductionEntry.objects.filter(machine_assignment=assignment, slot_index=0).count() == 0

    # The slot must be free for a corrected retry, not blocked by an orphan.
    retry_resp = api_client.post(
        "/api/production-entries/",
        {"machine_assignment": assignment.id, "entry_type": "hourly", "slot_index": 0, "values": []},
        format="json",
    )
    assert retry_resp.status_code == 201, retry_resp.data


@pytest.mark.django_db
def test_hourly_scoped_parameter_rejected_as_shift_total(
    api_client, machines, sections, all_day_shifts, django_user_model, number_parameter
):
    """Regression test: a machine/section-scoped parameter (measured
    hourly) must not also be submittable under entry_type='shift_total' —
    its shift total is the sum of the hourly entries, computed
    automatically, not a second manually-typed figure that would double
    every downstream Act total.
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
    resp = api_client.post(
        "/api/production-entries/",
        {
            "machine_assignment": assignment.id,
            "entry_type": "shift_total",
            "values": [{"parameter": number_parameter.code, "value": 50}],
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "tracked hourly" in str(resp.data).lower()


@pytest.mark.django_db
def test_shift_scoped_parameter_accepted_as_shift_total(
    api_client, machines, sections, all_day_shifts, django_user_model
):
    """The counterpart to the above: a genuine Parameter.SCOPE_SHIFT
    parameter is exactly what entry_type='shift_total' is for, and must
    still work."""
    from machines.models import MachineAssignment
    from shiftmgmt.services import get_or_create_open_instance

    m_a, _ = machines
    sec_a, _ = sections
    shift_param = Parameter.objects.create(
        name="Shift Notes Count", code="shift-notes-count", scope=Parameter.SCOPE_SHIFT,
        data_type=Parameter.DATA_TYPE_NUMBER, section=sec_a,
    )
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")

    instance = get_or_create_open_instance(m_a.site)
    assignment = MachineAssignment.objects.create(
        machine=m_a, operator=operator, shift_instance=instance, section=sec_a, status=MachineAssignment.STATUS_ACTIVE
    )

    api_client.force_authenticate(user=operator)
    resp = api_client.post(
        "/api/production-entries/",
        {
            "machine_assignment": assignment.id,
            "entry_type": "shift_total",
            "values": [{"parameter": shift_param.code, "value": 3}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
