// App-wide font/UI scaling. The Iris UI uses fixed px sizes throughout, so a
// root `font-size` tweak alone would not move most text. Instead we scale the
// whole document with CSS `zoom`, which enlarges text and layout proportionally
// and works reliably across the px-based design.

export const FONT_SCALE_STORAGE_KEY = "iris-font-scale";

export const DEFAULT_FONT_SCALE = 1;
const MIN_FONT_SCALE = 0.8;
const MAX_FONT_SCALE = 1.5;

export interface FontScaleOption {
  value: number;
  label: string;
  hint: string;
}

export const FONT_SCALE_OPTIONS: FontScaleOption[] = [
  { value: 0.9, label: "Mala", hint: "Kompaktan prikaz" },
  { value: 1, label: "Podrazumevana", hint: "Standardna veličina" },
  { value: 1.15, label: "Velika", hint: "Lakše za čitanje" },
  { value: 1.3, label: "Veoma velika", hint: "Maksimalna čitljivost" },
];

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SCALE;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));
}

export function readStoredFontScale(): number {
  try {
    const raw = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_SCALE;
    return clampFontScale(Number.parseFloat(raw));
  } catch {
    return DEFAULT_FONT_SCALE;
  }
}

export function persistFontScale(scale: number): void {
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(clampFontScale(scale)));
  } catch (e) {
    console.error(e);
  }
}

export function applyFontScale(scale: number): void {
  const clamped = clampFontScale(scale);
  const root = document.documentElement;
  const appRoot = document.getElementById("root");
  root.style.setProperty("--iris-font-scale", String(clamped));
  root.style.setProperty("zoom", String(clamped));

  if (clamped !== DEFAULT_FONT_SCALE) {
    const compensatedViewport = `calc(100dvh / ${clamped})`;
    document.body.style.overflow = "hidden";
    document.body.style.minHeight = compensatedViewport;
    if (appRoot) {
      appRoot.style.minHeight = compensatedViewport;
      appRoot.style.height = compensatedViewport;
      appRoot.style.overflow = "hidden";
    }
    return;
  }

  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("min-height");
  if (appRoot) {
    appRoot.style.removeProperty("min-height");
    appRoot.style.removeProperty("height");
    appRoot.style.removeProperty("overflow");
  }
}
