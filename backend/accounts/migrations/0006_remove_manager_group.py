from django.db import migrations


def reassign_managers_to_supervisor(apps, schema_editor):
    """The Manager role was removed — Supervisor absorbed everything it
    used to do. Any user still sitting in the "Manager" Django Group (from
    before this change) gets moved to "Supervisor" so they don't silently
    lose all access, then the now-unused "Manager" group row itself is
    deleted so it can't be picked again (e.g. via Django Admin).
    """
    Group = apps.get_model("auth", "Group")
    manager_group = Group.objects.filter(name="Manager").first()
    if manager_group is None:
        return

    supervisor_group, _ = Group.objects.get_or_create(name="Supervisor")
    for user in manager_group.user_set.all():
        user.groups.add(supervisor_group)
        user.groups.remove(manager_group)

    manager_group.delete()


def noop_reverse(apps, schema_editor):
    # Deliberately irreversible: which users were "originally" Manager vs.
    # already Supervisor is no longer recoverable once merged.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_historicaluser"),
    ]

    operations = [
        migrations.RunPython(reassign_managers_to_supervisor, noop_reverse),
    ]
