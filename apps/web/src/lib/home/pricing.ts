/**
 * The public price list: subscription plans, the adoption period, support and
 * paid changes. The data lives in pricing.json so the landing page
 * (`PricingPlans`) and the downloadable PDF (`scripts/generate-price-list.mjs`,
 * written to public/cenovnik-iris.pdf) read the same numbers. After changing
 * pricing.json, re-run the script; a test fails until the PDF is regenerated.
 * Prices are whole dinars and final (the provider is outside the VAT system);
 * keep them in step with the signed price list and terms of use.
 */
import data from "./pricing.json";

export interface Plan {
  name: string;
  tagline: string;
  /** Monthly price in RSD. */
  monthly: number;
  /** Annual price in RSD (ten months for twelve). */
  annual: number;
  users: number;
  /** One-time onboarding price in RSD. */
  onboarding: number;
  includes: string[];
  highlighted?: boolean;
}

export interface AdoptionRow {
  plan: string;
  days: number;
  hours: number;
}

export interface ChangePoint {
  label: string;
  price: string;
}

export interface Pricing {
  plans: Plan[];
  adoption: AdoptionRow[];
  support: string[];
  changes: ChangePoint[];
  /** The footnote under the plans: extra users, billing, trial, VAT. */
  terms: string;
}

export const PRICING: Pricing = data;

/** Where the generated PDF of this price list is served (from public/). */
export const PRICE_LIST_PDF_PATH = "/cenovnik-iris.pdf";
