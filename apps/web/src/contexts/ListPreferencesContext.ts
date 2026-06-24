import { createContext } from "react";
import type { PageSize } from "@/hooks/useWorkOrders";
import type { ListDensity } from "@/lib/list-preferences";

export interface ListPreferencesContextValue {
  density: ListDensity;
  setDensity: (density: ListDensity) => void;
  defaultPageSize: PageSize;
  setDefaultPageSize: (pageSize: PageSize) => void;
}

export const ListPreferencesContext =
  createContext<ListPreferencesContextValue | null>(null);
