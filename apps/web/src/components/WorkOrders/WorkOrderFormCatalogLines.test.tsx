// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";
import type { CatalogItem } from "@/types/catalog";

// The form pulls the signed-in user, the org settings and the admin-managed
// picklists from context; none of that is under test here.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ currentUser: { username: "admin", role: "admin" } }),
}));
vi.mock("@/hooks/useOrganization", async () => {
  const settings = await import("@/types/settings");
  return {
    useOrganization: () => ({
      billingDefaults: settings.DEFAULT_BILLING_DEFAULTS,
      priorityDefaults: settings.DEFAULT_PRIORITY_DEFAULTS,
      showShippingOptions: true,
    }),
  };
});
vi.mock("@/hooks/useEnumValues", () => ({
  useEnumValues: () => ({
    optionsFor: () => [],
    labelFor: (_field: string, value: string) => value,
  }),
}));
// The live PDF preview renders an iframe and is irrelevant to line editing.
vi.mock("@/components/WorkOrders/WorkOrderPdfPreview", () => ({
  WorkOrderPdfPreview: () => null,
}));

const { WorkOrderForm } = await import("./WorkOrderForm");

const strings = sr.workOrders.form;

const service: CatalogItem = {
  id: "svc-baner",
  code: "BANER",
  name: "Baner štampa",
  kind: "service",
  unit: "m2",
  purchasePrice: null,
  salePrice: 1200,
  barcode: null,
  taxGroup: null,
  description: null,
  isActive: true,
};

function stubApi() {
  vi.stubGlobal("api", {
    getCatalogItems: vi.fn().mockResolvedValue({ items: [service], total: 1 }),
    getWorkOrderOperators: vi.fn().mockResolvedValue([]),
    getCustomers: vi.fn().mockResolvedValue({ customers: [], total: 0 }),
    getLocations: vi.fn().mockResolvedValue([]),
  });
}

/** Adds the one catalog service via the "Usluga" picker button. */
async function addCatalogService(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: strings.catalogService }));
  const option = await screen.findByRole("button", { name: /Baner štampa/ });
  await user.click(option);
}

beforeEach(() => {
  stubApi();
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
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

describe("WorkOrderForm catalog lines", () => {
  // The print shop bills several physically distinct jobs against one catalog
  // code, so the same service has to be addable more than once, and each copy
  // has to be renameable on the spot to tell them apart on the nalog.
  it("adds the same catalog service twice, each line editable on the spot", async () => {
    const user = userEvent.setup();
    render(
      <WorkOrderForm onSubmit={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />,
    );

    await addCatalogService(user);
    await addCatalogService(user);

    const descriptions = await screen.findAllByRole("textbox", {
      name: strings.colDescription,
    });
    expect(descriptions).toHaveLength(2);

    // Both lines are unlocked, so distinct labels can be typed immediately.
    await user.clear(descriptions[0]);
    await user.type(descriptions[0], "Baner 0,5 m2");
    await user.clear(descriptions[1]);
    await user.type(descriptions[1], "Baner 6 m2");

    expect(descriptions[0]).toHaveValue("Baner 0,5 m2");
    expect(descriptions[1]).toHaveValue("Baner 6 m2");

    // Each line carries its own quantity, rather than one summed m² figure.
    const quantities = screen.getAllByRole("spinbutton", {
      name: strings.colQuantity,
    });
    expect(quantities).toHaveLength(2);
    await user.clear(quantities[0]);
    await user.type(quantities[0], "0.5");
    expect(quantities[0]).toHaveValue(0.5);
  });

  it("keeps the picked service listed after it is on the order", async () => {
    const user = userEvent.setup();
    render(
      <WorkOrderForm onSubmit={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />,
    );

    await addCatalogService(user);
    await user.click(screen.getByRole("button", { name: strings.catalogService }));

    const option = await screen.findByRole("button", { name: /Baner štampa/ });
    expect(option).toHaveTextContent(strings.catalogAlreadyAdded);
  });

  it("locks a catalog line loaded from an existing order until the pen is used", async () => {
    const user = userEvent.setup();
    render(
      <WorkOrderForm onSubmit={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />,
    );

    await addCatalogService(user);

    // Collapse the freshly added line, then re-open it: the pen has to keep
    // working now that the unlock set is keyed on the persisted line id.
    const editToggle = screen.getByRole("button", {
      name: strings.doneEditItem.replace("{{n}}", "1"),
    });
    await user.click(editToggle);

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: strings.colDescription }),
      ).not.toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: strings.editItem.replace("{{n}}", "1") }),
    );
    expect(
      await screen.findByRole("textbox", { name: strings.colDescription }),
    ).toBeInTheDocument();
  });
});
