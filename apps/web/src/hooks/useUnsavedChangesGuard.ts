import { useCallback, useContext, useEffect, useRef } from "react";
import {
  UNSAFE_DataRouterContext,
  useBlocker,
  type Blocker,
  type BlockerFunction,
} from "react-router-dom";

export interface UnsavedChangesGuard {
  /** True while a navigation is held back and the confirm dialog should show. */
  blocked: boolean;
  /** Leave the page anyway (resumes the held navigation). */
  confirmLeave: () => void;
  /** Stay on the page (drops the held navigation). */
  stay: () => void;
  /**
   * Disarms the guard for the next navigation. Call it right before a
   * deliberate navigation that follows a successful save, because the form is
   * still dirty at that moment.
   */
  allowNavigation: () => void;
}

const UNBLOCKED: Blocker = {
  state: "unblocked",
  reset: undefined,
  proceed: undefined,
  location: undefined,
};

/** Fallback used outside a data router, where `useBlocker` would throw. */
function useNoBlocker(): Blocker {
  return UNBLOCKED;
}

/**
 * Warns before the operator loses unsaved form input.
 *
 * - Tab close / reload: a `beforeunload` listener exists only while dirty.
 * - In-app navigation: a router blocker holds path changes while dirty. Search
 *   param / hash changes on the same path are never blocked.
 *
 * Outside a data router (e.g. tests rendering with `MemoryRouter`) only the
 * `beforeunload` part is active. Whether a data router exists never changes for
 * the lifetime of a mounted component, so choosing the hook once is safe.
 */
export function useUnsavedChangesGuard(dirty: boolean): UnsavedChangesGuard {
  const inDataRouter = useContext(UNSAFE_DataRouterContext) !== null;
  const useSelectedBlocker = inDataRouter ? useBlocker : useNoBlocker;

  const dirtyRef = useRef(dirty);
  const bypassRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
    // A fresh dirty cycle re-arms the guard if a bypass was never consumed.
    if (dirty) bypassRef.current = false;
  }, [dirty]);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      !bypassRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
    [],
  );
  const blocker = useSelectedBlocker(shouldBlock);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      if (bypassRef.current) return;
      event.preventDefault();
      // Required by older engines to trigger the native prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const allowNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);
  // Radix closes the dialog after the action's click handler, which would call
  // `stay()` right after `confirmLeave()`; this flag keeps that from cancelling.
  const leavingRef = useRef(false);
  const isBlocked = blocker.state === "blocked";
  useEffect(() => {
    if (isBlocked) leavingRef.current = false;
  }, [isBlocked]);
  const confirmLeave = useCallback(() => {
    leavingRef.current = true;
    blocker.proceed?.();
  }, [blocker]);
  const stay = useCallback(() => {
    if (leavingRef.current) return;
    blocker.reset?.();
  }, [blocker]);

  return {
    blocked: isBlocked,
    confirmLeave,
    stay,
    allowNavigation,
  };
}
