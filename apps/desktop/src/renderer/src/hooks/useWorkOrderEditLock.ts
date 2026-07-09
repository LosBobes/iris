import { useEffect, useRef, useState } from "react";

// How often the editing client refreshes its lock. Must stay well under the
// server's lock TTL so an actively-open form never lets its lock lapse, while a
// closed window (no more heartbeats) releases the work order shortly after.
const HEARTBEAT_MS = 30_000;

export type EditLockStatus = "acquiring" | "held" | "locked" | "error";

export interface WorkOrderEditLock {
  status: EditLockStatus;
  /** Username of the other operator when the order is locked, else null. */
  lockedBy: string | null;
  /** True only when another operator holds the lock and the form must be read-only. */
  readOnly: boolean;
}

/**
 * Acquires and holds an exclusive edit lock on a work order for as long as the
 * component is mounted, so only one operator edits it at a time. It heartbeats to
 * keep the lock alive and releases it on unmount. When another operator already
 * holds the lock, `status` becomes "locked" and `readOnly` is true so the caller
 * can render a read-only view naming the holder. A lock-service error fails open
 * (editable) rather than blocking work.
 */
export function useWorkOrderEditLock(id: string | undefined): WorkOrderEditLock {
  const [status, setStatus] = useState<EditLockStatus>("acquiring");
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const heldRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stopHeartbeat = (): void => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const acquire = async (): Promise<void> => {
      try {
        const result = await window.api.acquireWorkOrderEditLock(id);
        if (!active) return;
        if (result.acquired) {
          heldRef.current = true;
          setStatus("held");
          setLockedBy(null);
        } else {
          // Another operator holds it; stop heartbeating since we don't own it.
          heldRef.current = false;
          setStatus("locked");
          setLockedBy(result.lock.lockedBy);
          stopHeartbeat();
        }
      } catch {
        // Fail open: never block editing just because the lock call failed.
        if (active && !heldRef.current) setStatus("error");
      }
    };

    void acquire();
    timer = setInterval(() => {
      void acquire();
    }, HEARTBEAT_MS);

    return () => {
      active = false;
      stopHeartbeat();
      if (heldRef.current) {
        heldRef.current = false;
        void window.api.releaseWorkOrderEditLock(id);
      }
    };
  }, [id]);

  return { status, lockedBy, readOnly: status === "locked" };
}
