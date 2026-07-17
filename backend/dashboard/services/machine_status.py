from machines.models import Machine, MachineAssignment


def machine_status_board(site_id, machine_type_id=None):
    """Which machines are currently active/idle/in breakdown, and by whom
    they're operated — the machine status board.
    """
    qs = Machine.objects.filter(site_id=site_id).select_related("machine_type", "current_section")
    if machine_type_id:
        qs = qs.filter(machine_type_id=machine_type_id)

    active_assignments = {
        a.machine_id: a
        for a in MachineAssignment.objects.filter(
            machine__site_id=site_id, status=MachineAssignment.STATUS_ACTIVE
        ).select_related("operator")
    }

    rows = []
    for machine in qs:
        assignment = active_assignments.get(machine.id)
        rows.append(
            {
                "machine": machine.id,
                "fleet_number": machine.fleet_number,
                "machine_type": machine.machine_type_id,
                "machine_type_name": machine.machine_type.name,
                "status": machine.status,
                "current_section": machine.current_section_id,
                "operator": assignment.operator_id if assignment else None,
                "operator_label": str(assignment.operator) if assignment else None,
                "assignment_started_at": assignment.started_at if assignment else None,
            }
        )
    return rows
