// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { WorkOrderCard } from "./WorkOrderCard";
import "@/i18n";
import type { WorkOrder } from "@/types/work-order";

function makeOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "42",
    orderNumber: "RN-2026-00042",
    clientName: "Agencija Pro",
    jobDescription: "Zidni kalendari A3",
    status: "new",
    isCompleted: false,
    dueDate: "2026-03-15",
    assignment: { assignedTo: "ana.jovic", priority: "normal" },
    ...overrides,
  } as WorkOrder;
}

function LocationProbe(): React.JSX.Element {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderCard(
  order: WorkOrder,
  onToggleStatus = vi.fn(),
  today = "2026-03-01",
) {
  render(
    <MemoryRouter initialEntries={["/work-orders"]}>
      <Routes>
        <Route
          path="/work-orders"
          element={
            <>
              <ul>
                <WorkOrderCard
                  order={order}
                  onToggleStatus={onToggleStatus}
                  today={today}
                />
              </ul>
              <LocationProbe />
            </>
          }
        />
        <Route path="/work-orders/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return onToggleStatus;
}

afterEach(cleanup);

describe("WorkOrderCard", () => {
  it("renders the order fields", () => {
    renderCard(makeOrder());
    expect(screen.getByText("RN-2026-00042")).toBeInTheDocument();
    expect(screen.getByText("Agencija Pro")).toBeInTheDocument();
    expect(screen.getByText("Zidni kalendari A3")).toBeInTheDocument();
    expect(screen.getByText("15.03.2026")).toBeInTheDocument();
    expect(screen.getByText("ana.jovic")).toBeInTheDocument();
    expect(screen.getByText("Nov")).toBeInTheDocument();
  });

  it("links the card to the detail page", async () => {
    renderCard(makeOrder());
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/work-orders/42");
    await userEvent.click(link);
    expect(screen.getByTestId("location")).toHaveTextContent("/work-orders/42");
  });

  it("emphasizes overdue due dates", () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <WorkOrderCard
            order={makeOrder({ dueDate: "2026-02-01" })}
            onToggleStatus={vi.fn()}
            today="2026-03-01"
          />
        </ul>
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-overdue='true']")).not.toBeNull();
    expect(screen.getByText("Kasni")).toBeInTheDocument();
  });

  it("does not flag a completed order as overdue", () => {
    renderCard(
      makeOrder({ dueDate: "2026-02-01", isCompleted: true, status: "completed" }),
    );
    expect(screen.queryByText("Kasni")).toBeNull();
  });

  it("shows a labelled status button that calls the handler without navigating", async () => {
    const order = makeOrder();
    const onToggleStatus = renderCard(order);
    const button = screen.getByRole("button", { name: /Promeni u Dodeljen/ });
    expect(button).toHaveTextContent("Promeni u Dodeljen");
    await userEvent.click(button);
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
    expect(onToggleStatus).toHaveBeenCalledWith(order);
    expect(screen.getByTestId("location")).toHaveTextContent("/work-orders");
    expect(screen.getByTestId("location")).not.toHaveTextContent("/work-orders/42");
  });

  it("hides the status button when no transition exists", () => {
    renderCard(makeOrder({ status: "cancelled" }));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
