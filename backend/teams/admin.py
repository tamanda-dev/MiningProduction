from django.contrib import admin

from .models import ShiftPattern, Team, TeamMember


class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 1
    autocomplete_fields = ("user",)


@admin.register(ShiftPattern)
class ShiftPatternAdmin(admin.ModelAdmin):
    list_display = ("name", "active")
    search_fields = ("name",)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "site", "section", "shift_pattern", "active")
    list_filter = ("site", "section", "active")
    search_fields = ("name",)
    autocomplete_fields = ("site", "section", "shift_pattern")
    inlines = [TeamMemberInline]


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ("user", "team", "role_on_team", "active")
    list_filter = ("team__site", "role_on_team", "active")
    search_fields = ("user__username", "user__email")
    autocomplete_fields = ("team", "user")
