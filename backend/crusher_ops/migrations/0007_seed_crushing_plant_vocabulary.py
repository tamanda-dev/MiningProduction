from django.db import migrations

# This deployment runs exactly one crushing plant, and the Supervisor
# stationed there needs these exact checklist items and breakdown causes
# available the moment they open the app — not typed in by hand first.
# Idempotent (get_or_create by code), so re-running `migrate` on an
# environment that already has these rows is a no-op.
CHECKLIST_ITEMS = [
    ("Safety Talk", "safety-talk"),
    ("Plant Checks", "plant-checks"),
    ("Housekeeping", "housekeeping"),
    ("Crushing", "crushing"),
]

BREAKDOWN_CAUSES = [
    ("Blocked Chute Sensor", "blocked-chute-sensor", False),
    ("Belt Alignment", "belt-alignment", False),
    ("Process Interlock", "process-interlock", False),
    ("Choke", "choke", False),
    ("Pull wire", "pull-wire", False),
    ("Discharge chute hang-up", "discharge-chute-hang-up", False),
    ("Hopper hangup", "hopper-hangup", False),
    ("Faulty roller", "faulty-roller", False),
    ("Tramp metal", "tramp-metal", False),
    ("Belt Offtracking", "belt-offtracking", False),
    ("Other", "other", True),
]

TONNES_CRUSHED_PARAMETER_CODE = "tonnes-crushed"


def seed_vocabulary(apps, schema_editor):
    ChecklistItem = apps.get_model("crusher_ops", "ChecklistItem")
    BreakdownCause = apps.get_model("crusher_ops", "BreakdownCause")
    UOM = apps.get_model("masterdata", "UOM")
    Parameter = apps.get_model("masterdata", "Parameter")
    MachineType = apps.get_model("masterdata", "MachineType")

    for name, code in CHECKLIST_ITEMS:
        ChecklistItem.objects.get_or_create(code=code, defaults={"name": name})

    for name, code, is_other in BREAKDOWN_CAUSES:
        BreakdownCause.objects.get_or_create(code=code, defaults={"name": name, "is_other": is_other})

    uom, _ = UOM.objects.get_or_create(abbreviation="t", defaults={"name": "Tonnes"})
    parameter, created = Parameter.objects.get_or_create(
        code=TONNES_CRUSHED_PARAMETER_CODE,
        defaults={
            "name": "Tonnes Crushed",
            "uom": uom,
            "scope": "machine",
            "data_type": "number",
            "aggregation": "sum",
            "is_required": False,
        },
    )
    # applicable_machine_types is optional on Parameter (used for form-
    # schema filtering, not enforced) — only attach it if a "cru" Machine
    # Type already exists; if this deploy hasn't configured one yet, the
    # Parameter still gets created and can be attached to it later from
    # Master Data > Parameters once it does.
    crusher_type = MachineType.objects.filter(code="cru").first()
    if created and crusher_type is not None:
        parameter.applicable_machine_types.add(crusher_type)


def noop_reverse(apps, schema_editor):
    """Deliberately not deleting the seeded rows on reverse — by the time a
    site is using them (checklist ticks, breakdown-matrix entries, tonnage
    Production Entries reference them by FK/code), removing them would
    either cascade-delete real operational data or fail outright. A
    migrate-down that needs this vocabulary gone is a manual, deliberate
    data cleanup, not an automatic side effect of reversing this migration.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("crusher_ops", "0006_historicalhourlychecklistentry_completed_at_and_more"),
        ("masterdata", "0005_remove_historicalcrusherunit_history_user_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_vocabulary, noop_reverse),
    ]
