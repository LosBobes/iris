// App-wide color theme. Iris ships a warm ivory "paper" light theme; the dark
// theme inverts to a low-glare ink palette for long shifts. The preference is
// stored per-device (like font scale) and resolved against the OS setting when
// the user picks "system".
//
// Tailwind's dark variant is wired as `@custom-variant dark (&:is(.dark *))`,
// so applying the theme means toggling a single `.dark` class on <html>; the
// dark CSS-var block in main.css does the rest.

export const THEME_STORAGE_KEY = "iris-theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME: ThemePreference = "system";

export interface ThemeOption {
  value: ThemePreference;
  label: string;
  hint: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Svetla", hint: "Ivory papir" },
  { value: "dark", label: "Tamna", hint: "Manje naprezanja oka" },
  { value: "system", label: "Sistemska", hint: "Prati podešavanja uređaja" },
];

const VALID_THEMES: ThemePreference[] = ["light", "dark", "system"];

function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && VALID_THEMES.includes(value as ThemePreference);
}

export function readStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.error(e);
  }
}

/** Resolves a preference to a concrete theme, consulting the OS for "system". */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return prefersDark() ? "dark" : "light";
  }
  return preference;
}

export function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Toggles the `.dark` class on <html> and keeps `color-scheme` in sync so that
 *  native controls (scrollbars, form widgets) match the theme. */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}
