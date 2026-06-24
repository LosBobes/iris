import { useContext } from "react";
import {
  ColumnVisibilityContext,
  type ColumnVisibilityContextValue,
} from "@/contexts/ColumnVisibilityContext";

export function useColumnVisibility(): ColumnVisibilityContextValue {
  const ctx = useContext(ColumnVisibilityContext);
  if (!ctx) {
    throw new Error(
      "useColumnVisibility must be used within a ColumnVisibilityProvider",
    );
  }
  return ctx;
}
