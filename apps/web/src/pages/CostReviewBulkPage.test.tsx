// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import "@/i18n";
import { sr } from "@/i18n/locales/sr";
import type { WorkOrder } from "@/types/work-order";
import CostReviewBulkPage from "./CostReviewBulkPage";

const strings = sr.workOrders.costReview.bulk;

function order(id: string, description: string, unitPrice: number): WorkOrder {
  return {
    id,
    orderNumber: `2026-${id}`,
    clientName: "Kupac",
    invoiceDraft: {
      paidAt: null,
      lineItems: [
        { id: "l1", kind: "service", description, quantity: 2, unit: "kom", unitPrice, unitCost: null, catalogItemId: null },
      ],
    },
  } as unknown as WorkOrder;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CostReviewBulkPage", () => {
  it("backfills the same cost on same-named lines and saves every order", async () => {
    const orders = [order("1", "Montaža", 1000), order("2", "Montaža", 1500)];
    const updateWorkOrder = vi.fn().mockResolvedValue(orders[0]);
    const getWorkOrders = vi.fn().mockResolvedValue({ items: orders, total: 2 });
    vi.stubGlobal("api", { getWorkOrders, updateWorkOrder });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CostReviewBulkPage />
      </MemoryRouter>,
    );

    const first = await screen.findByRole("textbox", { name: /Trošak za Montaža na nalogu 2026-1/ });
    await user.type(first, "400");
    expect(screen.getByRole("textbox", { name: /na nalogu 2026-2/ })).toHaveValue("400");

    await user.click(screen.getByRole("button", { name: /Sačuvaj \(2 naloga\)/ }));

    await waitFor(() => expect(updateWorkOrder).toHaveBeenCalledTimes(2));
    expect(updateWorkOrder).toHaveBeenCalledWith("1", {
      invoiceDraft: expect.objectContaining({
        lineItems: [expect.objectContaining({ unitCost: 400 })],
      }),
    });
    expect(getWorkOrders).toHaveBeenCalledWith(expect.objectContaining({ needsCostReview: true }));
    expect(strings.title).toBeTruthy();
  });
});
