// Single source of truth for the Work Orders list columns. Shared by the table
// (rendering + sorting), the "fields to show" menu (visibility), and the search
// haystack (so hidden fields are excluded from free-text search). The visible
// set is persisted per-device.

import type { SortField } from "@/hooks/useWorkOrders";
import type { WorkOrder } from "@/types/work-order";
import {
  formatWorkOrderDate,
  formatWorkOrderPrice,
  getWorkOrderBillingDocumentLabel,
  getWorkOrderPriorityLabel,
} from "@/shared/utils/work-orders";

export type WorkOrderColumnKey =
  | "orderNumber"
  | "clientName"
  | "jobDescription"
  | "assigned"
  | "priority"
  | "billing"
  | "schedule"
  | "price"
  | "status";

export interface WorkOrderColumnMeta {
  key: WorkOrderColumnKey;
  label: string;
  sortField: SortField;
  width?: string;
  align?: "left" | "right";
  /** Locked columns can't be hidden, keeping each row identifiable. */
  locked?: boolean;
}

export const WORK_ORDER_COLUMNS: WorkOrderColumnMeta[] = [
  { key: "orderNumber", label: "Br. naloga", sortField: "orderNumber", width: "110px", locked: true },
  { key: "clientName", label: "Klijent", sortField: "clientName", width: "140px" },
  { key: "jobDescription", label: "Opis posla", sortField: "jobDescription" },
  { key: "assigned", label: "Operater", sortField: "assignment.assignedTo", width: "120px" },
  { key: "priority", label: "Prioritet", sortField: "assignment.priority", width: "90px" },
  { key: "billing", label: "Tip dokumenta", sortField: "billingDocumentType", width: "130px" },
  { key: "schedule", label: "Plan", sortField: "assignment.scheduledDate", width: "110px" },
  { key: "price", label: "Cena", sortField: "price", width: "110px", align: "right" },
  { key: "status", label: "Status", sortField: "status", width: "130px" },
];

export const ALL_COLUMN_KEYS: WorkOrderColumnKey[] = WORK_ORDER_COLUMNS.map(
  (column) => column.key,
);

const LOCKED_COLUMN_KEYS: WorkOrderColumnKey[] = WORK_ORDER_COLUMNS.filter(
  (column) => column.locked,
).map((column) => column.key);

const ALL_COLUMN_KEY_SET = new Set<WorkOrderColumnKey>(ALL_COLUMN_KEYS);

/** Lowercased strings a column contributes to the free-text search haystack.
 *  Enum-backed fields contribute raw value + Serbian label; price contributes
 *  raw + formatted; the schedule column contributes every date (issue, due,
 *  scheduled) in both ISO and DD.MM.YYYY notation. */
export function getColumnSearchValues(
  order: WorkOrder,
  key: WorkOrderColumnKey,
): string[] {
  switch (key) {
    case "orderNumber":
      return [order.orderNumber];
    case "clientName":
      return [order.clientName];
    case "jobDescription":
      return [order.jobDescription];
    case "assigned":
      return [order.assignment.assignedTo ?? ""];
    case "priority":
      return [
        order.assignment.priority,
        getWorkOrderPriorityLabel(order.assignment.priority),
      ];
    case "billing":
      return [
        order.billingDocumentType ?? "",
        getWorkOrderBillingDocumentLabel(order.billingDocumentType),
      ];
    case "schedule":
      return [
        order.issueDate,
        order.dueDate,
        order.assignment.scheduledDate,
      ].flatMap((date) => (date ? [date, formatWorkOrderDate(date)] : []));
    case "price":
      return order.price !== null
        ? [String(order.price), formatWorkOrderPrice(order.price)]
        : [];
    case "status":
      // Status has a dedicated filter pill; it's intentionally not part of the
      // free-text haystack.
      return [];
  }
}

/** Builds the lowercased search haystack from the currently visible columns. */
export function buildSearchHaystack(
  order: WorkOrder,
  visibleColumns: ReadonlySet<WorkOrderColumnKey> = ALL_COLUMN_KEY_SET,
): string {
  return WORK_ORDER_COLUMNS.filter((column) => visibleColumns.has(column.key))
    .flatMap((column) => getColumnSearchValues(order, column.key))
    .join(" ")
    .toLowerCase();
}

export const COLUMN_VISIBILITY_STORAGE_KEY = "iris-wo-columns";

/** Always-on columns merged with the stored selection. */
function normalizeColumns(keys: WorkOrderColumnKey[]): WorkOrderColumnKey[] {
  const set = new Set<WorkOrderColumnKey>([...LOCKED_COLUMN_KEYS, ...keys]);
  // Preserve canonical column order.
  return ALL_COLUMN_KEYS.filter((key) => set.has(key));
}

export function readStoredVisibleColumns(): WorkOrderColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (!raw) return [...ALL_COLUMN_KEYS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...ALL_COLUMN_KEYS];
    const valid = parsed.filter((key): key is WorkOrderColumnKey =>
      ALL_COLUMN_KEY_SET.has(key as WorkOrderColumnKey),
    );
    return normalizeColumns(valid);
  } catch {
    return [...ALL_COLUMN_KEYS];
  }
}

export function persistVisibleColumns(keys: WorkOrderColumnKey[]): void {
  try {
    localStorage.setItem(
      COLUMN_VISIBILITY_STORAGE_KEY,
      JSON.stringify(normalizeColumns(keys)),
    );
  } catch (e) {
    console.error(e);
  }
}

export function isColumnLocked(key: WorkOrderColumnKey): boolean {
  return LOCKED_COLUMN_KEYS.includes(key);
}
