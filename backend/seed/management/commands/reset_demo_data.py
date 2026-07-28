from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    """Deletes every business/operational record — sites, sections, machines,
    entries, breakdowns, teams, shifts, plan targets, crusher-ops data, and
    the audit trail — so the app starts from a genuinely empty state instead
    of the seeded demo dataset. User accounts (and their group/role
    membership) are deliberately left untouched, so the existing
    demo_admin/demo_supervisor/etc. logins keep working afterward; only their
    UserSiteAccess/MachineTypeQualification grants are cleared, since those
    reference the master-data rows being deleted.

    Deletion order matters: most FKs in this codebase are on_delete=PROTECT,
    so children must go before their parents. MachineAssignment in
    particular has no DELETE exposed via the API at all (it's an
    intentionally read-only audit history) — this command uses the ORM
    directly, which has no such restriction.
    """

    help = "Deletes all business/operational data, keeping user accounts. Irreversible — pass --yes to skip the prompt."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")

    def handle(self, *args, **options):
        if not options["yes"]:
            confirm = input(
                "This will PERMANENTLY delete every site, section, machine, entry, breakdown, "
                "team, shift, plan target, crusher-ops record, and audit-log entry.\n"
                "User accounts and their roles are preserved.\n"
                "Type 'yes' to continue: "
            )
            if confirm != "yes":
                self.stdout.write(self.style.WARNING("Aborted — no changes made."))
                return

        from accounts.models import UserSiteAccess
        from audit.models import AuditLog
        from crusher_ops.models import (
            BreakdownCause,
            BreakdownIncident,
            ChecklistItem,
            HourlyBreakdownEntry,
            HourlyChecklistEntry,
            HourlySlot,
            ShiftCrushingSummary,
        )
        from entries.models import BreakdownLog, CrusherEntry, DeliveryEntry, ProductionEntry
        from machines.models import Machine, MachineAssignment, MachineTypeQualification
        from masterdata.models import (
            CrusherUnit,
            DeliveryDestination,
            DowntimeReasonCode,
            MachineType,
            Parameter,
            Section,
            Site,
            UOM,
        )
        from planning.models import PlanTarget
        from shiftmgmt.models import Shift, ShiftInstance
        from teams.models import ShiftPattern, Team, TeamMember

        with transaction.atomic():
            # Deepest first: rows that reference entries/machines/shifts.
            HourlyChecklistEntry.objects.all().delete()
            HourlyBreakdownEntry.objects.all().delete()
            BreakdownIncident.objects.all().delete()
            ShiftCrushingSummary.objects.all().delete()
            ProductionEntry.objects.all().delete()  # cascades ParameterValue
            BreakdownLog.objects.all().delete()
            CrusherEntry.objects.all().delete()
            DeliveryEntry.objects.all().delete()

            MachineAssignment.objects.all().delete()
            PlanTarget.objects.all().delete()
            Parameter.objects.all().delete()  # cascades ParameterChoice; must precede Section (Parameter.section is PROTECT)
            TeamMember.objects.all().delete()
            Team.objects.all().delete()
            ShiftInstance.objects.all().delete()
            Shift.objects.all().delete()

            Machine.objects.all().delete()
            MachineTypeQualification.objects.all().delete()
            UserSiteAccess.objects.all().delete()

            HourlySlot.objects.all().delete()
            Section.objects.all().delete()
            CrusherUnit.objects.all().delete()
            DeliveryDestination.objects.all().delete()
            DowntimeReasonCode.objects.all().delete()
            BreakdownCause.objects.all().delete()
            ChecklistItem.objects.all().delete()
            MachineType.objects.all().delete()
            UOM.objects.all().delete()
            ShiftPattern.objects.all().delete()
            Site.objects.all().delete()

            # The bulk deletes above generate a fresh wave of "deleted"
            # audit-log rows via the HistoricalRecords bridge — clear those
            # too, plus any pre-existing history, for a genuinely blank
            # audit trail.
            AuditLog.objects.all().delete()

            # django-simple-history shadow tables have no live FK back to
            # the tables above (by design), so they wouldn't block any of
            # this — but they'd otherwise leave stray "history of a
            # since-deleted row" records behind. Clear every HistoricalXxx
            # table generically rather than importing all ~25 of them.
            for model in apps.get_models():
                if model.__name__.startswith("Historical"):
                    model.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                "Done. All business/operational data and audit history were deleted; user accounts were preserved."
            )
        )
