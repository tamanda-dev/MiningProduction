import pytest
from django.contrib.auth.models import Group

from accounts.models import UserSiteAccess
from audit.models import AuditLog
from core import scoping


@pytest.fixture
def admin_user(db, django_user_model):
    # Real deployments pre-seed all 3 groups via the seed_groups management
    # command; tests need the same so assign_role/create-with-role can
    # resolve whichever group they target, not just Admin's own.
    for name in (scoping.ADMIN_GROUP, scoping.SUPERVISOR_GROUP, scoping.OPERATOR_GROUP):
        Group.objects.get_or_create(name=name)
    user = django_user_model.objects.create_user(username="admin_1", password="pass12345")
    user.groups.add(Group.objects.get(name=scoping.ADMIN_GROUP))
    return user


@pytest.mark.django_db
def test_non_admin_cannot_create_user(api_client, supervisor_site_a):
    api_client.force_authenticate(user=supervisor_site_a)
    resp = api_client.post(
        "/api/users/",
        {"username": "newop", "password": "SomePass123!", "role": "operator"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_admin_can_create_disable_enable_and_reset_password(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    create_resp = api_client.post(
        "/api/users/",
        {
            "username": "newop",
            "email": "newop@example.com",
            "first_name": "New",
            "last_name": "Operator",
            "password": "SomePass123!",
            "role": "operator",
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.data
    user_id = create_resp.data["id"]
    assert create_resp.data["roles"] == ["operator"]
    assert create_resp.data["is_active"] is True

    disable_resp = api_client.post(f"/api/users/{user_id}/disable/")
    assert disable_resp.status_code == 200
    assert disable_resp.data["is_active"] is False

    enable_resp = api_client.post(f"/api/users/{user_id}/enable/")
    assert enable_resp.status_code == 200
    assert enable_resp.data["is_active"] is True

    reset_resp = api_client.post(f"/api/users/{user_id}/reset_password/", {"new_password": "NewPass456!"}, format="json")
    assert reset_resp.status_code == 200

    # The new password actually took effect.
    login_resp = api_client.post(
        "/api/auth/login/", {"username": "newop", "password": "NewPass456!"}, format="json"
    )
    assert login_resp.status_code == 200


@pytest.mark.django_db
def test_admin_can_assign_role(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    create_resp = api_client.post(
        "/api/users/", {"username": "newop2", "password": "SomePass123!", "role": "operator"}, format="json"
    )
    user_id = create_resp.data["id"]

    assign_resp = api_client.post(f"/api/users/{user_id}/assign_role/", {"role": "supervisor"}, format="json")
    assert assign_resp.status_code == 200
    assert assign_resp.data["roles"] == ["supervisor"]


@pytest.mark.django_db
def test_role_change_and_disable_appear_in_audit_log_without_leaking_password(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    create_resp = api_client.post(
        "/api/users/", {"username": "newop3", "password": "SomePass123!", "role": "operator"}, format="json"
    )
    user_id = create_resp.data["id"]

    api_client.post(f"/api/users/{user_id}/assign_role/", {"role": "supervisor"}, format="json")
    api_client.post(f"/api/users/{user_id}/disable/")

    events = AuditLog.objects.filter(action="user.updated", object_id=str(user_id))
    assert events.exists()
    for event in events:
        assert "password" not in event.changes


@pytest.mark.django_db
def test_user_site_access_is_admin_only(api_client, admin_user, supervisor_site_a, two_sites):
    # supervisor_site_a already holds a grant on site_a (see conftest.py's
    # fixture) — use site_b here so this doesn't collide with the unique
    # (user, site, section) constraint on the row the fixture already made.
    _, site_b = two_sites

    api_client.force_authenticate(user=supervisor_site_a)
    denied = api_client.post(
        "/api/user-site-accesses/", {"user": supervisor_site_a.id, "site": site_b.id}, format="json"
    )
    assert denied.status_code == 403

    api_client.force_authenticate(user=admin_user)
    created = api_client.post(
        "/api/user-site-accesses/", {"user": supervisor_site_a.id, "site": site_b.id}, format="json"
    )
    assert created.status_code == 201
    assert UserSiteAccess.objects.filter(user=supervisor_site_a, site=site_b).exists()


@pytest.mark.django_db
def test_any_authenticated_user_can_change_own_password(api_client, supervisor_site_a):
    api_client.force_authenticate(user=supervisor_site_a)

    wrong_current = api_client.post(
        "/api/auth/change-password/",
        {"current_password": "not-the-real-password", "new_password": "NewPass456!"},
        format="json",
    )
    assert wrong_current.status_code == 400

    changed = api_client.post(
        "/api/auth/change-password/",
        {"current_password": "pass12345", "new_password": "NewPass456!"},
        format="json",
    )
    assert changed.status_code == 200

    login_resp = api_client.post(
        "/api/auth/login/", {"username": "sup_a", "password": "NewPass456!"}, format="json"
    )
    assert login_resp.status_code == 200
