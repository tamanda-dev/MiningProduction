from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
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


class PasswordResetOTP(TimeStampedModel):
    """A one-time code emailed to a user for the "forgot password" flow.
    No HistoricalRecords here (unlike most models in this app) — this is
    transient security data, not an auditable business record, and the
    audit/signals.py bridge that mirrors HistoricalRecords-tracked models
    into /api/audit-log/ has no business surfacing OTP hashes there (same
    reasoning as excluding User.password above).
    """

    MAX_ATTEMPTS = 5
    TTL_MINUTES = 10

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_otps")
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    def is_usable(self) -> bool:
        return self.consumed_at is None and self.attempts < self.MAX_ATTEMPTS and self.expires_at > timezone.now()
