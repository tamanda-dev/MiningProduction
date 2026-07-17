from django.db import models

from core.models import TimeStampedModel
from masterdata.models import Parameter, Section, Site
from machines.models import Machine


class PlanTarget(TimeStampedModel):
    """The "Plan" column from the source Excel reports. `target_key` is a
    computed uniqueness guard: Postgres/SQLite treat NULLs as distinct in a
    multi-column UniqueConstraint, so two rows that are "the same target"
    except for a NULL machine/section/shift_instance/period_date would not
    collide under a plain UniqueConstraint. Collapsing every dimension
    (substituting a sentinel for NULL) into one string and uniquing on that
    closes the gap.
    """

    PERIOD_SHIFT = "shift"
    PERIOD_DAY = "day"
    PERIOD_MONTH = "month"
    PERIOD_CHOICES = [
        (PERIOD_SHIFT, "Shift"),
        (PERIOD_DAY, "Day"),
        (PERIOD_MONTH, "Month"),
    ]

    parameter = models.ForeignKey(Parameter, on_delete=models.PROTECT, related_name="plan_targets")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="plan_targets")
    section = models.ForeignKey(
        Section, on_delete=models.PROTECT, null=True, blank=True, related_name="plan_targets"
    )
    machine = models.ForeignKey(
        Machine, on_delete=models.PROTECT, null=True, blank=True, related_name="plan_targets"
    )
    period_type = models.CharField(max_length=10, choices=PERIOD_CHOICES)
    shift_instance = models.ForeignKey(
        "shiftmgmt.ShiftInstance", on_delete=models.PROTECT, null=True, blank=True, related_name="plan_targets"
    )
    period_date = models.DateField(null=True, blank=True)
    target_value = models.DecimalField(max_digits=14, decimal_places=2)
    target_key = models.CharField(max_length=255, unique=True, editable=False)

    class Meta:
        ordering = ["-period_date", "parameter"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(section__isnull=False) | models.Q(machine__isnull=False),
                name="ck_plantarget_section_or_machine",
            ),
        ]
        indexes = [
            models.Index(fields=["site", "period_type", "period_date"]),
        ]

    def __str__(self):
        return f"{self.parameter.code} target={self.target_value} ({self.period_type})"

    def _compute_key(self):
        return ":".join(
            str(part) if part is not None else "x"
            for part in (
                self.parameter_id,
                self.section_id,
                self.machine_id,
                self.period_type,
                self.shift_instance_id,
                self.period_date,
            )
        )

    def save(self, *args, **kwargs):
        self.target_key = self._compute_key()
        super().save(*args, **kwargs)

    def get_site_id(self):
        return self.site_id
