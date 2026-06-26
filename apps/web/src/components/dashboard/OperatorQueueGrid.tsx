import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ClipboardList,
  Clock,
  Hammer,
  Inbox,
} from "lucide-react";

/** Per-operator open-work counts, scoped to the signed-in operator. */
export interface OperatorQueue {
  assignedToMe: number;
  dueToday: number;
  overdue: number;
  inProgress: number;
  available: number;
}

interface OperatorQueueGridProps {
  queue: OperatorQueue;
  /** Signed-in operator username, used to deep-link the filtered order list. */
  username: string;
}

interface QueueCell {
  key: keyof OperatorQueue;
  label: string;
  hint: string;
  value: number;
  to: string;
  icon: React.ReactNode;
  /** Highlight in the cancelled/alert accent when the count is non-zero. */
  alert?: boolean;
}

/**
 * Operator-only stat grid: a scannable row of the signed-in operator's own open
 * work. Each cell deep-links into the work-order list pre-filtered to match the
 * count, so the number and the resulting list always agree.
 */
export function OperatorQueueGrid({
  queue,
  username,
}: OperatorQueueGridProps): React.JSX.Element {
  const { t } = useTranslation();
  const mine = `assignedTo=${encodeURIComponent(username)}`;

  const cells: QueueCell[] = [
    {
      key: "assignedToMe",
      label: t("dashboard.operator.assignedToMe"),
      hint: t("dashboard.operator.assignedToMeHint"),
      value: queue.assignedToMe,
      to: `/work-orders?${mine}`,
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      key: "dueToday",
      label: t("dashboard.operator.dueToday"),
      hint: t("dashboard.operator.dueTodayHint"),
      value: queue.dueToday,
      to: `/work-orders?${mine}&queue=today`,
      icon: <Clock className="h-4 w-4" />,
    },
    {
      key: "overdue",
      label: t("dashboard.operator.overdue"),
      hint: t("dashboard.operator.overdueHint"),
      value: queue.overdue,
      to: `/work-orders?${mine}&queue=overdue`,
      icon: <AlertTriangle className="h-4 w-4" />,
      alert: true,
    },
    {
      key: "inProgress",
      label: t("dashboard.operator.inProgress"),
      hint: t("dashboard.operator.inProgressHint"),
      value: queue.inProgress,
      to: `/work-orders?${mine}&status=inProgress`,
      icon: <Hammer className="h-4 w-4" />,
    },
    {
      key: "available",
      label: t("dashboard.operator.available"),
      hint: t("dashboard.operator.availableHint"),
      value: queue.available,
      to: `/work-orders?queue=unassigned`,
      icon: <Inbox className="h-4 w-4" />,
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t("dashboard.operator.eyebrow")}
        </div>
        <h2 className="mt-1 text-[22px] font-normal tracking-[-0.4px] text-foreground">
          {t("dashboard.operator.title")}
        </h2>
        <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
          {t("dashboard.operator.subtitle")}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((cell, index) => {
          const isAlert = Boolean(cell.alert && cell.value > 0);
          return (
            <Link
              key={cell.key}
              to={cell.to}
              aria-label={`${cell.label}: ${cell.value}`}
              className={`iris-focusable iris-press group flex flex-col justify-between border bg-card p-4 transition-colors ${
                isAlert
                  ? "border-[color:var(--iris-status-cancelled)] hover:bg-[color:var(--iris-status-cancelled)]/[0.06]"
                  : "border-border hover:bg-black/[0.02]"
              }`}
              style={{
                animation:
                  "iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both",
                animationDelay: `${120 + index * 60}ms`,
              }}
            >
              <div
                className={`flex items-center justify-between ${
                  isAlert
                    ? "text-[color:var(--iris-status-cancelled)]"
                    : "text-[color:var(--iris-ink-mute)]"
                }`}
              >
                <span className="text-[10px] uppercase tracking-[1.2px]">
                  {cell.label}
                </span>
                {cell.icon}
              </div>
              <div
                className={`tnum mt-3 text-[30px] font-normal leading-none tracking-[-0.6px] ${
                  isAlert
                    ? "text-[color:var(--iris-status-cancelled)]"
                    : "text-foreground"
                }`}
              >
                {cell.value}
              </div>
              <div className="mt-2 text-[11px] leading-snug text-[color:var(--iris-ink-soft)]">
                {cell.hint}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
