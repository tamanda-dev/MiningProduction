from rest_framework.permissions import BasePermission

from core import scoping


class CanWriteEntry(BasePermission):
    """Create-time gating (shift-window + override_reason) lives in the
    serializers (services.enforce_shift_window); this handles update/delete
    object-level rules: Supervisor/Admin always may (with an override_reason
    once closed, enforced by the serializer); Operator may only edit their
    own entry, and only while the shift instance is open.
    """

    SAFE_METHODS = ("GET", "HEAD", "OPTIONS")

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in self.SAFE_METHODS:
            return True
        if scoping.is_supervisor(request.user):
            return True
        if obj.shift_instance.status != obj.shift_instance.STATUS_OPEN:
            return False
        return obj.operator_id == request.user.id
