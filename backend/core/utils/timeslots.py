from datetime import date, datetime, time, timedelta


def generate_time_slots(
    shift_date: date,
    start_time: time,
    end_time: time,
    slot_length_minutes: int,
    tzinfo=None,
) -> list[tuple[int, datetime, datetime]]:
    """Computes (slot_index, start_datetime, end_datetime) tuples for a
    shift, given a per-site/shift-configurable slot length. Handles
    overnight shifts (end_time <= start_time implies the shift crosses
    midnight). Pure function — no DB/model access — so it's directly
    testable and reusable from both the API and the mobile form-schema
    contract.
    """
    start_dt = datetime.combine(shift_date, start_time)
    end_dt = datetime.combine(shift_date, end_time)
    if end_time <= start_time:
        end_dt += timedelta(days=1)
    if tzinfo is not None:
        start_dt = start_dt.replace(tzinfo=tzinfo)
        end_dt = end_dt.replace(tzinfo=tzinfo)

    slot_delta = timedelta(minutes=slot_length_minutes)
    slots = []
    cursor = start_dt
    idx = 0
    while cursor < end_dt:
        slot_end = min(cursor + slot_delta, end_dt)
        slots.append((idx, cursor, slot_end))
        cursor = slot_end
        idx += 1
    return slots
