from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel
from masterdata.models import Section, Site


class ShiftPattern(TimeStampedModel):
    """A team's rotation pattern (e.g. "4 on / 4 off", "6-day week") — kept
    separate from shiftmgmt.Shift, which is the daily Day/Night time window
    a ShiftInstance is generated from.
    """

    history = HistoricalRecords()

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Team(TimeStampedModel):
    history = HistoricalRecords()

    name = models.CharField(max_length=100)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="teams")
    section = models.ForeignKey(
        Section, on_delete=models.SET_NULL, null=True, blank=True, related_name="teams"
    )
    shift_pattern = models.ForeignKey(
        ShiftPattern, on_delete=models.SET_NULL, null=True, blank=True, related_name="teams"
    )
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site", "name"]
        constraints = [
            models.UniqueConstraint(fields=["site", "name"], name="uniq_team_site_name"),
        ]

    def __str__(self):
        return f"{self.name} ({self.site.code})"

    def get_site_id(self):
        return self.site_id


class TeamMember(TimeStampedModel):
    ROLE_OPERATOR = "operator"
    ROLE_TEAM_LEADER = "team_leader"
    ROLE_CHOICES = [
        (ROLE_OPERATOR, "Operator"),
        (ROLE_TEAM_LEADER, "Team Leader"),
    ]

    history = HistoricalRecords()

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="team_memberships")
    role_on_team = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_OPERATOR)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["team", "user"], name="uniq_teammember_team_user"),
        ]

    def __str__(self):
        return f"{self.user} @ {self.team}"
