from django.db import migrations

# A target-only parameter: it's never linked to a machine type
# (applicable_machine_types stays empty), so it never appears on any
# production-entry form — Mean Time to Repair isn't operator-entered, it's
# derived from BreakdownLog durations once the Artisan repair workflow
# marks a breakdown fixed (see dashboard/services/mttr.py). Existing here
# purely so it's selectable on the Plan Targets screen like any other
# parameter, giving admins a way to set a target MTTR per site/section.
def seed_mttr_parameter(apps, schema_editor):
    UOM = apps.get_model("masterdata", "UOM")
    Parameter = apps.get_model("masterdata", "Parameter")

    minutes, _ = UOM.objects.get_or_create(abbreviation="min", defaults={"name": "Minutes"})
    Parameter.objects.get_or_create(
        code="mttr-minutes",
        defaults={
            "name": "Mean Time to Repair",
            "uom": minutes,
            "scope": "machine",
            "data_type": "number",
            "aggregation": "average",
            "is_required": False,
        },
    )


def remove_mttr_parameter(apps, schema_editor):
    Parameter = apps.get_model("masterdata", "Parameter")
    Parameter.objects.filter(code="mttr-minutes").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("masterdata", "0007_seed_lhd_machine_type"),
    ]

    operations = [
        migrations.RunPython(seed_mttr_parameter, remove_mttr_parameter),
    ]
