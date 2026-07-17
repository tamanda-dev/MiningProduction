from django.contrib import admin

from .models import (
    CrusherUnit,
    DeliveryDestination,
    DowntimeReasonCode,
    MachineType,
    Parameter,
    ParameterChoice,
    Section,
    Site,
    SubSection,
    UOM,
)


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "timezone", "active")
    search_fields = ("name", "code")
    list_filter = ("active",)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "site", "active")
    list_filter = ("site", "active")
    search_fields = ("name", "code")


@admin.register(SubSection)
class SubSectionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "section", "display_order", "active")
    list_filter = ("section__site", "section", "active")
    search_fields = ("name", "code")


@admin.register(MachineType)
class MachineTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "active")
    search_fields = ("name", "code")


@admin.register(UOM)
class UOMAdmin(admin.ModelAdmin):
    list_display = ("name", "abbreviation")
    search_fields = ("name", "abbreviation")


class ParameterChoiceInline(admin.TabularInline):
    model = ParameterChoice
    extra = 1


@admin.register(Parameter)
class ParameterAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "scope", "data_type", "uom", "section", "is_required", "active")
    list_filter = ("scope", "data_type", "active", "applicable_machine_types")
    search_fields = ("name", "code")
    filter_horizontal = ("applicable_machine_types",)
    inlines = [ParameterChoiceInline]


@admin.register(CrusherUnit)
class CrusherUnitAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "site", "active")
    list_filter = ("site", "active")
    search_fields = ("name", "code")


@admin.register(DeliveryDestination)
class DeliveryDestinationAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "site", "active")
    list_filter = ("site", "active")
    search_fields = ("name", "code")


@admin.register(DowntimeReasonCode)
class DowntimeReasonCodeAdmin(admin.ModelAdmin):
    list_display = ("description", "code", "category", "active")
    list_filter = ("category", "active")
    search_fields = ("code", "description")
