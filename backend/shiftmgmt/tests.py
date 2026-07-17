import pytest

from machines.models import MachineTypeQualification
from shiftmgmt.services import get_or_create_open_instance


@pytest.mark.django_db
def test_operator_can_read_shift_instances_for_qualified_site(
    api_client, machines, all_day_shifts, django_user_model
):
    """Regression test: ShiftInstance/Shift previously used the plain
    UserSiteAccess-based site scoping, which returns an *empty* set (not
    None) for an Operator with no UserSiteAccess rows — the normal case.
    That silently 404'd every shift-instance/time-slots lookup an operator
    made, even though ReadOnlyOrSupervisorOrAbove was supposed to let any
    authenticated user read this data.
    """
    m_a, _ = machines
    get_or_create_open_instance(m_a.site)
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    MachineTypeQualification.objects.create(user=operator, machine_type=m_a.machine_type, site=m_a.site)
    api_client.force_authenticate(user=operator)

    resp = api_client.get("/api/shift-instances/", {"site": m_a.site_id})

    assert resp.status_code == 200
    assert resp.data["count"] >= 1


@pytest.mark.django_db
def test_operator_without_qualification_cannot_read_other_site_shift_instances(
    api_client, machines, all_day_shifts, django_user_model
):
    m_a, m_b = machines
    get_or_create_open_instance(m_a.site)
    get_or_create_open_instance(m_b.site)
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    MachineTypeQualification.objects.create(user=operator, machine_type=m_a.machine_type, site=m_a.site)
    api_client.force_authenticate(user=operator)

    resp = api_client.get("/api/shift-instances/", {"site": m_b.site_id})

    assert resp.status_code == 200
    assert resp.data["count"] == 0
