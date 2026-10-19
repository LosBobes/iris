// The price example on the landing page: one catalog line priced the way Iris
// prices an order line (net prices, PDV by tax group, margin on revenue). Pure,
// so the calculator component only renders.

import { addVat, VAT_TYPES, type VatTypeCode } from "@/shared/utils/vat";

export interface PricingInput {
  quantity: number;
  /** Nabavna cena / cena rada per unit, net. */
  unitCost: number;
  /** Prodajna cena per unit, net. */
  unitPrice: number;
  vatCode: VatTypeCode;
}

export interface PricingResult {
  /** What the shop paid for the whole line. */
  cost: number;
  /** Prodajna cena of the line without PDV (osnovica). */
  net: number;
  /** net - cost. */
  profit: number;
  /** profit / net, in percent; 0 when there is no revenue. */
  marginPct: number;
  vatRate: number;
  vat: number;
  /** What the customer pays: net + PDV. */
  gross: number;
}

/** The three PDV groups as the app shows them (the code Iris stores, the label on receipts). */
export const VAT_GROUPS: Array<{ code: VatTypeCode; label: string; name: string; rate: string }> = [
  { code: "DJ", label: "Đ", name: "opšta stopa", rate: "20%" },
  { code: "E", label: "E", name: "posebna stopa", rate: "10%" },
  { code: "A", label: "A", name: "oslobođeno", rate: "0%" },
];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function computePricing(input: PricingInput): PricingResult {
  const quantity = nonNegative(input.quantity);
  const cost = roundMoney(quantity * nonNegative(input.unitCost));
  const net = roundMoney(quantity * nonNegative(input.unitPrice));
  const profit = roundMoney(net - cost);
  const marginPct = net > 0 ? (profit / net) * 100 : 0;
  const vatRate = VAT_TYPES.find((type) => type.code === input.vatCode)?.rate ?? 0.2;
  const gross = addVat(net, vatRate);
  return { cost, net, profit, marginPct, vatRate, vat: roundMoney(gross - net), gross };
}
