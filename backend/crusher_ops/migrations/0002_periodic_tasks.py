from django.db import migrations


def create_periodic_tasks(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    every_15_min, _ = IntervalSchedule.objects.get_or_create(every=15, period="minutes")

    PeriodicTask.objects.get_or_create(
        name="Notify unattended breakdown incidents",
        defaults={
            "interval": every_15_min,
            "task": "crusher_ops.tasks.notify_unattended_breakdown_incidents",
        },
    )


def remove_periodic_tasks(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="Notify unattended breakdown incidents").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("crusher_ops", "0001_initial"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(create_periodic_tasks, remove_periodic_tasks),
    ]
