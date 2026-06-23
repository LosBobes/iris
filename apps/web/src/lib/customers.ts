import { isValidMb, isValidPib, MB_ERROR, PIB_ERROR } from "@/lib/serbian-id";
import type { Customer, Location } from "@/types/work-order";

export const emptyCustomer: Customer = {
  id: "",
  name: "",
  contactName: null,
  email: null,
  phone: null,
  pib: null,
  mb: null,
};

export function emptyLocation(customerId: string): Location {
  return { id: "", customerId, name: "", address: null };
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
  if (isNew && pib === "") return "PIB je obavezan za nove firme.";
  if (isNew && mb === "") return "Matični broj je obavezan za nove firme.";
  if (pib !== "" && !isValidPib(pib)) return PIB_ERROR;
  if (mb !== "" && !isValidMb(mb)) return MB_ERROR;
  return null;
}

export function getMissingLocationFields(location: Location): string[] {
  const missing: string[] = [];
  if (!location.name.trim()) missing.push("Naziv");
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
