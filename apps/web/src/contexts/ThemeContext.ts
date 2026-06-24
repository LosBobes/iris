import { createContext } from "react";
import type { ResolvedTheme, ThemePreference } from "@/lib/theme";

export interface ThemeContextValue {
  /** The user's stored preference (may be "system"). */
  theme: ThemePreference;
  /** The concrete theme currently applied. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
