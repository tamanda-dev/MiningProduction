from django.db import migrations


def create_periodic_tasks(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    every_15_min, _ = IntervalSchedule.objects.get_or_create(every=15, period="minutes")
    every_30_min, _ = IntervalSchedule.objects.get_or_create(every=30, period="minutes")

    PeriodicTask.objects.get_or_create(
        name="Prune stale machine assignments",
        defaults={
            "interval": every_15_min,
            "task": "dashboard.tasks.prune_stale_machine_assignments",
        },
    )
    PeriodicTask.objects.get_or_create(
        name="Send shift close reminders",
        defaults={
            "interval": every_30_min,
            "task": "dashboard.tasks.send_shift_close_reminder",
        },
    )


def remove_periodic_tasks(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(
        name__in=["Prune stale machine assignments", "Send shift close reminders"]
    ).delete()


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(create_periodic_tasks, remove_periodic_tasks),
    ]
