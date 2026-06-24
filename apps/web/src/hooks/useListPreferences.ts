import { useContext } from "react";
import {
  ListPreferencesContext,
  type ListPreferencesContextValue,
} from "@/contexts/ListPreferencesContext";

export function useListPreferences(): ListPreferencesContextValue {
  const ctx = useContext(ListPreferencesContext);
  if (!ctx) {
    throw new Error(
      "useListPreferences must be used within a ListPreferencesProvider",
    );
  }
  return ctx;
}
