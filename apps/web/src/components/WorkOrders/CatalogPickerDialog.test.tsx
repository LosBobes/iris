// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CatalogPickerDialog } from "./CatalogPickerDialog";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";
import type { CatalogItem } from "@/types/catalog";

const strings = sr.workOrders.form;

function catalogItem(overrides: Partial<CatalogItem> & { id: string }): CatalogItem {
  return {
    code: overrides.id.toUpperCase(),
    name: `Usluga ${overrides.id}`,
    kind: "service",
    unit: "m2",
    purchasePrice: null,
    salePrice: 1200,
    barcode: null,
    taxGroup: null,
    description: null,
    isActive: true,
    ...overrides,
  };
}

function stubApi(items: CatalogItem[]) {
  const getCatalogItems = vi
    .fn()
    .mockResolvedValue({ items, total: items.length });
  vi.stubGlobal("api", { getCatalogItems });
  return getCatalogItems;
}

function renderPicker(
  props: Partial<React.ComponentProps<typeof CatalogPickerDialog>> = {},
) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const view = render(
    <CatalogPickerDialog
      kind="service"
      open
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      usedIds={new Set()}
      {...props}
    />,
  );
  return { ...view, onSelect, onOpenChange };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Radix uses pointer-capture APIs jsdom does not implement.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CatalogPickerDialog", () => {
  // A print shop bills several physically distinct jobs (0,5 m², 6 m², 12 m²)
  // against one catalog code, so an item already on the order must stay
  // selectable — hiding it read as the item having vanished from the catalog.
  it("keeps an item already on the order in the results, flagged as such", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const item = catalogItem({ id: "svc-1", name: "Baner štampa" });
    stubApi([item]);

    const { onSelect } = renderPicker({ usedIds: new Set([item.id]) });

    const option = await screen.findByRole("button", { name: /Baner štampa/ });
    expect(option).toHaveTextContent(strings.catalogAlreadyAdded);

    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("does not flag items that are not yet on the order", async () => {
    stubApi([catalogItem({ id: "svc-1", name: "Baner štampa" })]);

    renderPicker();

    const option = await screen.findByRole("button", { name: /Baner štampa/ });
    expect(option).not.toHaveTextContent(strings.catalogAlreadyAdded);
  });

  it("shows the empty state only when the catalog itself returns nothing", async () => {
    stubApi([]);

    renderPicker({ usedIds: new Set(["svc-1"]) });

    await waitFor(() => {
      expect(screen.getByText(strings.noCatalog)).toBeInTheDocument();
    });
  });
});
