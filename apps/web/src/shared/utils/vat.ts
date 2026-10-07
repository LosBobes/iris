import type { BillingDocumentType } from "@/types/work-order";

// PDV (Serbian VAT) types, keyed by the tax-rate label printed on fiscal
// receipts (DJ is the ASCII spelling of Đ). A catalog item's `taxGroup` holds
// one of these codes; an empty or unrecognised value falls back to the general
// rate (opšta stopa).
export const VAT_TYPES = [
  { code: "DJ", rate: 0.2 },
  { code: "E", rate: 0.1 },
  { code: "A", rate: 0 },
] as const;

export type VatTypeCode = (typeof VAT_TYPES)[number]["code"];

export const DEFAULT_VAT_TYPE: VatTypeCode = "DJ";

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

/** PDV contained in (otkup) or added to (faktura/predračun) one line's amount. */
export function lineVatAmount(amount: number, rate: number, pricesIncludeVat: boolean): number {
  return pricesIncludeVat
    ? roundMoney(amount - amount / (1 + rate))
    : roundMoney(amount * rate);
}

export interface VatLine {
  quantity: number;
  unitPrice: number;
  /** PDV rate for the line, e.g. 0.2. */
  rate: number;
}

export interface VatBreakdown {
  /** Osnovica: the total without PDV. */
  base: number;
  /** PDV per rate, highest rate first; 0% rates are omitted. */
  vatByRate: { rate: number; amount: number }[];
  /** Total PDV across all rates. */
  vat: number;
  /** Osnovica + PDV: what the customer pays. */
  total: number;
}

/**
 * Splits an order into osnovica and PDV. Lines are grouped by rate and each
 * group is rounded once, as on an invoice. `pricesIncludeVat` is true for otkup
 * (prices are gross, so PDV is taken out) and false for faktura/predračun
 * (prices are net, so PDV is added on top).
 */
export function computeVatBreakdown(
  lines: VatLine[],
  pricesIncludeVat: boolean,
): VatBreakdown {
  const sumByRate = new Map<number, number>();
  for (const line of lines) {
    const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    sumByRate.set(line.rate, (sumByRate.get(line.rate) ?? 0) + amount);
  }

  let base = 0;
  let vat = 0;
  const vatByRate: { rate: number; amount: number }[] = [];
  for (const [rate, sum] of [...sumByRate.entries()].sort((a, b) => b[0] - a[0])) {
    const rateBase = pricesIncludeVat ? roundMoney(sum / (1 + rate)) : roundMoney(sum);
    const rateVat = pricesIncludeVat
      ? roundMoney(sum - rateBase)
      : roundMoney(rateBase * rate);
    base += rateBase;
    vat += rateVat;
    if (rate > 0) vatByRate.push({ rate, amount: rateVat });
  }

  base = roundMoney(base);
  vat = roundMoney(vat);
  return { base, vatByRate, vat, total: roundMoney(base + vat) };
}
