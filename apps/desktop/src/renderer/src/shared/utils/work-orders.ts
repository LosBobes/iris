import type {
  BillingDocumentType,
  DeliveryMethod,
  WorkOrderStatus,
} from "@/types/work-order";

export const WORK_ORDER_SELECT_NONE_VALUE = "__none__";

export const WORK_ORDER_DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  pickup: "Lično preuzimanje",
  postExpress: "Post Express",
  cityExpress: "City Express",
  fieldVisit: "Terenski obilazak",
};

export const WORK_ORDER_BILLING_LABELS: Record<BillingDocumentType, string> = {
  invoice: "Faktura",
  cashCollection: "Gotovinski račun",
  proforma: "Profaktura",
};

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: "Nacrt",
  active: "Aktivan",
  completed: "Završen",
  cancelled: "Otkazan",
};

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
  if (price === null) return "—";

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
