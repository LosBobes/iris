import type {
  AttentionSignal,
  AttentionSignalCounts,
  ClientAttentionRow,
} from "@/lib/dashboard/aggregations";
import { useTranslation } from "react-i18next";
import {
  CORE_ATTENTION_SIGNALS,
  INTERNAL_ATTENTION_SIGNALS,
} from "@/lib/dashboard/aggregations";
import { ClientAttentionList } from "@/components/dashboard/ClientAttentionList";
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
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        {t("dashboard.action.operativa")}
      </div>

      {/* Za obradu — internal queue (materials, unassigned), shown first. */}
      <div>
        <div className="flex flex-col gap-1">
          <h2 className="text-[22px] font-normal tracking-[-0.4px] text-foreground">
            {t("dashboard.action.toProcess")}
          </h2>
          <div className="text-[12px] text-[color:var(--iris-ink-soft)]">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{t("dashboard.action.material")} {signalCounts.waitingForMaterials}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("dashboard.signals.descriptions.waitingForMaterials")}
              </TooltipContent>
            </Tooltip>{" "}
            ·{" "}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{t("dashboard.action.unassigned")} {signalCounts.unassigned}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("dashboard.signals.descriptions.unassigned")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mt-4">
          <ClientAttentionList
            rows={internalAttentionRows}
            signals={INTERNAL_ATTENTION_SIGNALS}
            emptyMessage={t("dashboard.action.internalEmpty")}
          />
        </div>
      </div>

      {/* Rokovi i klijenti — work grouped by client, most urgent first. */}
      <div className="border-t border-[color:var(--iris-border-soft)] pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-normal tracking-[-0.4px] text-foreground">
              {t("dashboard.action.deadlinesClients")}
            </h2>
            <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
              {t("dashboard.action.deadlinesSubtitle")}
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
                      <span>{t(`dashboard.signals.labels.${signal}`)}</span>
                      <span className="tnum text-[11px] opacity-80">
                        {signalCounts[signal]}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t(`dashboard.signals.descriptions.${signal}`)} {t("dashboard.action.clickFilters")}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <ClientAttentionList
            rows={clientAttentionRows}
            signals={CORE_ATTENTION_SIGNALS}
            activeSignal={activeSignal}
            emptyMessage={t("dashboard.action.clientEmpty")}
          />
        </div>
      </div>
    </section>
  );
}
