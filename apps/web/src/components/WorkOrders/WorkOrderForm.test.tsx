import { describe, expect, it } from "vitest";
import {
  getFirstWorkOrderFormErrorTarget,
  resolveShippingAddress,
} from "./WorkOrderForm";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";
import type { FieldErrors } from "react-hook-form";

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
