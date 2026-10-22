import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The public price list: the three subscription plans with a monthly/annual
 * switch, the one-time onboarding price of each, and the terms for the
 * adoption period, support and paid changes. Prices are whole dinars and
 * final (the provider is outside the VAT system); keep them in step with the
 * signed price list and terms of use.
 */

export type Billing = "monthly" | "annual";

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

export const PLANS: Plan[] = [
  {
    name: "Osnovni",
    tagline: "Za firmu koja želi red u nalozima.",
    monthly: 3900,
    annual: 39000,
    users: 5,
    onboarding: 30000,
    includes: [
      "Radni nalozi, klijenti i lokacije",
      "Katalog usluga i artikala",
      "Kontrolna tabla",
      "Javni link za praćenje naloga",
    ],
  },
  {
    name: "Proizvodnja",
    tagline: "Za radionicu koja vodi materijal i korake rada.",
    monthly: 8900,
    annual: 89000,
    users: 15,
    onboarding: 80000,
    includes: [
      "Sve iz paketa Osnovni",
      "Magacin",
      "Procesi rada",
      "e-Fakture i e-Otpremnice",
    ],
    highlighted: true,
  },
  {
    name: "Pro",
    tagline: "Za proizvodnju koja planira mašine i ljude.",
    monthly: 13900,
    annual: 139000,
    users: 25,
    onboarding: 160000,
    includes: ["Sve iz paketa Proizvodnja", "Prisustvo", "Dnevno planiranje i „Moj red“"],
  },
];

const ADOPTION: Array<{ plan: string; days: number; hours: number }> = [
  { plan: "Osnovni", days: 30, hours: 4 },
  { plan: "Proizvodnja", days: 45, hours: 8 },
  { plan: "Pro", days: 60, hours: 16 },
];

const SUPPORT_POINTS: string[] = [
  "Radnim danima od 9 do 17 h, porukom, e-poštom ili telefonom",
  "Odgovor u roku od 1 radnog dana",
  "Kad kvar zaustavi rad, počinjemo u roku od 4 sata",
  "Ispravke grešaka i nove verzije su uvek besplatne",
];

const CHANGE_POINTS: Array<{ label: string; price: string }> = [
  { label: "Dorada po satu", price: "6.000 RSD" },
  { label: "Paket 10 sati", price: "50.000 RSD" },
  { label: "Paket 25 sati", price: "112.500 RSD" },
  { label: "Prioritetna podrška, mesečno", price: "4.900 RSD" },
  { label: "Dan na terenu", price: "15.000 RSD + put" },
];

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
        Dodatni korisnik je 490 RSD mesečno. Pretplata se plaća godišnje ili kvartalno unapred, a
        uz godišnje plaćanje uvođenje je 30% jeftinije. Probni period traje 30 dana i ne obavezuje
        vas ni na šta. Cene su u dinarima i konačne, jer nismo u sistemu PDV-a.
      </p>

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
