from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Wraps DRF's default handler so all error responses share one shape:
    {"detail": "...", "code": "..."}. Frontend/mobile clients rely on this
    consistent envelope instead of parsing per-exception-type payloads.
    """
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(response.data, dict) and "detail" in response.data:
        detail = response.data["detail"]
        code = getattr(detail, "code", "error")
        response.data = {"detail": str(detail), "code": code}
    else:
        response.data = {"detail": response.data, "code": "error"}
    return response
