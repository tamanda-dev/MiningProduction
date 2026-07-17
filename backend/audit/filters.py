import django_filters

from .models import AuditLog


class AuditLogFilter(django_filters.FilterSet):
    # Actions are named "<model_name>.<verb>" (e.g. "productionentry.updated")
    # by the simple-history bridge in audit/signals.py — icontains lets the
    # frontend query "history for this model" without needing to know the
    # numeric ContentType id.
    action = django_filters.CharFilter(field_name="action", lookup_expr="icontains")

    class Meta:
        model = AuditLog
        fields = ("action", "site", "content_type", "actor", "object_id")
