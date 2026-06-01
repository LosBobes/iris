import { describe, expect, it } from "vitest";
import type { Customer, Location } from "@/types/work-order";
import {
  formatMandatoryFieldsMessage,
  getMissingCustomerFields,
  getMissingLocationFields,
  removeDeletedCustomer,
  removeDeletedLocation,
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
  it("lets customer ID stay empty so save can auto-generate it", () => {
    expect(
      getMissingCustomerFields({
        ...completeCustomer,
        id: "",
        email: "   ",
        phone: null,
      }),
    ).toEqual(["Email", "Telefon"]);
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

describe("customer and location deletion state", () => {
  const customers: Customer[] = [
    completeCustomer,
    {
      id: "cust-7",
      name: "Druga Firma",
      contactName: "Milica Milic",
      email: "milica@example.test",
      phone: "+381 11 700 700",
    },
  ];

  const locations: Location[] = [
    completeLocation,
    {
      id: "loc-7",
      customerId: "cust-7",
      name: "Magacin",
      address: "Industrijska 7, Novi Sad",
    },
  ];

  it("removes a deleted location from the visible list", () => {
    expect(removeDeletedLocation(locations, "loc-6")).toEqual([locations[1]]);
  });

  it("removes a deleted customer and its locations from visible lists", () => {
    expect(removeDeletedCustomer(customers, locations, "cust-6")).toEqual({
      customers: [customers[1]],
      locations: [locations[1]],
    });
  });
});
