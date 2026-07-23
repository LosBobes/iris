import { describe, expect, it } from "vitest";
import type { WorkOrder } from "@/types/work-order";
import {
  buildPrintDescriptionLines,
  buildPrintItemRows,
  getPrintBillingRows,
  getPrintDeliveryRows,
  resolveBillingDocumentType,
  resolvePrintClientAddress,
  resolvePrintShippingAddress,
} from "./WorkOrderPrintSheet";

const baseShipping: WorkOrder["shipping"] = {
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
};

const baseOrder: WorkOrder = {
  id: "rn-1",
  orderNumber: "RN-2026-00001",
  customerId: null,
  locationId: null,
  clientName: "Profesionalni Upravnik",
  contactPerson: "Milos Damjanovic",
  jobDescription: "Vizit karte",
  jobDetails: null,
  billingDocumentType: "invoice",
  billingDocumentNumber: null,
  shipping: baseShipping,
  issuedBy: "mihajlo",
  executedBy: null,
  assignment: {
    assignedTo: null,
    priority: "normal",
  },
  issueDate: "2026-03-19",
  dueDate: "2026-03-25",
  isCompleted: false,
  status: "new",
  price: 1450,
  note: null,
  createdAt: "2026-03-19T08:00:00Z",
  updatedAt: "2026-03-19T08:00:00Z",
  completionDate: null,
  statusHistory: [],
  internalNotes: [],
  customerNotes: [],
  events: [],
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
    publicToken: "tok-rn-1",
    notificationEmail: null,
    emailNotificationsEnabled: false,
    signedBy: null,
    signedAt: null,
  },
};

describe("WorkOrderPrintSheet helpers", () => {
  it("marks the selected delivery row while keeping all paper checklist rows", () => {
    expect(getPrintDeliveryRows(baseShipping)).toEqual([
      { label: "VOZI SE", checked: false },
      { label: "LIČNO", checked: true },
      { label: "POST EXPRES", checked: false },
      { label: "CITY EXPRES", checked: false },
      { label: "POŠTARINA POUZEĆEM", checked: false },
      { label: "POŠTARINA NA NAŠ RAČUN", checked: false },
      { label: "AVANS POŠTARINA", checked: false },
      { label: "POŠTARINA SE NAPLAĆUJE PREKO FAKTURE", checked: false },
      { label: "ČEKA SE UPLATA", checked: false },
      { label: "IZLAZAK NA TEREN", checked: false },
    ]);
  });

  it("maps postage and wait-for-payment options to print rows", () => {
    expect(
      getPrintDeliveryRows({
        ...baseShipping,
        deliveryMethod: "postExpress",
        drivesOut: true,
        postagePaymentType: "cod",
        waitForPayment: true,
      }),
    ).toEqual([
      { label: "VOZI SE", checked: true },
      { label: "LIČNO", checked: false },
      { label: "POST EXPRES", checked: true },
      { label: "CITY EXPRES", checked: false },
      { label: "POŠTARINA POUZEĆEM", checked: true },
      { label: "POŠTARINA NA NAŠ RAČUN", checked: false },
      { label: "AVANS POŠTARINA", checked: false },
      { label: "POŠTARINA SE NAPLAĆUJE PREKO FAKTURE", checked: false },
      { label: "ČEKA SE UPLATA", checked: true },
      { label: "IZLAZAK NA TEREN", checked: false },
    ]);
  });

  it("maps billing document types to black-and-white document marks", () => {
    expect(getPrintBillingRows("invoice")).toEqual([
      { label: "FAKTURA", checked: true },
      { label: "OTKUP", checked: false },
      { label: "PROFAKTURA", checked: false },
    ]);

    expect(getPrintBillingRows("proforma")[2]).toEqual({
      label: "PROFAKTURA",
      checked: true,
    });
  });

  it("resolves the effective document type from the shop's billing defaults", () => {
    const overridable = { documentType: "proforma", allowOverride: true } as const;
    // Override allowed: the order's own choice wins, including "no type".
    expect(
      resolveBillingDocumentType(
        { ...baseOrder, billingDocumentType: "invoice" },
        overridable,
      ),
    ).toBe("invoice");
    expect(
      resolveBillingDocumentType(
        { ...baseOrder, billingDocumentType: null },
        overridable,
      ),
    ).toBeNull();

    // Override disabled: the shop default is authoritative even when the order
    // stored a different type or none at all (e.g. legacy/imported orders).
    const locked = { documentType: "invoice", allowOverride: false } as const;
    expect(
      resolveBillingDocumentType(
        { ...baseOrder, billingDocumentType: "proforma" },
        locked,
      ),
    ).toBe("invoice");
    expect(
      resolveBillingDocumentType(
        { ...baseOrder, billingDocumentType: null },
        locked,
      ),
    ).toBe("invoice");
  });

  it("builds large printable description lines from structured details", () => {
    expect(
      buildPrintDescriptionLines({
        ...baseOrder,
        jobDetails: {
          productCode: "VK",
          paperWeightGsm: 350,
          dimensions: "9x5",
          quantity: 200,
          finishingNote: "Samo se seče",
        },
      }),
    ).toEqual([
      "VK",
      "350G",
      "9X5",
      "200KOM",
      "SAMO SE SEČE",
    ]);
  });

  it("falls back to the order description when structured details are absent", () => {
    // Line items (stavke) live in their own panel via buildPrintItemLines.
    expect(buildPrintDescriptionLines(baseOrder)).toEqual(["VIZIT KARTE"]);
  });

  it("falls back to the order description when structured details are empty", () => {
    expect(
      buildPrintDescriptionLines({
        ...baseOrder,
        jobDetails: {
          productCode: null,
          paperWeightGsm: null,
          dimensions: null,
          quantity: null,
          finishingNote: null,
        },
      }),
    ).toEqual(["VIZIT KARTE"]);
  });

  it("builds table rows with name, unit price, quantity, and line total columns", () => {
    expect(
      buildPrintItemRows({
        ...baseOrder,
        invoiceDraft: {
          ...baseOrder.invoiceDraft,
          lineItems: [
            {
              id: "l1",
              kind: "goods",
              description: "Plakati A2",
              quantity: 100,
              unit: "kom",
              unitPrice: 150,
              unitCost: null,
              catalogItemId: null,
            },
            {
              id: "l2",
              kind: "service",
              description: "Kaširanje",
              quantity: 100,
              unit: "kom",
              unitPrice: 0,
              unitCost: null,
              catalogItemId: null,
            },
          ],
        },
      }),
    ).toEqual([
      { name: "PLAKATI A2", unitPrice: "150", quantity: "100 KOM", total: "15.000" },
      // Zero-priced line (or a money-stripped operator copy): price/total blank.
      { name: "KAŠIRANJE", unitPrice: "", quantity: "100 KOM", total: "" },
    ]);
  });

  it("returns no item rows when the order has no line items", () => {
    // The description panel handles the job text; the items panel is empty here.
    expect(buildPrintItemRows(baseOrder)).toEqual([]);
  });

  it("blanks the price and total columns on the operator (money-hidden) printout", () => {
    expect(
      buildPrintItemRows(
        {
          ...baseOrder,
          invoiceDraft: {
            ...baseOrder.invoiceDraft,
            lineItems: [
              {
                id: "l1",
                kind: "goods",
                description: "Plakati A2",
                quantity: 100,
                unit: "kom",
                unitPrice: 150,
                unitCost: null,
                catalogItemId: null,
              },
            ],
          },
        },
        false,
      ),
    ).toEqual([
      { name: "PLAKATI A2", unitPrice: "", quantity: "100 KOM", total: "" },
    ]);
  });

  it("prints only the explicit delivery address, never the client location", () => {
    // Missing delivery address does not fall back to the client's location: the
    // location address is shown at the top of the nalog instead.
    expect(
      resolvePrintShippingAddress({
        ...baseOrder,
        locationId: "loc-3",
        shipping: { ...baseShipping, shippingAddress: null },
      }),
    ).toBeNull();

    expect(
      resolvePrintShippingAddress({
        ...baseOrder,
        shipping: { ...baseShipping, shippingAddress: "Druga adresa 4, Beograd" },
      }),
    ).toBe("DRUGA ADRESA 4, BEOGRAD");
  });

  it("resolves the client's location address for the top-of-nalog subscript", () => {
    expect(
      resolvePrintClientAddress(
        { ...baseOrder, locationId: "loc-3" },
        [
          {
            id: "loc-3",
            customerId: "cust-3",
            name: "Studio",
            address: "Kneza Milosa 22, Beograd",
          },
        ],
      ),
    ).toBe("KNEZA MILOSA 22, BEOGRAD");

    // No location selected → no client address to print.
    expect(resolvePrintClientAddress(baseOrder, [])).toBeNull();
  });
});
