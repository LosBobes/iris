// Per-device cache of the in-progress "new work order" form. A browser refresh
// (or an accidental tab reload) tears the create page down without running React
// cleanup, so both the typed-in data and the reserved order number would be lost.
// We stash them here on every change and recover them when the page mounts again.

import type { WorkOrderFormValues } from "@/lib/work-orders/validation";

export const WORK_ORDER_DRAFT_STORAGE_KEY = "iris-wo-create-draft";

// Match the server's order-number reservation TTL (12h): once the reservation has
// lapsed the number in the draft is no longer ours, so recovering an older draft
// would only show a number the save can't keep. Expiring here keeps the two in step.
const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

export interface WorkOrderDraft {
  /** Reserved order number to reuse so a refresh keeps the same number. */
  orderNumber: string | null;
  values: WorkOrderFormValues;
  /** Epoch millis of the last write, used to expire stale drafts. */
  savedAt: number;
}

export function readWorkOrderDraft(): WorkOrderDraft | null {
  try {
    const raw = localStorage.getItem(WORK_ORDER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkOrderDraft> | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.savedAt !== "number" ||
      typeof parsed.values !== "object" ||
      parsed.values === null
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      clearWorkOrderDraft();
      return null;
    }
    return {
      orderNumber:
        typeof parsed.orderNumber === "string" ? parsed.orderNumber : null,
      values: parsed.values as WorkOrderFormValues,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeWorkOrderDraft(
  orderNumber: string | null,
  values: WorkOrderFormValues,
): void {
  try {
    const draft: WorkOrderDraft = {
      orderNumber,
      values,
      savedAt: Date.now(),
    };
    localStorage.setItem(WORK_ORDER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {
    console.error(e);
  }
}

export function clearWorkOrderDraft(): void {
  try {
    localStorage.removeItem(WORK_ORDER_DRAFT_STORAGE_KEY);
  } catch (e) {
    console.error(e);
  }
}
