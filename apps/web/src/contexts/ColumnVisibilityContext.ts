import { createContext } from "react";
import type { WorkOrderColumnKey } from "@/lib/work-order-columns";

export interface ColumnVisibilityContextValue {
  /** Ordered list of visible column keys. */
  visibleColumns: WorkOrderColumnKey[];
  /** Set form for O(1) lookups (search/filtering). */
  visibleColumnSet: ReadonlySet<WorkOrderColumnKey>;
  isVisible: (key: WorkOrderColumnKey) => boolean;
  toggleColumn: (key: WorkOrderColumnKey) => void;
  resetColumns: () => void;
}

export const ColumnVisibilityContext =
  createContext<ColumnVisibilityContextValue | null>(null);
