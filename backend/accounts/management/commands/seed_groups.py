from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from core import scoping

# Which domain apps' Django-Admin permissions each group gets, and which
# action prefixes (add/change/delete/view). This only controls Django Admin
# (the power-user fallback) — the API's real RBAC is enforced by the DRF
# permission classes in core/permissions.py + core/mixins.py, keyed off
# group *membership*, not these model permissions.
DOMAIN_APPS = [
    "masterdata",
    "machines",
    "shiftmgmt",
    "planning",
    "entries",
    "audit",
    "dashboard",
    "accounts",
]

GROUP_ACCESS = {
    # Supervisor absorbed the (now-removed) Manager role's full DOMAIN_APPS
    # access — previously Supervisor only got entries/machines/shiftmgmt,
    # with Manager getting everything else on top.
    scoping.SUPERVISOR_GROUP: {"apps": DOMAIN_APPS, "actions": ["view", "add", "change"]},
    scoping.OPERATOR_GROUP: {"apps": [], "actions": []},
    # API-only, like Operator — an Artisan's real capabilities (acknowledge/
    # complete a breakdown repair) are custom DRF actions gated by
    # core.scoping.is_artisan(), not Django Admin model permissions.
    scoping.ARTISAN_GROUP: {"apps": [], "actions": []},
}


class Command(BaseCommand):
    help = "Creates the Admin/Supervisor/Operator groups and assigns Django Admin permissions."

    def handle(self, *args, **options):
        admin_group, _ = Group.objects.get_or_create(name=scoping.ADMIN_GROUP)
        all_perms = Permission.objects.all()
        admin_group.permissions.set(all_perms)
        self.stdout.write(self.style.SUCCESS(f"{scoping.ADMIN_GROUP}: {all_perms.count()} permissions"))

        for group_name, cfg in GROUP_ACCESS.items():
            group, _ = Group.objects.get_or_create(name=group_name)
            if not cfg["apps"]:
                group.permissions.clear()
                self.stdout.write(self.style.SUCCESS(f"{group_name}: 0 permissions (API-only role)"))
                continue

            content_types = ContentType.objects.filter(app_label__in=cfg["apps"])
            perms = Permission.objects.none()
            for action in cfg["actions"]:
                perms |= Permission.objects.filter(
                    content_type__in=content_types, codename__startswith=f"{action}_"
                )
            group.permissions.set(perms)
            self.stdout.write(self.style.SUCCESS(f"{group_name}: {perms.count()} permissions"))

        self.stdout.write(self.style.SUCCESS("Groups seeded."))
