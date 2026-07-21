import type { HourlySlot } from "@/types";

/** Finds the HourlySlot whose [start_time, end_time) window contains now —
 * mirrors mobile/app/session/checklist.tsx's currentSlot() and the
 * backend's crusher_ops.services.current_slot_for. Display/default-select
 * convenience only; the server re-resolves on submit. */
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
