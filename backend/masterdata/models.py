from django.db import models
from simple_history.models import HistoricalRecords

from core.models import TimeStampedModel


class Site(TimeStampedModel):
    history = HistoricalRecords()

    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=20, unique=True)
    timezone = models.CharField(max_length=64, default="Africa/Harare")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Section(TimeStampedModel):
    history = HistoricalRecords()

    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="sections")
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=20)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site", "name"]
        constraints = [
            models.UniqueConstraint(fields=["site", "code"], name="uniq_section_site_code"),
        ]
        indexes = [models.Index(fields=["site", "active"])]

    def __str__(self):
        return f"{self.site.code}/{self.name}"


class SubSection(TimeStampedModel):
    history = HistoricalRecords()

    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="subsections")
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=20)
    active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["section", "display_order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["section", "code"], name="uniq_subsection_section_code"),
        ]

    def __str__(self):
        return f"{self.section} / {self.name}"


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

    name = models.CharField(max_length=150)
    code = models.SlugField(max_length=60, unique=True)
    uom = models.ForeignKey(UOM, on_delete=models.PROTECT, null=True, blank=True, related_name="parameters")
    applicable_machine_types = models.ManyToManyField(MachineType, blank=True, related_name="parameters")
    section = models.ForeignKey(
        Section, on_delete=models.PROTECT, null=True, blank=True, related_name="section_parameters"
    )
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    data_type = models.CharField(max_length=10, choices=DATA_TYPE_CHOICES)
    min_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    max_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    is_required = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]
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
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["parameter", "display_order"]
        constraints = [
            models.UniqueConstraint(fields=["parameter", "value"], name="uniq_parameterchoice_value"),
        ]

    def __str__(self):
        return f"{self.parameter.code}:{self.value}"


class CrusherUnit(TimeStampedModel):
    history = HistoricalRecords()

    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="crusher_units")
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=20)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["site", "name"]
        constraints = [
            models.UniqueConstraint(fields=["site", "code"], name="uniq_crusherunit_site_code"),
        ]

    def __str__(self):
        return self.name


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
