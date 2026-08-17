from collections import defaultdict

from entries.models import BreakdownLog
from machines.models import Machine
from shiftmgmt.services import time_slots_for_instance


def hourly_machine_status(shift_instance, machine_type_id=None):
    """Per-machine, per-hour-slot status for a shift instance — "ok" or
    the reason it was down — mirroring the source Availability &
    Breakdown Report: one row per machine, one column per hour slot,
    grouped by machine type, with a "how many machines were running"
    count per slot per group.

    Crushers are excluded — their breakdowns are tracked hour-by-hour
    through the Crushing & Breakdowns module (HourlyBreakdownEntry /
    BreakdownIncident), not BreakdownLog, and already have their own
    dedicated reporting (Checklist Compliance, MTTR/MTBF). This grid is
    the general-fleet (LHD/DUT/DRR/water bowser/etc.) equivalent.

    A machine is "down" for any slot its [start_at, end_at) window
    overlaps. An open breakdown (end_at still null) is treated as
    covering every slot from its start through the end of the shift,
    since it hasn't been resolved yet.
    """
    slots = time_slots_for_instance(shift_instance)
    shift_end = slots[-1][2] if slots else None

    machines_qs = (
        Machine.objects.filter(site=shift_instance.site)
        .exclude(status=Machine.STATUS_RETIRED)
        .exclude(machine_type__code__iexact="cru")
        .select_related("machine_type", "current_section")
    )
    if machine_type_id:
        machines_qs = machines_qs.filter(machine_type_id=machine_type_id)
    machines = list(machines_qs)
    if not machines:
        return []

    logs = (
        BreakdownLog.objects.filter(shift_instance=shift_instance, machine__in=machines)
        .select_related("reason_code")
        .order_by("start_at")
    )
    logs_by_machine = defaultdict(list)
    for log in logs:
        logs_by_machine[log.machine_id].append(log)

    def reason_label(log):
        if log.reason_code:
            return log.reason_code.description
        return log.description or "Breakdown"

    def status_for_slot(machine_id, slot_start, slot_end):
        for log in logs_by_machine.get(machine_id, []):
            log_end = log.end_at or shift_end or slot_end
            if log.start_at < slot_end and log_end > slot_start:
                return reason_label(log)
        return None

    by_type = defaultdict(list)
    type_names = {}
    for machine in machines:
        type_names[machine.machine_type_id] = machine.machine_type.name
        cells = []
        for slot_index, slot_start, slot_end in slots:
            reason = status_for_slot(machine.id, slot_start, slot_end)
            cells.append({"slot_index": slot_index, "ok": reason is None, "reason": reason})
        by_type[machine.machine_type_id].append(
            {
                "machine": machine.id,
                "fleet_number": machine.fleet_number,
                "name": machine.name,
                "section": machine.current_section_id,
                "section_name": machine.current_section.name if machine.current_section else None,
                "cells": cells,
            }
        )

    results = []
    for mt_id, rows in by_type.items():
        running_by_slot = []
        for i in range(len(slots)):
            running_by_slot.append(sum(1 for row in rows if row["cells"][i]["ok"]))
        results.append(
            {
                "machine_type": mt_id,
                "machine_type_name": type_names[mt_id],
                "slots": [{"slot_index": si, "start_at": s, "end_at": e} for si, s, e in slots],
                "machines": rows,
                "running_by_slot": running_by_slot,
            }
        )
    results.sort(key=lambda r: r["machine_type_name"])
    return results
