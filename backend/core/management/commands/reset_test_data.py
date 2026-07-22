from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import UserSiteAccess
from crusher_ops.models import (
    BreakdownCause,
    BreakdownIncident,
    ChecklistItem,
    HourlyBreakdownEntry,
    HourlyChecklistEntry,
    HourlySlot,
    ShiftCrushingSummary,
)
from entries.models import (
    BreakdownLog,
    CrusherEntry,
    DeliveryEntry,
    ParameterValue,
    ProductionEntry,
)
from machines.models import Machine, MachineAssignment, MachineTypeQualification
from masterdata.models import (
    UOM,
    CrusherUnit,
    DeliveryDestination,
    DowntimeReasonCode,
    MachineType,
    Parameter,
    ParameterChoice,
    Section,
    Site,
    SubSection,
)
from planning.models import PlanTarget
from shiftmgmt.models import Shift, ShiftInstance
from teams.models import ShiftPattern, Team, TeamMember

User = get_user_model()

# Ordered leaves-first so PROTECT-ed foreign keys never block a delete.
DELETE_ORDER = [
    ("Business/operational data", ParameterValue),
    ("Business/operational data", HourlyChecklistEntry),
    ("Business/operational data", HourlyBreakdownEntry),
    ("Business/operational data", BreakdownIncident),
    ("Business/operational data", ShiftCrushingSummary),
    ("Business/operational data", ProductionEntry),
    ("Business/operational data", BreakdownLog),
    ("Business/operational data", CrusherEntry),
    ("Business/operational data", DeliveryEntry),
    ("Business/operational data", PlanTarget),
    ("Business/operational data", MachineAssignment),
    ("Business/operational data", ShiftInstance),
    ("Master/setup data", TeamMember),
    ("Master/setup data", MachineTypeQualification),
    ("Master/setup data", Team),
    ("Master/setup data", Shift),
    ("Master/setup data", ShiftPattern),
    ("Master/setup data", Machine),
    ("Master/setup data", HourlySlot),
    ("Master/setup data", ChecklistItem),
    ("Master/setup data", BreakdownCause),
    ("Master/setup data", DowntimeReasonCode),
    ("Master/setup data", MachineType),
    ("Master/setup data", ParameterChoice),
    ("Master/setup data", Parameter),
    ("Master/setup data", SubSection),
    ("Master/setup data", DeliveryDestination),
    ("Master/setup data", CrusherUnit),
    ("Master/setup data", UserSiteAccess),
    ("Master/setup data", UOM),
    ("Master/setup data", Section),
    ("Master/setup data", Site),
]


class Command(BaseCommand):
    help = (
        "Deletes all master/setup data and all business/operational data so the app can be "
        "tested from a clean slate. Superuser accounts are preserved by default so you can "
        "still log in afterward; pass --delete-superusers to wipe every User row too."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete-superusers",
            action="store_true",
            help="Also delete superuser accounts (normally preserved so you can still log in).",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip the interactive confirmation prompt.",
        )

    def handle(self, *args, **options):
        if not options["yes"]:
            confirm = input(
                "This will permanently delete ALL master/setup data and ALL business/operational "
                "data from this database. Type 'yes' to continue: "
            )
            if confirm.strip().lower() != "yes":
                self.stdout.write(self.style.WARNING("Aborted."))
                return

        with transaction.atomic():
            for label, model in DELETE_ORDER:
                count, _ = model.objects.all().delete()
                if count:
                    self.stdout.write(f"[{label}] {model.__name__}: deleted {count}")

            user_qs = User.objects.all()
            if not options["delete_superusers"]:
                user_qs = user_qs.filter(is_superuser=False)
            count, _ = user_qs.delete()
            self.stdout.write(f"[Master/setup data] User: deleted {count}")

        remaining_superusers = User.objects.filter(is_superuser=True).count()
        self.stdout.write(self.style.SUCCESS("Reset complete."))
        if not options["delete_superusers"]:
            self.stdout.write(f"Preserved {remaining_superusers} superuser account(s).")
