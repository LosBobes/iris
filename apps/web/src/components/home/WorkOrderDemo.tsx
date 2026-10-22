import { useState } from "react";
import { ArrowRight, Eye, Link2, RotateCcw, X } from "lucide-react";
import { formatMoney } from "@/lib/home/format";

/**
 * The hero's work order: a live sample the visitor moves through the real
 * lifecycle with the same one-button step the app has, cancels, resets, and
 * flips to "what the client sees" on the public link. No API, all local.
 */

interface Step {
  key: "new" | "assigned" | "inProgress" | "completed" | "invoiced";
  label: string;
  color: string;
  /** The timeline entry the step adds. */
  event: string;
}

const STEPS: Step[] = [
  { key: "new", label: "Nov", color: "var(--iris-status-draft)", event: "Nalog otvoren, broj rezervisan" },
  { key: "assigned", label: "Dodeljen", color: "var(--iris-status-active)", event: "Ana preuzela posao" },
  { key: "inProgress", label: "U toku", color: "var(--iris-status-active)", event: "Rad u radionici započet" },
  { key: "completed", label: "Završen", color: "var(--iris-status-done)", event: "Posao završen, datum upisan automatski" },
  { key: "invoiced", label: "Fakturisan", color: "var(--iris-status-done)", event: "Faktura izdata, kraj puta" },
];

const CANCELLED_COLOR = "var(--iris-status-cancelled)";

const LINES: Array<{ name: string; quantity: string; cost: number; price: number }> = [
  { name: "Vizit karte 4/4", quantity: "1.000 kom", cost: 3200, price: 6500 },
  { name: "Mat plastifikacija", quantity: "1.000 kom", cost: 700, price: 1800 },
];

const ORDER = {
  number: "RN-2026-00042",
  client: "Pekara Zlatno Zrno d.o.o.",
  description: "Vizit karte, 4/4, mat plastifikacija",
  paper: "Kunstdruk 350 g, 85 × 55 mm",
  due: "24.10.2026.",
  completed: "22.10.2026.",
  clientNotes: "Preuzimanje u radnji posle 14 h.",
};

export function WorkOrderDemo(): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [clientView, setClientView] = useState(false);

  const current = STEPS[step];
  const next = STEPS[step + 1];
  const terminal = cancelled || !next;
  const statusLabel = cancelled ? "Otkazan" : current.label;
  const statusColor = cancelled ? CANCELLED_COLOR : current.color;
  const events = [
    ...STEPS.slice(0, step + 1).map((entry) => entry.event),
    ...(cancelled ? ["Nalog otkazan, ostaje zapisan"] : []),
  ];
  const total = LINES.reduce((sum, line) => sum + line.price, 0);

  const reset = (): void => {
    setStep(0);
    setCancelled(false);
  };

  return (
    <div className="w-full max-w-[440px]">
      <div
        data-testid="work-order-demo"
        className="border border-border bg-card px-6 py-6 shadow-[0_24px_70px_rgba(52,43,31,0.08)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {clientView ? "Iris · javni status" : "Radni nalog"}
            </div>
            <div className="mt-1 text-[24px] tracking-[-0.6px] tnum">{ORDER.number}</div>
          </div>
          <span
            key={statusLabel}
            role="status"
            aria-label={`Status: ${statusLabel}`}
            className="animate-iris-pop rounded-full border px-2.5 py-[3px] text-[11px]"
            style={{ color: statusColor, borderColor: "currentColor" }}
          >
            {statusLabel}
          </span>
        </div>

        {clientView ? (
          <ClientView statusLabel={statusLabel} />
        ) : (
          <InternalView step={step} total={total} />
        )}

        {!clientView && (
          <ol aria-label="Istorija naloga" className="mt-5 space-y-1 border-t border-[color:var(--iris-border-soft)] pt-4 text-[11px] text-[color:var(--iris-ink-soft)]">
            {events.map((event, index) => (
              <li key={event} className="animate-iris-rise flex gap-2">
                <span
                  aria-hidden
                  className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: index === events.length - 1 ? statusColor : "var(--iris-ink-faint)" }}
                />
                {event}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        {terminal ? (
          <button
            type="button"
            onClick={reset}
            className="iris-focusable iris-press inline-flex items-center gap-1.5 bg-foreground px-3.5 py-2 font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            Počni ispočetka
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            className="iris-focusable iris-press inline-flex items-center gap-1.5 bg-foreground px-3.5 py-2 font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
          >
            Pomeri u „{next.label}“
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
        {!terminal && step < 3 && (
          <button
            type="button"
            onClick={() => setCancelled(true)}
            className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-foreground hover:border-foreground"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
            Otkaži nalog
          </button>
        )}
        <button
          type="button"
          aria-pressed={clientView}
          onClick={() => setClientView((value) => !value)}
          className="iris-focusable iris-press ml-auto inline-flex items-center gap-1.5 px-1 py-2 text-[color:var(--iris-ink-soft)] hover:text-foreground"
        >
          {clientView ? <Link2 aria-hidden className="h-3.5 w-3.5" /> : <Eye aria-hidden className="h-3.5 w-3.5" />}
          {clientView ? "Nazad na nalog" : "Pogledaj kao klijent"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-[color:var(--iris-ink-mute)]">
        Probajte sami: kao i u aplikaciji, nalog ide samo napred. Ništa od ovoga se ne čuva.
      </p>
    </div>
  );
}

function InternalView({ step, total }: { step: number; total: number }): React.JSX.Element {
  const rows: Array<[string, string]> = [
    ["Klijent", ORDER.client],
    ["Opis posla", ORDER.description],
    ["Papir", ORDER.paper],
    ["Izvršilac", step >= 1 ? "Ana" : "—"],
    ["Rok", ORDER.due],
    ...(step >= 3 ? [["Završeno", ORDER.completed] as [string, string]] : []),
  ];
  return (
    <>
      <dl className="mt-5 space-y-2.5 text-[12px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-[color:var(--iris-border-soft)] pb-2">
            <dt className="text-[color:var(--iris-ink-mute)]">{label}</dt>
            <dd className="text-right text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">Stavke</div>
      <table className="mt-2 w-full text-[12px]">
        <tbody>
          {LINES.map((line) => (
            <tr key={line.name} className="border-b border-[color:var(--iris-border-soft)]">
              <td className="py-1.5">{line.name}</td>
              <td className="py-1.5 text-right tnum">{line.quantity}</td>
              <td className="py-1.5 text-right tnum">{formatMoney(line.price).replace(" RSD", "")}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 font-medium" colSpan={2}>Ukupno (neto)</td>
            <td className="pt-2 text-right font-medium tnum">{formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function ClientView({ statusLabel }: { statusLabel: string }): React.JSX.Element {
  const rows: Array<[string, string]> = [
    ["Opis posla", ORDER.description],
    ["Status", statusLabel],
    ["Rok", ORDER.due],
    ["Napomene za klijenta", ORDER.clientNotes],
  ];
  return (
    <div className="mt-5">
      <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{ORDER.client}</p>
      <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">{label}</dt>
            <dd className="mt-0.5 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 border-t border-[color:var(--iris-border-soft)] pt-3 text-[11px] text-[color:var(--iris-ink-mute)]">
        Ovako klijent vidi nalog kad otvori javni link: bez prijave, bez cena i bez internih napomena.
      </p>
    </div>
  );
}
