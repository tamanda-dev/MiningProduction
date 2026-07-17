from django.dispatch import receiver
from simple_history.signals import post_create_historical_record

from .services import log_event

HISTORY_TYPE_VERBS = {"+": "created", "~": "updated", "-": "deleted"}


@receiver(post_create_historical_record)
def bridge_history_to_audit_log(sender, instance, history_instance, **kwargs):
    """Every django-simple-history-tracked model save lands here, giving a
    generic "who/when/what changed" event for free without each domain app
    having to call audit.services directly for ordinary field edits.
    """
    actor = getattr(history_instance, "history_user", None)
    verb = HISTORY_TYPE_VERBS.get(history_instance.history_type, "changed")
    action = f"{instance._meta.model_name}.{verb}"
    log_event(action=action, actor=actor, target=instance)
