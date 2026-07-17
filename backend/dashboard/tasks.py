from celery import shared_task
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone

from machines.models import MachineAssignment
from shiftmgmt.models import ShiftInstance

from .services.export import build_shift_report_xlsx


@shared_task
def generate_shift_report(shift_instance_id):
    """Builds the shift's Act/Plan/Var XLSX export and saves it to media
    storage; returns the (relative) path the client polls/downloads from
    via /api/dashboard/export/{task_id}/.
    """
    shift_instance = ShiftInstance.objects.select_related("shift", "site").get(pk=shift_instance_id)
    buffer = build_shift_report_xlsx(shift_instance)
    filename = f"reports/shift_{shift_instance_id}_{timezone.now():%Y%m%d%H%M%S}.xlsx"
    path = default_storage.save(filename, ContentFile(buffer.read()))
    return default_storage.url(path)


@shared_task
def prune_stale_machine_assignments():
    """Safety net (scheduled via django-celery-beat): auto-releases
    MachineAssignments left 'active' after their ShiftInstance has closed
    or been approved — data hygiene only, never touches production entries.
    """
    stale = MachineAssignment.objects.filter(
        status=MachineAssignment.STATUS_ACTIVE,
        shift_instance__status__in=[ShiftInstance.STATUS_CLOSED, ShiftInstance.STATUS_APPROVED],
    )
    return stale.update(
        status=MachineAssignment.STATUS_RELEASED,
        ended_at=timezone.now(),
        release_reason="Auto-released: shift instance closed",
    )


@shared_task
def send_shift_close_reminder():
    """Data-completeness nudge for supervisors near shift end (scheduled
    via django-celery-beat). Wiring an actual notification channel
    (email/push/Slack) is deployment-specific and left to the integrator —
    this returns the count of currently open instances so the task is
    independently testable/observable.
    """
    return ShiftInstance.objects.filter(status=ShiftInstance.STATUS_OPEN).count()
