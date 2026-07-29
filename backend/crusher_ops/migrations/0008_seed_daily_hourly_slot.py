from django.db import migrations

# "Crushing is done daily" — the checklist/breakdown-matrix cadence keys off
# HourlySlot, and with none configured those screens have nothing to attach
# to (and ShiftCrushingSummary.crushing_time_minutes computes to 0). Only
# touches sites with ZERO existing HourlySlot rows, so a site that already
# has real hourly slots configured is left alone.
ALL_DAY_SLOT_INDEX = 0


def seed_daily_slot(apps, schema_editor):
    Site = apps.get_model("masterdata", "Site")
    HourlySlot = apps.get_model("crusher_ops", "HourlySlot")

    for site in Site.objects.all():
        if HourlySlot.objects.filter(site=site).exists():
            continue
        HourlySlot.objects.create(
            site=site,
            slot_index=ALL_DAY_SLOT_INDEX,
            start_time="00:00:00",
            end_time="00:00:00",
        )


def noop_reverse(apps, schema_editor):
    """Not deleting the seeded rows on reverse — see migration 0007's
    identical rationale (by the time a site is using this slot, checklist/
    breakdown-matrix entries reference it by FK)."""


class Migration(migrations.Migration):

    dependencies = [
        ("crusher_ops", "0007_seed_crushing_plant_vocabulary"),
    ]

    operations = [
        migrations.RunPython(seed_daily_slot, noop_reverse),
    ]
