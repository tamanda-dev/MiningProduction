from django.contrib import admin

from .models import Machine, MachineAssignment, MachineTypeQualification


@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ("fleet_number", "machine_type", "site", "status", "current_section")
    list_filter = ("site", "machine_type", "status")
    search_fields = ("fleet_number", "name")
    autocomplete_fields = ("machine_type", "site", "current_section")


@admin.register(MachineTypeQualification)
class MachineTypeQualificationAdmin(admin.ModelAdmin):
    list_display = ("user", "machine_type", "site", "active")
    list_filter = ("machine_type", "site", "active")
    search_fields = ("user__username", "user__email")
    autocomplete_fields = ("user", "machine_type", "site")


@admin.register(MachineAssignment)
class MachineAssignmentAdmin(admin.ModelAdmin):
    list_display = ("machine", "operator", "shift_instance", "section", "status", "started_at", "ended_at")
    list_filter = ("machine__site", "status")
    search_fields = ("machine__fleet_number", "operator__username")
    autocomplete_fields = ("machine", "operator", "shift_instance", "section", "handed_over_from")
    readonly_fields = ("started_at",)
