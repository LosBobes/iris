import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AttentionSignal,
  ClientAttentionRow,
} from "@/lib/dashboard/aggregations";
import { WORK_ORDER_STATUS_LABELS } from "@/shared/utils/work-orders";

const SIGNAL_LABELS: Record<AttentionSignal, string> = {
  overdue: "Kasni",
  dueToday: "Danas",
  dueThisWeek: "Ove nedelje",
  waitingForCustomer: "Čeka klijenta",
  waitingForMaterials: "Čeka materijal",
  unassigned: "Nedodeljeni",
};

const SIGNAL_COUNT_LABELS: Record<AttentionSignal, string> = {
  overdue: "kasni",
  dueToday: "danas",
  dueThisWeek: "ove nedelje",
  waitingForCustomer: "čeka klijenta",
  waitingForMaterials: "čeka materijal",
  unassigned: "nedodeljeno",
};

const BADGE_STYLES: Record<AttentionSignal, string> = {
  overdue:
    "border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 text-[color:var(--iris-status-cancelled)]",
  dueToday:
    "border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)]/10 text-[color:var(--iris-accent)]",
  dueThisWeek:
    "border-foreground/25 bg-foreground/5 text-foreground",
  waitingForCustomer:
    "border-[color:var(--iris-border-soft)] bg-background text-[color:var(--iris-ink-soft)]",
  waitingForMaterials:
    "border-[color:var(--iris-border-soft)] bg-background text-[color:var(--iris-ink-soft)]",
  unassigned:
    "border-[color:var(--iris-border-soft)] bg-background text-[color:var(--iris-ink-soft)]",
};

function buildWorkOrdersUrl(
  signal: AttentionSignal,
  row: ClientAttentionRow,
): string {
  const params = new URLSearchParams();
  if (row.customerId) {
    params.set("customerId", row.customerId);
  } else {
    params.set("search", row.displayName);
  }

  if (signal === "waitingForCustomer") {
    params.set("queue", "all");
    params.set("status", "waitingForCustomer");
  } else if (signal === "waitingForMaterials") {
    params.set("queue", "all");
    params.set("status", "waitingForMaterials");
  } else if (signal === "dueToday") {
    params.set("queue", "today");
  } else if (signal === "dueThisWeek") {
    params.set("queue", "thisWeek");
  } else {
    params.set("queue", signal);
  }

  return `/work-orders?${params.toString()}`;
}

function getPrimarySignal(
  row: ClientAttentionRow,
  signals: readonly AttentionSignal[],
): AttentionSignal {
  return signals.find((signal) => row.counts[signal] > 0) ?? signals[0];
}

function getCountParts(
  row: ClientAttentionRow,
  signals: readonly AttentionSignal[],
): string[] {
  return signals
    .filter((signal) => row.counts[signal] > 0)
    .map((signal) => `${row.counts[signal]} ${SIGNAL_COUNT_LABELS[signal]}`);
}

interface ClientAttentionListProps {
  rows: ClientAttentionRow[];
  signals: readonly AttentionSignal[];
  activeSignal?: AttentionSignal | null;
  emptyMessage: string;
}

export function ClientAttentionList({
  rows,
  signals,
  activeSignal = null,
  emptyMessage,
}: ClientAttentionListProps): React.JSX.Element {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const visibleRows = useMemo(() => {
    if (!activeSignal) return rows;
    return rows.filter((row) => row.counts[activeSignal] > 0);
  }, [activeSignal, rows]);

  if (visibleRows.length === 0) {
    return (
      <div className="border border-dashed border-[color:var(--iris-border-soft)] px-4 py-8 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => {
        const primarySignal = activeSignal ?? getPrimarySignal(row, signals);
        const isExpanded = expandedKeys.has(row.groupKey);
        const countParts = getCountParts(row, signals);
        const drillDownUrl = buildWorkOrdersUrl(primarySignal, row);

        return (
          <div key={row.groupKey} className="border border-border bg-card">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <Link
                to={drillDownUrl}
                className="iris-focusable group min-w-0 flex-1"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-foreground group-hover:underline">
                    {row.displayName}
                  </span>
                  <span
                    className={`whitespace-nowrap border px-2 py-0.5 text-[10px] uppercase tracking-[1px] ${BADGE_STYLES[primarySignal]}`}
                  >
                    {SIGNAL_LABELS[primarySignal]}
                  </span>
                </div>
                <div className="tnum mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
                  {countParts.join(" · ")}
                </div>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setExpandedKeys((current) => {
                    const next = new Set(current);
                    if (next.has(row.groupKey)) next.delete(row.groupKey);
                    else next.add(row.groupKey);
                    return next;
                  });
                }}
                className="iris-focusable iris-press flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-transparent text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
                aria-label={`${isExpanded ? "Sakrij" : "Prikaži"} naloge za ${row.displayName}`}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {isExpanded && (
              <div className="border-t border-[color:var(--iris-border-soft)] bg-background px-4 py-3">
                <div className="space-y-1.5">
                  {row.orders.slice(0, 5).map((order) => (
                    <Link
                      key={order.id}
                      to={`/work-orders/${order.id}`}
                      className="iris-focusable flex items-center justify-between gap-4 px-2 py-1.5 text-[12px] hover:bg-black/[0.03]"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        <span className="tnum">{order.orderNumber}</span> ·{" "}
                        {order.jobDescription}
                      </span>
                      <span className="shrink-0 text-[color:var(--iris-ink-mute)]">
                        {WORK_ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </Link>
                  ))}
                </div>
                {row.orders.length > 5 && (
                  <div className="mt-2 px-2 text-[11px] text-[color:var(--iris-ink-mute)]">
                    Još {row.orders.length - 5} naloga
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { SIGNAL_LABELS };
