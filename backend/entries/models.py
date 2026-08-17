from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel
from machines.models import Machine, MachineAssignment
from masterdata.models import (
    DeliveryDestination,
    DowntimeReasonCode,
    Parameter,
    Section,
    Site,
)
from shiftmgmt.models import ShiftInstance

SOURCE_CHOICES = [
    ("mobile", "Mobile"),
    ("web", "Web"),
    ("import", "Import"),
]

STATUS_CHOICES = [
    ("submitted", "Submitted"),
    ("flagged", "Flagged"),
    ("corrected", "Corrected"),
    ("approved", "Approved"),
]


class ProductionEntry(TimeStampedModel):
    id = models.BigAutoField(primary_key=True)
    history = HistoricalRecords()

    ENTRY_TYPE_HOURLY = "hourly"
    ENTRY_TYPE_SHIFT_TOTAL = "shift_total"
    ENTRY_TYPE_CHOICES = [
        (ENTRY_TYPE_HOURLY, "Hourly"),
        (ENTRY_TYPE_SHIFT_TOTAL, "Shift Total"),
    ]

    shift_instance = models.ForeignKey(ShiftInstance, on_delete=models.PROTECT, related_name="production_entries")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="production_entries")
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="production_entries")
    machine = models.ForeignKey(
        Machine, on_delete=models.PROTECT, null=True, blank=True, related_name="production_entries"
    )
    machine_assignment = models.ForeignKey(
        MachineAssignment, on_delete=models.PROTECT, null=True, blank=True, related_name="production_entries"
    )
    entry_type = models.CharField(max_length=15, choices=ENTRY_TYPE_CHOICES)
    slot_index = models.PositiveSmallIntegerField(null=True, blank=True)
    slot_start_at = models.DateTimeField(null=True, blank=True)
    slot_end_at = models.DateTimeField(null=True, blank=True)
    operator = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    comments = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="submitted")
    is_locked = models.BooleanField(default=False)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="mobile")
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)
    override_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-slot_start_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["shift_instance", "machine", "section", "slot_index"],
                condition=models.Q(entry_type="hourly"),
                name="uniq_hourly_slot",
            ),
            models.UniqueConstraint(
                fields=["shift_instance", "machine", "section"],
                condition=models.Q(entry_type="shift_total"),
                name="uniq_shift_total",
            ),
        ]
        indexes = [
            models.Index(fields=["site", "shift_instance"]),
            models.Index(fields=["section", "slot_start_at"]),
            models.Index(fields=["machine", "slot_start_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["slot_start_at"]),
        ]

    def __str__(self):
        return f"ProductionEntry#{self.pk} {self.entry_type} @ {self.section}"

    def get_site_id(self):
        return self.site_id


class ParameterValue(TimeStampedModel):
    history = HistoricalRecords()

    production_entry = models.ForeignKey(
        ProductionEntry, on_delete=models.CASCADE, null=True, blank=True, related_name="values"
    )
    delivery_entry = models.ForeignKey(
        "DeliveryEntry", on_delete=models.CASCADE, null=True, blank=True, related_name="values"
    )
    breakdown_log = models.ForeignKey(
        "BreakdownLog", on_delete=models.CASCADE, null=True, blank=True, related_name="values"
    )
    parameter = models.ForeignKey(Parameter, on_delete=models.PROTECT, related_name="values")
    value_number = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    value_text = models.TextField(null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(
                        production_entry__isnull=False,
                        delivery_entry__isnull=True,
                        breakdown_log__isnull=True,
                    )
                    | models.Q(
                        production_entry__isnull=True,
                        delivery_entry__isnull=False,
                        breakdown_log__isnull=True,
                    )
                    | models.Q(
                        production_entry__isnull=True,
                        delivery_entry__isnull=True,
                        breakdown_log__isnull=False,
                    )
                ),
                name="ck_parametervalue_exactly_one_parent",
            ),
            models.UniqueConstraint(
                fields=["production_entry", "parameter"],
                condition=models.Q(production_entry__isnull=False),
                name="uniq_parametervalue_production_entry",
            ),
            models.UniqueConstraint(
                fields=["delivery_entry", "parameter"],
                condition=models.Q(delivery_entry__isnull=False),
                name="uniq_parametervalue_delivery_entry",
            ),
            models.UniqueConstraint(
                fields=["breakdown_log", "parameter"],
                condition=models.Q(breakdown_log__isnull=False),
                name="uniq_parametervalue_breakdown_log",
            ),
        ]
        indexes = [
            models.Index(fields=["parameter", "production_entry"]),
            models.Index(fields=["parameter", "value_number"], condition=models.Q(value_number__isnull=False), name="idx_paramvalue_number"),
        ]

    def __str__(self):
        return f"{self.parameter.code}={self.value_number or self.value_text or self.value_boolean}"


class BreakdownLog(TimeStampedModel):
    history = HistoricalRecords()

    SEVERITY_LOW = "low"
    SEVERITY_MEDIUM = "medium"
    SEVERITY_HIGH = "high"
    SEVERITY_CHOICES = [
        (SEVERITY_LOW, "Low"),
        (SEVERITY_MEDIUM, "Medium"),
        (SEVERITY_HIGH, "High"),
    ]

    # The general-fleet (non-crusher) breakdown-repair workflow: Operator
    # reports (create, REPAIR_REPORTED) -> an Artisan acknowledges/claims it
    # (REPAIR_ACKNOWLEDGED) -> that Artisan marks it fixed
    # (REPAIR_FIXED, which stamps `end_at` and so fixes `duration_minutes`)
    # -> the reporting Operator confirms the machine actually works again
    # (REPAIR_CONFIRMED). See entries/services.py's
    # acknowledge_breakdown/complete_breakdown_repair/confirm_breakdown_repair
    # for the transition rules — this field is never written directly by a
    # generic PATCH, only by those three actions.
    REPAIR_REPORTED = "reported"
    REPAIR_ACKNOWLEDGED = "acknowledged"
    REPAIR_FIXED = "fixed"
    REPAIR_CONFIRMED = "confirmed"
    REPAIR_STATUS_CHOICES = [
        (REPAIR_REPORTED, "Reported"),
        (REPAIR_ACKNOWLEDGED, "Acknowledged"),
        (REPAIR_FIXED, "Fixed"),
        (REPAIR_CONFIRMED, "Confirmed"),
    ]

    shift_instance = models.ForeignKey(ShiftInstance, on_delete=models.PROTECT, related_name="breakdown_logs")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="breakdown_logs")
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="breakdown_logs")
    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name="breakdown_logs")
    machine_assignment = models.ForeignKey(
        MachineAssignment, on_delete=models.PROTECT, null=True, blank=True, related_name="breakdown_logs"
    )
    reason_code = models.ForeignKey(
        DowntimeReasonCode, on_delete=models.PROTECT, null=True, blank=True, related_name="breakdown_logs"
    )
    description = models.TextField(blank=True)
    slot_index = models.PositiveSmallIntegerField(null=True, blank=True)
    slot_start_at = models.DateTimeField(null=True, blank=True)
    slot_end_at = models.DateTimeField(null=True, blank=True)
    # Server-stamped at report time and never client-editable afterward
    # (see BreakdownLogSerializer) — the start of the downtime window the
    # user asked to measure: "operator reports" to "artisan completes
    # fixing", not whatever a client's clock happens to say.
    start_at = models.DateTimeField()
    # Server-stamped exclusively by complete_breakdown_repair() when the
    # assigned Artisan marks the fix done — this is deliberately the same
    # field `duration_minutes` (below) has always been computed from, so
    # formalizing it into a workflow step required no change to that
    # computation at all.
    end_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, blank=True)
    operator = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    artisan = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, null=True, blank=True, related_name="assigned_breakdown_logs"
    )
    repair_status = models.CharField(max_length=15, choices=REPAIR_STATUS_CHOICES, default=REPAIR_REPORTED)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="submitted")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="mobile")
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)

    class Meta:
        ordering = ["-start_at"]
        indexes = [
            models.Index(fields=["site", "shift_instance"]),
            models.Index(fields=["machine", "start_at"]),
            models.Index(fields=["reason_code"]),
            models.Index(fields=["repair_status"]),
        ]

    def __str__(self):
        return f"Breakdown#{self.pk} {self.machine} @ {self.start_at}"

    def get_site_id(self):
        return self.site_id

    def save(self, *args, **kwargs):
        if self.start_at and self.end_at:
            self.duration_minutes = int((self.end_at - self.start_at).total_seconds() // 60)
        super().save(*args, **kwargs)


class DeliveryEntry(TimeStampedModel):
    history = HistoricalRecords()

    shift_instance = models.ForeignKey(ShiftInstance, on_delete=models.PROTECT, related_name="delivery_entries")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="delivery_entries")
    delivery_destination = models.ForeignKey(DeliveryDestination, on_delete=models.PROTECT, related_name="entries")
    section = models.ForeignKey(
        Section, on_delete=models.PROTECT, null=True, blank=True, related_name="delivery_entries"
    )
    slot_index = models.PositiveSmallIntegerField(null=True, blank=True)
    slot_start_at = models.DateTimeField(null=True, blank=True)
    slot_end_at = models.DateTimeField(null=True, blank=True)
    tonnes = models.DecimalField(max_digits=14, decimal_places=3)
    trip_count = models.PositiveIntegerField(default=1)
    operator = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    comments = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="submitted")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="mobile")
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)

    class Meta:
        ordering = ["-slot_start_at", "-created_at"]
        constraints = [
            # DeliveryEntry has no entry_type (unlike ProductionEntry) —
            # it's always slot-based, so this is the single matching
            # "hourly" constraint that model splits in two.
            # Without it, nothing stops the mobile app's offline-sync retry
            # path (or a plain double-submit) from creating two delivery
            # records for the same slot, silently inflating tonnes/trip_count
            # totals downstream.
            models.UniqueConstraint(
                fields=["shift_instance", "delivery_destination", "slot_index"],
                name="uniq_deliveryentry_hourly_slot",
            ),
        ]
        indexes = [models.Index(fields=["site", "shift_instance"])]

    def __str__(self):
        return f"DeliveryEntry#{self.pk} {self.delivery_destination}"

    def get_site_id(self):
        return self.site_id
