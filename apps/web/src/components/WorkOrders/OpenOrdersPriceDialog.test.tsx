// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import "@/i18n";
import { sr } from "@/i18n/locales/sr";
import type { WorkOrder } from "@/types/work-order";
import { OpenOrdersPriceDialog } from "./OpenOrdersPriceDialog";

const strings = sr.workOrders.form.openOrdersPrice;

const order = {
  id: "wo-2",
  orderNumber: "2026-002",
  clientName: "Kupac",
  billingDocumentType: "invoice",
  invoiceDraft: {
    lineItems: [
      { id: "l1", kind: "service", description: "Baner", quantity: 2, unit: "m2", unitPrice: 1000, unitCost: null, catalogItemId: "c1" },
    ],
    paidAt: null,
  },
} as unknown as WorkOrder;

const change = {
  catalogItemId: "c1",
  name: "Baner",
  kind: "service" as const,
  previousSalePrice: 1000,
  salePrice: 1500,
  rate: 0.2,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OpenOrdersPriceDialog", () => {
  it("re-prices the open orders when the admin agrees", async () => {
    const updateWorkOrder = vi.fn().mockResolvedValue(order);
    vi.stubGlobal("api", { updateWorkOrder });
    const onDone = vi.fn();
    render(<OpenOrdersPriceDialog changes={[change]} orders={[order]} onDone={onDone} />);

    expect(screen.getByText(/2026-002/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: strings.confirm }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateWorkOrder).toHaveBeenCalledWith("wo-2", {
      invoiceDraft: expect.objectContaining({
        lineItems: [expect.objectContaining({ unitPrice: 1500 })],
      }),
      price: 3000,
    });
  });

  it("leaves the orders alone when the admin declines", async () => {
    const updateWorkOrder = vi.fn();
    vi.stubGlobal("api", { updateWorkOrder });
    const onDone = vi.fn();
    render(<OpenOrdersPriceDialog changes={[change]} orders={[order]} onDone={onDone} />);

    await userEvent.click(screen.getByRole("button", { name: strings.skip }));

    expect(onDone).toHaveBeenCalled();
    expect(updateWorkOrder).not.toHaveBeenCalled();
  });
});
