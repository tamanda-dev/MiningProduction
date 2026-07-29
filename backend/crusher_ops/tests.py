from datetime import time, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import Group
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core import scoping
from entries.models import ParameterValue, ProductionEntry
from machines.models import Machine
from masterdata.models import UOM, MachineType, Parameter, Section, Site
from shiftmgmt.models import Shift
from shiftmgmt.services import get_or_create_open_instance

from . import services
from .models import BreakdownCause, BreakdownIncident, HourlySlot, ShiftCrushingSummary


@pytest.fixture
def site(db):
    return Site.objects.create(name="Site A", code="site-a")


@pytest.fixture
def section(db, site):
    return Section.objects.create(site=site, name="Sec A", code="sec-a")


@pytest.fixture
def crusher_machine_type(db):
    return MachineType.objects.create(name="Crusher", code="cru")


@pytest.fixture
def other_machine_type(db):
    return MachineType.objects.create(name="Dump Truck", code="dut")


@pytest.fixture
def crusher_machine(db, site, section, crusher_machine_type):
    return Machine.objects.create(
        site=site, machine_type=crusher_machine_type, fleet_number="1", current_section=section
    )


@pytest.fixture
def other_machine(db, site, section, other_machine_type):
    return Machine.objects.create(site=site, machine_type=other_machine_type, fleet_number="2", current_section=section)


@pytest.fixture
def all_day_shift(db, site):
    return Shift.objects.create(site=site, name="All-Day", start_time="00:00", end_time="00:00")


@pytest.fixture
def shift_instance(db, site, all_day_shift):
    return get_or_create_open_instance(site)


@pytest.fixture
def hourly_slot(db, site):
    return HourlySlot.objects.create(site=site, slot_index=0, start_time=time(0, 0), end_time=time(1, 0))


@pytest.fixture
def breakdown_cause(db):
    return BreakdownCause.objects.create(name="Belt Tear", code="belt-tear")


@pytest.fixture
def tonnes_crushed_parameter(db):
    # Already seeded by crusher_ops migration 0007 for every real
    # deployment — get_or_create so this fixture works the same whether
    # that migration has run against this test DB or not.
    uom, _ = UOM.objects.get_or_create(abbreviation="t", defaults={"name": "Tonnes"})
    parameter, _ = Parameter.objects.get_or_create(
        code="tonnes-crushed",
        defaults={
            "name": "Tonnes Crushed",
            "uom": uom,
            "scope": Parameter.SCOPE_MACHINE,
            "data_type": Parameter.DATA_TYPE_NUMBER,
            "aggregation": Parameter.AGGREGATION_SUM,
        },
    )
    return parameter


@pytest.fixture
def operator(db, django_user_model):
    return django_user_model.objects.create_user(username="op1", password="pass12345")


@pytest.fixture
def supervisor(db, django_user_model, site):
    from accounts.models import UserSiteAccess

    group, _ = Group.objects.get_or_create(name=scoping.SUPERVISOR_GROUP)
    user = django_user_model.objects.create_user(username="sup1", password="pass12345")
    user.groups.add(group)
    UserSiteAccess.objects.create(user=user, site=site)
    return user


@pytest.fixture
def artisan(db, django_user_model):
    return django_user_model.objects.create_user(
        username="artisan1", password="pass12345", maintenance_technician=True
    )


@pytest.mark.django_db
def test_validate_crusher_machine_rejects_non_crusher(other_machine):
    with pytest.raises(ValidationError):
        services.validate_crusher_machine(other_machine)


@pytest.mark.django_db
def test_validate_crusher_machine_accepts_crusher(crusher_machine):
    services.validate_crusher_machine(crusher_machine)  # does not raise


@pytest.mark.django_db
def test_hourly_slot_unique_per_site_and_index(site):
    HourlySlot.objects.create(site=site, slot_index=5, start_time=time(5, 0), end_time=time(6, 0))
    with pytest.raises(IntegrityError):
        HourlySlot.objects.create(site=site, slot_index=5, start_time=time(6, 0), end_time=time(7, 0))


@pytest.mark.django_db
def test_operator_can_submit_hourly_checklist_entry(
    api_client, crusher_machine, all_day_shift, hourly_slot, operator
):
    from .models import ChecklistItem

    item, _ = ChecklistItem.objects.get_or_create(code="safety-talk", defaults={"name": "Safety Talk"})
    api_client.force_authenticate(user=operator)
    resp = api_client.post(
        "/api/hourly-checklist-entries/",
        {"crusher": crusher_machine.id, "hourly_slot": hourly_slot.id, "checklist_item": item.id, "is_completed": True},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["slot_start_at"] is not None


@pytest.mark.django_db
def test_duplicate_hourly_checklist_entry_returns_clean_conflict(
    api_client, crusher_machine, all_day_shift, hourly_slot, operator
):
    from .models import ChecklistItem

    item, _ = ChecklistItem.objects.get_or_create(code="safety-talk", defaults={"name": "Safety Talk"})
    api_client.force_authenticate(user=operator)
    payload = {
        "crusher": crusher_machine.id,
        "hourly_slot": hourly_slot.id,
        "checklist_item": item.id,
        "is_completed": True,
    }
    first = api_client.post("/api/hourly-checklist-entries/", payload, format="json")
    assert first.status_code == 201
    second = api_client.post("/api/hourly-checklist-entries/", payload, format="json")
    assert second.status_code == 400


@pytest.mark.django_db
def test_bulk_sync_reports_duplicate_as_slot_conflict_for_mobile_retry_logic(
    api_client, crusher_machine, all_day_shift, hourly_slot, operator
):
    """The mobile offline queue (mobile/src/api/queue.ts::isConflictError)
    distinguishes a real per-item rejection (won't auto-retry) from a
    transient network failure (will) by checking for "slot_conflict" in the
    bulk endpoint's per-item errors — this is that contract's backend half.
    """
    from .models import ChecklistItem, HourlyChecklistEntry

    item, _ = ChecklistItem.objects.get_or_create(code="safety-talk", defaults={"name": "Safety Talk"})
    HourlyChecklistEntry.objects.create(
        shift_instance=get_or_create_open_instance(crusher_machine.site),
        site=crusher_machine.site,
        crusher=crusher_machine,
        hourly_slot=hourly_slot,
        slot_start_at=timezone.now(),
        slot_end_at=timezone.now(),
        checklist_item=item,
        is_completed=True,
        operator=operator,
        recorded_by=operator,
    )

    api_client.force_authenticate(user=operator)
    resp = api_client.post(
        "/api/hourly-checklist-entries/bulk/",
        [
            {
                "client_uuid": "11111111-1111-1111-1111-111111111111",
                "crusher": crusher_machine.id,
                "hourly_slot": hourly_slot.id,
                "checklist_item": item.id,
                "is_completed": True,
            }
        ],
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data[0]["success"] is False
    assert "slot_conflict" in str(resp.data[0]["errors"])


@pytest.mark.django_db
def test_hourly_breakdown_entry_requires_other_text_when_other_cause_selected(
    api_client, crusher_machine, all_day_shift, hourly_slot, operator
):
    other, _ = BreakdownCause.objects.get_or_create(code="other", defaults={"name": "Other", "is_other": True})
    api_client.force_authenticate(user=operator)
    resp = api_client.post(
        "/api/hourly-breakdown-entries/",
        {"crusher": crusher_machine.id, "hourly_slot": hourly_slot.id, "causes": [other.id]},
        format="json",
    )
    assert resp.status_code == 400
    assert "other_cause_text" in resp.data["detail"]


@pytest.mark.django_db
def test_artisan_must_be_flagged_maintenance_technician(
    api_client, crusher_machine, supervisor, operator
):
    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/breakdown-incidents/",
        {
            "crusher": crusher_machine.id,
            "time_occurred": timezone.now().isoformat(),
            "description": "Motor tripped",
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    incident_id = create_resp.data["id"]

    api_client.force_authenticate(user=supervisor)
    assign_resp = api_client.post(
        f"/api/breakdown-incidents/{incident_id}/assign/", {"artisan": operator.id}, format="json"
    )
    assert assign_resp.status_code == 400


@pytest.mark.django_db
def test_assign_and_resolve_incident_flow(api_client, crusher_machine, supervisor, artisan, operator):
    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/breakdown-incidents/",
        {
            "crusher": crusher_machine.id,
            "time_occurred": timezone.now().isoformat(),
            "description": "Motor tripped",
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    incident_id = create_resp.data["id"]

    api_client.force_authenticate(user=supervisor)
    assign_resp = api_client.post(
        f"/api/breakdown-incidents/{incident_id}/assign/", {"artisan": artisan.id}, format="json"
    )
    assert assign_resp.status_code == 200, assign_resp.data
    assert assign_resp.data["status"] == "in_progress"

    # "Mark Attended" is a distinct step from assignment (the artisan
    # travels to site before starting work) — PATCH is available to the
    # assigned artisan per CanWriteBreakdownIncident's object check.
    api_client.force_authenticate(user=artisan)
    attend_resp = api_client.patch(
        f"/api/breakdown-incidents/{incident_id}/", {"time_attended": timezone.now().isoformat()}, format="json"
    )
    assert attend_resp.status_code == 200, attend_resp.data

    resolve_resp = api_client.post(
        f"/api/breakdown-incidents/{incident_id}/resolve/",
        {"root_cause_of_failure": "Worn bearing", "remedial_action_taken": "Replaced bearing"},
        format="json",
    )
    assert resolve_resp.status_code == 200, resolve_resp.data
    assert resolve_resp.data["status"] == "resolved"
    assert resolve_resp.data["repair_minutes"] is not None


@pytest.mark.django_db
def test_reporting_operator_cannot_edit_after_status_leaves_open(
    api_client, crusher_machine, supervisor, artisan, operator
):
    """Once an artisan is assigned (status flips to in_progress), editing
    the timeline is a maintenance decision, not the original reporter's."""
    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/breakdown-incidents/",
        {"crusher": crusher_machine.id, "time_occurred": timezone.now().isoformat(), "description": "Jam"},
        format="json",
    )
    incident_id = create_resp.data["id"]

    api_client.force_authenticate(user=supervisor)
    api_client.post(f"/api/breakdown-incidents/{incident_id}/assign/", {"artisan": artisan.id}, format="json")

    api_client.force_authenticate(user=operator)
    patch_resp = api_client.patch(
        f"/api/breakdown-incidents/{incident_id}/", {"description": "Updated by reporter"}, format="json"
    )
    assert patch_resp.status_code == 403


@pytest.mark.django_db
def test_shift_crushing_summary_tonnage_recompute(
    site, section, crusher_machine, all_day_shift, hourly_slot, tonnes_crushed_parameter, operator
):
    """Tonnage is sourced from ordinary Production Entries against the
    crusher Machine (the "Tonnes Crushed" parameter) — there is no separate
    crusher-throughput model/screen. Crushing time is derived from the
    site's configured HourlySlot window (60 minutes here) minus downtime
    (zero in this test), not manually entered.
    """
    instance = get_or_create_open_instance(site)
    for slot_index, tonnes in enumerate([Decimal("120.5"), Decimal("80.0")]):
        entry = ProductionEntry.objects.create(
            shift_instance=instance,
            site=site,
            section=section,
            machine=crusher_machine,
            entry_type=ProductionEntry.ENTRY_TYPE_HOURLY,
            slot_index=slot_index,
            operator=operator,
            recorded_by=operator,
        )
        ParameterValue.objects.create(
            production_entry=entry, parameter=tonnes_crushed_parameter, value_number=tonnes
        )

    summary = services.refresh_summary_for(crusher_machine, instance, operator)

    assert summary.crushed_tonnage == Decimal("200.5")
    assert summary.down_time_minutes == 0
    assert summary.crushing_time_minutes == 60
    assert summary.availability_pct == Decimal("100.00")


@pytest.mark.django_db
def test_shift_crushing_summary_availability_accounts_for_resolved_incident(
    site, crusher_machine, all_day_shift, hourly_slot, operator
):
    instance = get_or_create_open_instance(site)
    occurred = timezone.now() - timedelta(hours=1)
    BreakdownIncident.objects.create(
        site=site,
        crusher=crusher_machine,
        shift_instance=instance,
        time_occurred=occurred,
        time_reported=occurred,
        time_attended=occurred + timedelta(minutes=5),
        time_completed=occurred + timedelta(minutes=35),
        status=BreakdownIncident.STATUS_RESOLVED,
        reported_by=operator,
        recorded_by=operator,
    )
    summary = services.refresh_summary_for(crusher_machine, instance, operator)

    assert summary.down_time_minutes == 35
    assert summary.stoppage_instances == 1
    # 60-minute HourlySlot window minus 35 minutes of downtime.
    assert summary.crushing_time_minutes == 25
    assert summary.availability_pct == Decimal(25) / Decimal(60) * 100


@pytest.mark.django_db
def test_refresh_summary_for_auto_creates_summary(site, crusher_machine, all_day_shift, hourly_slot, operator):
    """No Supervisor ever manually POSTs a ShiftCrushingSummary — it's
    get-or-created the first time any crusher_ops activity is recorded for
    a shift, so the Crusher Plant Summary dashboard has something to show
    from the very first checklist tick or breakdown entry.
    """
    instance = get_or_create_open_instance(site)
    assert not ShiftCrushingSummary.objects.filter(crusher=crusher_machine, shift_instance=instance).exists()

    services.refresh_summary_for(crusher_machine, instance, operator)

    summary = ShiftCrushingSummary.objects.get(crusher=crusher_machine, shift_instance=instance)
    assert summary.site == site
    assert summary.recorded_by == operator
    assert summary.crushing_time_minutes == 60


@pytest.mark.django_db
def test_hourly_checklist_entry_completed_at_stamped_when_marked_done(
    api_client, crusher_machine, all_day_shift, hourly_slot, operator
):
    from .models import ChecklistItem

    item, _ = ChecklistItem.objects.get_or_create(code="safety-talk", defaults={"name": "Safety Talk"})
    api_client.force_authenticate(user=operator)
    resp = api_client.post(
        "/api/hourly-checklist-entries/",
        {"crusher": crusher_machine.id, "hourly_slot": hourly_slot.id, "checklist_item": item.id, "is_completed": True},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["completed_at"] is not None
