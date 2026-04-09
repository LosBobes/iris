import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import WorkOrderEditPage from "./WorkOrderEditPage";
import type { WorkOrder } from "@/types/work-order";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";
import { AuthContext } from "@/contexts/AuthContext";

const mockGetWorkOrderById = vi.fn();
const mockUpdateWorkOrder = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

const mockFormValues: WorkOrderFormValues = {
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
  price: null,
  note: null,
  issueDate: "2026-04-07",
  dueDate: null,
  executedBy: null,
};

vi.mock("@/components/WorkOrders/WorkOrderForm", () => ({
  WorkOrderForm: ({
    onSubmit,
  }: {
    onSubmit: (values: WorkOrderFormValues) => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onSubmit(mockFormValues)}>
      Sačuvaj izmene
    </button>
  ),
}));

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
  price: null,
  note: null,
  createdAt: "2026-04-07T08:00:00Z",
  updatedAt: "2026-04-07T08:00:00Z",
  completionDate: null,
};

function renderPage(): void {
  render(
    <AuthContext.Provider
      value={{ currentUser: { id: '1', username: 'admin', role: 'admin' }, onLogout: vi.fn() }}
    >
      <MemoryRouter initialEntries={["/work-orders/order-1/edit"]}>
        <Routes>
          <Route path="/work-orders" element={<div>Lista naloga</div>} />
          <Route path="/work-orders/:id/edit" element={<WorkOrderEditPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("WorkOrderEditPage", () => {
  beforeEach(() => {
    mockGetWorkOrderById.mockReset();
    mockUpdateWorkOrder.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();

    mockGetWorkOrderById.mockResolvedValue(sampleOrder);

    vi.stubGlobal("api", {
      getWorkOrderById: mockGetWorkOrderById,
      updateWorkOrder: mockUpdateWorkOrder,
    });
  });

  it("shows an error toast and stays on the page when saving returns null", async () => {
    mockUpdateWorkOrder.mockResolvedValueOnce(null);

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Sačuvaj izmene" }),
    );

    await waitFor(() => {
      expect(mockUpdateWorkOrder).toHaveBeenCalledWith(
        sampleOrder.id,
        mockFormValues,
      );
      expect(toast.error).toHaveBeenCalledWith("Radni nalog nije pronađen.");
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(
      screen.getByText(`Izmena naloga ${sampleOrder.orderNumber}`),
    ).toBeInTheDocument();
  });

  it("shows an error toast and keeps the current state when status toggle returns null", async () => {
    mockUpdateWorkOrder.mockResolvedValueOnce(null);

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Označi kao završeno" }),
    );

    await waitFor(() => {
      expect(mockUpdateWorkOrder).toHaveBeenCalledWith(
        sampleOrder.id,
        expect.objectContaining({
          status: "completed",
          isCompleted: true,
          completionDate: expect.any(String),
        }),
      );
      expect(toast.error).toHaveBeenCalledWith("Radni nalog nije pronađen.");
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Označi kao završeno" }),
    ).toBeInTheDocument();
  });
});
