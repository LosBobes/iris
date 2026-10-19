// Number formatting for the landing page's examples (Serbian Latin grouping,
// "6.500,00 RSD"). The app's own formatters either drop decimals (dashboard)
// or omit the currency (work-order prices); the examples want both.

const money = new Intl.NumberFormat("sr-Latn-RS", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const whole = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 });

export function formatMoney(value: number): string {
  return `${money.format(value)} RSD`;
}

export function formatWhole(value: number): string {
  return whole.format(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
