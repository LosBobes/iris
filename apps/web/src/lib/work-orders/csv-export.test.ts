import { describe, expect, it } from "vitest";
import { workOrdersToCsv } from "@/lib/work-orders/csv-export";
import type { WorkOrderColumnKey } from "@/lib/work-order-columns";
import type { WorkOrder } from "@/types/work-order";

function makeOrder(overrides: Partial<WorkOrder>): WorkOrder {
  return {
    id: "order-1",
    orderNumber: "RN-1",
    customerId: "c1",
    clientName: "Klijent",
    jobDescription: "Opis",
    billingDocumentType: "invoice",
    shipping: {
      deliveryMethod: "pickup",
      postagePaymentType: "prepaid",
      trackingNumber: null,
      shippingProvider: null,
      waitForPayment: false,
      hasPackaging: false,
      hasLabeling: false,
      isFragile: false,
      requiresSignature: false,
      hasInsurance: false,
      shippingAddress: null,
    },
    issuedBy: "ana",
    executedBy: null,
    assignment: { assignedTo: "ana", priority: "normal" },
    issueDate: "2026-06-01",
    dueDate: null,
    isCompleted: false,
    status: "assigned",
    price: null,
    note: null,
    createdAt: "2026-06-01T08:00:00Z",
    updatedAt: "2026-06-01T08:00:00Z",
    completionDate: null,
    statusHistory: [],
    internalNotes: [],
    customerNotes: [],
    events: [],
    attachments: [],
    materialUsage: [],
    timeEntries: [],
    invoiceDraft: { status: "none", invoiceNumber: null, lineItems: [], paidAt: null },
    communication: {
      publicToken: "token",
      notificationEmail: null,
      emailNotificationsEnabled: false,
      signedBy: null,
      signedAt: null,
    },
    ...overrides,
  };
}

describe("workOrdersToCsv", () => {
  it("emits only visible columns, in canonical order, with the header row", () => {
    const orders = [
      makeOrder({ orderNumber: "RN-1", clientName: "Acme", price: 67000 }),
    ];
    const visible = new Set<WorkOrderColumnKey>(["orderNumber", "price"]);

    const csv = workOrdersToCsv(orders, visible);
    const [header, row] = csv.split("\r\n");

    expect(header).toBe("Br. naloga,Cena");
    expect(row).toBe("RN-1,67000");
  });

  it("escapes values containing commas and quotes", () => {
    const orders = [
      makeOrder({ orderNumber: "RN-2", jobDescription: 'Plakat, A2 "veliki"' }),
    ];
    const visible = new Set<WorkOrderColumnKey>([
      "orderNumber",
      "jobDescription",
    ]);

    const csv = workOrdersToCsv(orders, visible);
    const row = csv.split("\r\n")[1];

    expect(row).toBe('RN-2,"Plakat, A2 ""veliki"""');
  });
});
