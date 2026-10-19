import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The lifecycle as a row of selectable statuses: pick one and read what it
 * means, who moves the order there and what Iris does by itself. Tab
 * semantics with arrow-key navigation.
 */

interface StatusInfo {
  key: string;
  label: string;
  color: string;
  side?: boolean;
  meaning: string;
  who: string;
  automatic: string;
}

const STATUSES: StatusInfo[] = [
  {
    key: "new",
    label: "Nov",
    color: "var(--iris-status-draft)",
    meaning: "Nalog je otvoren, rad još nije krenuo. Svaki nalog počinje ovde.",
    who: "Bilo ko: operater ili administrator, čim klijent potvrdi posao.",
    automatic: "Iris rezerviše sledeći broj naloga i vraća nesačuvan unos ako se stranica osveži.",
  },
  {
    key: "assigned",
    label: "Dodeljen",
    color: "var(--iris-status-active)",
    meaning: "Neko je preuzeo posao. Dok izvršilac nije upisan, nalog je na tabli „nedodeljen“.",
    who: "Operater koji preuzima posao, ili administrator koji ga dodeljuje.",
    automatic: "Nalog nestaje sa liste nedodeljenih, a operater ga vidi među svojima.",
  },
  {
    key: "inProgress",
    label: "U toku",
    color: "var(--iris-status-active)",
    meaning: "Posao se radi u radionici. Sa procesima rada, i korak po korak.",
    who: "Izvršilac, dugmetom „Pomeri u U toku“.",
    automatic: "Ako je modul uključen, završen korak procesa sam knjiži utrošak materijala u magacinu.",
  },
  {
    key: "completed",
    label: "Završen",
    color: "var(--iris-status-done)",
    meaning: "Gotovo. Odavde nalog ne može nazad u rad.",
    who: "Izvršilac, kad je posao spreman za isporuku.",
    automatic: "Iris upisuje datum završetka i nalog izlazi iz signala rokova na tabli.",
  },
  {
    key: "invoiced",
    label: "Fakturisan",
    color: "var(--iris-status-done)",
    meaning: "Faktura, profaktura ili otkup: novac je rešen, nalog je završio put.",
    who: "Administrator ili operater, posle naplate.",
    automatic: "Prihod i zarada naloga ulaze u mesečne brojeve na kontrolnoj tabli.",
  },
  {
    key: "cancelled",
    label: "Otkazan",
    color: "var(--iris-status-cancelled)",
    side: true,
    meaning: "Posao je otpao. Nalog ostaje zapisan, pa je otkazivanje skoro uvek bolje od brisanja.",
    who: "Bilo ko, iz menija „Još radnji“, dok nalog nije završen.",
    automatic: "Nalog izlazi iz svih signala i lista za rad, a istorija ostaje.",
  },
];

export function StatusExplorer(): React.JSX.Element {
  const [selected, setSelected] = useState(STATUSES[0].key);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = STATUSES.find((status) => status.key === selected) ?? STATUSES[0];

  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + STATUSES.length) % STATUSES.length;
    setSelected(STATUSES[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div role="tablist" aria-label="Statusi naloga" className="flex min-w-[600px] items-center gap-2">
          {STATUSES.map((status, index) => {
            const isActive = status.key === selected;
            return (
              <div key={status.key} className={cn("flex items-center gap-2", status.side && "ml-4 border-l border-dashed border-[color:var(--iris-ink-faint)] pl-4")}>
                <button
                  type="button"
                  role="tab"
                  id={`status-tab-${status.key}`}
                  aria-selected={isActive}
                  aria-controls="status-panel"
                  tabIndex={isActive ? 0 : -1}
                  ref={(element) => {
                    refs.current[index] = element;
                  }}
                  onClick={() => setSelected(status.key)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={cn(
                    "iris-focusable iris-press whitespace-nowrap border px-3 py-1.5 text-[12px] font-medium transition-colors",
                    status.side && "border-dashed",
                    isActive ? "bg-foreground text-background" : "bg-transparent hover:bg-[color:var(--iris-border-soft)]",
                  )}
                  style={isActive ? { borderColor: "var(--foreground)" } : { color: status.color, borderColor: "currentColor" }}
                >
                  {status.label}
                </button>
                {!status.side && index < STATUSES.length - 2 ? (
                  <span aria-hidden className="h-px w-6 bg-[color:var(--iris-ink-faint)] sm:w-10" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div
        key={active.key}
        id="status-panel"
        role="tabpanel"
        aria-labelledby={`status-tab-${active.key}`}
        className="animate-iris-rise mt-6 grid gap-5 border-t border-[color:var(--iris-border-soft)] pt-6 md:grid-cols-3"
      >
        <StatusFact label="Šta znači" body={active.meaning} />
        <StatusFact label="Ko pomera" body={active.who} />
        <StatusFact label="Šta Iris uradi sam" body={active.automatic} />
      </div>
    </div>
  );
}

function StatusFact({ label, body }: { label: string; body: string }): React.JSX.Element {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">{label}</div>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-foreground">{body}</p>
    </div>
  );
}
