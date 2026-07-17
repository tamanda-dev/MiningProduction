import pytest

from machines import services
from machines.models import Machine, MachineTypeQualification
from machines.services import MachineConflictError


@pytest.mark.django_db
def test_supervisor_cannot_see_other_site_machines(api_client, machines, supervisor_site_a):
    """The spec's core RBAC guarantee: a Site A supervisor must not see
    Site B data. This is what core.mixins.SiteScopedQuerySetMixin exists
    to enforce on every site-scoped viewset.
    """
    m_a, m_b = machines
    api_client.force_authenticate(user=supervisor_site_a)

    resp = api_client.get("/api/machines/")

    assert resp.status_code == 200
    ids = {row["id"] for row in resp.data["results"]}
    assert m_a.id in ids
    assert m_b.id not in ids


@pytest.mark.django_db
def test_operator_sees_machine_via_qualification_not_site_access(
    api_client, machines, sections, all_day_shifts, django_user_model
):
    """Operators typically hold no UserSiteAccess rows at all — their
    visibility into the machine-activation picker comes from
    MachineTypeQualification instead (see MachineViewSet.get_queryset).
    """
    m_a, m_b = machines
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    MachineTypeQualification.objects.create(user=operator, machine_type=m_a.machine_type, site=m_a.site)
    api_client.force_authenticate(user=operator)

    resp = api_client.get("/api/machines/")

    ids = {row["id"] for row in resp.data["results"]}
    assert m_a.id in ids
    assert m_b.id not in ids


@pytest.mark.django_db
def test_operator_qualification_scopes_by_machine_type_not_just_site(
    api_client, machines, second_machine_type, django_user_model
):
    """Regression test: a prior bug scoped MachineViewSet visibility by
    site only, so an operator qualified for one machine type could see
    every machine type at that site. A qualification is a (site,
    machine_type) pair — both must match.
    """
    m_a, _ = machines
    other_type_machine = Machine.objects.create(site=m_a.site, machine_type=second_machine_type, fleet_number="99")
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    MachineTypeQualification.objects.create(user=operator, machine_type=m_a.machine_type, site=m_a.site)
    api_client.force_authenticate(user=operator)

    resp = api_client.get("/api/machines/")

    ids = {row["id"] for row in resp.data["results"]}
    assert m_a.id in ids
    assert other_type_machine.id not in ids


@pytest.mark.django_db
def test_claim_machine_conflict_returns_409(machines, sections, all_day_shifts, django_user_model):
    """DB-first concurrency guarantee: once a machine is actively claimed
    for a shift instance, a second claim attempt must fail cleanly rather
    than silently double-booking the machine.
    """
    m_a, _ = machines
    sec_a, _ = sections
    op1 = django_user_model.objects.create_user(username="op1", password="pass12345")
    op2 = django_user_model.objects.create_user(username="op2", password="pass12345")
    MachineTypeQualification.objects.create(user=op1, machine_type=m_a.machine_type, site=m_a.site)
    MachineTypeQualification.objects.create(user=op2, machine_type=m_a.machine_type, site=m_a.site)

    services.claim_machine(m_a, op1, sec_a)

    with pytest.raises(MachineConflictError):
        services.claim_machine(m_a, op2, sec_a)


@pytest.mark.django_db
def test_release_then_reclaim_succeeds(machines, sections, all_day_shifts, django_user_model):
    m_a, _ = machines
    sec_a, _ = sections
    op1 = django_user_model.objects.create_user(username="op1", password="pass12345")
    op2 = django_user_model.objects.create_user(username="op2", password="pass12345")
    MachineTypeQualification.objects.create(user=op1, machine_type=m_a.machine_type, site=m_a.site)
    MachineTypeQualification.objects.create(user=op2, machine_type=m_a.machine_type, site=m_a.site)

    assignment = services.claim_machine(m_a, op1, sec_a)
    services.release_machine(assignment)

    new_assignment = services.claim_machine(m_a, op2, sec_a)
    assert new_assignment.operator == op2
