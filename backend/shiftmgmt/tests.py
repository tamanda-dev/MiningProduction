import pytest

from machines.models import MachineTypeQualification
from shiftmgmt.services import get_or_create_open_instance


@pytest.mark.django_db
def test_time_slots_marks_availability_against_the_server_clock(api_client, machines, django_user_model):
    """is_available must reflect the server's own clock (Africa/Harare,
    per TIME_ZONE), not anything the client supplies — a Shift that
    started 1 minute ago makes its first slot available and its later
    slots (hours from now) not, deterministically regardless of wall-clock
    time when this test runs."""
    from datetime import timedelta

    from django.utils import timezone

    from shiftmgmt.models import Shift

    m_a, _ = machines
    now = timezone.localtime()
    shift = Shift.objects.create(
        site=m_a.site,
        name="Just Started",
        start_time=(now - timedelta(minutes=1)).time(),
        end_time=(now + timedelta(hours=8)).time(),
        slot_length_minutes=60,
    )
    instance = get_or_create_open_instance(m_a.site)
    assert instance.shift_id == shift.id  # sanity: "now" resolved to this shift

    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    MachineTypeQualification.objects.create(user=operator, machine_type=m_a.machine_type, site=m_a.site)
    api_client.force_authenticate(user=operator)

    resp = api_client.get(f"/api/shift-instances/{instance.id}/time-slots/")

    assert resp.status_code == 200
    slots = {row["slot_index"]: row["is_available"] for row in resp.data}
    assert slots[0] is True  # started 1 minute ago
    assert slots[1] is False  # starts ~59 minutes from now


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
