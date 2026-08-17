import pytest
from rest_framework.exceptions import ValidationError

from entries import services
from masterdata.models import UOM, DeliveryDestination, Parameter


@pytest.fixture
def number_parameter(db, machine_type):
    uom, _ = UOM.objects.get_or_create(abbreviation="t", defaults={"name": "Tonnes"})
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


@pytest.mark.django_db
def test_delivery_entry_without_slot_index_is_accepted(
    api_client, two_sites, all_day_shifts, django_user_model
):
    """Regression test: DeliveryEntry's UniqueConstraint(fields=["shift_
    instance","delivery_destination","slot_index"]) has no `condition=`, so
    DRF's auto-generated UniqueTogetherValidator force-marked slot_index
    required=True even though it's blank=True on the model precisely so a
    delivery can be logged without picking one (most real deliveries aren't
    tied to a specific hourly slot). Same footgun fixed elsewhere this
    session; DeliveryEntrySerializer was the one place it was never applied,
    unnoticed because nothing in either client submitted to this endpoint
    until now.
    """
    site_a, _ = two_sites
    destination = DeliveryDestination.objects.create(site=site_a, name="Stockpile A", code="stockpile-a")
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")

    api_client.force_authenticate(user=operator)
    resp = api_client.post(
        "/api/delivery-entries/",
        {"delivery_destination": destination.id, "tonnes": "33.5", "trip_count": 3},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["slot_index"] is None


@pytest.mark.django_db
def test_production_entry_date_to_includes_the_whole_day(
    api_client, machines, sections, all_day_shifts, django_user_model
):
    """Regression test: date_to must match the *date part* of slot_start_at,
    not compare the raw datetime against midnight of that date — a plain
    slot_start_at__lte=2026-07-29 would silently exclude an entry logged at
    2026-07-29 14:00 (everything past midnight on the "to" day), which is
    not what a Supervisor means by "show me entries through the 29th."
    """
    from datetime import datetime, timezone as dt_timezone

    from entries.models import ProductionEntry
    from machines.models import MachineAssignment
    from shiftmgmt.services import get_or_create_open_instance

    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="op1", password="pass12345")
    instance = get_or_create_open_instance(m_a.site)
    assignment = MachineAssignment.objects.create(
        machine=m_a, operator=operator, shift_instance=instance, section=sec_a, status=MachineAssignment.STATUS_ACTIVE
    )
    entry = ProductionEntry.objects.create(
        shift_instance=instance, site=m_a.site, section=sec_a, machine=m_a, machine_assignment=assignment,
        entry_type=ProductionEntry.ENTRY_TYPE_HOURLY, slot_index=0, operator=operator, recorded_by=operator,
        slot_start_at=datetime(2026, 7, 29, 14, 0, tzinfo=dt_timezone.utc),
        slot_end_at=datetime(2026, 7, 29, 15, 0, tzinfo=dt_timezone.utc),
    )

    api_client.force_authenticate(user=operator)
    resp = api_client.get("/api/production-entries/", {"date_from": "2026-07-29", "date_to": "2026-07-29"})
    assert resp.status_code == 200
    assert entry.id in [row["id"] for row in resp.data["results"]]


@pytest.mark.django_db
def test_editing_a_production_entry_preserves_its_shift_instance_and_operator(
    api_client, machines, sections, all_day_shifts, django_user_model, supervisor_site_a
):
    """Regression test: PATCHing an existing entry (e.g. a supervisor
    correcting a value days later) must not silently move it onto whatever
    shift instance happens to be open *right now*, nor reassign it to
    whoever is doing the editing. validate() used to recompute
    shift_instance/operator unconditionally on every save instead of
    falling back to the row's existing values on update — caught live via
    the web dashboard's "Edit entry" flow visibly reassigning an operator's
    entry to the supervisor who corrected it.
    """
    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="entry_owner", password="pass12345")

    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/production-entries/",
        {"section": sec_a.id, "machine": m_a.id, "entry_type": "shift_total", "values": []},
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    entry_id = create_resp.data["id"]
    original_operator_id = create_resp.data["operator"]
    original_shift_instance_id = create_resp.data["shift_instance"]
    assert original_operator_id == operator.id

    api_client.force_authenticate(user=supervisor_site_a)
    patch_resp = api_client.patch(f"/api/production-entries/{entry_id}/", {"comments": "corrected"}, format="json")
    assert patch_resp.status_code == 200, patch_resp.data
    assert patch_resp.data["operator"] == original_operator_id
    assert patch_resp.data["shift_instance"] == original_shift_instance_id


@pytest.mark.django_db
def test_editing_a_breakdown_log_preserves_its_shift_instance_and_operator(
    api_client, machines, sections, all_day_shifts, django_user_model, supervisor_site_a
):
    """Same regression as above, for BreakdownLog — here shift_instance and
    operator are read-only fields the client can never submit at all, so
    the only way validate() could have preserved them on update was to
    check self.instance explicitly, which it didn't."""
    m_a, _ = machines
    sec_a, _ = sections
    operator = django_user_model.objects.create_user(username="entry_owner2", password="pass12345")

    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/breakdown-logs/",
        {
            "machine": m_a.id,
            "section": sec_a.id,
            "start_at": "2026-07-29T14:00:00Z",
            "description": "Hydraulic hose burst",
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    log_id = create_resp.data["id"]
    original_operator_id = create_resp.data["operator"]
    original_shift_instance_id = create_resp.data["shift_instance"]
    assert original_operator_id == operator.id

    api_client.force_authenticate(user=supervisor_site_a)
    patch_resp = api_client.patch(f"/api/breakdown-logs/{log_id}/", {"description": "corrected"}, format="json")
    assert patch_resp.status_code == 200, patch_resp.data
    assert patch_resp.data["operator"] == original_operator_id
    assert patch_resp.data["shift_instance"] == original_shift_instance_id


@pytest.mark.django_db
def test_editing_a_delivery_entry_preserves_its_shift_instance_and_operator(
    api_client, two_sites, all_day_shifts, django_user_model, supervisor_site_a
):
    """Same regression as above, for DeliveryEntry."""
    site_a, _ = two_sites
    destination = DeliveryDestination.objects.create(site=site_a, name="Stockpile B", code="stockpile-b")
    operator = django_user_model.objects.create_user(username="entry_owner3", password="pass12345")

    api_client.force_authenticate(user=operator)
    create_resp = api_client.post(
        "/api/delivery-entries/",
        {"delivery_destination": destination.id, "tonnes": "12.0", "trip_count": 1},
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    entry_id = create_resp.data["id"]
    original_operator_id = create_resp.data["operator"]
    original_shift_instance_id = create_resp.data["shift_instance"]
    assert original_operator_id == operator.id

    api_client.force_authenticate(user=supervisor_site_a)
    patch_resp = api_client.patch(f"/api/delivery-entries/{entry_id}/", {"tonnes": "15.0"}, format="json")
    assert patch_resp.status_code == 200, patch_resp.data
    assert patch_resp.data["operator"] == original_operator_id
    assert patch_resp.data["shift_instance"] == original_shift_instance_id
