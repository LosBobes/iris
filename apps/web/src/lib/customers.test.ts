import { describe, expect, it } from "vitest";
import {
  getMissingLocationFields,
  nextLocationId,
  removeLocation,
  slugId,
  validateCustomerIdentifiers,
} from "@/lib/customers";
import type { Customer, Location } from "@/types/work-order";

const validCustomer: Customer = {
  id: "cust-1",
  name: "Validna Firma",
  contactName: "Petar",
  email: null,
  phone: null,
  pib: "100197914",
  mb: "53671888",
};

describe("validateCustomerIdentifiers", () => {
  it("requires PIB and MB for new firms", () => {
    expect(
      validateCustomerIdentifiers({ ...validCustomer, pib: null, mb: null }, true),
    ).toBe("PIB je obavezan za nove firme.");
    expect(
      validateCustomerIdentifiers({ ...validCustomer, mb: null }, true),
    ).toBe("Matični broj je obavezan za nove firme.");
  });

  it("allows existing firms without identifiers", () => {
    expect(
      validateCustomerIdentifiers({ ...validCustomer, pib: null, mb: null }, false),
    ).toBeNull();
  });

  it("rejects malformed identifiers even on existing firms", () => {
    expect(validateCustomerIdentifiers({ ...validCustomer, pib: "123456789" }, false)).toContain(
      "PIB",
    );
    expect(validateCustomerIdentifiers({ ...validCustomer, mb: "123" }, false)).toContain(
      "Matični broj",
    );
  });

  it("accepts valid identifiers for a new firm", () => {
    expect(validateCustomerIdentifiers(validCustomer, true)).toBeNull();
  });
});

describe("getMissingLocationFields", () => {
  const base: Location = { id: "loc-1", customerId: "cust-1", name: "Centrala", address: null };

  it("returns no missing fields when the name is present", () => {
    expect(getMissingLocationFields(base)).toEqual([]);
  });

  it("flags a blank name", () => {
    expect(getMissingLocationFields({ ...base, name: "  " })).toEqual(["Naziv"]);
  });
});

describe("nextLocationId", () => {
  const existing: Location[] = [
    { id: "loc-centrala", customerId: "cust-1", name: "Centrala", address: null },
  ];

  it("derives the id from the location name", () => {
    expect(nextLocationId(existing, "Magacin")).toBe("loc-magacin");
  });

  it("suffixes ids that are already taken by an unsaved sibling", () => {
    expect(nextLocationId(existing, "Centrala")).toBe("loc-centrala-2");
    expect(
      nextLocationId(
        [...existing, { id: "loc-centrala-2", customerId: "cust-1", name: "Centrala", address: null }],
        "Centrala",
      ),
    ).toBe("loc-centrala-3");
  });
});

describe("removeLocation", () => {
  it("removes the matching location", () => {
    const locations: Location[] = [
      { id: "loc-1", customerId: "c", name: "A", address: null },
      { id: "loc-2", customerId: "c", name: "B", address: null },
    ];
    expect(removeLocation(locations, "loc-1")).toEqual([locations[1]]);
  });
});

describe("slugId", () => {
  it("builds a prefixed slug from a name", () => {
    expect(slugId("cust", "Štampa Doo")).toMatch(/^cust-/);
    expect(slugId("loc", "Main Office")).toBe("loc-main-office");
  });
});
