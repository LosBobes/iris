// In-memory twin of the API's work-order list query (iris-api
// internal/store/work_order_list.go): filters, sort and paging as
// `GET /work-orders` applies them. Fixture mode serves the list through this,
// so keep the two behaviorally identical when changing either.

import i18n from "@/i18n";
import {
  formatWorkOrderDate,
  formatWorkOrderPrice,
} from "@/shared/utils/work-orders";
import {
  WORK_ORDER_LIST_DEFAULT_LIMIT,
  WORK_ORDER_LIST_MAX_LIMIT,
  type WorkOrder,
  type WorkOrderListFilters,
  type WorkOrderListQuery,
  type WorkOrderListResult,
} from "@/types/work-order";

/**
 * Lowercases and folds the Serbian Latin diacritics (č, ć → c; š → s; ž → z;
 * đ → dj) — the same rule as the API's FoldSearchText, so "cobanovic" finds
 * "Čobanović".
 */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj");
}

/** The folded free-text haystack the API stores as work_orders.search_text. */
export function workOrderSearchText(order: WorkOrder): string {
  const parts: string[] = [
    order.orderNumber,
    order.clientName,
    order.jobDescription,
  ];
  if (order.assignment.assignedTo) parts.push(order.assignment.assignedTo);
  if (order.assignment.priority) {
    parts.push(
      order.assignment.priority,
      i18n.t(`workOrders.priority.${order.assignment.priority}`, { lng: "sr" }),
    );
  }
  if (order.billingDocumentType) {
    parts.push(
      order.billingDocumentType,
      i18n.t(`workOrders.billing.${order.billingDocumentType}`, {
        lng: "sr",
        defaultValue: order.billingDocumentType,
      }),
    );
  }
  for (const date of [order.issueDate, order.dueDate]) {
    if (date) parts.push(date, formatWorkOrderDate(date));
  }
  if (order.price !== null) {
    parts.push(String(order.price), formatWorkOrderPrice(order.price));
  }
  return foldSearchText(parts.join(" "));
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function matchesWorkOrderListFilters(
  order: WorkOrder,
  filters: WorkOrderListFilters,
): boolean {
  const search = foldSearchText(filters.search?.trim() ?? "");
  if (search && !workOrderSearchText(order).includes(search)) return false;
  if (filters.status && order.status !== filters.status) return false;
  const assignedTo = order.assignment.assignedTo ?? "";
  if (filters.assignedTo && assignedTo !== filters.assignedTo) return false;
  if (filters.customerId && order.customerId !== filters.customerId) return false;
  if (
    filters.billingDocumentType &&
    order.billingDocumentType !== filters.billingDocumentType
  )
    return false;
  if (
    filters.deliveryMethod &&
    order.shipping.deliveryMethod !== filters.deliveryMethod
  )
    return false;
  if (filters.dateFrom && order.issueDate < filters.dateFrom) return false;
  if (filters.dateTo && order.issueDate > filters.dateTo) return false;
  if (filters.needsCostReview && !order.needsCostReview) return false;
  if (filters.queue) {
    if (order.status === "cancelled") return false;
    const today = filters.today || new Date().toISOString().slice(0, 10);
    const dueDate = order.dueDate ?? "";
    switch (filters.queue) {
      case "unassigned":
        if (assignedTo) return false;
        break;
      case "overdue":
        if (!dueDate || dueDate >= today || order.isCompleted) return false;
        break;
      case "today":
        if (dueDate !== today) return false;
        break;
      case "thisWeek":
        if (!dueDate || dueDate < today || dueDate > addDays(today, 7)) return false;
        break;
    }
  }
  return true;
}

const PRIORITY_RANK: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

/** Natural-sort key: every digit run zero-padded (RN-2026-9 < RN-2026-10). */
export function orderNumberSortKey(orderNumber: string): string {
  return orderNumber
    .toLowerCase()
    .replace(/\d+/g, (run) => run.replace(/^0+/, "").padStart(20, "0"));
}

function sortValue(order: WorkOrder, field: string): string | number | null {
  switch (field) {
    case "orderNumber":
      return orderNumberSortKey(order.orderNumber);
    case "clientName":
      return order.clientName.toLowerCase();
    case "jobDescription":
      return order.jobDescription.toLowerCase();
    case "status":
      return order.status;
    case "assignedTo":
      return order.assignment.assignedTo;
    case "priority":
      return PRIORITY_RANK[order.assignment.priority] ?? 4;
    case "billingDocumentType":
      return order.billingDocumentType;
    case "deliveryMethod":
      return order.shipping.deliveryMethod;
    case "dueDate":
      return order.dueDate;
    case "price":
      return order.price;
    default:
      return order.issueDate;
  }
}

/** Sorts like the API's ORDER BY: missing values last, then id ascending. */
export function sortWorkOrderList(orders: WorkOrder[], sort = ""): WorkOrder[] {
  const desc = sort === "" || sort.startsWith("-");
  const field = sort.replace(/^-/, "");
  return [...orders].sort((a, b) => {
    const av = sortValue(a, field);
    const bv = sortValue(b, field);
    if (av === null || bv === null) {
      if (av !== bv) return av === null ? 1 : -1;
    } else if (av !== bv) {
      const cmp = av < bv ? -1 : 1;
      return desc ? -cmp : cmp;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Every order matching the filters, sorted (no paging) — the CSV export set. */
export function filterAndSortWorkOrders(
  orders: WorkOrder[],
  filters: WorkOrderListFilters,
): WorkOrder[] {
  return sortWorkOrderList(
    orders.filter((order) => matchesWorkOrderListFilters(order, filters)),
    filters.sort,
  );
}

/** One page plus the filtered total, with the API's default and capped limit. */
export function queryWorkOrderList(
  orders: WorkOrder[],
  query: WorkOrderListQuery = {},
): WorkOrderListResult {
  const matches = filterAndSortWorkOrders(orders, query);
  const requested = query.limit ?? 0;
  const limit =
    requested > 0
      ? Math.min(requested, WORK_ORDER_LIST_MAX_LIMIT)
      : WORK_ORDER_LIST_DEFAULT_LIMIT;
  const offset = Math.max(query.offset ?? 0, 0);
  return { items: matches.slice(offset, offset + limit), total: matches.length };
}
