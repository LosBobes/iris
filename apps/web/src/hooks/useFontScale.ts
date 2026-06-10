import { useContext } from "react";
import {
  FontScaleContext,
  type FontScaleContextValue,
} from "@/contexts/FontScaleContext";

export function useFontScale(): FontScaleContextValue {
  const ctx = useContext(FontScaleContext);
  if (!ctx) {
    throw new Error("useFontScale must be used within a FontScaleProvider");
  }
  return ctx;
}
