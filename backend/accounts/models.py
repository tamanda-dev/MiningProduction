from django.contrib.auth.models import AbstractUser
from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel


class User(AbstractUser):
    # password is excluded: simple_history tracks every field by default,
    # and the password *hash* must never end up queryable via the
    # audit/AuditLog bridge (audit/signals.py bridges every
    # HistoricalRecords-tracked model save into /api/audit-log/ generically).
    history = HistoricalRecords(excluded_fields=["password"])

    employee_code = models.CharField(max_length=32, unique=True, null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    maintenance_technician = models.BooleanField(
        default=False,
        help_text="Eligible to be assigned as the artisan on a BreakdownIncident (crusher_ops).",
    )

    def __str__(self):
        return self.get_full_name() or self.username


class UserSiteAccess(TimeStampedModel):
    """Grants a user access to a Site (whole-site) or a specific Section
    within it (section=null means whole-site). See core/scoping.py for how
    this drives queryset filtering and permission checks.
    """

    history = HistoricalRecords()

    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="site_accesses")
    site = models.ForeignKey("masterdata.Site", on_delete=models.PROTECT, related_name="user_accesses")
    section = models.ForeignKey(
        "masterdata.Section",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="user_accesses",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "site", "section"], name="uniq_user_site_section"),
        ]

    def __str__(self):
        return f"{self.user} -> {self.site}" + (f"/{self.section}" if self.section_id else "")
