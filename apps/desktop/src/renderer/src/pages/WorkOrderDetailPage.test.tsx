import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WorkOrderDetailPage from "./WorkOrderDetailPage";
import type { WorkOrder } from "@/types/work-order";
import { AuthContext } from "@/contexts/AuthContext";

const mockGetWorkOrderById = vi.fn();

const sampleOrder: WorkOrder = {
  id: "order-1",
  orderNumber: "RN-2026-0001",
  clientName: "Demo Klijent",
  contactPerson: null,
  jobDescription: "Stampa flajera",
  jobDetails: null,
  billingDocumentType: null,
  billingDocumentNumber: null,
  shipping: {
    deliveryMethod: null,
    hasPackaging: false,
    hasLabeling: false,
    isFragile: false,
    requiresSignature: false,
    hasInsurance: false,
    shippingAddress: null,
  },
  issuedBy: "admin",
  executedBy: null,
  issueDate: "2026-04-07",
  dueDate: null,
  isCompleted: false,
  status: "active",
  price: 12000,
  note: "Napomena za nalog",
  createdAt: "2026-04-07T08:00:00Z",
  updatedAt: "2026-04-07T08:00:00Z",
  completionDate: null,
};

function renderPage(
  initialEntry = "/work-orders/order-1",
  routePath = "/work-orders/:id",
): void {
  render(
    <AuthContext.Provider
      value={{
        currentUser: { id: "1", username: "admin", role: "admin" },
        onLogout: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/work-orders" element={<div>Lista naloga</div>} />
          <Route path={routePath} element={<WorkOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("WorkOrderDetailPage", () => {
  beforeEach(() => {
    mockGetWorkOrderById.mockReset();
    vi.stubGlobal("api", {
      getWorkOrderById: mockGetWorkOrderById,
    });
    vi.stubGlobal("print", vi.fn());
  });

  it("shows the loading state and then renders work order details", async () => {
    mockGetWorkOrderById.mockResolvedValueOnce(sampleOrder);

    renderPage();

    expect(screen.getByText("Učitavanje naloga...")).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "Izmeni" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(sampleOrder.orderNumber)).toHaveLength(2);
    expect(screen.getByText(sampleOrder.clientName)).toBeInTheDocument();

    expect(mockGetWorkOrderById).toHaveBeenCalledWith(sampleOrder.id);
  });

  it("shows a not-found message when the work order does not exist", async () => {
    mockGetWorkOrderById.mockResolvedValueOnce(null);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Radni nalog nije pronađen")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: "Izmeni" }),
    ).not.toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    mockGetWorkOrderById.mockRejectedValueOnce(new Error("boom"));

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Greška pri učitavanju radnog naloga"),
      ).toBeInTheDocument();
    });
  });

  it("shows a not-found message when the route parameter is missing", async () => {
    renderPage("/", "/");

    await waitFor(() => {
      expect(screen.getByText("Radni nalog nije pronađen")).toBeInTheDocument();
    });

    expect(mockGetWorkOrderById).not.toHaveBeenCalled();
  });
});
