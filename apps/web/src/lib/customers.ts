import i18n from "@/i18n";
import { isValidMb, isValidPib } from "@/lib/serbian-id";
import type {
  Customer,
  CustomerContact,
  CustomerEmail,
  Location,
} from "@/types/work-order";

export const emptyCustomer: Customer = {
  id: "",
  name: "",
  contactName: null,
  email: null,
  phone: null,
  pib: null,
  mb: null,
  emails: [],
  contacts: [],
};

export function emptyLocation(customerId: string): Location {
  return { id: "", customerId, name: "", address: null };
}

// Editor rows carry a client-side id; the server replaces blank ids on save.
export function emptyCustomerEmail(): CustomerEmail {
  return { id: slugId("cem", Math.random().toString(36).slice(2)), email: "", label: null, sortOrder: 0 };
}

export function emptyCustomerContact(): CustomerContact {
  return {
    id: slugId("cct", Math.random().toString(36).slice(2)),
    name: "",
    email: null,
    phone: null,
    role: null,
    sortOrder: 0,
  };
}

/**
 * Normalizes the customer's email/contact collections for saving: trims values,
 * drops empty rows (no email / no contact name), and reassigns sortOrder from
 * the current array order.
 */
export function normalizeCustomerCollections(customer: Customer): Customer {
  const emails = customer.emails
    .map((email) => ({ ...email, email: email.email.trim(), label: blankToNull(email.label) }))
    .filter((email) => email.email !== "")
    .map((email, sortOrder) => ({ ...email, sortOrder }));
  const contacts = customer.contacts
    .map((contact) => ({
      ...contact,
      name: contact.name.trim(),
      email: blankToNull(contact.email),
      phone: blankToNull(contact.phone),
      role: blankToNull(contact.role),
    }))
    .filter((contact) => contact.name !== "")
    .map((contact, sortOrder) => ({ ...contact, sortOrder }));
  // Keep the legacy single fields in sync with the first entry so consumers that
  // still read them (work-order notification email, list summaries) keep working.
  return {
    ...customer,
    emails,
    contacts,
    email: emails[0]?.email ?? null,
    contactName: contacts[0]?.name ?? null,
    phone: contacts[0]?.phone ?? null,
  };
}

/**
 * Validates a customer's Serbian identifiers. PIB and MB are required when
 * creating a new firm; for existing records they are optional, but any value
 * present must be well-formed. Returns a Serbian error message or null.
 */
export function validateCustomerIdentifiers(
  customer: Customer,
  isNew: boolean,
): string | null {
  const pib = (customer.pib ?? "").trim();
  const mb = (customer.mb ?? "").trim();
  if (isNew && pib === "") return i18n.t("customerDetail.pibRequired");
  if (isNew && mb === "") return i18n.t("customerDetail.mbRequired");
  if (pib !== "" && !isValidPib(pib)) return i18n.t("customerDetail.pibError");
  if (mb !== "" && !isValidMb(mb)) return i18n.t("customerDetail.mbError");
  return null;
}

export function getMissingLocationFields(location: Location): string[] {
  const missing: string[] = [];
  if (!location.name.trim()) missing.push(i18n.t("customerDetail.fieldNameShort"));
  return missing;
}

export function removeLocation(locations: Location[], id: string): Location[] {
  return locations.filter((location) => location.id !== id);
}

export function blankToNull(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  return value;
}

export function slugId(prefix: string, value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${slug || Date.now().toString(36)}`;
}

export function formatActionError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}.`;
}
