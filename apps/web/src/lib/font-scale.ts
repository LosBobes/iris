// App-wide font/UI scaling. The Iris UI uses fixed px sizes throughout, so a
// root `font-size` tweak alone would not move most text. Instead we scale the
// whole app with a CSS `transform: scale()` on a wrapper element, which enlarges
// text and layout proportionally across the px-based design.
//
// We deliberately use `transform` rather than `zoom`: Radix popovers/selects/
// tooltips are positioned by Floating UI, which compensates for an ancestor
// `transform: scale` but is blind to CSS `zoom`. Under `zoom` every popover
// rendered inside the scaled tree lands offset by the scale factor. The wrapper
// is sized to `100vw / scale` so that after scaling it fills the real viewport.

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

// Applies the scale to `target` (the wrapper that contains the whole app and
// the overlay portal node). `--iris-font-scale` is also published on the root
// element for any CSS that needs the factor (e.g. `.iris-screen`).
export function applyFontScale(scale: number, target: HTMLElement | null): void {
  const clamped = clampFontScale(scale);
  document.documentElement.style.setProperty("--iris-font-scale", String(clamped));

  if (!target) return;

  if (clamped === DEFAULT_FONT_SCALE) {
    target.style.removeProperty("transform");
    target.style.removeProperty("transform-origin");
    target.style.removeProperty("width");
    target.style.removeProperty("height");
    target.style.removeProperty("overflow");
    return;
  }

  // Lay the wrapper out at the inverse size, then scale it back up from the
  // top-left so it fills the real viewport. Top-level screens are `position:
  // fixed` (AppShell, Login, public tracking); the `transform` makes the
  // wrapper their containing block, so they stay pinned to the visible area.
  target.style.transform = `scale(${clamped})`;
  target.style.transformOrigin = "0 0";
  target.style.width = `calc(100vw / ${clamped})`;
  target.style.height = `calc(100dvh / ${clamped})`;
  target.style.overflow = "hidden";
}
