from rest_framework import serializers

from core import scoping

from .models import User


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    site_accesses = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "employee_code",
            "phone",
            "maintenance_technician",
            "roles",
            "site_accesses",
        )

    def get_roles(self, obj) -> list[str]:
        roles = []
        if scoping.is_admin(obj):
            roles.append("admin")
        if scoping.is_manager(obj):
            roles.append("manager")
        if scoping.is_supervisor(obj):
            roles.append("supervisor")
        if scoping.is_operator(obj):
            roles.append("operator")
        return roles

    def get_site_accesses(self, obj) -> list[dict]:
        # UserSiteAccess is added to this app once masterdata.Site exists
        # (see accounts/models.py); import is deferred so this module loads
        # cleanly regardless of build order.
        from .models import UserSiteAccess

        return [
            {"site": row.site_id, "section": row.section_id}
            for row in UserSiteAccess.objects.filter(user=obj).select_related("site", "section")
        ]


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "employee_code",
            "maintenance_technician",
        )
