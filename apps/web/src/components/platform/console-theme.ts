/**
 * The Backoffice's dark-surface variables. Always dark, like an ops console,
 * whatever the app theme; the chart palette in series.ts is validated against
 * --pf-panel. Overlays that portal out of the console (the actions menu)
 * re-apply them on their own root.
 */
export const CONSOLE_VARS = {
  "--pf-bg": "#111214",
  "--pf-panel": "#1a1b1e",
  "--pf-border": "#2a2c31",
  "--pf-grid": "#24262b",
  "--pf-text": "#e8e9ea",
  "--pf-text-2": "#a1a4ab",
  "--pf-muted": "#6f737b",
  colorScheme: "dark",
} as React.CSSProperties;
