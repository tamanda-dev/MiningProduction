from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import BaseCommand

from core import scoping

User = get_user_model()

# Deliberately accounts-only: no sites/sections/machines/parameters/teams/
# etc. get seeded, so a fresh deploy has working demo logins for every role
# but an otherwise empty system, ready to be configured from scratch
# through the UI (see README's Master Data section) rather than shipped
# with a canned dataset.
DEMO_USERS = [
    ("demo_admin", scoping.ADMIN_GROUP, "Admin123!", "Tendai", "Moyo"),
    ("demo_supervisor", scoping.SUPERVISOR_GROUP, "Supervisor123!", "Simbarashe", "Ncube"),
    ("demo_operator1", scoping.OPERATOR_GROUP, "Operator123!", "Tapiwa", "Mutasa"),
    ("demo_operator2", scoping.OPERATOR_GROUP, "Operator123!", "Blessing", "Sibanda"),
]


class Command(BaseCommand):
    help = "Creates the demo user accounts (one per role) — no master/business data."

    def handle(self, *args, **options):
        call_command("seed_groups")

        self._seed_users()
        self._seed_maintenance_technician()

        self.stdout.write(self.style.SUCCESS("Demo accounts seeded successfully."))

    def _seed_users(self):
        users = {}
        for username, group_name, password, first_name, last_name in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@example.com",
                    "first_name": first_name,
                    "last_name": last_name,
                },
            )
            if created:
                user.set_password(password)
                user.save()
            elif user.first_name != first_name or user.last_name != last_name:
                user.first_name = first_name
                user.last_name = last_name
                user.save(update_fields=["first_name", "last_name"])
            group, _ = Group.objects.get_or_create(name=group_name)
            user.groups.set([group])
            users[username] = user

        self.stdout.write(f"Demo users: {list(users)} (passwords per DEMO_USERS in seed_demo_data.py)")
        return users

    def _seed_maintenance_technician(self):
        user, created = User.objects.get_or_create(
            username="demo_artisan",
            defaults={
                "email": "demo_artisan@example.com",
                "first_name": "Kudakwashe",
                "last_name": "Marufu",
                "maintenance_technician": True,
            },
        )
        if created:
            user.set_password("Artisan123!")
            user.save()
        else:
            update_fields = []
            if not user.maintenance_technician:
                user.maintenance_technician = True
                update_fields.append("maintenance_technician")
            if not user.first_name:
                user.first_name = "Kudakwashe"
                user.last_name = "Marufu"
                update_fields += ["first_name", "last_name"]
            if update_fields:
                user.save(update_fields=update_fields)
        group, _ = Group.objects.get_or_create(name=scoping.OPERATOR_GROUP)
        user.groups.set([group])
        self.stdout.write("Demo user 'demo_artisan' seeded (maintenance_technician=True, password Artisan123!).")
        return user
