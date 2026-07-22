from .base import *  # noqa: F401,F403

DEBUG = False
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "test_db.sqlite3",  # noqa: F405
    }
}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
# See dev.py's matching override: base.py's CELERY_RESULT_BACKEND defaults
# to Redis unconditionally, which would make any test touching
# AsyncResult(task_id) (export status polling) fail on a connection error
# in CI, where no Redis server runs either.
CELERY_RESULT_BACKEND = "cache+memory://"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
