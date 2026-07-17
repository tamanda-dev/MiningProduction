from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

from core.models import TimeStampedModel


class AuditLog(TimeStampedModel):
    """The single queryable timeline behind /api/audit-log/. Field-level
    who/when/old/new diffs live in django-simple-history's HistoricalXxx
    shadow tables (see audit/signals.py, which bridges every historical
    record into a row here); discrete business events that don't map to a
    field diff (overrides, approvals) are logged directly via
    audit/services.py::log_event. GenericForeignKey is acceptable here
    specifically because this is an append-only event log that's never a
    join/aggregation target — unlike entries.ParameterValue, which
    deliberately avoids GenericForeignKey for that reason.
    """

    actor = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_events"
    )
    action = models.CharField(max_length=100)
    content_type = models.ForeignKey(ContentType, on_delete=models.PROTECT, null=True, blank=True)
    object_id = models.CharField(max_length=64, null=True, blank=True)
    target = GenericForeignKey("content_type", "object_id")
    site = models.ForeignKey(
        "masterdata.Site", on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_events"
    )
    changes = models.JSONField(default=dict, blank=True)
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
            models.Index(fields=["action"]),
            models.Index(fields=["site"]),
        ]

    def __str__(self):
        return f"{self.action} by {self.actor} @ {self.created_at:%Y-%m-%d %H:%M}"
