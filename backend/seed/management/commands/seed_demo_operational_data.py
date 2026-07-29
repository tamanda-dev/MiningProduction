import random
from datetime import time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import UserSiteAccess
from crusher_ops import services as crusher_services
from crusher_ops.models import (
    BreakdownCause,
    BreakdownIncident,
    ChecklistItem,
    HourlyBreakdownEntry,
    HourlySlot,
    HourlyChecklistEntry,
)
from entries.models import BreakdownLog, DeliveryEntry, ProductionEntry
from entries.services import resolve_slot_datetimes, set_parameter_values
from machines.models import Machine, MachineTypeQualification
from masterdata.models import (
    UOM,
    DeliveryDestination,
    DowntimeReasonCode,
    MachineType,
    Parameter,
    Section,
    Site,
)
from planning.models import PlanTarget
from shiftmgmt.models import Shift, ShiftInstance

User = get_user_model()

# How many trailing days (including today) get a Day + Night ShiftInstance
# pair seeded for South Pit. Deliberately relative to "now" (see module
# docstring below) rather than a fixed historical range, so the dataset
# always looks fresh no matter when this command is actually run.
DAYS_OF_HISTORY = 15

SITE_DEFS = [
    # (name, [(section_name, section_code)])
    ("North Pit", ("Bimha", "B001")),
    ("South Pit", ("Royport", "RP001")),
    ("West Pit", ("Quarry", "quarry")),
]

MACHINE_TYPE_DEFS = [
    ("Crusher", "cru"),
    ("Dump Truck", "DT"),
    ("Hydraulic Excavator", "HEX"),
    ("Rotary Drill Rig", "RRD"),
    ("Water Truck", "WT"),
]

UOM_DEFS = [
    ("t", "Tonnes"),
    ("%", "Percentage"),
    ("l", "Litres"),
]

DOWNTIME_REASON_DEFS = [
    ("electrical-fault", "Electrical Fault", "Electrical"),
    ("hydraulic-failure", "Hydraulic Failure", "Mechanical"),
    ("tyre-puncture", "Tyre Puncture", "Mechanical"),
    ("operator-break", "Operator Break", "Operational"),
    ("refueling", "Refueling", "Operational"),
]

# code -> (name, machine_type codes it applies to, uom abbreviation, aggregation)
PARAMETER_DEFS = [
    # tonnes-crushed already exists — seeded by crusher_ops migration 0007 —
    # but is re-declared here (get_or_create, same values) so this command
    # is self-sufficient if ever run against a DB whose migrations predate
    # 0007, and so refresh_summary_for's TONNES_CRUSHED_PARAMETER_CODE
    # lookup always has something to find.
    ("tonnes-crushed", "Tonnes Crushed", ["cru"], "t", Parameter.AGGREGATION_SUM),
    # Percentage parameters MUST use "average" aggregation, never "sum" —
    # three hourly readings of 99/99/100% summing to "298%" is meaningless.
    # See masterdata migration 0006_fix_percent_parameter_aggregation.
    ("machine-availability", "Machine Availability", ["cru", "DT", "HEX", "RRD", "WT"], "%", Parameter.AGGREGATION_AVERAGE),
    ("Fuel-Consumption", "Fuel Consumption", ["DT", "HEX", "RRD", "WT"], "l", Parameter.AGGREGATION_SUM),
    ("tonnes-hauled", "Tonnes Hauled", ["DT"], "t", Parameter.AGGREGATION_SUM),
]

# fleet_number -> (site_name, machine_type_code, display name)
MACHINE_DEFS = [
    ("DUT-001", "North Pit", "DT", "Big Red"),
    ("CRU-001", "South Pit", "cru", ""),
    ("HEX-001", "South Pit", "HEX", "Rock Breaker"),
    ("DUT-101", "South Pit", "DT", "Haul King"),
    ("WT-001", "West Pit", "WT", "Dust Buster"),
    ("RRD-001", "West Pit", "RRD", "Rock Driller"),
]

DELIVERY_DESTINATION_DEFS = [
    # (site_name, name, code)
    ("South Pit", "Processing Plant", "processing-plant"),
    ("South Pit", "Rail Siding", "rail-siding"),
    ("South Pit", "Stockpile A", "stockpile-a"),
]

# Non-"Other" breakdown causes only — sampled for the breakdown matrix so we
# never have to also fabricate other_cause_text.
BREAKDOWN_CAUSE_CODES = [
    "blocked-chute-sensor",
    "belt-alignment",
    "process-interlock",
    "choke",
    "pull-wire",
    "discharge-chute-hang-up",
    "hopper-hangup",
    "faulty-roller",
    "tramp-metal",
    "belt-offtracking",
]


class Command(BaseCommand):
    """Recreates the operational/demo dataset that used to only exist in
    someone's local dev SQLite database via ad-hoc, never-committed
    `python -c "..."` scripts: master data (sites/sections/machines/
    parameters/delivery destinations), a machine-type qualification for the
    demo crusher operator/supervisor, and a rolling window of South Pit
    ShiftInstances with production entries, breakdowns, crusher-ops
    checklist/breakdown-matrix/incident rows, deliveries, and plan targets.

    Complements (does not replace) `seed_demo_data`, which stays
    accounts-only by design — this command is the "and now populate it"
    step, run after.

    Idempotent: every write is get_or_create/update_or_create keyed on the
    same natural fields the models' UniqueConstraints already enforce, and
    dates are always computed relative to "now" (see DAYS_OF_HISTORY) rather
    than hardcoded, so re-running this command next week/month/year keeps
    the dataset "the last N days" instead of drifting into the past.
    """

    help = "Seeds master data plus a rolling window of South Pit operational demo data (idempotent)."

    def handle(self, *args, **options):
        call_command("seed_demo_data")

        with transaction.atomic():
            users = self._resolve_users()
            sites, sections = self._seed_sites_and_sections()
            machine_types = self._seed_machine_types()
            uoms = self._seed_uoms()
            machines = self._seed_machines(sites, machine_types)
            delivery_destinations = self._seed_delivery_destinations(sites)
            self._seed_downtime_reason_codes()
            parameters = self._seed_parameters(machine_types, uoms)
            shifts = self._seed_shifts(sites)
            self._seed_hourly_slots(sites)
            causes = self._seed_causes_lookup()
            self._seed_qualifications_and_access(users, sites, machines, machine_types)

            self._seed_operational_window(
                users=users,
                sites=sites,
                sections=sections,
                machines=machines,
                delivery_destinations=delivery_destinations,
                parameters=parameters,
                shifts=shifts,
                causes=causes,
            )

        self.stdout.write(self.style.SUCCESS("Demo operational data seeded successfully."))

    # -- master data -----------------------------------------------------

    def _resolve_users(self):
        return {
            "admin": User.objects.get(username="demo_admin"),
            "supervisor": User.objects.get(username="demo_supervisor"),
            "operator1": User.objects.get(username="demo_operator1"),
            "operator2": User.objects.get(username="demo_operator2"),
            "artisan": User.objects.get(username="demo_artisan"),
        }

    def _seed_sites_and_sections(self):
        sites = {}
        sections = {}
        for name, (section_name, section_code) in SITE_DEFS:
            site, _ = Site.objects.get_or_create(name=name)
            sites[name] = site
            section, _ = Section.objects.get_or_create(
                site=site, code=section_code, defaults={"name": section_name}
            )
            sections[name] = section
        self.stdout.write(f"Sites/sections: {list(sites)}")
        return sites, sections

    def _seed_machine_types(self):
        machine_types = {}
        for name, code in MACHINE_TYPE_DEFS:
            mt, _ = MachineType.objects.get_or_create(code=code, defaults={"name": name})
            machine_types[code] = mt
        return machine_types

    def _seed_uoms(self):
        uoms = {}
        for abbreviation, name in UOM_DEFS:
            uom, _ = UOM.objects.get_or_create(abbreviation=abbreviation, defaults={"name": name})
            uoms[abbreviation] = uom
        return uoms

    def _seed_machines(self, sites, machine_types):
        machines = {}
        for fleet_number, site_name, type_code, display_name in MACHINE_DEFS:
            machine, _ = Machine.objects.get_or_create(
                site=sites[site_name],
                machine_type=machine_types[type_code],
                fleet_number=fleet_number,
                defaults={"name": display_name, "status": Machine.STATUS_ACTIVE},
            )
            machines[fleet_number] = machine
        self.stdout.write(f"Machines: {list(machines)}")
        return machines

    def _seed_delivery_destinations(self, sites):
        destinations = []
        for site_name, name, code in DELIVERY_DESTINATION_DEFS:
            dest, _ = DeliveryDestination.objects.get_or_create(
                site=sites[site_name], code=code, defaults={"name": name}
            )
            destinations.append(dest)
        return destinations

    def _seed_downtime_reason_codes(self):
        for code, description, category in DOWNTIME_REASON_DEFS:
            DowntimeReasonCode.objects.get_or_create(
                code=code, defaults={"description": description, "category": category}
            )

    def _seed_parameters(self, machine_types, uoms):
        parameters = {}
        for code, name, type_codes, uom_abbr, aggregation in PARAMETER_DEFS:
            parameter, created = Parameter.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "uom": uoms[uom_abbr],
                    "scope": Parameter.SCOPE_MACHINE,
                    "data_type": Parameter.DATA_TYPE_NUMBER,
                    "aggregation": aggregation,
                    "is_required": False,
                    "min_value": Decimal("0"),
                    "max_value": Decimal("100") if uom_abbr == "%" else None,
                },
            )
            # Percentage parameters must be "average", never "sum" — enforce
            # even on a pre-existing row (e.g. one created before this
            # command existed) rather than only on first creation.
            if uom_abbr == "%" and parameter.aggregation != Parameter.AGGREGATION_AVERAGE:
                parameter.aggregation = Parameter.AGGREGATION_AVERAGE
                parameter.save(update_fields=["aggregation"])
            parameter.applicable_machine_types.add(*[machine_types[c] for c in type_codes])
            parameters[code] = parameter
        return parameters

    def _seed_shifts(self, sites):
        shifts = {}
        for site_name, _ in SITE_DEFS:
            site = sites[site_name]
            day_shift, _ = Shift.objects.get_or_create(
                site=site,
                name="Day",
                defaults={"start_time": time(7, 30), "end_time": time(17, 30), "slot_length_minutes": 60},
            )
            night_shift, _ = Shift.objects.get_or_create(
                site=site,
                name="Night",
                defaults={"start_time": time(17, 30), "end_time": time(3, 30), "slot_length_minutes": 60},
            )
            shifts[site_name] = {"Day": day_shift, "Night": night_shift}
        return shifts

    def _seed_hourly_slots(self, sites):
        # crusher_ops migration 0008 seeds this same all-day slot, but only
        # for sites that already existed at migrate time — Sites are
        # business data created by this command, not a migration, so on a
        # genuinely fresh DB (migrate, then this command) migration 0008
        # ran against zero Site rows and seeded nothing. Belt-and-braces:
        # do the same get-or-create here so a fresh DB and an
        # already-populated dev DB both end up with one.
        for site in sites.values():
            if HourlySlot.objects.filter(site=site).exists():
                continue
            HourlySlot.objects.create(site=site, slot_index=0, start_time=time(0, 0), end_time=time(0, 0))

    def _seed_causes_lookup(self):
        return list(BreakdownCause.objects.filter(code__in=BREAKDOWN_CAUSE_CODES))

    def _seed_qualifications_and_access(self, users, sites, machines, machine_types):
        south_pit = sites["South Pit"]
        crusher = machines["CRU-001"]
        for user_key in ("supervisor", "operator1"):
            user = users[user_key]
            MachineTypeQualification.objects.get_or_create(
                user=user,
                machine_type=machine_types["cru"],
                site=south_pit,
                machine=crusher,
                defaults={"active": True},
            )
            UserSiteAccess.objects.get_or_create(user=user, site=south_pit, section=None)

    # -- operational window ------------------------------------------------

    def _seed_operational_window(
        self, *, users, sites, sections, machines, delivery_destinations, parameters, shifts, causes
    ):
        south_pit = sites["South Pit"]
        section = sections["South Pit"]
        crusher = machines["CRU-001"]
        excavator = machines["HEX-001"]
        dump_truck = machines["DUT-101"]
        supervisor = users["supervisor"]
        operator = users["operator1"]
        artisan = users["artisan"]
        checklist_items = list(ChecklistItem.objects.all())
        # Sites normally have exactly one all-day HourlySlot (see crusher_ops
        # migration 0008) — .filter().first() rather than .get() so this
        # doesn't blow up if a site was ever reconfigured with more than one.
        hourly_slot = HourlySlot.objects.filter(site=south_pit).order_by("slot_index").first()
        if hourly_slot is None:
            raise RuntimeError("South Pit has no HourlySlot configured; expected crusher_ops migration 0008 to have seeded one.")

        today = timezone.now().date()
        dates = [today - timezone.timedelta(days=offset) for offset in range(DAYS_OF_HISTORY)]

        for date in dates:
            self._seed_day_plan_targets(south_pit, section, parameters, date)

        self._seed_month_plan_targets(south_pit, section, parameters, today)

        shift_index = 0
        for date in dates:
            for shift_name in ("Day", "Night"):
                shift = shifts["South Pit"][shift_name]
                instance, _ = ShiftInstance.objects.get_or_create(
                    shift=shift,
                    date=date,
                    defaults={"site": south_pit, "status": ShiftInstance.STATUS_OPEN},
                )
                if date < today and instance.status == ShiftInstance.STATUS_OPEN:
                    instance.status = ShiftInstance.STATUS_CLOSED
                    instance.closed_at = timezone.now()
                    instance.closed_by = supervisor
                    instance.save(update_fields=["status", "closed_at", "closed_by"])

                rnd = random.Random(f"south-pit-{date.isoformat()}-{shift_name}")

                self._seed_production_entries(
                    instance, section, south_pit, crusher, excavator, dump_truck,
                    operator, supervisor, parameters, rnd,
                )
                self._seed_checklist_entries(
                    instance, south_pit, crusher, hourly_slot, checklist_items, operator, supervisor, rnd
                )
                self._seed_breakdown_matrix_entry(
                    instance, south_pit, crusher, hourly_slot, causes, operator, supervisor, rnd, shift_index
                )
                self._seed_breakdown_incident(
                    instance, south_pit, section, crusher, causes, operator, supervisor, artisan, rnd, shift_index
                )
                self._seed_breakdown_log(
                    instance, south_pit, section, dump_truck, excavator, operator, supervisor, rnd, shift_index
                )
                self._seed_delivery_entries(
                    instance, south_pit, section, delivery_destinations, operator, supervisor, rnd
                )

                crusher_services.refresh_summary_for(crusher, instance, supervisor)
                shift_index += 1

        self.stdout.write(f"Seeded {shift_index} South Pit shift instances spanning {DAYS_OF_HISTORY} days.")

    def _seed_day_plan_targets(self, site, section, parameters, date):
        targets = [
            ("machine-availability", Decimal("90.00")),
            ("tonnes-crushed", Decimal("200.00")),
            ("tonnes-hauled", Decimal("100.00")),
            ("Fuel-Consumption", Decimal("150.00")),
        ]
        for code, value in targets:
            self._upsert_plan_target(
                parameter=parameters[code],
                site=site,
                section=section,
                machine=None,
                period_type=PlanTarget.PERIOD_DAY,
                period_date=date,
                shift_instance=None,
                target_value=value,
            )

    def _seed_month_plan_targets(self, site, section, parameters, today):
        month_start = today.replace(day=1)
        # NOTE: percentage/averaged parameters (machine-availability) are NOT
        # scaled up for the month like additive tonnage/consumption targets
        # are — a monthly average target stays ~90, it is not "90 * 30".
        targets = [
            ("machine-availability", Decimal("90.00")),
            ("tonnes-crushed", Decimal("4000.00")),
            ("tonnes-hauled", Decimal("2000.00")),
            ("Fuel-Consumption", Decimal("3000.00")),
        ]
        for code, value in targets:
            self._upsert_plan_target(
                parameter=parameters[code],
                site=site,
                section=section,
                machine=None,
                period_type=PlanTarget.PERIOD_MONTH,
                period_date=month_start,
                shift_instance=None,
                target_value=value,
            )

    def _upsert_plan_target(self, **kwargs):
        target_value = kwargs.pop("target_value")
        obj, created = PlanTarget.objects.get_or_create(**kwargs, defaults={"target_value": target_value})
        if not created and obj.target_value != target_value:
            obj.target_value = target_value
            obj.save(update_fields=["target_value"])
        return obj

    def _seed_production_entries(
        self, instance, section, site, crusher, excavator, dump_truck, operator, supervisor, parameters, rnd
    ):
        slot_start, slot_end = resolve_slot_datetimes(instance, 0)

        crusher_entry = self._upsert_production_entry(instance, site, section, crusher, operator, supervisor, slot_start, slot_end)
        set_parameter_values(
            "production_entry",
            crusher_entry,
            [
                {"parameter": "tonnes-crushed", "value": round(rnd.uniform(150, 230), 1)},
                {"parameter": "machine-availability", "value": round(rnd.uniform(85, 99.5), 1)},
            ],
        )

        excavator_entry = self._upsert_production_entry(instance, site, section, excavator, operator, supervisor, slot_start, slot_end)
        set_parameter_values(
            "production_entry",
            excavator_entry,
            [
                {"parameter": "machine-availability", "value": round(rnd.uniform(80, 99), 1)},
                {"parameter": "Fuel-Consumption", "value": round(rnd.uniform(60, 150), 1)},
            ],
        )

        truck_entry = self._upsert_production_entry(instance, site, section, dump_truck, operator, supervisor, slot_start, slot_end)
        set_parameter_values(
            "production_entry",
            truck_entry,
            [
                {"parameter": "tonnes-hauled", "value": round(rnd.uniform(50, 120), 1)},
                {"parameter": "Fuel-Consumption", "value": round(rnd.uniform(70, 180), 1)},
                {"parameter": "machine-availability", "value": round(rnd.uniform(80, 99), 1)},
            ],
        )

    def _upsert_production_entry(self, instance, site, section, machine, operator, supervisor, slot_start, slot_end):
        entry, _ = ProductionEntry.objects.get_or_create(
            shift_instance=instance,
            machine=machine,
            section=section,
            slot_index=0,
            entry_type=ProductionEntry.ENTRY_TYPE_HOURLY,
            defaults={
                "site": site,
                "slot_start_at": slot_start,
                "slot_end_at": slot_end,
                "operator": operator,
                "recorded_by": supervisor,
                "status": "submitted",
                "source": "web",
            },
        )
        return entry

    def _seed_checklist_entries(
        self, instance, site, crusher, hourly_slot, checklist_items, operator, supervisor, rnd
    ):
        slot_start, slot_end = crusher_services.resolve_slot_datetimes(hourly_slot, instance)
        for item in checklist_items:
            entry, created = HourlyChecklistEntry.objects.get_or_create(
                shift_instance=instance,
                crusher=crusher,
                hourly_slot=hourly_slot,
                checklist_item=item,
                defaults={
                    "site": site,
                    "slot_start_at": slot_start,
                    "slot_end_at": slot_end,
                    "is_completed": True,
                    "completed_at": slot_start + timezone.timedelta(minutes=rnd.randint(5, 90)),
                    "operator": operator,
                    "recorded_by": supervisor,
                    "status": "submitted",
                    "source": "web",
                },
            )
            if not created and not entry.is_completed:
                entry.is_completed = True
                entry.completed_at = slot_start + timezone.timedelta(minutes=rnd.randint(5, 90))
                entry.save(update_fields=["is_completed", "completed_at"])

    def _seed_breakdown_matrix_entry(
        self, instance, site, crusher, hourly_slot, causes, operator, supervisor, rnd, shift_index
    ):
        slot_start, slot_end = crusher_services.resolve_slot_datetimes(hourly_slot, instance)
        cause_count = [0, 1, 1, 2][shift_index % 4]
        selected_causes = rnd.sample(causes, k=min(cause_count, len(causes)))
        downtime_minutes = 0
        if cause_count == 1:
            downtime_minutes = rnd.randint(15, 45)
        elif cause_count == 2:
            downtime_minutes = rnd.randint(30, 90)

        entry, created = HourlyBreakdownEntry.objects.get_or_create(
            shift_instance=instance,
            crusher=crusher,
            hourly_slot=hourly_slot,
            defaults={
                "site": site,
                "slot_start_at": slot_start,
                "slot_end_at": slot_end,
                "downtime_minutes": downtime_minutes,
                "operator": operator,
                "recorded_by": supervisor,
                "status": "submitted",
                "source": "web",
            },
        )
        if not created and entry.downtime_minutes != downtime_minutes:
            entry.downtime_minutes = downtime_minutes
            entry.save(update_fields=["downtime_minutes"])
        entry.causes.set(selected_causes)

    def _seed_breakdown_incident(
        self, instance, site, section, crusher, causes, operator, supervisor, artisan, rnd, shift_index
    ):
        # Only ~every third shift gets an incident, so MTTR/MTBF trend data
        # spans multiple distinct days without an incident on every shift.
        if shift_index % 3 != 0:
            return
        anchor, _ = resolve_slot_datetimes(instance, 0)
        occurred = anchor + timezone.timedelta(minutes=rnd.randint(30, 500))
        cause = rnd.choice(causes)

        is_most_recent = shift_index == 0
        defaults = {
            "site": site,
            "section": section,
            "time_reported": occurred,
            "artisan": artisan,
            "cause": cause,
            "description": f"{cause.name} detected on {crusher}.",
            "severity": BreakdownIncident.SEVERITY_MEDIUM,
            "reported_by": operator,
            "recorded_by": supervisor,
            "source": "web",
        }
        if is_most_recent:
            defaults["status"] = BreakdownIncident.STATUS_IN_PROGRESS
            defaults["time_attended"] = occurred + timezone.timedelta(minutes=rnd.randint(5, 20))
        else:
            attended = occurred + timezone.timedelta(minutes=rnd.randint(5, 20))
            completed = attended + timezone.timedelta(minutes=rnd.randint(15, 90))
            defaults["status"] = BreakdownIncident.STATUS_RESOLVED
            defaults["time_attended"] = attended
            defaults["time_completed"] = completed

        BreakdownIncident.objects.get_or_create(
            crusher=crusher,
            shift_instance=instance,
            time_occurred=occurred,
            defaults=defaults,
        )

    def _seed_breakdown_log(
        self, instance, site, section, dump_truck, excavator, operator, supervisor, rnd, shift_index
    ):
        # Only ~every fifth shift gets a fleet-wide BreakdownLog (distinct
        # from the crusher-specific BreakdownIncident above), alternating
        # between the two non-crusher South Pit machines.
        if shift_index % 5 != 3:
            return
        machine = dump_truck if shift_index % 10 == 3 else excavator
        reasons = list(DowntimeReasonCode.objects.all())
        reason = reasons[shift_index % len(reasons)]

        anchor, _ = resolve_slot_datetimes(instance, 0)
        start_at = anchor + timezone.timedelta(minutes=rnd.randint(30, 400))
        end_at = start_at + timezone.timedelta(minutes=rnd.randint(10, 90))

        BreakdownLog.objects.get_or_create(
            shift_instance=instance,
            machine=machine,
            start_at=start_at,
            defaults={
                "site": site,
                "section": section,
                "reason_code": reason,
                "description": reason.description,
                "end_at": end_at,
                "severity": BreakdownLog.SEVERITY_LOW,
                "operator": operator,
                "recorded_by": supervisor,
                "status": "submitted",
                "source": "web",
            },
        )

    def _seed_delivery_entries(
        self, instance, site, section, delivery_destinations, operator, supervisor, rnd
    ):
        slot_start, slot_end = resolve_slot_datetimes(instance, 0)
        for destination in delivery_destinations:
            DeliveryEntry.objects.get_or_create(
                shift_instance=instance,
                delivery_destination=destination,
                slot_index=0,
                defaults={
                    "site": site,
                    "section": section,
                    "slot_start_at": slot_start,
                    "slot_end_at": slot_end,
                    "tonnes": Decimal(str(round(rnd.uniform(20, 50), 1))),
                    "trip_count": rnd.randint(2, 8),
                    "operator": operator,
                    "recorded_by": supervisor,
                    "status": "submitted",
                    "source": "web",
                },
            )
