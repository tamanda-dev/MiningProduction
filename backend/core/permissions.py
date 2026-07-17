from rest_framework.permissions import BasePermission

from . import scoping


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return scoping.is_admin(request.user)


class IsManagerOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return scoping.is_manager(request.user)


class IsSupervisorOrAbove(BasePermission):
    def has_permission(self, request, view):
        return scoping.is_supervisor(request.user)


class IsOperator(BasePermission):
    def has_permission(self, request, view):
        return scoping.is_operator(request.user)


class ReadOnlyOrSupervisorOrAbove(BasePermission):
    """Anyone authenticated may read master data; only Supervisor+ may write."""

    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

    def has_permission(self, request, view):
        if request.method in self.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return scoping.is_supervisor(request.user)


class ReadOnlyOrAdmin(BasePermission):
    """Anyone authenticated may read master data; only Admin may write.
    Matches the spec's "Admin: manages all master data" role boundary —
    Manager/Supervisor consume master data but don't redefine it.
    """

    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

    def has_permission(self, request, view):
        if request.method in self.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return scoping.is_admin(request.user)


class ReadOnlyOrManagerOrAdmin(BasePermission):
    """Anyone with site access may read (e.g. Supervisors viewing Act vs
    Plan on their live shift view); only Manager/Admin set targets.
    """

    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

    def has_permission(self, request, view):
        if request.method in self.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return scoping.is_manager(request.user)


class HasSiteAccess(BasePermission):
    """Object-level check: the object's resolved site must be within the
    requesting user's accessible sites. Objects expose their site either via
    a `site_id` attribute or a `get_site_id()` method (for models where site
    is reached through a relation, e.g. `section.site_id`).
    """

    def has_object_permission(self, request, view, obj):
        site_ids = scoping.accessible_site_ids(request.user)
        if site_ids is None:
            return True
        site_id = getattr(obj, "site_id", None)
        if site_id is None and hasattr(obj, "get_site_id"):
            site_id = obj.get_site_id()
        return site_id in site_ids
