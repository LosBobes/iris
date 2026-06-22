// Saved filter views for the Work Orders list. A view is just a name plus the
// filter query string (the same one that drives the URL), stored per-device.

export const SAVED_VIEWS_STORAGE_KEY = "iris-wo-saved-views";

export interface SavedView {
  id: string;
  name: string;
  /** URLSearchParams string produced by filtersToSearchParams(). */
  query: string;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (view): view is SavedView =>
        typeof view === "object" &&
        view !== null &&
        typeof (view as SavedView).id === "string" &&
        typeof (view as SavedView).name === "string" &&
        typeof (view as SavedView).query === "string",
    );
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedView[]): void {
  try {
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
  } catch (e) {
    console.error(e);
  }
}

export function addSavedView(name: string, query: string): SavedView[] {
  const trimmed = name.trim();
  const views = readSavedViews();
  // Replace a view with the same name rather than duplicating it.
  const next = views.filter(
    (view) => view.name.toLowerCase() !== trimmed.toLowerCase(),
  );
  next.push({ id: createId(), name: trimmed, query });
  persistSavedViews(next);
  return next;
}

export function removeSavedView(id: string): SavedView[] {
  const next = readSavedViews().filter((view) => view.id !== id);
  persistSavedViews(next);
  return next;
}
