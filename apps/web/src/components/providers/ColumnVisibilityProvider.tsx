import { useCallback, useMemo, useState } from "react";
import { ColumnVisibilityContext } from "@/contexts/ColumnVisibilityContext";
import {
  ALL_COLUMN_KEYS,
  isColumnLocked,
  persistVisibleColumns,
  readStoredVisibleColumns,
  type WorkOrderColumnKey,
} from "@/lib/work-order-columns";

interface ColumnVisibilityProviderProps {
  children: React.ReactNode;
}

export function ColumnVisibilityProvider({
  children,
}: ColumnVisibilityProviderProps): React.JSX.Element {
  const [visibleColumns, setVisibleColumns] = useState<WorkOrderColumnKey[]>(
    () => readStoredVisibleColumns(),
  );

  const update = useCallback((next: WorkOrderColumnKey[]) => {
    setVisibleColumns(next);
    persistVisibleColumns(next);
  }, []);

  const toggleColumn = useCallback(
    (key: WorkOrderColumnKey) => {
      if (isColumnLocked(key)) return;
      setVisibleColumns((prev) => {
        const has = prev.includes(key);
        // Recompute from the canonical order so columns never shuffle.
        const nextSet = new Set(prev);
        if (has) nextSet.delete(key);
        else nextSet.add(key);
        const next = ALL_COLUMN_KEYS.filter((columnKey) =>
          nextSet.has(columnKey),
        );
        persistVisibleColumns(next);
        return next;
      });
    },
    [],
  );

  const resetColumns = useCallback(() => {
    update([...ALL_COLUMN_KEYS]);
  }, [update]);

  const visibleColumnSet = useMemo(
    () => new Set(visibleColumns),
    [visibleColumns],
  );

  const isVisible = useCallback(
    (key: WorkOrderColumnKey) => visibleColumnSet.has(key),
    [visibleColumnSet],
  );

  const value = useMemo(
    () => ({
      visibleColumns,
      visibleColumnSet,
      isVisible,
      toggleColumn,
      resetColumns,
    }),
    [visibleColumns, visibleColumnSet, isVisible, toggleColumn, resetColumns],
  );

  return (
    <ColumnVisibilityContext.Provider value={value}>
      {children}
    </ColumnVisibilityContext.Provider>
  );
}
