from django.core.cache import cache

# Celery AsyncResult(task_id) has no notion of who triggered it, so without
# this, DashboardExportStatusView/CrusherPlantExportStatusView (both
# IsAuthenticated-only, matching how any client polls its own export) would
# let any authenticated user poll ANY task_id and read another user's
# download_url. task_ids are unguessable UUID4s, but a leaked/logged one
# shouldn't be enough on its own — cache the triggering user against the
# task_id so the status view can enforce "only the triggering user may poll
# this task". TTL matches how long a client would plausibly still be
# polling for a result.
_TTL_SECONDS = 60 * 60 * 6


def record_export_owner(task_id: str, user_id: int) -> None:
    cache.set(f"export-owner:{task_id}", user_id, timeout=_TTL_SECONDS)


def is_export_owner(task_id: str, user_id: int) -> bool:
    return cache.get(f"export-owner:{task_id}") == user_id
