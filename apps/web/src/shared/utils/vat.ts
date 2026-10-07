import type { BillingDocumentType } from "@/types/work-order";

// PDV (Serbian VAT) types, keyed by the tax-rate label printed on fiscal
// receipts. A catalog item's `taxGroup` holds one of these codes; an empty or
// unrecognised value falls back to the general rate (opšta stopa).
export const VAT_TYPES = [
  { code: "Đ", rate: 0.2 },
  { code: "E", rate: 0.1 },
  { code: "A", rate: 0 },
] as const;

export type VatTypeCode = (typeof VAT_TYPES)[number]["code"];

export const DEFAULT_VAT_TYPE: VatTypeCode = "Đ";

export function isVatTypeCode(value: string | null | undefined): value is VatTypeCode {
  return VAT_TYPES.some((type) => type.code === value);
}

/** The rate (e.g. 0.2) for a catalog item's tax group. */
export function vatRateForTaxGroup(taxGroup: string | null | undefined): number {
  const code = isVatTypeCode(taxGroup) ? taxGroup : DEFAULT_VAT_TYPE;
  return VAT_TYPES.find((type) => type.code === code)!.rate;
}

/** True when the document type is charged with VAT included (otkup). Invoices
 * (faktura) and proformas (predračun) keep net prices — VAT is added on the
 * document itself. */
export function billingDocumentIncludesVat(
  type: BillingDocumentType | null | undefined,
): boolean {
  return type === "cashCollection";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addVat(netPrice: number, rate: number): number {
  return roundMoney(netPrice * (1 + rate));
}

export function removeVat(grossPrice: number, rate: number): number {
  return roundMoney(grossPrice / (1 + rate));
}

/** Re-prices a line when the order's document type switches between a net
 * (faktura/predračun) and a gross (otkup) basis; unchanged otherwise. */
export function repriceForBillingDocument(
  unitPrice: number,
  rate: number,
  from: BillingDocumentType | null | undefined,
  to: BillingDocumentType | null | undefined,
): number {
  const before = billingDocumentIncludesVat(from);
  const after = billingDocumentIncludesVat(to);
  if (before === after) return unitPrice;
  return after ? addVat(unitPrice, rate) : removeVat(unitPrice, rate);
}
