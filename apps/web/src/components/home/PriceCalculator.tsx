import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent } from "@/lib/home/format";
import { computePricing, VAT_GROUPS } from "@/lib/home/pricing";
import type { VatTypeCode } from "@/shared/utils/vat";
import type { PreviewRole } from "@/lib/home/modules";

/**
 * One catalog line, priced live: quantity, cost and sale price in, cost,
 * profit, margin, PDV and the customer's total out. A role toggle shows the
 * operator's narrower view of the same numbers.
 */
export function PriceCalculator(): React.JSX.Element {
  const [quantity, setQuantity] = useState("1000");
  const [unitCost, setUnitCost] = useState("3,20");
  const [unitPrice, setUnitPrice] = useState("6,50");
  const [vatCode, setVatCode] = useState<VatTypeCode>("DJ");
  const [role, setRole] = useState<PreviewRole>("admin");
  const vatGroupId = useId();

  const result = computePricing({
    quantity: parseNumber(quantity),
    unitCost: parseNumber(unitCost),
    unitPrice: parseNumber(unitPrice),
    vatCode,
  });
  const admin = role === "admin";
  const loss = result.profit < 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <form className="space-y-5" onSubmit={(event) => event.preventDefault()} aria-label="Primer cene">
        <Field label="Količina (kom)" value={quantity} onChange={setQuantity} />
        <Field label="Nabavna cena po komadu (neto)" value={unitCost} onChange={setUnitCost} hint="Koliko nas košta: papir, folija, rad." />
        <Field label="Prodajna cena po komadu (neto)" value={unitPrice} onChange={setUnitPrice} hint="Koliko naplaćujemo klijentu, bez PDV-a." />
        <div>
          <div id={vatGroupId} className="mb-1.5 text-[11px] text-[color:var(--iris-ink-soft)]">Poreska grupa</div>
          <div role="radiogroup" aria-labelledby={vatGroupId} className="flex gap-2">
            {VAT_GROUPS.map((group) => {
              const checked = group.code === vatCode;
              return (
                <button
                  key={group.code}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setVatCode(group.code)}
                  className={cn(
                    "iris-focusable iris-press flex-1 border px-2 py-2 text-left transition-colors",
                    checked ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground",
                  )}
                >
                  <span className="block text-[14px] font-medium">{group.label} · {group.rate}</span>
                  <span className={cn("block text-[10px]", checked ? "text-background/70" : "text-[color:var(--iris-ink-mute)]")}>{group.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </form>

      <div className="border border-border bg-background px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">Kako to vidi</div>
          <div role="radiogroup" aria-label="Prikaz uloge" className="flex border border-border text-[12px]">
            {(["admin", "operator"] as PreviewRole[]).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                onClick={() => setRole(value)}
                className={cn(
                  "iris-focusable px-3 py-1.5 transition-colors",
                  role === value ? "bg-foreground text-background" : "text-[color:var(--iris-ink-soft)] hover:text-foreground",
                )}
              >
                {value === "admin" ? "Administrator" : "Operater"}
              </button>
            ))}
          </div>
        </div>

        <dl className="mt-5 space-y-2 text-[13px]" aria-live="polite">
          {admin && <Row label="Trošak" value={formatMoney(result.cost)} />}
          {admin && (
            <Row
              label="Zarada"
              value={formatMoney(result.profit)}
              tone={loss ? "var(--iris-status-cancelled)" : "var(--iris-status-done)"}
            />
          )}
          {admin && (
            <Row
              label="Marža (zarada ÷ prodajna cena)"
              value={formatPercent(result.marginPct)}
              tone={loss ? "var(--iris-status-cancelled)" : "var(--iris-status-done)"}
            />
          )}
          <Row label="Prodajna cena (neto, osnovica)" value={formatMoney(result.net)} strong />
          <Row label={`PDV ${formatPercent(result.vatRate * 100)}`} value={formatMoney(result.vat)} />
          <Row label="Klijent plaća (bruto)" value={formatMoney(result.gross)} strong />
        </dl>

        <p className="mt-5 border-t border-[color:var(--iris-border-soft)] pt-3 text-[11px] leading-[1.5] text-[color:var(--iris-ink-mute)]">
          {admin
            ? loss
              ? "Prodajna cena je ispod troška: ovakav nalog bi na kontrolnoj tabli bio crven."
              : "Na nalogu i na kontrolnoj tabli administrator vidi sve ove brojeve, po stavci i po mesecu."
            : "Operater vidi samo prodajnu cenu i ono što klijent plaća. Trošak, zarada i marža mu se ne prikazuju."}
        </p>
      </div>
    </div>
  );
}

/** Reads "6,50", "6.50" or "1.000" the way a Serbian keyboard types them. */
export function parseNumber(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}): React.JSX.Element {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11px] text-[color:var(--iris-ink-soft)]">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-0 border-b border-border bg-transparent py-2 text-[16px] text-foreground outline-none transition-colors duration-150 focus:border-foreground tnum"
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[11px] text-[color:var(--iris-ink-mute)]">{hint}</p>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }): React.JSX.Element {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-b border-[color:var(--iris-border-soft)] pb-2", strong && "text-[15px]")}>
      <dt className={cn("text-[color:var(--iris-ink-soft)]", strong && "font-medium text-foreground")}>{label}</dt>
      <dd className={cn("tnum", strong && "font-medium")} style={tone ? { color: tone } : undefined}>{value}</dd>
    </div>
  );
}
