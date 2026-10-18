import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "@/i18n";
import { formatActionError, reportUnexpectedError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-client";
import type { WorkOrder } from "@/types/work-order";

export interface UseWorkOrderOptions {
  /** Sentry/console context for an unexpected load failure. */
  context: string;
  /**
   * Wait for a fresh fetch instead of rendering a cached copy first. The edit
   * form uses it: its initial values are taken once, so they must not come
   * from a copy another operator may have changed since.
   */
  fresh?: boolean;
}

export interface UseWorkOrderResult {
  order: WorkOrder | null;
  /** Replaces the cached order (e.g. with a mutation's response). */
  setOrder: (order: WorkOrder | null) => void;
  loading: boolean;
  /** Display message: not found, or the formatted load error. */
  error: string | null;
}

/** One work order by id, cached (and invalidated by every work-order mutation). */
export function useWorkOrder(
  id: string | undefined,
  { context, fresh = false }: UseWorkOrderOptions,
): UseWorkOrderResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.workOrder(id ?? ""),
    queryFn: () => window.api.getWorkOrderById(id ?? ""),
    enabled: Boolean(id),
    refetchOnMount: fresh ? "always" : true,
  });

  useEffect(() => {
    if (query.error) reportUnexpectedError(context, query.error);
  }, [context, query.error]);

  const setOrder = useCallback(
    (order: WorkOrder | null) => {
      if (id) queryClient.setQueryData(queryKeys.workOrder(id), order);
    },
    [id, queryClient],
  );

  if (!id) {
    return { order: null, setOrder, loading: false, error: i18n.t("workOrders.detail.notFound") };
  }
  const loading = fresh ? !query.isFetchedAfterMount && !query.error : query.isPending;
  if (loading) return { order: null, setOrder, loading: true, error: null };
  if (query.error) {
    return {
      order: null,
      setOrder,
      loading: false,
      error: formatActionError(i18n.t("workOrders.detail.loadError"), query.error),
    };
  }
  const order = query.data ?? null;
  return {
    order,
    setOrder,
    loading: false,
    error: order ? null : i18n.t("workOrders.detail.notFound"),
  };
}
