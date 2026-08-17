from django.db import migrations


def seed_artisan_group(apps, schema_editor):
    """Creates the "Artisan" Django Group directly, so it exists
    immediately after `migrate` on any deployment — assigning the Artisan
    role via UserViewSet.assign_role (see accounts/views.py) does
    `Group.objects.get(name=...)`, not get_or_create, so it would 404 on a
    site that hasn't separately (re)run `seed_groups` since this role was
    added.
    """
    Group = apps.get_model("auth", "Group")
    Group.objects.get_or_create(name="Artisan")


def remove_artisan_group(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name="Artisan").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_passwordresetotp"),
    ]

    operations = [
        migrations.RunPython(seed_artisan_group, remove_artisan_group),
    ]
