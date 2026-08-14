from django.db import migrations

# The source Hauling/Trucking + Availability & Breakdown shift reports this
# system replaces track Load-Haul-Dump units as their own equipment class,
# distinct from Dump Trucks (DT) — this site runs both. Missing from the
# machine-type list until now, which blocked Master Data from ever adding
# an LHD-type Machine or seeing one grouped correctly on the hourly
# availability/breakdown report.
def seed_lhd_machine_type(apps, schema_editor):
    MachineType = apps.get_model("masterdata", "MachineType")
    MachineType.objects.get_or_create(code="LHD", defaults={"name": "Load-Haul-Dump"})


def remove_lhd_machine_type(apps, schema_editor):
    MachineType = apps.get_model("masterdata", "MachineType")
    MachineType.objects.filter(code="LHD").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("masterdata", "0006_fix_percent_parameter_aggregation"),
    ]

    operations = [
        migrations.RunPython(seed_lhd_machine_type, remove_lhd_machine_type),
    ]
