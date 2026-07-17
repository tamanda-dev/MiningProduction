from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone

from audit.services import log_event
from masterdata.models import Site

from .export import build_crusher_plant_report_pdf
from .models import BreakdownIncident


@shared_task
def notify_unattended_breakdown_incidents():
    """Flags any open BreakdownIncident that has gone unattended past the
    configured SLA threshold — logs one durable, queryable AuditLog row per
    breach (visible via the existing /api/audit-log/ drill-down) and stamps
    sla_breach_notified_at so it fires exactly once per incident. The
    actual push/email/Slack channel is deployment-specific, matching the
    existing precedent in dashboard.tasks.send_shift_close_reminder.
    """
    cutoff = timezone.now() - timedelta(minutes=settings.CRUSHER_SLA_UNATTENDED_MINUTES)
    overdue = BreakdownIncident.objects.filter(
        time_attended__isnull=True,
        status=BreakdownIncident.STATUS_OPEN,
        time_reported__lte=cutoff,
        sla_breach_notified_at__isnull=True,
    )
    count = 0
    for incident in overdue:
        minutes_overdue = int((timezone.now() - incident.time_reported).total_seconds() // 60)
        log_event(
            action="breakdownincident.sla_breach",
            target=incident,
            changes={"minutes_overdue": minutes_overdue, "threshold_minutes": settings.CRUSHER_SLA_UNATTENDED_MINUTES},
        )
        incident.sla_breach_notified_at = timezone.now()
        incident.save(update_fields=["sla_breach_notified_at"])
        count += 1
    return count


@shared_task
def generate_crusher_plant_report(site_id, date_from, date_to):
    """Builds the Crusher Plant PDF export and saves it to media storage;
    returns the (relative) path the client polls/downloads from via
    /api/crusher-ops/dashboard/export/{task_id}/ — mirrors
    dashboard.tasks.generate_shift_report's shape.
    """
    site = Site.objects.get(pk=site_id)
    buffer = build_crusher_plant_report_pdf(site, date_from, date_to)
    filename = f"reports/crusher_plant_{site_id}_{timezone.now():%Y%m%d%H%M%S}.pdf"
    path = default_storage.save(filename, ContentFile(buffer.read()))
    return default_storage.url(path)
