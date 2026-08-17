from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel
from masterdata.models import MachineType, Section, Site


class Machine(TimeStampedModel):
    history = HistoricalRecords()

    # Kept as STATUS_ACTIVE for backward compatibility with existing call
    # sites (claim_machine, apply_breakdown_side_effects, availability
    # aggregation, seed data) — only the *stored value/label* changed to
    # "Operating" to match the Shift KPI Dashboard spec's terminology.
    STATUS_ACTIVE = "operating"
    STATUS_STANDBY = "standby"
    STATUS_OPERATIONAL_DELAY = "operational_delay"
    STATUS_PLANNED_MAINTENANCE = "planned_maintenance"
    STATUS_UNPLANNED_MAINTENANCE = "unplanned_maintenance"
    STATUS_BREAKDOWN = "breakdown"
    STATUS_REFUELLING = "refuelling"
    STATUS_NO_OPERATOR = "no_operator"
    STATUS_WEATHER_DELAY = "weather_delay"
    STATUS_BLAST_CLEARANCE = "blast_clearance"
    STATUS_COMMS_LOSS = "communications_loss"
    STATUS_UNKNOWN = "unknown"
    # Not part of the 12-state operational model — a separate, permanent
    # fleet-lifecycle state (decommissioned), kept from the original model.
    STATUS_RETIRED = "retired"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Operating"),
        (STATUS_STANDBY, "Standby"),
        (STATUS_OPERATIONAL_DELAY, "Operational Delay"),
        (STATUS_PLANNED_MAINTENANCE, "Planned Maintenance"),
        (STATUS_UNPLANNED_MAINTENANCE, "Unplanned Maintenance"),
        (STATUS_BREAKDOWN, "Breakdown"),
        (STATUS_REFUELLING, "Refuelling"),
        (STATUS_NO_OPERATOR, "No Operator"),
        (STATUS_WEATHER_DELAY, "Weather Delay"),
        (STATUS_BLAST_CLEARANCE, "Blast Clearance"),
        (STATUS_COMMS_LOSS, "Communications Loss"),
        (STATUS_UNKNOWN, "Unknown"),
        (STATUS_RETIRED, "Retired"),
    ]
    # Statuses an operator can self-claim a machine into for a new shift.
    # A machine parked in any other state (down for repair, admin-flagged,
    # decommissioned...) must first be resolved through the relevant
    # workflow (breakdown repair, master data) before it can be claimed.
    CLAIMABLE_STATUSES = {STATUS_ACTIVE, STATUS_STANDBY}
    # Statuses apply_breakdown_side_effects() is allowed to move a machine
    # between automatically. Any other status was set deliberately (by an
    # admin, or by a workflow this function doesn't own) and must never be
    # silently overwritten just because a breakdown log opened or closed.
    AUTO_MANAGED_STATUSES = {STATUS_ACTIVE, STATUS_STANDBY, STATUS_BREAKDOWN}

    machine_type = models.ForeignKey(MachineType, on_delete=models.PROTECT, related_name="machines")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="machines")
    fleet_number = models.CharField(max_length=30)
    name = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=25, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
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
    """Which machine(s) an operator is certified/assigned to operate —
    drives the machine-select filter on the activation flow (both mobile
    and the dashboard's Operate section).

    `machine` is how this is actually granted from the admin/supervisor
    "Assign Machines to Operators" UI: pick the operator and one specific
    physical unit (e.g. "DUT-001 — South Pit") — no separate site step,
    since the chosen machine's site comes along with it, and the operator
    still picks which site they're working at for themselves when they
    activate it (this only decides whether that specific unit shows up in
    their picker once they get there). `machine_type`/`site` are then
    auto-derived from `machine` (see MachineTypeQualificationSerializer),
    not asked separately.

    `machine` is nullable rather than required so the older, broader
    "qualified for this whole machine_type (optionally at one site)" grant
    remains representable for any other caller that still wants it (e.g.
    seed scripts, direct API use) — see _check_qualified's and
    MachineViewSet.get_queryset()'s handling of the two shapes.
    """

    history = HistoricalRecords()

    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="qualifications")
    machine_type = models.ForeignKey(MachineType, on_delete=models.PROTECT, related_name="qualified_users")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, null=True, blank=True, related_name="qualifications")
    machine = models.ForeignKey(
        "Machine", on_delete=models.PROTECT, null=True, blank=True, related_name="assigned_operators"
    )
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "machine_type", "site", "machine"], name="uniq_qualification_user_type_site_machine"
            ),
        ]

    def __str__(self):
        if self.machine_id:
            return f"{self.user} assigned to {self.machine}"
        return f"{self.user} qualified on {self.machine_type}"

    def save(self, *args, **kwargs):
        # Model-level safety net (in addition to
        # MachineTypeQualificationSerializer.validate() doing the same for
        # the API path): machine_type/site are NOT NULL, so any direct-ORM
        # creation with only `machine` set — seed scripts, shell, tests —
        # needs this too, not just requests routed through the serializer.
        if self.machine_id and not self.machine_type_id:
            self.machine_type_id = self.machine.machine_type_id
            self.site_id = self.machine.site_id
        super().save(*args, **kwargs)


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
