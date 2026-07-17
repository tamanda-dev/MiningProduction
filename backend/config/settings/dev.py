from .base import *  # noqa: F401,F403

DEBUG = True

# Local dev without Redis running: fall back to in-memory cache unless
# REDIS_URL is explicitly set (e.g. when running under docker-compose).
if not config("REDIS_URL", default=""):
    CACHES = {
        "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    }
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

INSTALLED_APPS += ["django_extensions"]  # noqa: F405
