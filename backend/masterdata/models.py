from django.db import models
from django.utils.text import slugify
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel


def _unique_slug(queryset, base, max_length, fallback):
    """Shared by Site/Section's save() overrides: slugify(name), falling
    back to `fallback` if that yields nothing (e.g. a non-ASCII-only name),
    then suffix -2/-3/... until it's unique within `queryset` — so leaving
    "Code" blank in the form never 500s on a collision.
    """
    base = slugify(base)[:max_length] or fallback
    candidate = base
    n = 1
    while queryset.filter(code=candidate).exists():
        n += 1
        suffix = f"-{n}"
        candidate = f"{base[: max_length - len(suffix)]}{suffix}"
    return candidate


class Site(TimeStampedModel):
    history = HistoricalRecords()

    name = models.CharField(max_length=100)
    # Optional from the client — auto-generated from `name` in save() when
    # left blank, so "Code" is a convenience override, not a required field.
    code = models.SlugField(max_length=20, unique=True, blank=True)
    timezone = models.CharField(max_length=64, default="Africa/Harare")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = _unique_slug(Site.objects.exclude(pk=self.pk), self.name, 20, "site")
        super().save(*args, **kwargs)


class Section(TimeStampedModel):
    history = HistoricalRecords()

    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="sections")
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=20, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site", "name"]
        constraints = [
            models.UniqueConstraint(fields=["site", "code"], name="uniq_section_site_code"),
        ]
        indexes = [models.Index(fields=["site", "active"])]

    def __str__(self):
        return f"{self.site.code}/{self.name}"

    def save(self, *args, **kwargs):
        if not self.code:
            scoped = Section.objects.filter(site_id=self.site_id).exclude(pk=self.pk)
            self.code = _unique_slug(scoped, self.name, 20, "section")
        super().save(*args, **kwargs)


class MachineType(TimeStampedModel):
    history = HistoricalRecords()

    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class UOM(TimeStampedModel):
    history = HistoricalRecords()

    name = models.CharField(max_length=50)
    abbreviation = models.CharField(max_length=10, unique=True)

    class Meta:
        verbose_name = "UOM"
        verbose_name_plural = "UOMs"
        ordering = ["name"]

    def __str__(self):
        return self.abbreviation


class Parameter(TimeStampedModel):
    history = HistoricalRecords()

    SCOPE_MACHINE = "machine"
    SCOPE_SECTION = "section"
    SCOPE_SHIFT = "shift"
    SCOPE_CHOICES = [
        (SCOPE_MACHINE, "Machine"),
        (SCOPE_SECTION, "Section"),
        (SCOPE_SHIFT, "Shift-total"),
    ]

    DATA_TYPE_NUMBER = "number"
    DATA_TYPE_INTEGER = "integer"
    DATA_TYPE_TEXT = "text"
    DATA_TYPE_SELECT = "select"
    DATA_TYPE_BOOLEAN = "boolean"
    DATA_TYPE_CHOICES = [
        (DATA_TYPE_NUMBER, "Number"),
        (DATA_TYPE_INTEGER, "Integer"),
        (DATA_TYPE_TEXT, "Text"),
        (DATA_TYPE_SELECT, "Select"),
        (DATA_TYPE_BOOLEAN, "Boolean"),
    ]

    AGGREGATION_SUM = "sum"
    AGGREGATION_AVERAGE = "average"
    AGGREGATION_CHOICES = [
        (AGGREGATION_SUM, "Sum"),
        (AGGREGATION_AVERAGE, "Average"),
    ]

    name = models.CharField(max_length=150)
    code = models.SlugField(max_length=60, unique=True)
    uom = models.ForeignKey(UOM, on_delete=models.PROTECT, null=True, blank=True, related_name="parameters")
    applicable_machine_types = models.ManyToManyField(MachineType, blank=True, related_name="parameters")
    section = models.ForeignKey(
        Section, on_delete=models.PROTECT, null=True, blank=True, related_name="section_parameters"
    )
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    data_type = models.CharField(max_length=10, choices=DATA_TYPE_CHOICES)
    # How multiple hourly readings roll up into a shift/day/MTD "Act" total.
    # A flow/count quantity (tonnes hauled, bucket loads) is genuinely
    # additive across the shift — sum is right and was the only behavior
    # before this field existed. A rate/percentage (machine availability,
    # ground condition score) is not: three hourly readings of 99/99/100%
    # summing to "298%" is meaningless — those need averaging instead.
    # Defaults to "sum" so every parameter created before this field existed
    # keeps its current (correct, for additive quantities) behavior.
    aggregation = models.CharField(max_length=10, choices=AGGREGATION_CHOICES, default=AGGREGATION_SUM)
    min_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    max_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    is_required = models.BooleanField(default=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(scope="section", section__isnull=False)
                    | ~models.Q(scope="section")
                ),
                name="ck_parameter_section_scope_requires_section",
            ),
        ]

    def __str__(self):
        return self.name


class ParameterChoice(TimeStampedModel):
    history = HistoricalRecords()

    parameter = models.ForeignKey(Parameter, on_delete=models.CASCADE, related_name="choices")
    value = models.CharField(max_length=100)
    label = models.CharField(max_length=150)

    class Meta:
        ordering = ["parameter", "label"]
        constraints = [
            models.UniqueConstraint(fields=["parameter", "value"], name="uniq_parameterchoice_value"),
        ]

    def __str__(self):
        return f"{self.parameter.code}:{self.value}"


class DeliveryDestination(TimeStampedModel):
    history = HistoricalRecords()

    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="delivery_destinations")
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=20)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site", "name"]
        constraints = [
            models.UniqueConstraint(fields=["site", "code"], name="uniq_deliverydest_site_code"),
        ]

    def __str__(self):
        return self.name


class DowntimeReasonCode(TimeStampedModel):
    history = HistoricalRecords()

    code = models.SlugField(max_length=30, unique=True)
    description = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "description"]

    def __str__(self):
        return self.description
