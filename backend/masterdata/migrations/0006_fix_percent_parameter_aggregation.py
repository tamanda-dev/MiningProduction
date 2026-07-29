from django.db import migrations

# A parameter measured in "%" is definitionally a rate, not an additive
# quantity — three hourly readings of 99/99/100% must average to ~99.3%,
# never sum to "298%" (see Parameter.aggregation's docstring, added earlier
# this session). Any parameter that was created before that field existed,
# or had its UOM set to "%" afterwards without also flipping aggregation,
# is silently wrong in every rollup that reads it — caught live via
# "Machine Availability" reporting 320%+ on a real export.
def fix_percent_aggregation(apps, schema_editor):
    Parameter = apps.get_model("masterdata", "Parameter")
    Parameter.objects.filter(uom__abbreviation="%").exclude(aggregation="average").update(aggregation="average")


def noop_reverse(apps, schema_editor):
    """Not reversible — there's no record of which rows were "sum" on
    purpose (there shouldn't be any for a % parameter) versus fixed by this
    migration."""


class Migration(migrations.Migration):

    dependencies = [
        ("masterdata", "0005_remove_historicalcrusherunit_history_user_and_more"),
    ]

    operations = [
        migrations.RunPython(fix_percent_aggregation, noop_reverse),
    ]
