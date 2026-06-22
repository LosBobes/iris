// CSV export for the Work Orders list. Exports the currently visible columns
// (so the file matches what the user sees) using their displayed/plain values.
// Values are emitted in the same Serbian formatting as the table.

import type { WorkOrder } from "@/types/work-order";
import {
  WORK_ORDER_COLUMNS,
  type WorkOrderColumnKey,
} from "@/lib/work-order-columns";
import {
  WORK_ORDER_BILLING_LABELS,
  formatWorkOrderDate,
  getWorkOrderPriorityLabel,
  getWorkOrderStatusLabel,
} from "@/shared/utils/work-orders";

/** Plain (unformatted-for-display where it matters) cell value for export. */
function exportCellValue(order: WorkOrder, key: WorkOrderColumnKey): string {
  switch (key) {
    case "orderNumber":
      return order.orderNumber;
    case "clientName":
      return order.clientName;
    case "jobDescription":
      return order.jobDescription;
    case "assigned":
      return order.assignment.assignedTo ?? "";
    case "priority":
      return getWorkOrderPriorityLabel(order.assignment.priority);
    case "billing":
      return order.billingDocumentType
        ? WORK_ORDER_BILLING_LABELS[order.billingDocumentType]
        : "";
    case "schedule": {
      const date = order.assignment.scheduledDate ?? order.dueDate;
      return date ? formatWorkOrderDate(date) : "";
    }
    case "price":
      // Raw numeric value (no thousands separators) so spreadsheets parse it.
      return order.price !== null ? String(order.price) : "";
    case "status":
      return getWorkOrderStatusLabel(order.status);
  }
}

/** Escapes a value per RFC 4180 (quote fields containing quotes/commas/newlines). */
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function workOrdersToCsv(
  orders: WorkOrder[],
  visibleColumns: ReadonlySet<WorkOrderColumnKey>,
): string {
  const columns = WORK_ORDER_COLUMNS.filter((column) =>
    visibleColumns.has(column.key),
  );
  const header = columns.map((column) => escapeCsv(column.label)).join(",");
  const rows = orders.map((order) =>
    columns
      .map((column) => escapeCsv(exportCellValue(order, column.key)))
      .join(","),
  );
  return [header, ...rows].join("\r\n");
}

/** Triggers a client-side download of the CSV. Prefixed with a UTF-8 BOM so
 *  Excel renders Serbian characters correctly. */
export function downloadWorkOrdersCsv(
  orders: WorkOrder[],
  visibleColumns: ReadonlySet<WorkOrderColumnKey>,
  filename = `radni-nalozi-${new Date().toISOString().slice(0, 10)}.csv`,
): void {
  const csv = "﻿" + workOrdersToCsv(orders, visibleColumns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
