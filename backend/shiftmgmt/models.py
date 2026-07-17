from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel
from masterdata.models import Site


class Shift(TimeStampedModel):
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="shifts")
    name = models.CharField(max_length=50)
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_length_minutes = models.PositiveIntegerField(default=60)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site", "start_time"]
        constraints = [
            models.UniqueConstraint(fields=["site", "name"], name="uniq_shift_site_name"),
        ]

    def __str__(self):
        return f"{self.site.code}/{self.name}"

    def get_site_id(self):
        return self.site_id

    @property
    def is_overnight(self):
        return self.end_time <= self.start_time


class ShiftInstance(TimeStampedModel):
    history = HistoricalRecords()

    STATUS_OPEN = "open"
    STATUS_CLOSED = "closed"
    STATUS_APPROVED = "approved"
    STATUS_CHOICES = [
        (STATUS_OPEN, "Open"),
        (STATUS_CLOSED, "Closed"),
        (STATUS_APPROVED, "Approved"),
    ]

    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="instances")
    date = models.DateField()
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="shift_instances")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["-date", "shift"]
        constraints = [
            models.UniqueConstraint(fields=["shift", "date"], name="uniq_shiftinstance_shift_date"),
        ]
        indexes = [
            models.Index(fields=["site", "date"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.shift} @ {self.date} [{self.status}]"

    def get_site_id(self):
        return self.site_id

    def save(self, *args, **kwargs):
        if not self.site_id:
            self.site_id = self.shift.site_id
        super().save(*args, **kwargs)
