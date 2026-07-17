from django.contrib import admin

from .models import PlanTarget


@admin.register(PlanTarget)
class PlanTargetAdmin(admin.ModelAdmin):
    list_display = (
        "parameter",
        "site",
        "section",
        "machine",
        "period_type",
        "period_date",
        "shift_instance",
        "target_value",
    )
    list_filter = ("site", "period_type")
    search_fields = ("parameter__name", "parameter__code")
    autocomplete_fields = ("parameter", "site", "section", "machine", "shift_instance")
    date_hierarchy = "period_date"
