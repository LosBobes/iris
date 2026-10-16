// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

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
    optionsFor: (field: string) =>
      field === "billingDocumentType"
        ? [
            { value: "invoice", label: "Faktura" },
            { value: "cashCollection", label: "Otkup" },
          ]
        : [],
    labelFor: (_field: string, value: string) => value,
  }),
}));
// The live PDF preview renders an iframe and is irrelevant to line editing.
vi.mock("@/components/WorkOrders/WorkOrderPdfPreview", () => ({
  WorkOrderPdfPreview: () => null,
}));

const { WorkOrderForm } = await import("./WorkOrderForm");

const strings = sr.workOrders.form;

function stubApi() {
  vi.stubGlobal("api", {
    getCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getCatalogItemById: vi.fn().mockResolvedValue(null),
    getWorkOrderOperators: vi.fn().mockResolvedValue([]),
    getCustomers: vi.fn().mockResolvedValue({ customers: [], total: 0 }),
    getLocations: vi.fn().mockResolvedValue([]),
  });
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

describe("WorkOrderForm text import", () => {
  // Operators type whole product lists into the opis posla; the form spots
  // that and converts the list into real stavke in one step.
  it("offers to convert a product list typed into the description into line items", async () => {
    const user = userEvent.setup();
    render(
      <WorkOrderForm onSubmit={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />,
    );

    expect(screen.queryByText(strings.descriptionLooksLikeList)).not.toBeInTheDocument();
    await user.type(
      document.getElementById("jobDescription") as HTMLElement,
      "Mango 20 kom - Kokos 10 kom - Sveca amber 5 kom",
    );
    expect(await screen.findByText(strings.descriptionLooksLikeList)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: strings.descriptionToItems }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: strings.textImport.unitPrice }),
      "50",
    );
    await user.click(within(dialog).getByRole("button", { name: "Dodaj 3 stavke" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const descriptions = screen.getAllByRole("textbox", { name: strings.colDescription });
    expect(descriptions.map((input) => (input as HTMLInputElement).value)).toEqual([
      "Mango",
      "Kokos",
      "Sveca amber",
    ]);
    // Three lines now cover the three-entry list, so the nudge goes away.
    expect(screen.queryByText(strings.descriptionLooksLikeList)).not.toBeInTheDocument();
  });

  it("opens an empty import dialog from the items toolbar", async () => {
    const user = userEvent.setup();
    render(
      <WorkOrderForm onSubmit={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: strings.textImportButton }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(strings.textImport.empty)).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: strings.textImport.textLabel }),
      "Baner 6 m2",
    );
    await user.click(within(dialog).getByRole("button", { name: "Dodaj 1 stavku" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: strings.colDescription })).toHaveValue("Baner");
  });
});
