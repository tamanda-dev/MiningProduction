from django.contrib import admin

from .models import BreakdownLog, CrusherEntry, DeliveryEntry, ParameterValue, ProductionEntry


class ParameterValueInline(admin.TabularInline):
    model = ParameterValue
    extra = 0
    autocomplete_fields = ("parameter",)


@admin.register(ProductionEntry)
class ProductionEntryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "shift_instance",
        "site",
        "section",
        "machine",
        "entry_type",
        "slot_index",
        "operator",
        "status",
    )
    list_filter = ("site", "section", "entry_type", "status")
    search_fields = ("id", "comments")
    autocomplete_fields = (
        "shift_instance",
        "site",
        "section",
        "machine",
        "machine_assignment",
        "operator",
        "recorded_by",
    )
    inlines = [ParameterValueInline]


@admin.register(BreakdownLog)
class BreakdownLogAdmin(admin.ModelAdmin):
    list_display = ("id", "machine", "reason_code", "start_at", "end_at", "duration_minutes", "severity", "status")
    list_filter = ("site", "severity", "status")
    search_fields = ("description", "comments")
    autocomplete_fields = (
        "shift_instance",
        "site",
        "section",
        "machine",
        "machine_assignment",
        "reason_code",
        "operator",
        "recorded_by",
    )
    inlines = [ParameterValueInline]


@admin.register(CrusherEntry)
class CrusherEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "crusher_unit", "entry_type", "slot_index", "throughput_tonnes", "status")
    list_filter = ("site", "crusher_unit", "entry_type", "status")
    autocomplete_fields = ("shift_instance", "site", "crusher_unit", "section", "operator", "recorded_by")
    inlines = [ParameterValueInline]


@admin.register(DeliveryEntry)
class DeliveryEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "delivery_destination", "tonnes", "trip_count", "status")
    list_filter = ("site", "delivery_destination", "status")
    autocomplete_fields = ("shift_instance", "site", "delivery_destination", "section", "operator", "recorded_by")
    inlines = [ParameterValueInline]
