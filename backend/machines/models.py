from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel
from masterdata.models import MachineType, Section, Site


class Machine(TimeStampedModel):
    history = HistoricalRecords()

    STATUS_ACTIVE = "active"
    STATUS_BREAKDOWN = "breakdown"
    STATUS_MAINTENANCE = "maintenance"
    STATUS_RETIRED = "retired"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_BREAKDOWN, "Breakdown"),
        (STATUS_MAINTENANCE, "Maintenance"),
        (STATUS_RETIRED, "Retired"),
    ]

    machine_type = models.ForeignKey(MachineType, on_delete=models.PROTECT, related_name="machines")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="machines")
    fleet_number = models.CharField(max_length=30)
    name = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    current_section = models.ForeignKey(
        Section, on_delete=models.SET_NULL, null=True, blank=True, related_name="machines"
    )

    class Meta:
        ordering = ["site", "machine_type", "fleet_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "machine_type", "fleet_number"], name="uniq_machine_site_type_fleet"
            ),
        ]
        indexes = [
            models.Index(fields=["site", "status"]),
            models.Index(fields=["machine_type", "site"]),
        ]

    def __str__(self):
        return f"{self.machine_type.code} {self.fleet_number}"

    def get_site_id(self):
        return self.site_id


class MachineTypeQualification(TimeStampedModel):
    """Which machine types (optionally scoped to a site) an operator is
    certified/assigned to operate — drives the machine-select filter on the
    mobile app's activation flow.
    """

    history = HistoricalRecords()

    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="qualifications")
    machine_type = models.ForeignKey(MachineType, on_delete=models.PROTECT, related_name="qualified_users")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, null=True, blank=True, related_name="qualifications")
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "machine_type", "site"], name="uniq_qualification_user_type_site"
            ),
        ]

    def __str__(self):
        return f"{self.user} qualified on {self.machine_type}"


class MachineAssignment(TimeStampedModel):
    """Represents an operator "claiming" a machine for a shift instance —
    the machine-activation workflow. All production entries submitted
    during an active assignment auto-tag to machine/site/section/shift/
    operator from this record; the operator never re-enters that context.
    Concurrency safety: the partial unique constraints below are the
    race-proof source of truth (see machines/services.py::claim_machine for
    the select_for_update() layer that turns a race into a clean 409).
    """

    history = HistoricalRecords()

    STATUS_ACTIVE = "active"
    STATUS_RELEASED = "released"
    STATUS_HANDED_OVER = "handed_over"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_RELEASED, "Released"),
        (STATUS_HANDED_OVER, "Handed Over"),
    ]

    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name="assignments")
    operator = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="machine_assignments")
    shift_instance = models.ForeignKey(
        "shiftmgmt.ShiftInstance", on_delete=models.PROTECT, related_name="machine_assignments"
    )
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="machine_assignments")
    sub_section = models.ForeignKey(
        "masterdata.SubSection",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="machine_assignments",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    handed_over_from = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="handed_over_to"
    )
    release_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["machine", "shift_instance"],
                condition=models.Q(status="active"),
                name="uniq_active_assignment_per_machine_per_shift",
            ),
            models.UniqueConstraint(
                fields=["operator", "shift_instance"],
                condition=models.Q(status="active"),
                name="uniq_active_assignment_per_operator_per_shift",
            ),
        ]
        indexes = [
            models.Index(fields=["machine", "status"]),
            models.Index(fields=["operator", "status"]),
        ]

    def __str__(self):
        return f"{self.operator} -> {self.machine} [{self.status}]"

    def get_site_id(self):
        return self.machine.site_id
