import { useCallback, useMemo, useState } from "react";
import { ListPreferencesContext } from "@/contexts/ListPreferencesContext";
import type { PageSize } from "@/hooks/useWorkOrders";
import {
  persistDefaultPageSize,
  persistDensity,
  readStoredDefaultPageSize,
  readStoredDensity,
  type ListDensity,
} from "@/lib/list-preferences";

interface ListPreferencesProviderProps {
  children: React.ReactNode;
}

export function ListPreferencesProvider({
  children,
}: ListPreferencesProviderProps): React.JSX.Element {
  const [density, setDensityState] = useState<ListDensity>(() =>
    readStoredDensity(),
  );
  const [defaultPageSize, setDefaultPageSizeState] = useState<PageSize>(() =>
    readStoredDefaultPageSize(),
  );

  const setDensity = useCallback((next: ListDensity) => {
    setDensityState(next);
    persistDensity(next);
  }, []);

  const setDefaultPageSize = useCallback((next: PageSize) => {
    setDefaultPageSizeState(next);
    persistDefaultPageSize(next);
  }, []);

  const value = useMemo(
    () => ({ density, setDensity, defaultPageSize, setDefaultPageSize }),
    [density, setDensity, defaultPageSize, setDefaultPageSize],
  );

  return (
    <ListPreferencesContext.Provider value={value}>
      {children}
    </ListPreferencesContext.Provider>
  );
}
