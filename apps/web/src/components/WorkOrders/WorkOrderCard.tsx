import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight, User } from "lucide-react";
import { IrisBadge } from "@/components/WorkOrders/IrisBadge";
import { cn } from "@/lib/utils";
import type { WorkOrder } from "@/types/work-order";
import {
  canToggleWorkOrderCompletion,
  formatWorkOrderDate,
  getLocalIsoDate,
  getPrimaryWorkOrderTransition,
  getWorkOrderStatusLabel,
} from "@/shared/utils/work-orders";

interface WorkOrderCardProps {
  order: WorkOrder;
  /** Same handler the table row uses, so behavior stays identical. */
  onToggleStatus: (order: WorkOrder) => void;
  /** Local `YYYY-MM-DD`; injectable for tests. */
  today?: string;
}

/**
 * Phone/tablet representation of one work order. The whole card is a link to
 * the detail page (stretched-link pattern: the order-number anchor covers the
 * card); the status button sits above that layer, so tapping it never
 * navigates.
 */
export const WorkOrderCard = memo(function WorkOrderCard({
  order,
  onToggleStatus,
  today = getLocalIsoDate(),
}: WorkOrderCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const nextStatus = getPrimaryWorkOrderTransition(order.status);
  const canToggleStatus = canToggleWorkOrderCompletion(order.status);
  const isOverdue =
    !!order.dueDate && order.dueDate < today && !order.isCompleted;

  return (
    <li className="relative border border-border bg-card transition-colors active:bg-black/[0.03]">
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link
            to={`/work-orders/${order.id}`}
            aria-label={t("workOrders.table.openRow", {
              order: order.orderNumber,
              client: order.clientName,
            })}
            className="iris-focusable tnum inline-flex min-w-0 items-center gap-1 text-[15px] font-medium text-foreground after:absolute after:inset-0 after:content-['']"
          >
            <span className="truncate">{order.orderNumber}</span>
            <ChevronRight
              aria-hidden
              className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-faint)]"
            />
          </Link>
          <div className="shrink-0">
            <IrisBadge status={order.status} />
          </div>
        </div>

        <div className="break-words text-[14px] text-foreground">
          {order.clientName}
        </div>
        {order.jobDescription && (
          <p className="line-clamp-2 break-words text-[12px] text-[color:var(--iris-ink-soft)]">
            {order.jobDescription}
          </p>
        )}

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <div
            data-overdue={isOverdue ? "true" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              isOverdue
                ? "font-semibold text-[color:var(--iris-status-cancelled)]"
                : "text-[color:var(--iris-ink-soft)]",
            )}
          >
            <dt className="sr-only">{t("workOrders.table.card.dueLabel")}</dt>
            <CalendarClock aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <dd>
              {order.dueDate
                ? formatWorkOrderDate(order.dueDate)
                : t("workOrders.table.card.noDueDate")}
              {isOverdue && (
                <span className="ml-1.5 uppercase tracking-[0.5px]">
                  {t("workOrders.table.card.overdue")}
                </span>
              )}
            </dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[color:var(--iris-ink-soft)]">
            <dt className="sr-only">{t("workOrders.table.card.assignee")}</dt>
            <User aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <dd className="truncate">
              {order.assignment.assignedTo ??
                t("workOrders.table.card.unassigned")}
            </dd>
          </div>
        </dl>
      </div>

      {canToggleStatus && nextStatus && (
        <div className="relative z-10 border-t border-[color:var(--iris-border-soft)] p-2">
          <button
            type="button"
            onClick={() => onToggleStatus(order)}
            className="iris-focusable iris-press flex min-h-11 w-full items-center justify-center bg-foreground px-4 text-[13px] font-medium text-background hover:bg-foreground/90"
          >
            {t("workOrders.table.changeStatusTo", {
              status: getWorkOrderStatusLabel(nextStatus),
            })}
          </button>
        </div>
      )}
    </li>
  );
});
