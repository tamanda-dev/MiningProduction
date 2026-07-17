from django.contrib import admin

from .models import (
    BreakdownCause,
    BreakdownIncident,
    ChecklistItem,
    HourlyBreakdownEntry,
    HourlyChecklistEntry,
    HourlySlot,
    ShiftCrushingSummary,
)


@admin.register(BreakdownCause)
class BreakdownCauseAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_other", "display_order", "active")
    list_filter = ("is_other", "active")
    search_fields = ("name", "code")


@admin.register(ChecklistItem)
class ChecklistItemAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "display_order", "active")
    list_filter = ("active",)
    search_fields = ("name", "code")


@admin.register(HourlySlot)
class HourlySlotAdmin(admin.ModelAdmin):
    list_display = ("site", "slot_index", "start_time", "end_time", "active")
    list_filter = ("site", "active")
    search_fields = ("site__name", "site__code")
    autocomplete_fields = ("site",)


@admin.register(HourlyChecklistEntry)
class HourlyChecklistEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "crusher", "hourly_slot", "checklist_item", "is_completed", "status")
    list_filter = ("site", "is_completed", "status")
    autocomplete_fields = (
        "shift_instance",
        "site",
        "crusher",
        "hourly_slot",
        "checklist_item",
        "operator",
        "recorded_by",
    )


@admin.register(HourlyBreakdownEntry)
class HourlyBreakdownEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "crusher", "hourly_slot", "downtime_minutes", "status")
    list_filter = ("site", "status")
    autocomplete_fields = ("shift_instance", "site", "crusher", "hourly_slot", "operator", "recorded_by")
    filter_horizontal = ("causes",)


@admin.register(BreakdownIncident)
class BreakdownIncidentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "crusher",
        "time_occurred",
        "status",
        "artisan",
        "cause",
        "repair_minutes",
    )
    list_filter = ("site", "status", "severity")
    search_fields = ("description", "root_cause_of_failure", "remedial_action_taken")
    autocomplete_fields = (
        "site",
        "section",
        "crusher",
        "shift_instance",
        "artisan",
        "cause",
        "reported_by",
        "recorded_by",
    )

    @admin.display(description="MTTR (min)")
    def repair_minutes(self, obj):
        return obj.repair_minutes


@admin.register(ShiftCrushingSummary)
class ShiftCrushingSummaryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "crusher",
        "shift_instance",
        "crushing_time_minutes",
        "down_time_minutes",
        "crushed_tonnage",
        "availability_pct",
        "status",
    )
    list_filter = ("site", "status")
    autocomplete_fields = ("shift_instance", "site", "crusher", "recorded_by")
