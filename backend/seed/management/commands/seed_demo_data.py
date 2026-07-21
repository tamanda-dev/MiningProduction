import datetime
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import UserSiteAccess
from core import scoping
from machines.models import Machine, MachineTypeQualification
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
from shiftmgmt.models import Shift
from teams.models import ShiftPattern, Team, TeamMember

User = get_user_model()

SECTION_NAMES = ["Ngwarati", "Rukodzi", "Mupfuti", "Bimha"]
SUBSECTION_CODES = list("ABCDEFGHIJKLMNOPQ")

MACHINE_TYPES = [
    ("DUT", "Dump Truck", "Underground haul trucks"),
    ("LHD", "Load-Haul-Dump", "Scoop/loader units"),
    ("BOR", "Bogger", "Boring/bogging units"),
    ("DRR", "Drill Rig", "Drilling rigs"),
    ("CRU", "Crusher", "Crushing plant units"),
]

UOMS = [
    ("Tonnes", "t"),
    ("Metres", "m"),
    ("Percent", "%"),
    ("Number", "no"),
    ("Hours", "hr"),
]

DOWNTIME_REASONS = [
    ("mech-fail", "Mechanical failure", "Mechanical"),
    ("elec-fail", "Electrical failure", "Electrical"),
    ("hydraulic", "Hydraulic leak", "Mechanical"),
    ("no-operator", "No operator available", "Operational"),
    ("blast-delay", "Blast delay", "Operational"),
    ("planned-maint", "Planned maintenance", "Planned"),
]

DEMO_USERS = [
    ("demo_admin", scoping.ADMIN_GROUP, "Admin123!", "Tendai", "Moyo"),
    ("demo_manager", scoping.MANAGER_GROUP, "Manager123!", "Farai", "Chikwava"),
    ("demo_supervisor", scoping.SUPERVISOR_GROUP, "Supervisor123!", "Simbarashe", "Ncube"),
    ("demo_operator1", scoping.OPERATOR_GROUP, "Operator123!", "Tapiwa", "Mutasa"),
    ("demo_operator2", scoping.OPERATOR_GROUP, "Operator123!", "Blessing", "Sibanda"),
]

BREAKDOWN_CAUSES = [
    ("blocked-chute", "Blocked Chute"),
    ("belt-tear", "Belt Tear"),
    ("motor-overload", "Motor Overload/Trip"),
    ("bearing-failure", "Bearing Failure"),
    ("hydraulic-failure", "Hydraulic Failure"),
    ("electrical-fault", "Electrical Fault"),
    ("liner-wear", "Liner Wear/Failure"),
    ("feeder-jam", "Feeder Jam"),
    ("conveyor-misalignment", "Conveyor Misalignment"),
    ("tramp-metal", "Foreign Object/Tramp Metal"),
    ("lubrication-fault", "Lubrication System Fault"),
]

CHECKLIST_ITEMS = [
    ("safety-talk", "Safety Talk"),
    ("plant-checks", "Plant Checks"),
    ("housekeeping", "Housekeeping"),
    ("crushing-status", "Crushing Status Check"),
]


class Command(BaseCommand):
    help = "Loads demo master data (sites, sections, machine types, machines, parameters, teams, users) for an immediately-demoable system."

    def add_arguments(self, parser):
        parser.add_argument(
            "--with-entries",
            action="store_true",
            help="Also seed a handful of sample ProductionEntry rows for today's shift.",
        )

    def handle(self, *args, **options):
        call_command("seed_groups")

        sites = self._seed_sites()
        sections_by_site = self._seed_sections(sites)
        subsections_by_section = self._seed_subsections(sections_by_site)
        machine_types = self._seed_machine_types()
        uoms = self._seed_uoms()
        parameters = self._seed_parameters(machine_types, uoms, sections_by_site)
        self._seed_crusher_units(sites)
        self._seed_delivery_destinations(sites)
        self._seed_downtime_reasons()
        machines = self._seed_machines(sites, machine_types, sections_by_site)
        shifts = self._seed_shifts(sites)
        users = self._seed_users(sites, sections_by_site, machine_types)
        self._seed_teams(sites, sections_by_site, shifts, users)
        self._seed_plan_targets(sites, sections_by_site, parameters)

        causes = self._seed_breakdown_causes()
        self._seed_checklist_items()
        self._seed_hourly_slots(sites)
        users["demo_artisan"] = self._seed_maintenance_technician(sites)
        self._seed_demo_breakdown_incidents(machines, users, causes)

        if options["with_entries"]:
            self._seed_sample_entries(machines, sections_by_site, shifts, users, parameters)

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))

    # -- Sites / Sections -------------------------------------------------

    def _seed_sites(self):
        sites = {}
        for name, code in [("South Pit", "south-pit"), ("North Pit", "north-pit")]:
            site, _ = Site.objects.get_or_create(code=code, defaults={"name": name})
            sites[code] = site
        self.stdout.write(f"Sites: {list(sites)}")
        return sites

    def _seed_sections(self, sites):
        sections_by_site = {}
        for code, site in sites.items():
            sections_by_site[code] = []
            for name in SECTION_NAMES:
                section, _ = Section.objects.get_or_create(
                    site=site, code=name.lower(), defaults={"name": name}
                )
                sections_by_site[code].append(section)
        self.stdout.write("Sections seeded for each site.")
        return sections_by_site

    def _seed_subsections(self, sections_by_site):
        subsections_by_section = {}
        for sections in sections_by_site.values():
            for section in sections:
                subsections_by_section[section.id] = []
                for i, letter in enumerate(SUBSECTION_CODES):
                    sub, _ = SubSection.objects.get_or_create(
                        section=section, code=letter, defaults={"name": letter, "display_order": i}
                    )
                    subsections_by_section[section.id].append(sub)
        self.stdout.write("Subsections A-Q seeded per section.")
        return subsections_by_section

    # -- Machine types / UOMs / Parameters ---------------------------------

    def _seed_machine_types(self):
        machine_types = {}
        for code, name, description in MACHINE_TYPES:
            mt, _ = MachineType.objects.get_or_create(
                code=code.lower(), defaults={"name": name, "description": description}
            )
            machine_types[code] = mt
        self.stdout.write(f"MachineTypes: {list(machine_types)}")
        return machine_types

    def _seed_uoms(self):
        uoms = {}
        for name, abbreviation in UOMS:
            uom, _ = UOM.objects.get_or_create(abbreviation=abbreviation, defaults={"name": name})
            uoms[abbreviation] = uom
        self.stdout.write(f"UOMs: {list(uoms)}")
        return uoms

    def _seed_parameters(self, machine_types, uoms, sections_by_site):
        parameters = {}

        def machine_param(code, name, uom_abbr, machine_type_codes, min_value=None, max_value=None):
            param, _ = Parameter.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "uom": uoms[uom_abbr],
                    "scope": Parameter.SCOPE_MACHINE,
                    "data_type": Parameter.DATA_TYPE_NUMBER,
                    "min_value": min_value,
                    "max_value": max_value,
                },
            )
            param.applicable_machine_types.set([machine_types[c] for c in machine_type_codes])
            parameters[code] = param
            return param

        machine_param("tonnes-hauled", "Tonnes Hauled", "t", ["DUT"], min_value=0)
        machine_param("bucket-loads", "Bucket Loads", "no", ["LHD"], min_value=0)
        machine_param("metres-drilled", "Metres Drilled", "m", ["DRR"], min_value=0)
        machine_param("holes-bored", "Holes Bored", "no", ["BOR"], min_value=0)
        machine_param("crusher-throughput", "Crusher Throughput", "t", ["CRU"], min_value=0)

        # Section-level parameter (any site's Ngwarati section)
        for sections in sections_by_site.values():
            ngwarati = next((s for s in sections if s.code == "ngwarati"), None)
            if ngwarati:
                param, _ = Parameter.objects.get_or_create(
                    code=f"face-advance-{ngwarati.site.code}",
                    defaults={
                        "name": "Face Advance",
                        "uom": uoms["m"],
                        "scope": Parameter.SCOPE_SECTION,
                        "data_type": Parameter.DATA_TYPE_NUMBER,
                        "section": ngwarati,
                    },
                )
                parameters[param.code] = param

        # Select-type parameter, applicable to all machine types
        ground_condition, _ = Parameter.objects.get_or_create(
            code="ground-condition",
            defaults={
                "name": "Ground Condition",
                "scope": Parameter.SCOPE_SHIFT,
                "data_type": Parameter.DATA_TYPE_SELECT,
                "is_required": False,
            },
        )
        ground_condition.applicable_machine_types.set(list(machine_types.values()))
        for i, (value, label) in enumerate([("good", "Good"), ("fair", "Fair"), ("poor", "Poor")]):
            ParameterChoice.objects.get_or_create(
                parameter=ground_condition, value=value, defaults={"label": label, "display_order": i}
            )
        parameters["ground-condition"] = ground_condition

        self.stdout.write(f"Parameters: {list(parameters)}")
        return parameters

    def _seed_crusher_units(self, sites):
        for code, site in sites.items():
            for suffix in ["201", "202", "203"]:
                CrusherUnit.objects.get_or_create(
                    site=site, code=f"crushed-{suffix}", defaults={"name": f"Crushed-{suffix}"}
                )
        self.stdout.write("CrusherUnits 201/202/203 seeded per site.")

    def _seed_delivery_destinations(self, sites):
        for code, site in sites.items():
            for suffix in ["1", "2"]:
                DeliveryDestination.objects.get_or_create(
                    site=site, code=f"plant-{suffix}", defaults={"name": f"Plant {suffix}"}
                )
        self.stdout.write("DeliveryDestinations Plant 1/2 seeded per site.")

    def _seed_downtime_reasons(self):
        for code, description, category in DOWNTIME_REASONS:
            DowntimeReasonCode.objects.get_or_create(
                code=code, defaults={"description": description, "category": category}
            )
        self.stdout.write(f"DowntimeReasonCodes: {[c for c, _, _ in DOWNTIME_REASONS]}")

    # -- Machines -----------------------------------------------------------

    def _seed_machines(self, sites, machine_types, sections_by_site):
        machines = {}
        fleet_start = {"DUT": 110, "LHD": 20, "BOR": 5, "DRR": 8, "CRU": 1}
        for code, site in sites.items():
            sections = sections_by_site[code]
            for mt_code, mt in machine_types.items():
                for i in range(2):
                    fleet_number = str(fleet_start[mt_code] + i)
                    machine, _ = Machine.objects.get_or_create(
                        site=site,
                        machine_type=mt,
                        fleet_number=fleet_number,
                        defaults={
                            "name": f"{mt_code} {fleet_number}",
                            "current_section": sections[i % len(sections)],
                        },
                    )
                    machines.setdefault(code, []).append(machine)
        self.stdout.write("Machines seeded (2 per type per site).")
        return machines

    # -- Shifts ---------------------------------------------------------------

    def _seed_shifts(self, sites):
        shifts = {}
        for code, site in sites.items():
            day, _ = Shift.objects.get_or_create(
                site=site, name="Day", defaults={"start_time": "06:30", "end_time": "18:30", "slot_length_minutes": 60}
            )
            night, _ = Shift.objects.get_or_create(
                site=site, name="Night", defaults={"start_time": "18:30", "end_time": "06:30", "slot_length_minutes": 60}
            )
            shifts[code] = {"Day": day, "Night": night}
        self.stdout.write("Shifts Day/Night seeded per site (60-minute slots).")
        return shifts

    # -- Users ------------------------------------------------------------------

    def _seed_users(self, sites, sections_by_site, machine_types):
        from django.contrib.auth.models import Group

        users = {}
        south_pit = sites["south-pit"]

        for username, group_name, password, first_name, last_name in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@example.com",
                    "first_name": first_name,
                    "last_name": last_name,
                },
            )
            if created:
                user.set_password(password)
                user.save()
            elif user.first_name != first_name or user.last_name != last_name:
                user.first_name = first_name
                user.last_name = last_name
                user.save(update_fields=["first_name", "last_name"])
            group, _ = Group.objects.get_or_create(name=group_name)
            user.groups.set([group])
            users[username] = user

        # Admin: no UserSiteAccess needed (bypasses scoping entirely).
        # Manager: no rows -> unrestricted across all sites (per scoping rules).
        # Supervisor: scoped to South Pit only, to demonstrate cross-site isolation.
        UserSiteAccess.objects.get_or_create(user=users["demo_supervisor"], site=south_pit, section=None)

        # Operators: qualified on DUT + LHD at South Pit.
        for username in ["demo_operator1", "demo_operator2"]:
            for mt_code in ["DUT", "LHD"]:
                MachineTypeQualification.objects.get_or_create(
                    user=users[username], machine_type=machine_types[mt_code], site=south_pit
                )

        # demo_operator2 is also qualified on Crusher — without this, no
        # seeded account can ever activate a CRU machine, making the
        # Crushing & Breakdowns module's checklist/breakdown-matrix screens
        # (mobile and web) unreachable end-to-end via a real operator login.
        # demo_operator1 deliberately stays DUT/LHD-only, to keep
        # demonstrating that qualification scoping still excludes CRU for
        # an unqualified operator.
        MachineTypeQualification.objects.get_or_create(
            user=users["demo_operator2"], machine_type=machine_types["CRU"], site=south_pit
        )

        self.stdout.write(f"Demo users: {list(users)} (passwords per DEMO_USERS in seed_demo_data.py)")
        return users

    # -- Teams --------------------------------------------------------------

    def _seed_teams(self, sites, sections_by_site, shifts, users):
        pattern, _ = ShiftPattern.objects.get_or_create(name="Standard Rotation", defaults={"description": "4 on / 4 off"})
        south_pit = sites["south-pit"]
        ngwarati = next(s for s in sections_by_site["south-pit"] if s.code == "ngwarati")

        team, _ = Team.objects.get_or_create(
            site=south_pit, name="Ngwarati A-Team", defaults={"section": ngwarati, "shift_pattern": pattern}
        )
        for username, role in [("demo_supervisor", TeamMember.ROLE_TEAM_LEADER), ("demo_operator1", TeamMember.ROLE_OPERATOR), ("demo_operator2", TeamMember.ROLE_OPERATOR)]:
            TeamMember.objects.get_or_create(team=team, user=users[username], defaults={"role_on_team": role})
        self.stdout.write("Team 'Ngwarati A-Team' seeded with demo users.")

    # -- Plan targets ---------------------------------------------------------

    def _seed_plan_targets(self, sites, sections_by_site, parameters):
        today = timezone.localdate()
        south_pit = sites["south-pit"]
        ngwarati = next(s for s in sections_by_site["south-pit"] if s.code == "ngwarati")

        for code in ["tonnes-hauled", "bucket-loads", "metres-drilled", "holes-bored", "crusher-throughput"]:
            PlanTarget.objects.get_or_create(
                parameter=parameters[code],
                site=south_pit,
                section=ngwarati,
                machine=None,
                period_type=PlanTarget.PERIOD_DAY,
                period_date=today,
                defaults={"target_value": 500},
            )
        self.stdout.write(f"PlanTargets seeded for {today} (South Pit / Ngwarati).")

    # -- Optional sample entries ------------------------------------------------

    def _seed_sample_entries(self, machines, sections_by_site, shifts, users, parameters):
        from entries.models import ProductionEntry
        from entries.services import resolve_slot_datetimes, set_parameter_values
        from shiftmgmt.services import get_or_create_open_instance

        south_pit_machines = machines.get("south-pit", [])
        dut_machine = next((m for m in south_pit_machines if m.machine_type.code == "dut"), None)
        if dut_machine is None:
            return

        instance = get_or_create_open_instance(dut_machine.site)
        if instance is None:
            self.stdout.write(self.style.WARNING("No shift covers the current time; skipping sample entries."))
            return

        operator = users["demo_operator1"]
        for slot_index in range(3):
            slot_start_at, slot_end_at = resolve_slot_datetimes(instance, slot_index)
            entry, created = ProductionEntry.objects.get_or_create(
                shift_instance=instance,
                machine=dut_machine,
                section=dut_machine.current_section,
                slot_index=slot_index,
                entry_type=ProductionEntry.ENTRY_TYPE_HOURLY,
                defaults={
                    "site": dut_machine.site,
                    "operator": operator,
                    "recorded_by": operator,
                    "source": "import",
                    "slot_start_at": slot_start_at,
                    "slot_end_at": slot_end_at,
                },
            )
            if created:
                set_parameter_values(
                    "production_entry", entry, [{"parameter": "tonnes-hauled", "value": 40 + slot_index * 5}]
                )
        self.stdout.write("Sample ProductionEntry rows seeded for today's shift.")

    # -- Crushing & Breakdowns module ---------------------------------------

    def _seed_breakdown_causes(self):
        from crusher_ops.models import BreakdownCause

        causes = {}
        for i, (code, name) in enumerate(BREAKDOWN_CAUSES):
            cause, _ = BreakdownCause.objects.get_or_create(code=code, defaults={"name": name, "display_order": i})
            causes[code] = cause
        other, _ = BreakdownCause.objects.get_or_create(
            code="other", defaults={"name": "Other", "is_other": True, "display_order": len(BREAKDOWN_CAUSES)}
        )
        causes["other"] = other
        self.stdout.write(f"BreakdownCauses: {list(causes)}")
        return causes

    def _seed_checklist_items(self):
        from crusher_ops.models import ChecklistItem

        items = {}
        for i, (code, name) in enumerate(CHECKLIST_ITEMS):
            item, _ = ChecklistItem.objects.get_or_create(code=code, defaults={"name": name, "display_order": i})
            items[code] = item
        self.stdout.write(f"ChecklistItems: {list(items)}")
        return items

    def _seed_hourly_slots(self, sites):
        from datetime import time

        from crusher_ops.models import HourlySlot

        slots_by_site = {}
        for code, site in sites.items():
            slots_by_site[code] = []
            for hour in range(24):
                slot, _ = HourlySlot.objects.get_or_create(
                    site=site,
                    slot_index=hour,
                    defaults={"start_time": time(hour=hour), "end_time": time(hour=(hour + 1) % 24)},
                )
                slots_by_site[code].append(slot)
        self.stdout.write("HourlySlots (24x60min) seeded per site.")
        return slots_by_site

    def _seed_maintenance_technician(self, sites):
        from django.contrib.auth.models import Group

        user, created = User.objects.get_or_create(
            username="demo_artisan",
            defaults={
                "email": "demo_artisan@example.com",
                "first_name": "Kudakwashe",
                "last_name": "Marufu",
                "maintenance_technician": True,
            },
        )
        if created:
            user.set_password("Artisan123!")
            user.save()
        else:
            update_fields = []
            if not user.maintenance_technician:
                user.maintenance_technician = True
                update_fields.append("maintenance_technician")
            if not user.first_name:
                user.first_name = "Kudakwashe"
                user.last_name = "Marufu"
                update_fields += ["first_name", "last_name"]
            if update_fields:
                user.save(update_fields=update_fields)
        group, _ = Group.objects.get_or_create(name=scoping.OPERATOR_GROUP)
        user.groups.set([group])
        self.stdout.write("Demo user 'demo_artisan' seeded (maintenance_technician=True, password Artisan123!).")
        return user

    def _seed_demo_breakdown_incidents(self, machines, users, causes):
        from crusher_ops.models import BreakdownIncident
        from shiftmgmt.services import get_or_create_open_instance

        south_pit_machines = machines.get("south-pit", [])
        crusher_machine = next((m for m in south_pit_machines if m.machine_type.code == "cru"), None)
        if crusher_machine is None:
            return

        instance = get_or_create_open_instance(crusher_machine.site)
        operator = users["demo_operator1"]
        artisan = users.get("demo_artisan")
        now = timezone.now()

        # Keyed on (crusher, description) rather than a freshly-computed
        # time_occurred — the latter changes on every command run and would
        # defeat get_or_create's idempotency (a new duplicate row each run),
        # unlike every other _seed_x method's stable business-key lookup.
        open_occurred = now - timedelta(hours=2)
        BreakdownIncident.objects.get_or_create(
            crusher=crusher_machine,
            description="Belt tear on primary conveyor.",
            defaults={
                "site": crusher_machine.site,
                "section": crusher_machine.current_section,
                "shift_instance": instance,
                "time_occurred": open_occurred,
                "time_reported": open_occurred + timedelta(minutes=5),
                "cause": causes.get("belt-tear"),
                "severity": "high",
                "status": BreakdownIncident.STATUS_OPEN,
                "reported_by": operator,
                "recorded_by": operator,
                "source": "import",
            },
        )

        resolved_occurred = now - timedelta(days=1)
        BreakdownIncident.objects.get_or_create(
            crusher=crusher_machine,
            description="Bearing failure on secondary crusher motor.",
            defaults={
                "site": crusher_machine.site,
                "section": crusher_machine.current_section,
                "shift_instance": instance,
                "time_occurred": resolved_occurred,
                "time_reported": resolved_occurred + timedelta(minutes=5),
                "time_attended": resolved_occurred + timedelta(minutes=20),
                "time_completed": resolved_occurred + timedelta(minutes=95),
                "artisan": artisan,
                "cause": causes.get("bearing-failure"),
                "root_cause_of_failure": "Worn bearing, inadequate lubrication interval.",
                "remedial_action_taken": "Replaced bearing, adjusted lubrication schedule.",
                "severity": "medium",
                "status": BreakdownIncident.STATUS_RESOLVED,
                "reported_by": operator,
                "recorded_by": operator,
                "source": "import",
            },
        )
        self.stdout.write("Demo BreakdownIncidents seeded (1 open, 1 resolved).")
