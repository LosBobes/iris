import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import WorkOrdersPage from "./WorkOrdersPage";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import type { WorkOrder } from "@/types/work-order";

const mockUseWorkOrders = vi.mocked(useWorkOrders);
const mockDeleteWorkOrder = vi.fn();
const mockRefreshOrders = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/useWorkOrders", () => ({
  useWorkOrders: vi.fn(),
}));

vi.mock("@/components/WorkOrders/WorkOrdersTable", () => ({
  WorkOrdersTable: ({
    orders,
    onDelete,
  }: {
    orders: WorkOrder[];
    onDelete: (order: WorkOrder) => void;
  }) => (
    <button type="button" onClick={() => onDelete(orders[0])}>
      Obrisi {orders[0].orderNumber}
    </button>
  ),
}));

vi.mock("@/components/WorkOrders/DeleteWorkOrderDialog", () => ({
  DeleteWorkOrderDialog: ({
    open,
    orderNumber,
    onConfirm,
  }: {
    open: boolean;
    orderNumber: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div>
        <p>Potvrda za {orderNumber}</p>
        <button type="button" onClick={onConfirm}>
          Potvrdi brisanje
        </button>
      </div>
    ) : null,
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

describe("WorkOrdersPage", () => {
  beforeEach(() => {
    mockDeleteWorkOrder.mockReset();
    mockRefreshOrders.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();

    mockUseWorkOrders.mockReturnValue({
      orders: [sampleOrder],
      totalFiltered: 1,
      allOrdersCount: 1,
      loading: false,
      error: null,
      filters: {
        search: "",
        status: "all",
        billingDocumentType: "all",
        deliveryMethod: "all",
        dateFrom: "",
        dateTo: "",
      },
      updateFilters: vi.fn(),
      resetFilters: vi.fn(),
      sortField: "issueDate",
      sortDirection: "desc",
      handleSort: vi.fn(),
      currentPage: 1,
      totalPages: 1,
      setCurrentPage: vi.fn(),
      pageSize: 10,
      setPageSize: vi.fn(),
      refreshOrders: mockRefreshOrders,
    });

    vi.stubGlobal("api", {
      deleteWorkOrder: mockDeleteWorkOrder,
    });
  });

  it("shows an error toast and keeps the dialog open when deleteWorkOrder returns success false", async () => {
    mockDeleteWorkOrder.mockResolvedValueOnce({
      success: false,
      message: "Radni nalog nije pronađen.",
    });

    render(
      <MemoryRouter initialEntries={["/work-orders"]}>
        <WorkOrdersPage />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /obrisi rn-2026-0001/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Potvrdi brisanje" }));

    await waitFor(() => {
      expect(mockDeleteWorkOrder).toHaveBeenCalledWith(sampleOrder.id);
      expect(toast.error).toHaveBeenCalledWith("Radni nalog nije pronađen.");
    });

    expect(mockRefreshOrders).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText("Potvrda za RN-2026-0001")).toBeInTheDocument();
  });
});
