import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from accounts.models import UserSiteAccess
from core import scoping
from machines.models import Machine
from masterdata.models import MachineType, Section, Site
from shiftmgmt.models import Shift


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def two_sites(db):
    site_a = Site.objects.create(name="Site A", code="site-a")
    site_b = Site.objects.create(name="Site B", code="site-b")
    return site_a, site_b


@pytest.fixture
def machine_type(db):
    return MachineType.objects.create(name="Dump Truck", code="dut")


@pytest.fixture
def second_machine_type(db):
    return MachineType.objects.create(name="Load-Haul-Dump", code="lhd")


@pytest.fixture
def sections(db, two_sites):
    site_a, site_b = two_sites
    sec_a = Section.objects.create(site=site_a, name="Sec A", code="sec-a")
    sec_b = Section.objects.create(site=site_b, name="Sec B", code="sec-b")
    return sec_a, sec_b


@pytest.fixture
def machines(db, two_sites, machine_type):
    site_a, site_b = two_sites
    m_a = Machine.objects.create(site=site_a, machine_type=machine_type, fleet_number="1")
    m_b = Machine.objects.create(site=site_b, machine_type=machine_type, fleet_number="2")
    return m_a, m_b


@pytest.fixture
def all_day_shifts(db, two_sites):
    """Covers every time of day so tests don't depend on wall-clock time."""
    site_a, site_b = two_sites
    shift_a = Shift.objects.create(site=site_a, name="All-Day", start_time="00:00", end_time="00:00")
    shift_b = Shift.objects.create(site=site_b, name="All-Day", start_time="00:00", end_time="00:00")
    return shift_a, shift_b


@pytest.fixture
def supervisor_site_a(db, django_user_model, two_sites):
    site_a, _ = two_sites
    group, _ = Group.objects.get_or_create(name=scoping.SUPERVISOR_GROUP)
    user = django_user_model.objects.create_user(username="sup_a", password="pass12345")
    user.groups.add(group)
    UserSiteAccess.objects.create(user=user, site=site_a)
    return user
