import { describe, expect, it } from "vitest";
import {
  getInvoiceUnitOptions,
  getFirstWorkOrderFormErrorTarget,
  normalizeWorkOrderFormDefaultValues,
  resolveShippingAddress,
} from "./WorkOrderForm";
import {
  workOrderFormSchema,
  type WorkOrderFormValues,
} from "@/lib/work-orders/validation";
import type { FieldErrors } from "react-hook-form";

const duplicateValues: WorkOrderFormValues = {
  customerId: "cust-1",
  locationId: "loc-1",
  clientName: "Firma Doo",
  contactPerson: null,
  jobDescription: "Stampa vizitkarti 500 kom",
  jobDetails: null,
  billingDocumentType: "invoice",
  billingDocumentNumber: null,
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
  assignment: {
    assignedTo: null,
    priority: "normal",
    scheduledDate: null,
  },
  price: 12000,
  note: null,
  issueDate: "2026-05-31",
  dueDate: null,
  executedBy: null,
  internalNotes: [],
  customerNotes: [],
  attachments: [],
  materialUsage: [],
  timeEntries: [],
  invoiceDraft: {
    status: "draft",
    invoiceNumber: null,
    lineItems: [],
    paidAt: null,
  },
  communication: {
    publicToken: "",
    notificationEmail: null,
    emailNotificationsEnabled: false,
    signedBy: null,
    signedAt: null,
  },
};

describe("getFirstWorkOrderFormErrorTarget", () => {
  it("maps nested shipping address errors to the rendered input id", () => {
    const errors = {
      shipping: {
        shippingAddress: {
          type: "custom",
          message: "Adresa za dostavu je obavezna kada je izabran način dostave",
        },
      },
    } as FieldErrors<WorkOrderFormValues>;

    expect(getFirstWorkOrderFormErrorTarget(errors)).toBe("shippingAddress");
  });

  it("returns the direct field path for top-level fields", () => {
    const errors = {
      clientName: {
        type: "too_small",
        message: "Naziv klijenta je obavezan",
      },
    } as FieldErrors<WorkOrderFormValues>;

    expect(getFirstWorkOrderFormErrorTarget(errors)).toBe("clientName");
  });

  it("maps hidden note metadata errors to the visible note textarea", () => {
    const errors = {
      internalNotes: [
        {
          id: {
            type: "invalid_type",
            message: "Required",
          },
        },
      ],
    } as FieldErrors<WorkOrderFormValues>;

    expect(getFirstWorkOrderFormErrorTarget(errors)).toBe("internalNotes.0.body");
  });
});

describe("normalizeWorkOrderFormDefaultValues", () => {
  it("adds valid draft note rows when duplicated orders start with empty notes", () => {
    const normalized = normalizeWorkOrderFormDefaultValues(duplicateValues);

    expect(normalized.internalNotes[0]).toMatchObject({
      visibility: "internal",
      author: "admin",
      body: "",
    });
    expect(normalized.customerNotes[0]).toMatchObject({
      visibility: "customer",
      author: "admin",
      body: "",
    });
    expect(workOrderFormSchema.safeParse(normalized).success).toBe(true);
  });

  it("adds default service units to legacy invoice lines", () => {
    const normalized = normalizeWorkOrderFormDefaultValues({
      ...duplicateValues,
      invoiceDraft: {
        status: "draft",
        invoiceNumber: null,
        lineItems: [
          {
            id: "line-1",
            description: "Stampa",
            quantity: 1,
            unitPrice: 12000,
          },
        ],
        paidAt: null,
      },
    } as unknown as WorkOrderFormValues);

    expect(normalized.invoiceDraft.lineItems[0]).toMatchObject({
      kind: "service",
      unit: "kom",
    });
    expect(workOrderFormSchema.safeParse(normalized).success).toBe(true);
  });
});

describe("getInvoiceUnitOptions", () => {
  it("allows kom, m2, and set for services", () => {
    expect(getInvoiceUnitOptions("service")).toEqual(["kom", "m2", "set"]);
  });

  it("allows only kom and m2 for goods", () => {
    expect(getInvoiceUnitOptions("goods")).toEqual(["kom", "m2"]);
  });

  it("rejects set for goods in form validation", () => {
    const result = workOrderFormSchema.safeParse({
      ...duplicateValues,
      invoiceDraft: {
        status: "draft",
        invoiceNumber: null,
        lineItems: [
          {
            id: "line-1",
            kind: "goods",
            description: "Materijal",
            quantity: 1,
            unit: "set",
            unitPrice: 1000,
          },
        ],
        paidAt: null,
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("resolveShippingAddress", () => {
  const locations = [
    {
      id: "loc-1",
      customerId: "cust-1",
      name: "Agencija",
      address: "Kralja Petra 8, Nis",
    },
  ];

  it("uses the selected location address for delivery methods that require shipping", () => {
    expect(resolveShippingAddress(null, "postExpress", "loc-1", locations)).toBe(
      "Kralja Petra 8, Nis",
    );
  });

  it("preserves an explicitly entered shipping address", () => {
    expect(
      resolveShippingAddress(
        "Druga adresa 4, Beograd",
        "postExpress",
        "loc-1",
        locations,
      ),
    ).toBe("Druga adresa 4, Beograd");
  });
});
