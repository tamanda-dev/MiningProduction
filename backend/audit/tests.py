import pytest

from .models import AuditLog


@pytest.mark.django_db
def test_masterdata_edit_is_queryable_via_audit_log(api_client, supervisor_site_a, two_sites):
    """Regression test: HistoricalRecords full-coverage pass added
    `history = HistoricalRecords()` to every masterdata model. Confirms an
    edit to one of them (Section, previously untracked) is bridged into
    AuditLog by audit/signals.py::bridge_history_to_audit_log and is
    queryable via GET /api/audit-log/?action=<model>.updated, the same as
    any model that already had history tracking.
    """
    from masterdata.models import Section

    site_a, _ = two_sites
    section = Section.objects.create(site=site_a, name="Original Name", code="orig")

    section.name = "Renamed"
    section.save()

    assert AuditLog.objects.filter(action="section.updated", object_id=str(section.pk)).exists()

    api_client.force_authenticate(user=supervisor_site_a)
    resp = api_client.get("/api/audit-log/", {"action": "section.updated"})
    assert resp.status_code == 200
    results = resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
    assert any(row["object_id"] == str(section.pk) for row in results)
