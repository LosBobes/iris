import type {
  BillingDocumentType,
  DeliveryMethod,
  WorkOrderStatus,
} from "@/types/work-order";
import i18n from "@/i18n";

export const WORK_ORDER_SELECT_NONE_VALUE = "__none__";

// Enum value lists for building selects/charts; labels are resolved through i18n
// (sr default / en alternate) so the UI follows the active language.
export const DELIVERY_METHODS: DeliveryMethod[] = [
  "pickup",
  "postExpress",
  "cityExpress",
  "fieldVisit",
];

export const BILLING_DOCUMENT_TYPES: BillingDocumentType[] = [
  "invoice",
  "cashCollection",
  "proforma",
];

export function getWorkOrderDeliveryLabel(method: DeliveryMethod): string {
  return i18n.t(`workOrders.delivery.${method}`);
}

export function getWorkOrderBillingDocumentLabel(
  type: BillingDocumentType,
): string {
  return i18n.t(`workOrders.billing.${type}`);
}

export function getWorkOrderStatusLabel(status: WorkOrderStatus): string {
  return i18n.t(`workOrders.status.${status}`);
}

export const WORK_ORDER_STATUS_VARIANTS: Record<
  WorkOrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  active: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export function getLocalIsoDate(date = new Date()): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

export function canToggleWorkOrderCompletion(status: WorkOrderStatus): boolean {
  return status === "active" || status === "completed";
}

export function formatWorkOrderDateTime(iso: string): string {
  return new Date(iso).toLocaleString("sr-Latn-RS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWorkOrderPrice(price: number | null): string {
  if (price === null) return "-";

  return (
    new Intl.NumberFormat("sr-Latn-RS", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price) + " RSD"
  );
}

export function formatWorkOrderDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

/**
 * Compares two order numbers the way the shop reads them: by their embedded
 * digits, so RN-2026-9 sorts before RN-2026-10 instead of after it (a plain
 * alphabetical compare puts "10" first). Non-numeric parts are compared as
 * text, so the year/prefix segments still order correctly.
 */
export function compareWorkOrderNumbers(a: string, b: string): number {
  // Split each number into runs of digits and runs of everything else, then
  // walk the two segment lists in step.
  const segmentsA = a.match(/\d+|\D+/g) ?? [];
  const segmentsB = b.match(/\d+|\D+/g) ?? [];
  const shared = Math.min(segmentsA.length, segmentsB.length);
  for (let i = 0; i < shared; i += 1) {
    const segA = segmentsA[i];
    const segB = segmentsB[i];
    const numericA = /^\d+$/.test(segA);
    const numericB = /^\d+$/.test(segB);
    if (numericA && numericB) {
      const diff = Number(segA) - Number(segB);
      if (diff !== 0) return diff;
      continue;
    }
    const cmp = segA.localeCompare(segB, "sr-Latn");
    if (cmp !== 0) return cmp;
  }
  return segmentsA.length - segmentsB.length;
}
