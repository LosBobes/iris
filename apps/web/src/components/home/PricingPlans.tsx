import { useState } from "react";
import { Check, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRICE_LIST_PDF_PATH, PRICING } from "@/lib/home/pricing";

/**
 * The public price list: the three subscription plans with a monthly/annual
 * switch, the one-time onboarding price of each, and the terms for the
 * adoption period, support and paid changes, plus a link to the same list as
 * a PDF. The numbers come from lib/home/pricing.json, shared with the PDF.
 */

export type Billing = "monthly" | "annual";

const { plans: PLANS, adoption: ADOPTION, support: SUPPORT_POINTS, changes: CHANGE_POINTS } = PRICING;

const RSD = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 });

/** "8.900 RSD": dinars with a dot as the thousands separator. */
export function formatRsd(amount: number): string {
  return `${RSD.format(amount)} RSD`;
}

export function PricingPlans(): React.JSX.Element {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <div>
      <div role="group" aria-label="Način plaćanja" className="inline-flex border border-border bg-card p-0.5 text-[12px]">
        <BillingButton active={billing === "monthly"} onClick={() => setBilling("monthly")}>
          Mesečno
        </BillingButton>
        <BillingButton active={billing === "annual"} onClick={() => setBilling("annual")}>
          Godišnje · 2 meseca gratis
        </BillingButton>
      </div>

      <ul className="mt-6 grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <li
            key={plan.name}
            aria-label={`Paket ${plan.name}`}
            className={cn(
              "flex flex-col border bg-card px-5 py-6 sm:px-6",
              plan.highlighted ? "border-[color:var(--iris-accent)]" : "border-border",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[17px] font-medium tracking-[-0.3px]">{plan.name}</h3>
              {plan.highlighted ? (
                <span className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-accent)]">
                  Najčešći izbor
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[13px] text-[color:var(--iris-ink-soft)]">{plan.tagline}</p>
            <div className="mt-5 flex items-baseline gap-1.5" aria-live="polite">
              <span className="text-[30px] font-normal tracking-[-0.8px] tnum">
                {RSD.format(billing === "monthly" ? plan.monthly : plan.annual)}
              </span>
              <span className="text-[12px] text-[color:var(--iris-ink-mute)]">
                RSD {billing === "monthly" ? "mesečno" : "godišnje"}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--iris-ink-mute)]">Do {plan.users} korisnika</p>
            <ul className="mt-5 space-y-1.5 text-[13px]">
              {plan.includes.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[color:var(--iris-status-done)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <div className="flex items-baseline justify-between gap-3 border-t border-[color:var(--iris-border-soft)] pt-4 text-[12px]">
                <span className="text-[color:var(--iris-ink-soft)]">Uvođenje, jednokratno</span>
                <span className="tnum text-foreground">{formatRsd(plan.onboarding)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 max-w-[80ch] text-[12px] leading-[1.6] text-[color:var(--iris-ink-mute)]">
        {PRICING.terms}
      </p>
      <a
        href={PRICE_LIST_PDF_PATH}
        download
        className="iris-focusable mt-3 inline-flex items-center gap-2 text-[13px] text-foreground underline underline-offset-4 hover:text-[color:var(--iris-accent)]"
      >
        <FileDown aria-hidden className="h-4 w-4" />
        Preuzmite ceo cenovnik (PDF)
      </a>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <TermsCard title="Period usvajanja" lead="Posle početka rada manje izmene radimo besplatno, u okviru fonda sati.">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Period usvajanja po paketu</caption>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                <th className="pb-2 font-normal">Paket</th>
                <th className="pb-2 font-normal">Trajanje</th>
                <th className="pb-2 text-right font-normal">Sati</th>
              </tr>
            </thead>
            <tbody>
              {ADOPTION.map((row) => (
                <tr key={row.plan} className="border-t border-[color:var(--iris-border-soft)]">
                  <td className="py-1.5">{row.plan}</td>
                  <td className="py-1.5 tnum">{row.days} dana</td>
                  <td className="py-1.5 text-right tnum">{row.hours} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TermsCard>

        <TermsCard title="Podrška" lead="Uključena u svaki paket.">
          <ul className="space-y-1.5 text-[13px]">
            {SUPPORT_POINTS.map((point) => (
              <li key={point} className="flex gap-2">
                <Check aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[color:var(--iris-status-done)]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </TermsCard>

        <TermsCard title="Dorade i usluge" lead="Za veće dorade dajemo fiksnu ponudu pre početka rada.">
          <dl className="text-[13px]">
            {CHANGE_POINTS.map((point) => (
              <div
                key={point.label}
                className="flex items-baseline justify-between gap-3 border-t border-[color:var(--iris-border-soft)] py-1.5 first:border-t-0"
              >
                <dt className="text-[color:var(--iris-ink-soft)]">{point.label}</dt>
                <dd className="tnum">{point.price}</dd>
              </div>
            ))}
          </dl>
        </TermsCard>
      </div>
    </div>
  );
}

function BillingButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "iris-focusable px-3 py-1.5 tracking-[0.2px] transition-colors",
        active ? "bg-foreground text-background" : "text-[color:var(--iris-ink-soft)] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TermsCard({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="border border-border bg-card px-5 py-5">
      <h3 className="text-[15px] font-medium tracking-[-0.2px]">{title}</h3>
      <p className="mt-1 text-[12px] leading-[1.5] text-[color:var(--iris-ink-soft)]">{lead}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
