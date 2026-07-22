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
    # CELERY_RESULT_BACKEND (base.py) defaults to redis://localhost:6379/0
    # unconditionally — without this override, DashboardExportStatusView /
    # CrusherPlantExportStatusView's AsyncResult(task_id) lookup tries to
    # reach Redis and throws a connection error on every call, in an
    # environment this file otherwise promises needs no Redis server at
    # all. Eager mode already returns results inline on trigger, so the
    # in-memory backend only needs to serve same-process status polls.
    CELERY_RESULT_BACKEND = "cache+memory://"

INSTALLED_APPS += ["django_extensions"]  # noqa: F405
