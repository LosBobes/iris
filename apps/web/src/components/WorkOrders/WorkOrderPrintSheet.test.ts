import { describe, expect, it } from "vitest";
import type { WorkOrder } from "@/types/work-order";
import {
  buildPrintJobLines,
  getPrintBillingRows,
  getPrintDeliveryRows,
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

  it("builds large printable job lines from structured details and price", () => {
    expect(
      buildPrintJobLines({
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
      "CENA: 1.450 DINARA",
    ]);
  });

  it("falls back to the order description when structured details are absent", () => {
    expect(buildPrintJobLines(baseOrder)).toEqual([
      "VIZIT KARTE",
      "CENA: 1.450 DINARA",
    ]);
  });

  it("falls back to the order description when structured details are empty", () => {
    expect(
      buildPrintJobLines({
        ...baseOrder,
        jobDetails: {
          productCode: null,
          paperWeightGsm: null,
          dimensions: null,
          quantity: null,
          finishingNote: null,
        },
      }),
    ).toEqual(["VIZIT KARTE", "CENA: 1.450 DINARA"]);
  });

  it("uses the selected location address when shipping address is missing", () => {
    expect(
      resolvePrintShippingAddress(
        {
          ...baseOrder,
          locationId: "loc-3",
          shipping: { ...baseShipping, shippingAddress: null },
        },
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
  });
});
