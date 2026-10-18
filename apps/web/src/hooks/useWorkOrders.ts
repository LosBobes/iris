import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  WorkOrder,
  WorkOrderStatus,
  BillingDocumentType,
  DeliveryMethod,
  WorkOrderListFilters,
} from "@/types/work-order";
import {
  getLocalIsoDate,
  WORK_ORDER_STATUS_ORDER,
} from "@/shared/utils/work-orders";
import { readStoredDefaultPageSize } from "@/lib/list-preferences";
import i18n from "@/i18n";
import type { WorkOrderColumnKey } from "@/lib/work-order-columns";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { queryKeys } from "@/lib/query-client";

export type SortField =
  | "orderNumber"
  | "clientName"
  | "jobDescription"
  | "assignment.assignedTo"
  | "assignment.priority"
  | "dueDate"
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
  /** Operator username; "" = any. Used by the operator dashboard deep-links. */
  assignedTo: string;
  dateFrom: string;
  dateTo: string;
  /** Admin-only: show only orders awaiting cost entry. */
  needsCostReview: boolean;
}

export interface UseWorkOrdersResult {
  /** The current page of orders, as filtered, sorted and paged by the API. */
  orders: WorkOrder[];
  /**
   * The server-side filters + sort behind the list, for the CSV export
   * (`window.api.exportWorkOrdersCsv`), which covers every page.
   */
  exportFilters: WorkOrderListFilters;
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
  assignedTo: "",
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
    assignedTo: searchParams.get("assignedTo") ?? "",
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
  if (filters.assignedTo) searchParams.set("assignedTo", filters.assignedTo);
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
    left.assignedTo === right.assignedTo &&
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo &&
    left.needsCostReview === right.needsCostReview
  );
}

/** API sort parameter for each table sort column. */
const SORT_PARAM: Record<SortField, string> = {
  orderNumber: "orderNumber",
  clientName: "clientName",
  jobDescription: "jobDescription",
  "assignment.assignedTo": "assignedTo",
  "assignment.priority": "priority",
  dueDate: "dueDate",
  billingDocumentType: "billingDocumentType",
  "shipping.deliveryMethod": "deliveryMethod",
  price: "price",
  status: "status",
  issueDate: "issueDate",
};

/** `field` / `-field` sort parameter for the list API. */
export function toSortParam(field: SortField, direction: SortDirection): string {
  return `${direction === "desc" ? "-" : ""}${SORT_PARAM[field]}`;
}

/**
 * Maps the list's filter state to the API's server-side filters, keeping the
 * table's established rules: the status and document-type filters only apply
 * while their column is shown, and a customer drill-down (customerId)
 * replaces the free-text search it was opened with.
 */
export function buildWorkOrderListFilters(
  filters: WorkOrdersFiltersState,
  visibleColumns?: ReadonlySet<WorkOrderColumnKey>,
  today = getLocalIsoDate(),
): WorkOrderListFilters {
  const isColumnVisible = (key: WorkOrderColumnKey): boolean =>
    visibleColumns ? visibleColumns.has(key) : true;
  const params: WorkOrderListFilters = {};
  if (filters.customerId) params.customerId = filters.customerId;
  else if (filters.search.trim()) params.search = filters.search.trim();
  if (filters.assignedTo) params.assignedTo = filters.assignedTo;
  if (filters.status !== "all" && isColumnVisible("status")) {
    params.status = filters.status;
  }
  if (filters.billingDocumentType !== "all" && isColumnVisible("billing")) {
    params.billingDocumentType = filters.billingDocumentType;
  }
  if (filters.deliveryMethod !== "all") {
    params.deliveryMethod = filters.deliveryMethod;
  }
  if (filters.queue !== "all") {
    params.queue = filters.queue;
    params.today = today;
  }
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.needsCostReview) params.needsCostReview = true;
  return params;
}

/** How often an open list checks whether the local date rolled over. */
export const TODAY_CHECK_INTERVAL_MS = 60_000;

/**
 * The local ISO date, re-read every minute and whenever the tab regains focus
 * or visibility, so date-relative queries (and their query keys) follow
 * midnight.
 */
export function useLocalToday(): string {
  const [today, setToday] = useState(() => getLocalIsoDate());
  useEffect(() => {
    const refresh = () => setToday(getLocalIsoDate());
    const timer = window.setInterval(refresh, TODAY_CHECK_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}

export interface UseWorkOrdersOptions {
  /**
   * Scope the list (and its "of all" count) to orders awaiting cost entry,
   * filtered by the API — the cost-review queue lists exactly the set the
   * sidebar badge counts (both come from the same server-side filter).
   */
  needsCostReview?: boolean;
}

export function useWorkOrders(
  options: UseWorkOrdersOptions = {},
): UseWorkOrdersResult {
  const serverNeedsCostReview = options.needsCostReview === true;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [filters, setFilters] = useState<WorkOrdersFiltersState>(() =>
    filtersFromSearchParams(searchParams),
  );
  // Newest nalog on top: the list follows the order number, counting down, so
  // the rows read one under the other by broj naloga rather than by date.
  const [sortField, setSortField] = useState<SortField>("orderNumber");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(() =>
    readStoredDefaultPageSize(),
  );
  const { visibleColumnSet } = useColumnVisibility();
  // The queue filters (overdue / today / this week) are relative to the local
  // date, which must roll over at midnight in a tab left open.
  const today = useLocalToday();

  // Mirrors `filters` for callbacks (`updateFilters`, the URL-sync effect
  // below) that need the latest value without depending on `filters` itself
  // — that dependency would otherwise force `updateFilters` to be recreated
  // on every filter change.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    const nextFilters = filtersFromSearchParams(
      new URLSearchParams(searchParamsKey),
    );
    // Compare against the latest filters first so the `setFilters` updater
    // stays a pure state transition — `setCurrentPage` is only called here,
    // never from inside an updater function.
    if (areFiltersEqual(filtersRef.current, nextFilters)) return;
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    setCurrentPage(1);
  }, [searchParamsKey]);

  const exportFilters = useMemo<WorkOrderListFilters>(() => {
    const params = buildWorkOrderListFilters(filters, visibleColumnSet, today);
    if (serverNeedsCostReview) params.needsCostReview = true;
    params.sort = toSortParam(sortField, sortDirection);
    return params;
  }, [filters, visibleColumnSet, today, serverNeedsCostReview, sortField, sortDirection]);

  const pageParams = useMemo(
    () => ({
      ...exportFilters,
      view: "summary" as const,
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
    }),
    [exportFilters, pageSize, currentPage],
  );

  const listQuery = useQuery({
    queryKey: queryKeys.workOrderList(pageParams),
    queryFn: () => window.api.getWorkOrders(pageParams),
    // Keep showing the previous page while the next one loads, so paging and
    // filtering don't flash the loading state.
    placeholderData: keepPreviousData,
  });

  // The unfiltered size of the list ("x of y" and the empty state): one row
  // is enough, only `total` is read.
  const countParams = useMemo(
    () => ({
      view: "summary" as const,
      limit: 1,
      ...(serverNeedsCostReview ? { needsCostReview: true } : {}),
    }),
    [serverNeedsCostReview],
  );
  const countQuery = useQuery({
    queryKey: queryKeys.workOrderCount(countParams),
    queryFn: async () => (await window.api.getWorkOrders(countParams)).total,
  });

  const totalFiltered = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // A delete or a narrower result can leave the current page past the end;
  // step back to the last page that exists.
  useEffect(() => {
    if (listQuery.data && currentPage > totalPages) setCurrentPage(totalPages);
  }, [listQuery.data, currentPage, totalPages]);

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
    filtersRef.current = INITIAL_FILTERS;
    setFilters(INITIAL_FILTERS);
    setCurrentPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const updateFilters = useCallback(
    (patch: Partial<WorkOrdersFiltersState>) => {
      // Reads the latest filters off the ref (instead of depending on
      // `filters`) so this callback stays referentially stable across filter
      // changes — it is passed down to memoized filter UI.
      const prev = filtersRef.current;
      const nextFilters = {
        ...prev,
        ...patch,
        customerId: patch.search !== undefined ? "" : (patch.customerId ?? prev.customerId),
      };
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
      setCurrentPage(1);
      setSearchParams(filtersToSearchParams(nextFilters), { replace: true });
    },
    [setSearchParams],
  );

  const handlePageSizeChange = useCallback((nextPageSize: PageSize) => {
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }, []);

  const refreshOrders = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.workOrders });
  }, [queryClient]);

  let error: string | null = null;
  if (listQuery.error) {
    error =
      listQuery.error instanceof Error
        ? listQuery.error.message
        : i18n.t("common.unknownError");
  }

  return {
    orders: listQuery.data?.items ?? [],
    exportFilters,
    totalFiltered,
    allOrdersCount: countQuery.data ?? totalFiltered,
    loading: listQuery.isPending,
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
    refreshOrders,
  };
}
