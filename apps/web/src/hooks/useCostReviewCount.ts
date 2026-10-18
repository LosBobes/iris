import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";

const COST_REVIEW_COUNT_PARAMS = { needsCostReview: true, limit: 1, view: "summary" } as const;

/**
 * Number of work orders awaiting cost entry (needsCostReview), used for the
 * sidebar badge. Admin-only — the API only sets needsCostReview for admins, so
 * callers pass enabled=false for operators to skip the request entirely.
 *
 * Cached with the other work-order queries, so every work-order mutation
 * (which invalidates them) refreshes the badge — including costs an admin just
 * entered. Uses limit:1 because only the filtered `total` is needed.
 */
export function useCostReviewCount(enabled: boolean): number {
  const { data } = useQuery({
    queryKey: queryKeys.workOrderCount(COST_REVIEW_COUNT_PARAMS),
    queryFn: async () => (await window.api.getWorkOrders(COST_REVIEW_COUNT_PARAMS)).total,
    enabled,
  });
  return enabled ? (data ?? 0) : 0;
}
