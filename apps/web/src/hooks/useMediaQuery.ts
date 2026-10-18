import { useCallback, useSyncExternalStore } from "react";

/** Subscribes to a CSS media query; returns `false` where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = () =>
    typeof window !== "undefined" && !!window.matchMedia
      ? window.matchMedia(query).matches
      : false;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
