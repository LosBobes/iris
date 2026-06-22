import { ChevronDown } from "lucide-react";
import type {
  AttentionSignal,
  AttentionSignalCounts,
  ClientAttentionRow,
} from "@/lib/dashboard/aggregations";
import {
  CORE_ATTENTION_SIGNALS,
  INTERNAL_ATTENTION_SIGNALS,
} from "@/lib/dashboard/aggregations";
import {
  ClientAttentionList,
  SIGNAL_DESCRIPTIONS,
  SIGNAL_LABELS,
} from "@/components/dashboard/ClientAttentionList";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DashboardActionSectionProps {
  clientAttentionRows: ClientAttentionRow[];
  internalAttentionRows: ClientAttentionRow[];
  signalCounts: AttentionSignalCounts;
  activeSignal: AttentionSignal | null;
  onActiveSignalChange: (signal: AttentionSignal | null) => void;
}

export function DashboardActionSection({
  clientAttentionRows,
  internalAttentionRows,
  signalCounts,
  activeSignal,
  onActiveSignalChange,
}: DashboardActionSectionProps): React.JSX.Element {
  return (
    <section className="space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          Operacije
        </div>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-normal tracking-[-0.4px] text-foreground">
              Zahteva pažnju
            </h2>
            <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
              Po klijentima, od najhitnijeg ka manje hitnom
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CORE_ATTENTION_SIGNALS.map((signal) => {
              const isActive = activeSignal === signal;
              return (
                <Tooltip key={signal}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        onActiveSignalChange(isActive ? null : signal);
                      }}
                      className={`iris-focusable iris-press flex items-center gap-2 border px-3 py-2 text-[12px] ${
                        isActive
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
                      }`}
                    >
                      <span>{SIGNAL_LABELS[signal]}</span>
                      <span className="tnum text-[11px] opacity-80">
                        {signalCounts[signal]}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {SIGNAL_DESCRIPTIONS[signal]} Klik filtrira listu.
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      <ClientAttentionList
        rows={clientAttentionRows}
        signals={CORE_ATTENTION_SIGNALS}
        activeSignal={activeSignal}
        emptyMessage="Nema klijenata sa aktivnim signalima za pažnju."
      />

      <details className="group border-t border-[color:var(--iris-border-soft)] pt-4">
        <summary className="iris-focusable flex cursor-pointer list-none items-center justify-between gap-4 py-1">
          <div>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              Interno
            </div>
            <div className="mt-1 text-[13px] text-[color:var(--iris-ink-soft)]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>Materijal {signalCounts.waitingForMaterials}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {SIGNAL_DESCRIPTIONS.waitingForMaterials}
                </TooltipContent>
              </Tooltip>{" "}
              ·{" "}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>Nedodeljeno {signalCounts.unassigned}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {SIGNAL_DESCRIPTIONS.unassigned}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-[color:var(--iris-ink-mute)] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="pt-3">
          <ClientAttentionList
            rows={internalAttentionRows}
            signals={INTERNAL_ATTENTION_SIGNALS}
            emptyMessage="Nema internih signala za proveru."
          />
        </div>
      </details>
    </section>
  );
}
