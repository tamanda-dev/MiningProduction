import type { HourlySlot } from "@/src/api/types";

/** Finds the HourlySlot whose [start_time, end_time) window contains
 * `now`, mirroring crusher_ops.services.current_slot_for on the backend —
 * this is purely a display/default-selection convenience; the server
 * re-resolves and validates the slot on submit regardless.
 */
export function currentSlot(slots: HourlySlot[]): HourlySlot | null {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  for (const slot of slots) {
    const start = toMinutes(slot.start_time);
    const end = toMinutes(slot.end_time);
    const isOvernight = end <= start;
    if (isOvernight ? nowMinutes >= start || nowMinutes < end : nowMinutes >= start && nowMinutes < end) {
      return slot;
    }
  }
  return null;
}
