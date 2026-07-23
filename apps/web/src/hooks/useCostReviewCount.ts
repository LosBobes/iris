import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Number of work orders awaiting cost entry (needsCostReview), used for the
 * sidebar badge. Admin-only — the API only sets needsCostReview for admins, so
 * callers pass enabled=false for operators to skip the request entirely.
 *
 * Re-fetches on navigation so the badge reflects costs an admin just entered.
 * Uses limit:1 because only the filtered `total` is needed, not the rows.
 */
export function useCostReviewCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;
    window.api
      .getWorkOrders({ needsCostReview: true, limit: 1 })
      .then((result) => {
        if (!cancelled) setCount(result.total);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, location.pathname]);

  return count;
}
