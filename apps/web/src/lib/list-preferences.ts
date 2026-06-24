// Per-device preferences for the Work Orders list: row density and the default
// page size used when no explicit `pageSize` is in the URL. Stored in
// localStorage like the other appearance settings.

import { PAGE_SIZE_OPTIONS, type PageSize } from "@/hooks/useWorkOrders";

export const DENSITY_STORAGE_KEY = "iris-list-density";
export const DEFAULT_PAGE_SIZE_STORAGE_KEY = "iris-default-page-size";

export type ListDensity = "compact" | "comfortable";

export const DEFAULT_DENSITY: ListDensity = "comfortable";
export const DEFAULT_PAGE_SIZE_PREFERENCE: PageSize = 10;

export interface DensityOption {
  value: ListDensity;
  label: string;
  hint: string;
  /** Tailwind row-height class applied to table rows. */
  rowHeightClass: string;
}

export const DENSITY_OPTIONS: DensityOption[] = [
  {
    value: "comfortable",
    label: "Udobna",
    hint: "Više prostora po redu",
    rowHeightClass: "h-10",
  },
  {
    value: "compact",
    label: "Kompaktna",
    hint: "Više redova na ekranu",
    rowHeightClass: "h-8",
  },
];

export function getRowHeightClass(density: ListDensity): string {
  return (
    DENSITY_OPTIONS.find((option) => option.value === density)?.rowHeightClass ??
    "h-10"
  );
}

export function readStoredDensity(): ListDensity {
  try {
    const raw = localStorage.getItem(DENSITY_STORAGE_KEY);
    return raw === "compact" || raw === "comfortable" ? raw : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function persistDensity(density: ListDensity): void {
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch (e) {
    console.error(e);
  }
}

export function readStoredDefaultPageSize(): PageSize {
  try {
    const raw = localStorage.getItem(DEFAULT_PAGE_SIZE_STORAGE_KEY);
    const parsed = Number(raw);
    if (PAGE_SIZE_OPTIONS.includes(parsed as PageSize)) {
      return parsed as PageSize;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_PAGE_SIZE_PREFERENCE;
}

export function persistDefaultPageSize(pageSize: PageSize): void {
  try {
    localStorage.setItem(DEFAULT_PAGE_SIZE_STORAGE_KEY, String(pageSize));
  } catch (e) {
    console.error(e);
  }
}
