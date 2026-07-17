"""Role-group and site/section accessibility helpers shared by permissions
and queryset-scoping mixins. Kept dependency-light (deferred model imports)
so `core` does not import `accounts` at module load time.
"""

ADMIN_GROUP = "Admin"
MANAGER_GROUP = "Manager"
SUPERVISOR_GROUP = "Supervisor"
OPERATOR_GROUP = "Operator"


def _in_group(user, group_name):
    return bool(user and user.is_authenticated and user.groups.filter(name=group_name).exists())


def is_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or _in_group(user, ADMIN_GROUP)))


def is_manager(user):
    return is_admin(user) or _in_group(user, MANAGER_GROUP)


def is_supervisor(user):
    return is_manager(user) or _in_group(user, SUPERVISOR_GROUP)


def is_operator(user):
    return _in_group(user, OPERATOR_GROUP)


def accessible_site_ids(user):
    """Returns None for "unrestricted" (Admin, or a Manager with no explicit
    UserSiteAccess rows), otherwise a set of accessible Site ids.
    """
    if is_admin(user):
        return None
    from accounts.models import UserSiteAccess

    rows = UserSiteAccess.objects.filter(user=user)
    if is_manager(user) and not rows.exists():
        return None
    return set(rows.values_list("site_id", flat=True))


def accessible_site_ids_including_qualifications(user):
    """Like accessible_site_ids, but also includes sites the user holds any
    active MachineTypeQualification for. Operators typically hold no
    UserSiteAccess rows at all (that's the Manager/Supervisor grant
    mechanism) — for site-wide-but-not-machine-specific resources like
    Shift/ShiftInstance, an operator still needs to read data for the
    site(s) they're qualified to work at. (Machine visibility itself needs
    finer (site, machine_type) pairing — see machines/views.py — but shifts
    aren't tied to a machine type, so site-level qualification is the
    right granularity here.)
    """
    site_ids = accessible_site_ids(user)
    if site_ids is None:
        return None

    from machines.models import MachineTypeQualification

    quals = MachineTypeQualification.objects.filter(user=user, active=True)
    if quals.filter(site__isnull=True).exists():  # null site == qualified anywhere
        return None
    return site_ids | set(quals.values_list("site_id", flat=True))


def accessible_section_ids(user):
    """Returns None when the user has no explicit section-level restriction
    (i.e. every section within their accessible sites is fair game),
    otherwise a set of accessible Section ids.
    """
    if is_admin(user):
        return None
    from accounts.models import UserSiteAccess

    rows = UserSiteAccess.objects.filter(user=user, section__isnull=False)
    if not rows.exists():
        return None
    return set(rows.values_list("section_id", flat=True))
