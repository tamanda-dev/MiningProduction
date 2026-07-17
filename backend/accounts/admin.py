from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, UserSiteAccess


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Mining profile", {"fields": ("employee_code", "phone", "maintenance_technician")}),
    )
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "employee_code",
        "maintenance_technician",
        "is_staff",
    )
    list_filter = DjangoUserAdmin.list_filter + ("maintenance_technician",)
    search_fields = ("username", "email", "employee_code", "first_name", "last_name")


@admin.register(UserSiteAccess)
class UserSiteAccessAdmin(admin.ModelAdmin):
    list_display = ("user", "site", "section")
    list_filter = ("site", "section")
    search_fields = ("user__username", "user__email")
    autocomplete_fields = ("user", "site", "section")
