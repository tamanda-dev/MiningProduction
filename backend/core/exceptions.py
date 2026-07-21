from rest_framework.views import exception_handler


def _first_code(data, default="error"):
    """Dig through a (possibly nested) DRF error payload for an error code."""
    if isinstance(data, dict):
        for value in data.values():
            code = _first_code(value, default)
            if code != default:
                return code
        return default
    if isinstance(data, (list, tuple)):
        for item in data:
            code = _first_code(item, default)
            if code != default:
                return code
        return default
    return getattr(data, "code", default)


def _flatten_errors(data):
    """Turn a DRF error payload (str, ErrorDetail, list, or field->errors dict)
    into a single human-readable string."""
    if isinstance(data, dict):
        return "; ".join(f"{field}: {_flatten_errors(value)}" for field, value in data.items())
    if isinstance(data, (list, tuple)):
        return ", ".join(_flatten_errors(item) for item in data)
    return str(data)


def api_exception_handler(exc, context):
    """Wraps DRF's default handler so all error responses share one shape:
    {"detail": "...", "code": "..."}. Frontend/mobile clients rely on this
    consistent envelope instead of parsing per-exception-type payloads.
    """
    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    if isinstance(data, dict) and set(data.keys()) == {"detail"}:
        detail = data["detail"]
        code = getattr(detail, "code", "error")
        response.data = {"detail": str(detail), "code": code}
    else:
        response.data = {"detail": _flatten_errors(data), "code": _first_code(data)}
    return response
