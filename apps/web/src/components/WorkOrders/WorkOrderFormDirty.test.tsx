// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import "@/i18n";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";

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
vi.mock("@/components/WorkOrders/WorkOrderPdfPreview", () => ({
  WorkOrderPdfPreview: () => null,
}));

const { WorkOrderForm } = await import("./WorkOrderForm");

const values: WorkOrderFormValues = {
  customerId: null,
  locationId: null,
  clientName: "Firma Doo",
  contactPerson: null,
  jobDescription: "Stampa vizitkarti",
  jobDetails: null,
  billingDocumentType: "invoice",
  billingDocumentNumber: null,
  isPaid: false,
  shipping: {
    deliveryMethod: "pickup",
    drivesOut: false,
    postagePaymentType: null,
    waitForPayment: false,
    hasPackaging: false,
    hasLabeling: false,
    isFragile: false,
    requiresSignature: false,
    hasInsurance: false,
    shippingAddress: null,
  },
  assignment: { assignedTo: null, priority: "normal" },
  price: 12000,
  note: null,
  issueDate: "2026-05-31",
  proformaDueDate: null,
  dueDate: null,
  issuedBy: "admin",
  executedBy: null,
  internalNotes: [],
  customerNotes: [],
  attachments: [],
  materialUsage: [],
  timeEntries: [],
  invoiceDraft: { status: "draft", invoiceNumber: null, lineItems: [], paidAt: null },
  communication: {
    publicToken: "",
    notificationEmail: null,
    emailNotificationsEnabled: false,
    signedBy: null,
    signedAt: null,
  },
};

beforeEach(() => {
  vi.stubGlobal("api", {
    getCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getWorkOrderOperators: vi.fn().mockResolvedValue([]),
    getCustomers: vi.fn().mockResolvedValue({ customers: [], total: 0 }),
    getLocations: vi.fn().mockResolvedValue([]),
  });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorkOrderForm dirty reporting", () => {
  it("stays clean after load and turns dirty only after the operator edits", async () => {
    const onDirtyChange = vi.fn();
    render(
      <WorkOrderForm
        initialValues={values}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );

    // Let the mount-time effects (price sync, customer/location lookups) settle.
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(false));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);

    const description = document.getElementById("jobDescription") as HTMLElement;
    await userEvent.type(description, "x");
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByDisplayValue("Stampa vizitkartix")).toBeInTheDocument();
  });

  it("never reports dirty in read-only mode", async () => {
    const onDirtyChange = vi.fn();
    render(
      <WorkOrderForm
        initialValues={values}
        readOnly
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(false));
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });
});
