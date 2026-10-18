import { useQuery } from "@tanstack/react-query";
import type { Announcement } from "@/types/announcement";

export const announcementsQueryKey = ["announcements"] as const;

/** Light polling: a maintenance notice should appear without a reload. */
const REFRESH_MS = 5 * 60_000;

/**
 * Platform announcements active now for the signed-in organization. Refetched
 * when the window regains focus and every few minutes while it is visible
 * (TanStack pauses the interval in background tabs). Failures show nothing:
 * the banner is a courtesy, never a reason to break the app.
 */
export function useAnnouncements(enabled = true): Announcement[] {
  const { data } = useQuery({
    queryKey: announcementsQueryKey,
    queryFn: () => window.api.getAnnouncements(),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  return enabled ? (data ?? []) : [];
}
