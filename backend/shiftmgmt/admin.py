from django.contrib import admin

from .models import Shift, ShiftInstance


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("name", "site", "start_time", "end_time", "slot_length_minutes", "active")
    list_filter = ("site", "active")
    search_fields = ("name",)
    autocomplete_fields = ("site",)


@admin.register(ShiftInstance)
class ShiftInstanceAdmin(admin.ModelAdmin):
    list_display = ("shift", "date", "site", "status", "closed_at", "approved_at")
    list_filter = ("site", "status", "date")
    search_fields = ("shift__name",)
    autocomplete_fields = ("shift", "site", "closed_by", "approved_by")
    date_hierarchy = "date"
