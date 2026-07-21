from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel
from entries.models import SOURCE_CHOICES, STATUS_CHOICES
from machines.models import Machine
from masterdata.models import Section, Site
from shiftmgmt.models import ShiftInstance


class BreakdownCause(TimeStampedModel):
    """Admin-configurable breakdown-cause vocabulary shared by the hourly
    breakdown matrix (HourlyBreakdownEntry.causes) and the detailed
    BreakdownIncident.cause — one shared list so Pareto-by-cause reporting
    has a single vocabulary. Exactly one row should have is_other=True.
    """

    history = HistoricalRecords()

    name = models.CharField(max_length=150)
    code = models.SlugField(max_length=40, unique=True)
    is_other = models.BooleanField(
        default=False, help_text="Selecting this cause requires free-text detail elsewhere."
    )
    display_order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name


class ChecklistItem(TimeStampedModel):
    history = HistoricalRecords()

    name = models.CharField(max_length=150)
    code = models.SlugField(max_length=40, unique=True)
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name


class HourlySlot(TimeStampedModel):
    """Per-site admin-configurable checklist/breakdown-matrix cadence —
    deliberately independent of Shift.slot_length_minutes (see
    shiftmgmt.models.Shift) since the plant's checklist cadence is
    configured separately from production-entry slotting.
    """

    history = HistoricalRecords()

    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="crusher_hourly_slots")
    slot_index = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site", "slot_index"]
        constraints = [
            models.UniqueConstraint(fields=["site", "slot_index"], name="uniq_hourlyslot_site_index"),
        ]
        indexes = [models.Index(fields=["site", "active"])]

    def __str__(self):
        return f"{self.site.code} slot {self.slot_index} ({self.start_time}-{self.end_time})"

    @property
    def is_overnight(self):
        return self.end_time <= self.start_time


class HourlyChecklistEntry(TimeStampedModel):
    """One row per crusher per hourly slot per checklist item, per shift —
    the operator's hourly Safety Talk/Plant Checks/Housekeeping/Crushing
    Status sign-off."""

    history = HistoricalRecords()

    shift_instance = models.ForeignKey(
        ShiftInstance, on_delete=models.PROTECT, related_name="hourly_checklist_entries"
    )
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="hourly_checklist_entries")
    crusher = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name="hourly_checklist_entries")
    hourly_slot = models.ForeignKey(HourlySlot, on_delete=models.PROTECT, related_name="checklist_entries")
    slot_start_at = models.DateTimeField()
    slot_end_at = models.DateTimeField()
    checklist_item = models.ForeignKey(ChecklistItem, on_delete=models.PROTECT, related_name="entries")
    is_completed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    operator = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="submitted")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="mobile")
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)

    class Meta:
        ordering = ["-slot_start_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["shift_instance", "crusher", "hourly_slot", "checklist_item"],
                name="uniq_hourly_checklist_entry",
            ),
        ]
        indexes = [
            models.Index(fields=["site", "shift_instance"]),
            models.Index(fields=["crusher", "slot_start_at"]),
            models.Index(fields=["checklist_item"]),
        ]

    def __str__(self):
        return f"Checklist#{self.pk} {self.crusher} slot {self.hourly_slot.slot_index} / {self.checklist_item}"

    def get_site_id(self):
        return self.site_id


class HourlyBreakdownEntry(TimeStampedModel):
    """One matrix row per crusher per hourly slot per shift — which
    BreakdownCause(s) applied during that hour, a multi-select within the
    single row (not one row per cause)."""

    history = HistoricalRecords()

    shift_instance = models.ForeignKey(
        ShiftInstance, on_delete=models.PROTECT, related_name="hourly_breakdown_entries"
    )
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="hourly_breakdown_entries")
    crusher = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name="hourly_breakdown_entries")
    hourly_slot = models.ForeignKey(HourlySlot, on_delete=models.PROTECT, related_name="breakdown_entries")
    slot_start_at = models.DateTimeField()
    slot_end_at = models.DateTimeField()
    causes = models.ManyToManyField(BreakdownCause, related_name="hourly_breakdown_entries", blank=True)
    other_cause_text = models.TextField(blank=True)
    downtime_minutes = models.PositiveIntegerField(null=True, blank=True)
    comments = models.TextField(blank=True)
    operator = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="submitted")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="mobile")
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)

    class Meta:
        ordering = ["-slot_start_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["shift_instance", "crusher", "hourly_slot"], name="uniq_hourly_breakdown_entry"
            ),
        ]
        indexes = [
            models.Index(fields=["site", "shift_instance"]),
            models.Index(fields=["crusher", "slot_start_at"]),
        ]

    def __str__(self):
        return f"BreakdownMatrix#{self.pk} {self.crusher} slot {self.hourly_slot.slot_index}"

    def get_site_id(self):
        return self.site_id


class BreakdownIncident(TimeStampedModel):
    """The detailed maintenance-workflow record — occurred -> reported ->
    attended -> completed — distinct from the simpler, fleet-wide
    entries.BreakdownLog. Drives MTTR/MTBF reporting for the crusher plant.
    """

    history = HistoricalRecords()

    STATUS_OPEN = "open"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_RESOLVED = "resolved"
    STATUS_CHOICES = [
        (STATUS_OPEN, "Open"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_RESOLVED, "Resolved"),
    ]

    SEVERITY_LOW = "low"
    SEVERITY_MEDIUM = "medium"
    SEVERITY_HIGH = "high"
    SEVERITY_CHOICES = [
        (SEVERITY_LOW, "Low"),
        (SEVERITY_MEDIUM, "Medium"),
        (SEVERITY_HIGH, "High"),
    ]

    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="breakdown_incidents")
    section = models.ForeignKey(
        Section, on_delete=models.PROTECT, null=True, blank=True, related_name="breakdown_incidents"
    )
    crusher = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name="breakdown_incidents")
    shift_instance = models.ForeignKey(
        ShiftInstance, on_delete=models.PROTECT, null=True, blank=True, related_name="breakdown_incidents"
    )

    time_occurred = models.DateTimeField()
    time_reported = models.DateTimeField()
    time_attended = models.DateTimeField(null=True, blank=True)
    time_completed = models.DateTimeField(null=True, blank=True)

    artisan = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assigned_breakdown_incidents",
    )
    cause = models.ForeignKey(
        BreakdownCause, on_delete=models.PROTECT, null=True, blank=True, related_name="breakdown_incidents"
    )
    cause_other_text = models.TextField(blank=True)
    description = models.TextField(blank=True)
    root_cause_of_failure = models.TextField(blank=True)
    remedial_action_taken = models.TextField(blank=True)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_OPEN)

    reported_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="mobile")
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)
    sla_breach_notified_at = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True)

    class Meta:
        ordering = ["-time_occurred"]
        indexes = [
            models.Index(fields=["site", "status"]),
            models.Index(fields=["crusher", "time_occurred"]),
            models.Index(fields=["artisan", "status"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"Incident#{self.pk} {self.crusher} @ {self.time_occurred} [{self.status}]"

    def get_site_id(self):
        return self.site_id

    @property
    def attend_minutes(self) -> int | None:
        if self.time_attended is None:
            return None
        return int((self.time_attended - self.time_reported).total_seconds() // 60)

    @property
    def repair_minutes(self) -> int | None:
        """MTTR-proper: time actively spent repairing (attended -> completed)."""
        if self.time_attended is None or self.time_completed is None:
            return None
        return int((self.time_completed - self.time_attended).total_seconds() // 60)

    @property
    def resolution_minutes(self) -> int | None:
        """Looser variant: reported -> completed (includes queueing/response delay)."""
        if self.time_completed is None:
            return None
        return int((self.time_completed - self.time_reported).total_seconds() // 60)


class ShiftCrushingSummary(TimeStampedModel):
    """Per-shift, per-crusher totals: crushing time (entered), down time /
    stoppage instances (derived from BreakdownIncident/HourlyBreakdownEntry),
    crushed tonnage (derived from the existing CrusherEntry throughput
    data, site+shift-instance-wide — see crusher_ops.services for why),
    and derived availability %.
    """

    history = HistoricalRecords()

    shift_instance = models.ForeignKey(
        ShiftInstance, on_delete=models.PROTECT, related_name="crushing_summaries"
    )
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="crushing_summaries")
    crusher = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name="crushing_summaries")

    crushing_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    down_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    crushed_tonnage = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    stoppage_instances = models.PositiveIntegerField(default=0)
    availability_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    comments = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="submitted")
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="mobile")
    client_uuid = models.UUIDField(null=True, blank=True, unique=True)

    class Meta:
        ordering = ["-shift_instance_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["shift_instance", "crusher"], name="uniq_shiftcrushingsummary_shift_crusher"
            ),
        ]
        indexes = [
            models.Index(fields=["site", "shift_instance"]),
            models.Index(fields=["crusher"]),
        ]

    def __str__(self):
        return f"CrushingSummary#{self.pk} {self.crusher} @ {self.shift_instance}"

    def get_site_id(self):
        return self.site_id
