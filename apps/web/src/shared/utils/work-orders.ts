import type {
  BillingDocumentType,
  DeliveryMethod,
  WorkOrder,
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
  new: "Nov",
  assigned: "Dodeljen",
  inProgress: "U toku",
  waitingForCustomer: "Čeka klijenta",
  waitingForMaterials: "Čeka materijal",
  completed: "Završen",
  cancelled: "Otkazan",
  invoiced: "Fakturisan",
};

export const WORK_ORDER_CUSTOMER_NEXT_STEPS: Record<WorkOrderStatus, string> = {
  new: "Nalog je evidentiran i čeka dodelu operateru.",
  assigned: "Nalog je dodeljen operateru i priprema je u toku.",
  inProgress: "Rad je u toku; javljamo se čim bude spremno za sledeći korak.",
  waitingForCustomer: "Čekamo vašu potvrdu materijala/dizajna.",
  waitingForMaterials: "Čekamo potreban materijal pre nastavka izrade.",
  completed: "Nalog je završen i spreman za preuzimanje ili isporuku.",
  invoiced: "Nalog je fakturisan; ostaje još administrativna obrada po dokumentu.",
  cancelled: "Nalog je otkazan.",
};

export const WORK_ORDER_STATUS_VARIANTS: Record<
  WorkOrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  new: "outline",
  assigned: "default",
  inProgress: "default",
  waitingForCustomer: "outline",
  waitingForMaterials: "outline",
  completed: "secondary",
  cancelled: "destructive",
  invoiced: "secondary",
};

export const WORK_ORDER_STATUS_ORDER: WorkOrderStatus[] = [
  "new",
  "assigned",
  "inProgress",
  "waitingForCustomer",
  "waitingForMaterials",
  "completed",
  "invoiced",
  "cancelled",
];

export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  new: ["assigned", "cancelled"],
  assigned: ["inProgress", "waitingForMaterials", "cancelled"],
  inProgress: [
    "waitingForCustomer",
    "waitingForMaterials",
    "completed",
    "cancelled",
  ],
  waitingForCustomer: ["inProgress", "cancelled"],
  waitingForMaterials: ["inProgress", "cancelled"],
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
  waitingForCustomer: "inProgress",
  waitingForMaterials: "inProgress",
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
  return WORK_ORDER_CUSTOMER_NEXT_STEPS[status];
}

export function buildWorkOrderCustomerNotice(
  order: Pick<WorkOrder, "orderNumber" | "status" | "dueDate" | "assignment">,
): string {
  const customerDueDate = order.dueDate ?? order.assignment.scheduledDate;

  return [
    `Radni nalog ${order.orderNumber}`,
    `Status: ${WORK_ORDER_STATUS_LABELS[order.status]}`,
    `Rok: ${customerDueDate ? formatWorkOrderDate(customerDueDate) : "-"}`,
    `Sledeći korak: ${getWorkOrderCustomerNextStep(order.status)}`,
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
