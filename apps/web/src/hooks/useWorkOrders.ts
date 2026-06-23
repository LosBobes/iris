import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  WorkOrder,
  WorkOrderStatus,
  BillingDocumentType,
  DeliveryMethod,
} from "@/types/work-order";
import {
  getLocalIsoDate,
  WORK_ORDER_STATUS_ORDER,
} from "@/shared/utils/work-orders";
import { readStoredDefaultPageSize } from "@/lib/list-preferences";
import {
  buildSearchHaystack,
  type WorkOrderColumnKey,
} from "@/lib/work-order-columns";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";

export type SortField =
  | "orderNumber"
  | "clientName"
  | "jobDescription"
  | "assignment.assignedTo"
  | "assignment.priority"
  | "assignment.scheduledDate"
  | "billingDocumentType"
  | "shipping.deliveryMethod"
  | "price"
  | "status"
  | "issueDate";

export type SortDirection = "asc" | "desc";
export const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface WorkOrdersFiltersState {
  search: string;
  status: WorkOrderStatus | "all";
  billingDocumentType: BillingDocumentType | "all";
  deliveryMethod: DeliveryMethod | "all";
  queue: "all" | "unassigned" | "overdue" | "today" | "thisWeek";
  customerId: string;
  dateFrom: string;
  dateTo: string;
  /** Admin-only: show only orders awaiting cost entry. */
  needsCostReview: boolean;
}

export interface UseWorkOrdersResult {
  orders: WorkOrder[];
  /** All filtered + sorted orders (every page), for export. */
  filteredSortedOrders: WorkOrder[];
  totalFiltered: number;
  allOrdersCount: number;
  loading: boolean;
  error: string | null;
  filters: WorkOrdersFiltersState;
  updateFilters: (patch: Partial<WorkOrdersFiltersState>) => void;
  resetFilters: () => void;
  sortField: SortField;
  sortDirection: SortDirection;
  handleSort: (field: SortField) => void;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  pageSize: PageSize;
  setPageSize: (pageSize: PageSize) => void;
  refreshOrders: () => Promise<void>;
}

const INITIAL_FILTERS: WorkOrdersFiltersState = {
  search: "",
  status: "all",
  billingDocumentType: "all",
  deliveryMethod: "all",
  queue: "all",
  customerId: "",
  dateFrom: "",
  dateTo: "",
  needsCostReview: false,
};

const QUEUE_VALUES = ["all", "unassigned", "overdue", "today", "thisWeek"] as const;
const BILLING_VALUES: BillingDocumentType[] = [
  "invoice",
  "cashCollection",
  "proforma",
];
const DELIVERY_VALUES: DeliveryMethod[] = [
  "pickup",
  "postExpress",
  "cityExpress",
  "fieldVisit",
];

function readEnumParam<T extends string>(
  searchParams: URLSearchParams,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = searchParams.get(key);
  if (value && values.includes(value as T)) return value as T;
  return fallback;
}

export function filtersFromSearchParams(
  searchParams: URLSearchParams,
): WorkOrdersFiltersState {
  return {
    search: searchParams.get("search") ?? "",
    status: readEnumParam(
      searchParams,
      "status",
      ["all", ...WORK_ORDER_STATUS_ORDER],
      "all",
    ),
    billingDocumentType: readEnumParam(
      searchParams,
      "billingDocumentType",
      ["all", ...BILLING_VALUES],
      "all",
    ),
    deliveryMethod: readEnumParam(
      searchParams,
      "deliveryMethod",
      ["all", ...DELIVERY_VALUES],
      "all",
    ),
    queue: readEnumParam(searchParams, "queue", QUEUE_VALUES, "all"),
    customerId: searchParams.get("customerId") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    needsCostReview: searchParams.get("needsCostReview") === "true",
  };
}

export function filtersToSearchParams(
  filters: WorkOrdersFiltersState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.search) searchParams.set("search", filters.search);
  if (filters.status !== "all") searchParams.set("status", filters.status);
  if (filters.billingDocumentType !== "all") {
    searchParams.set("billingDocumentType", filters.billingDocumentType);
  }
  if (filters.deliveryMethod !== "all") {
    searchParams.set("deliveryMethod", filters.deliveryMethod);
  }
  if (filters.queue !== "all") searchParams.set("queue", filters.queue);
  if (filters.customerId) searchParams.set("customerId", filters.customerId);
  if (filters.dateFrom) searchParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) searchParams.set("dateTo", filters.dateTo);
  if (filters.needsCostReview) searchParams.set("needsCostReview", "true");

  return searchParams;
}

function areFiltersEqual(
  left: WorkOrdersFiltersState,
  right: WorkOrdersFiltersState,
): boolean {
  return (
    left.search === right.search &&
    left.status === right.status &&
    left.billingDocumentType === right.billingDocumentType &&
    left.deliveryMethod === right.deliveryMethod &&
    left.queue === right.queue &&
    left.customerId === right.customerId &&
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo &&
    left.needsCostReview === right.needsCostReview
  );
}

export function filterWorkOrdersForList(
  orders: WorkOrder[],
  filters: WorkOrdersFiltersState,
  today = getLocalIsoDate(),
  // When provided, free-text search and the status/document filters are scoped
  // to the columns the user has chosen to show. Defaults to all columns.
  visibleColumns?: ReadonlySet<WorkOrderColumnKey>,
): WorkOrder[] {
  const isColumnVisible = (key: WorkOrderColumnKey): boolean =>
    visibleColumns ? visibleColumns.has(key) : true;

  return orders.filter((order) => {
    if (filters.customerId && order.customerId !== filters.customerId) {
      return false;
    }

    if (filters.search && !filters.customerId) {
      const q = filters.search.toLowerCase();
      // Searchable across the visible columns only: br naloga, klijent, opis
      // posla, operater, prioritet, tip dokumenta, plan (datumi) and cena.
      // Enum-backed fields contribute raw value + Serbian label; price
      // contributes raw + formatted; dates contribute ISO + DD.MM.YYYY. Hidden
      // columns are excluded so the field list governs search scope.
      const haystack = buildSearchHaystack(order, visibleColumns);
      if (!haystack.includes(q)) return false;
    }
    if (
      isColumnVisible("status") &&
      filters.status !== "all" &&
      order.status !== filters.status
    )
      return false;
    if (
      isColumnVisible("billing") &&
      filters.billingDocumentType !== "all" &&
      order.billingDocumentType !== filters.billingDocumentType
    )
      return false;
    if (
      filters.deliveryMethod !== "all" &&
      order.shipping.deliveryMethod !== filters.deliveryMethod
    )
      return false;
    if (filters.queue !== "all") {
      const dueDate = order.dueDate ?? order.assignment.scheduledDate;
      if (filters.queue === "unassigned" && order.assignment.assignedTo) {
        return false;
      }
      if (
        filters.queue === "overdue" &&
        (!dueDate || dueDate >= today || order.isCompleted)
      ) {
        return false;
      }
      if (filters.queue === "today" && dueDate !== today) {
        return false;
      }
      if (filters.queue === "thisWeek") {
        if (!dueDate) return false;
        const due = new Date(`${dueDate}T00:00:00`);
        const now = new Date(`${today}T00:00:00`);
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (
          due.getTime() < now.getTime() ||
          due.getTime() > now.getTime() + sevenDaysMs
        ) {
          return false;
        }
      }
    }
    if (filters.dateFrom && order.issueDate < filters.dateFrom) return false;
    if (filters.dateTo && order.issueDate > filters.dateTo) return false;
    if (filters.needsCostReview && !order.needsCostReview) return false;
    return true;
  });
}

export function useWorkOrders(): UseWorkOrdersResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<WorkOrdersFiltersState>(() =>
    filtersFromSearchParams(searchParams),
  );
  const [sortField, setSortField] = useState<SortField>("issueDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    readStoredDefaultPageSize(),
  );
  const { visibleColumnSet } = useColumnVisibility();

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.api.getWorkOrders();
      setOrders(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepoznata greška");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const nextFilters = filtersFromSearchParams(
      new URLSearchParams(searchParamsKey),
    );
    setFilters((prev) => {
      if (areFiltersEqual(prev, nextFilters)) return prev;
      setCurrentPage(1);
      return nextFilters;
    });
  }, [searchParamsKey]);

  const filteredOrders = useMemo(() => {
    return filterWorkOrdersForList(orders, filters, undefined, visibleColumnSet);
  }, [orders, filters, visibleColumnSet]);

  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders];
    sorted.sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortField) {
        case "shipping.deliveryMethod":
          aVal = a.shipping.deliveryMethod;
          bVal = b.shipping.deliveryMethod;
          break;
        case "assignment.assignedTo":
          aVal = a.assignment.assignedTo;
          bVal = b.assignment.assignedTo;
          break;
        case "assignment.priority":
          aVal = a.assignment.priority;
          bVal = b.assignment.priority;
          break;
        case "assignment.scheduledDate":
          aVal = a.assignment.scheduledDate;
          bVal = b.assignment.scheduledDate;
          break;
        case "price":
          aVal = a.price;
          bVal = b.price;
          break;
        default:
          aVal = a[sortField];
          bVal = b[sortField];
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal), "sr-Latn");

      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredOrders, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [pageSize, safeCurrentPage, sortedOrders]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
      setCurrentPage(1);
    },
    [sortField],
  );

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setCurrentPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const updateFilters = useCallback(
    (patch: Partial<WorkOrdersFiltersState>) => {
      const nextFilters = {
        ...filters,
        ...patch,
        customerId: patch.search !== undefined ? "" : (patch.customerId ?? filters.customerId),
      };
      setFilters(nextFilters);
      setCurrentPage(1);
      setSearchParams(filtersToSearchParams(nextFilters), { replace: true });
    },
    [filters, setSearchParams],
  );

  const handlePageSizeChange = useCallback((nextPageSize: PageSize) => {
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }, []);

  return {
    orders: paginatedOrders,
    filteredSortedOrders: sortedOrders,
    totalFiltered: sortedOrders.length,
    allOrdersCount: orders.length,
    loading,
    error,
    filters,
    updateFilters,
    resetFilters,
    sortField,
    sortDirection,
    handleSort,
    currentPage: safeCurrentPage,
    totalPages,
    setCurrentPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    refreshOrders: fetchOrders,
  };
}
