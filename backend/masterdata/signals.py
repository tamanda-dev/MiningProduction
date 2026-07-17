from django.core.cache import cache
from django.db.models.signals import post_delete, post_save

from .models import Parameter, ParameterChoice

FORM_SCHEMA_VERSION_KEY = "parameter_schema_version"


def _bump_form_schema_version(**kwargs):
    try:
        cache.incr(FORM_SCHEMA_VERSION_KEY)
    except ValueError:
        cache.set(FORM_SCHEMA_VERSION_KEY, 1)


post_save.connect(_bump_form_schema_version, sender=Parameter)
post_delete.connect(_bump_form_schema_version, sender=Parameter)
post_save.connect(_bump_form_schema_version, sender=ParameterChoice)
post_delete.connect(_bump_form_schema_version, sender=ParameterChoice)
