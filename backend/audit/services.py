from django.contrib.contenttypes.models import ContentType

from .models import AuditLog


def log_event(action, actor=None, target=None, site_id=None, changes=None, reason=""):
    """Central entry point other apps call to record a discrete business
    event (e.g. machine activation, an override edit) that doesn't map
    cleanly to a field-level diff. `target`, if given, is any model
    instance; site_id is inferred from it (via `.site_id` or
    `.get_site_id()`, the same convention used by core.permissions) when
    not passed explicitly.
    """
    content_type = None
    object_id = None
    if target is not None:
        content_type = ContentType.objects.get_for_model(type(target))
        object_id = str(target.pk)
        if site_id is None:
            site_id = getattr(target, "site_id", None)
            if site_id is None and hasattr(target, "get_site_id"):
                site_id = target.get_site_id()

    is_real_user = bool(actor and getattr(actor, "is_authenticated", False) and actor.pk)
    return AuditLog.objects.create(
        actor=actor if is_real_user else None,
        action=action,
        content_type=content_type,
        object_id=object_id,
        site_id=site_id,
        changes=changes or {},
        reason=reason,
    )
