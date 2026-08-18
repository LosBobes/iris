import i18n from "@/i18n";
import type {
  BillingDocumentType,
  DeliveryMethod,
  PostagePaymentType,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from "@/types/work-order";

export const WORK_ORDER_SELECT_NONE_VALUE = "__none__";

// Enum labels are resolved through i18n (sr default / en alternate). Utility
// callers (CSV export, search haystack) read the current language at call time;
// components re-render on language change via their own useTranslation usage.
export function getWorkOrderDeliveryLabel(method: DeliveryMethod): string {
  return i18n.t(`workOrders.delivery.${method}`);
}

export function getWorkOrderPostageLabel(type: PostagePaymentType): string {
  return i18n.t(`workOrders.postage.${type}`);
}

export function getWorkOrderStatusLabel(status: WorkOrderStatus): string {
  return i18n.t(`workOrders.status.${status}`);
}

export function getWorkOrderPriorityLabel(priority: WorkOrderPriority): string {
  return i18n.t(`workOrders.priority.${priority}`);
}

// The document type (tip dokumenta) is admin-extensible, so a value with no
// built-in translation falls back to the stored value rather than leaking the
// i18n key.
export function getWorkOrderBillingDocumentLabel(
  type: BillingDocumentType | null,
): string {
  if (!type) return "";
  return i18n.t(`workOrders.billing.${type}`, { defaultValue: type });
}

const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "new",
  "assigned",
  "inProgress",
  "completed",
  "cancelled",
  "invoiced",
];

// Status-change events are stored with the Serbian prefix; match on it but emit
// the translated prefix + status so the timeline follows the active language.
const STORED_STATUS_CHANGE_PREFIX = "Status promenjen na ";

function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (WORK_ORDER_STATUSES as string[]).includes(value);
}

/** Localizes status-change timeline labels that still store raw enum values. */
export function formatWorkOrderEventLabel(label: string, kind?: string): string {
  if (kind !== "status" || !label.startsWith(STORED_STATUS_CHANGE_PREFIX)) {
    return label;
  }

  const rawStatus = label.slice(STORED_STATUS_CHANGE_PREFIX.length);
  if (!isWorkOrderStatus(rawStatus)) {
    return label;
  }

  return `${i18n.t("workOrders.statusChangePrefix")}${getWorkOrderStatusLabel(rawStatus)}`;
}

export const WORK_ORDER_STATUS_VARIANTS: Record<
  WorkOrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  new: "outline",
  assigned: "default",
  inProgress: "default",
  completed: "secondary",
  cancelled: "destructive",
  invoiced: "secondary",
};

export const WORK_ORDER_STATUS_ORDER: WorkOrderStatus[] = [
  "new",
  "assigned",
  "inProgress",
  "completed",
  "invoiced",
  "cancelled",
];

export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  new: ["assigned", "cancelled"],
  assigned: ["inProgress", "cancelled"],
  inProgress: ["completed", "cancelled"],
  completed: ["invoiced"],
  invoiced: [],
  cancelled: [],
};

export const WORK_ORDER_PRIMARY_TRANSITION: Record<
  WorkOrderStatus,
  WorkOrderStatus | null
> = {
  new: "assigned",
  assigned: "inProgress",
  inProgress: "completed",
  completed: "invoiced",
  invoiced: null,
  cancelled: null,
};

export function getLocalIsoDate(date = new Date()): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

export function canToggleWorkOrderCompletion(status: WorkOrderStatus): boolean {
  return getPrimaryWorkOrderTransition(status) !== null;
}

export function getAllowedWorkOrderTransitions(
  status: WorkOrderStatus,
): WorkOrderStatus[] {
  return WORK_ORDER_TRANSITIONS[status];
}

export function getPrimaryWorkOrderTransition(
  status: WorkOrderStatus,
): WorkOrderStatus | null {
  return WORK_ORDER_PRIMARY_TRANSITION[status];
}

export function getWorkOrderCustomerNextStep(status: WorkOrderStatus): string {
  return i18n.t(`workOrders.customerNextSteps.${status}`);
}

export function buildWorkOrderCustomerNotice(
  order: Pick<WorkOrder, "orderNumber" | "status" | "dueDate" | "assignment">,
): string {
  const customerDueDate = order.dueDate;

  return [
    `${i18n.t("workOrders.notice.workOrder")} ${order.orderNumber}`,
    `${i18n.t("workOrders.notice.status")}: ${getWorkOrderStatusLabel(order.status)}`,
    `${i18n.t("workOrders.notice.dueDate")}: ${customerDueDate ? formatWorkOrderDate(customerDueDate) : "-"}`,
    `${i18n.t("workOrders.notice.nextStep")}: ${getWorkOrderCustomerNextStep(order.status)}`,
  ].join("\n");
}

export function isWorkOrderStatusTerminal(status: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[status].length === 0;
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
