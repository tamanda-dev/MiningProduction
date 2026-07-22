from rest_framework.permissions import BasePermission

from core import scoping

from .models import BreakdownIncident


class CanWriteCrusherOpsEntry(BasePermission):
    """Same shape as entries.permissions.CanWriteEntry: Supervisor/Admin
    always; the owning operator only while the shift instance is open.
    Generalized with `owner_field` so both HourlyChecklistEntryViewSet and
    HourlyBreakdownEntryViewSet (both keyed on `operator`) can share it.
    """

    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")
    owner_field = "operator_id"

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in self.SAFE_METHODS:
            return True
        if scoping.is_supervisor(request.user):
            return True
        if obj.shift_instance.status != obj.shift_instance.STATUS_OPEN:
            return False
        return getattr(obj, self.owner_field) == request.user.id


class CanWriteBreakdownIncident(BasePermission):
    """Supervisor/Admin: always, including on an already-resolved incident
    (this used to be Manager-only unconditional access; Supervisor absorbed
    it when the Manager role was removed). The assigned artisan: always, so
    they can PATCH time_attended/root_cause_of_failure/remedial_action_taken
    regardless of open/in_progress. The reporting operator: only while
    status=="open" (before an artisan is assigned — once assigned, editing
    the timeline is a maintenance decision, not the reporter's).
    """

    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj: BreakdownIncident):
        if request.method in self.SAFE_METHODS:
            return True
        if scoping.is_supervisor(request.user):
            return True
        if obj.artisan_id == request.user.id:
            return True
        return obj.reported_by_id == request.user.id and obj.status == BreakdownIncident.STATUS_OPEN
