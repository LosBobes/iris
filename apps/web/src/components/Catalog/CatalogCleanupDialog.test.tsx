// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CatalogCleanupDialog } from "./CatalogCleanupDialog";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";
import type { CatalogItem } from "@/types/catalog";

const strings = sr.catalog.cleanup;

function catalogItem(overrides: Partial<CatalogItem> & { id: string }): CatalogItem {
  return {
    code: overrides.id.toUpperCase(),
    name: `Stavka ${overrides.id}`,
    kind: "service",
    unit: "kom",
    purchasePrice: null,
    salePrice: null,
    barcode: null,
    taxGroup: null,
    description: null,
    isActive: true,
    ...overrides,
  };
}

function stubApi(overrides: Partial<Window["api"]> = {}) {
  const previewCatalogCleanup = vi.fn().mockResolvedValue({ items: [], total: 0 });
  const cleanupCatalogItems = vi.fn().mockResolvedValue({ deleted: 0 });
  const api = { previewCatalogCleanup, cleanupCatalogItems, ...overrides }
  vi.stubGlobal("api", api);
  return api as { previewCatalogCleanup: typeof previewCatalogCleanup; cleanupCatalogItems: typeof cleanupCatalogItems };
}

function renderDialog(props: Partial<React.ComponentProps<typeof CatalogCleanupDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onDeleted = vi.fn();
  const onError = vi.fn();
  const view = render(
    <CatalogCleanupDialog
      open
      onOpenChange={onOpenChange}
      onDeleted={onDeleted}
      onError={onError}
      {...props}
    />,
  );
  return { ...view, onOpenChange, onDeleted, onError };
}

/** Advances from the scope step to the confirmation listing. */
async function goToConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: strings.next }));
}

beforeEach(() => {
  // Radix uses pointer-capture APIs jsdom does not implement.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CatalogCleanupDialog scope step", () => {
  it("opens on the narrowest scope: services only, items with no price at all", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText(strings.options.title)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: strings.options.kindService }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: strings.options.kindArticle }),
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: strings.options.missingBoth })).toBeChecked();

    await goToConfirm(user);
    expect(api.previewCatalogCleanup).toHaveBeenCalledWith({
      kinds: ["service"],
      missing: "both",
    });
  });

  it("disables Next and explains why when no kind is selected", async () => {
    stubApi();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("checkbox", { name: strings.options.kindService }));

    expect(screen.getByText(strings.options.kindsRequired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: strings.next })).toBeDisabled();
  });

  it("sends both kinds when the second one is ticked", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("checkbox", { name: strings.options.kindArticle }));
    await goToConfirm(user);

    expect(api.previewCatalogCleanup).toHaveBeenCalledWith({
      kinds: ["service", "article"],
      missing: "both",
    });
  });

  it.each([
    [strings.options.missingPurchase, "purchase"],
    [strings.options.missingSale, "sale"],
    [strings.options.missingBoth, "both"],
  ])("sends the %s price mode", async (label, expected) => {
    const api = stubApi();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("radio", { name: label }));
    await goToConfirm(user);

    expect(api.previewCatalogCleanup).toHaveBeenCalledWith({
      kinds: ["service"],
      missing: expected,
    });
  });
});

describe("CatalogCleanupDialog confirmation step", () => {
  const items = [
    catalogItem({ id: "svc-1", name: "Plotovanje", kind: "service" }),
    catalogItem({ id: "art-1", name: "Kaširana ploča", kind: "article", salePrice: 250 }),
  ];

  it("lists exactly the items the preview returned, with why each matched", async () => {
    stubApi({
      previewCatalogCleanup: vi.fn().mockResolvedValue({ items, total: items.length }),
    } as Partial<Window["api"]>);
    const user = userEvent.setup();
    renderDialog();

    await goToConfirm(user);

    expect(await screen.findByText(strings.confirm.title)).toBeInTheDocument();
    const list = screen.getByTestId("catalog-cleanup-preview");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Plotovanje")).toBeInTheDocument();
    expect(within(list).getByText("Kaširana ploča")).toBeInTheDocument();
    // The item with no prices at all is labelled differently from the one that
    // only lacks a purchase price.
    expect(within(list).getByText(new RegExp(strings.confirm.noPrices))).toBeInTheDocument();
    expect(within(list).getByText(new RegExp(strings.confirm.noPurchase))).toBeInTheDocument();
  });

  it("deletes with the same filter it previewed, then reports the count and closes", async () => {
    const api = stubApi({
      previewCatalogCleanup: vi.fn().mockResolvedValue({ items, total: items.length }),
      cleanupCatalogItems: vi.fn().mockResolvedValue({ deleted: 2 }),
    } as Partial<Window["api"]>);
    const user = userEvent.setup();
    const { onDeleted, onOpenChange, onError } = renderDialog();

    await user.click(screen.getByRole("radio", { name: strings.options.missingSale }));
    await user.click(screen.getByRole("checkbox", { name: strings.options.kindArticle }));
    await goToConfirm(user);

    await user.click(
      await screen.findByRole("button", { name: /Obriši \(2\)/ }),
    );

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(2));
    const expectedFilter = { kinds: ["service", "article"], missing: "sale" };
    expect(api.previewCatalogCleanup).toHaveBeenCalledWith(expectedFilter);
    expect(api.cleanupCatalogItems).toHaveBeenCalledWith(expectedFilter);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it("offers no delete button when nothing matches, and goes back to the scope step", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    renderDialog();

    await goToConfirm(user);

    expect(await screen.findByText(strings.confirm.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("catalog-cleanup-preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Obriši/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: strings.back }));
    expect(screen.getByText(strings.options.title)).toBeInTheDocument();
    expect(api.cleanupCatalogItems).not.toHaveBeenCalled();
  });

  it("never deletes straight from the scope step", async () => {
    const api = stubApi({
      previewCatalogCleanup: vi.fn().mockResolvedValue({ items, total: items.length }),
    } as Partial<Window["api"]>);
    const user = userEvent.setup();
    renderDialog();

    await goToConfirm(user);

    expect(api.previewCatalogCleanup).toHaveBeenCalledTimes(1);
    expect(api.cleanupCatalogItems).not.toHaveBeenCalled();
  });
});

describe("CatalogCleanupDialog failures", () => {
  it("reports a failed preview and stays on the scope step", async () => {
    const api = stubApi({
      previewCatalogCleanup: vi.fn().mockRejectedValue(new Error("boom")),
    } as Partial<Window["api"]>);
    const user = userEvent.setup();
    const { onError } = renderDialog();

    await goToConfirm(user);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(strings.previewError));
    expect(screen.getByText(strings.options.title)).toBeInTheDocument();
    expect(api.cleanupCatalogItems).not.toHaveBeenCalled();
  });

  it("reports a failed delete and keeps the dialog open", async () => {
    stubApi({
      previewCatalogCleanup: vi
        .fn()
        .mockResolvedValue({ items: [catalogItem({ id: "svc-1" })], total: 1 }),
      cleanupCatalogItems: vi.fn().mockRejectedValue(new Error("boom")),
    } as Partial<Window["api"]>);
    const user = userEvent.setup();
    const { onDeleted, onError, onOpenChange } = renderDialog();

    await goToConfirm(user);
    await user.click(await screen.findByRole("button", { name: /Obriši \(1\)/ }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(strings.error));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText(strings.confirm.title)).toBeInTheDocument();
  });
});

describe("CatalogCleanupDialog reopening", () => {
  it("resets scope and step so a previous selection cannot leak into the next run", async () => {
    const api = stubApi({
      previewCatalogCleanup: vi
        .fn()
        .mockResolvedValue({ items: [catalogItem({ id: "svc-1" })], total: 1 }),
    } as Partial<Window["api"]>);
    const user = userEvent.setup();
    const { rerender } = renderDialog();

    await user.click(screen.getByRole("checkbox", { name: strings.options.kindArticle }));
    await user.click(screen.getByRole("radio", { name: strings.options.missingPurchase }));
    await goToConfirm(user);
    expect(await screen.findByText(strings.confirm.title)).toBeInTheDocument();

    const noop = vi.fn();
    rerender(
      <CatalogCleanupDialog open={false} onOpenChange={noop} onDeleted={noop} onError={noop} />,
    );
    rerender(
      <CatalogCleanupDialog open onOpenChange={noop} onDeleted={noop} onError={noop} />,
    );

    expect(screen.getByText(strings.options.title)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: strings.options.kindArticle }),
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: strings.options.missingBoth })).toBeChecked();

    await goToConfirm(user);
    expect(api.previewCatalogCleanup).toHaveBeenLastCalledWith({
      kinds: ["service"],
      missing: "both",
    });
  });
});
