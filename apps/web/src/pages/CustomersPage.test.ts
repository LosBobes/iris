import { describe, expect, it } from "vitest";
import type { Customer, Location } from "@/types/work-order";
import {
  formatMandatoryFieldsMessage,
  getMissingCustomerFields,
  getMissingLocationFields,
} from "./CustomersPage";

const completeCustomer: Customer = {
  id: "cust-6",
  name: "Nova Firma",
  contactName: "Petar Petrovic",
  email: "petar@example.test",
  phone: "+381 11 600 600",
};

const completeLocation: Location = {
  id: "loc-6",
  customerId: "cust-6",
  name: "Centrala",
  address: "Bulevar umetnosti 1, Beograd",
};

describe("customer and location mandatory fields", () => {
  it("requires every visible customer field before saving", () => {
    expect(
      getMissingCustomerFields({
        ...completeCustomer,
        id: "",
        email: "   ",
        phone: null,
      }),
    ).toEqual(["ID", "Email", "Telefon"]);
  });

  it("accepts customer drafts with every visible field populated", () => {
    expect(getMissingCustomerFields(completeCustomer)).toEqual([]);
  });

  it("requires every visible location field before saving", () => {
    expect(
      getMissingLocationFields({
        ...completeLocation,
        customerId: "",
        name: " ",
        address: null,
      }),
    ).toEqual(["Klijent", "Naziv", "Adresa"]);
  });

  it("formats the mandatory field alert message", () => {
    expect(formatMandatoryFieldsMessage("lokaciju", ["Klijent", "Adresa"])).toBe(
      "Popunite sva obavezna polja za lokaciju: Klijent, Adresa.",
    );
  });
});
