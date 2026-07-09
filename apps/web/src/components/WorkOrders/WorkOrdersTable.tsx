import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { IrisBadge } from "@/components/WorkOrders/IrisBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Pencil,
  Trash2,
  Copy,
  Check,
  Circle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import type { WorkOrder } from "@/types/work-order";
import {
  PAGE_SIZE_OPTIONS,
  type PageSize,
  type SortField,
  type SortDirection,
} from "@/hooks/useWorkOrders";
import { useListPreferences } from "@/hooks/useListPreferences";
import { getRowHeightClass } from "@/lib/list-preferences";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { useAuth } from "@/hooks/useAuth";
import {
  WORK_ORDER_COLUMNS,
  columnLabel,
  type WorkOrderColumnKey,
} from "@/lib/work-order-columns";
import {
  canToggleWorkOrderCompletion,
  formatWorkOrderDate,
  formatWorkOrderPrice,
  getPrimaryWorkOrderTransition,
  getWorkOrderBillingDocumentLabel,
  getWorkOrderPriorityLabel,
  getWorkOrderStatusLabel,
} from "@/shared/utils/work-orders";

/** Content + cell classes for a single data column. The actions column is
 *  rendered separately so it can be pinned to the right edge. */
function renderColumnCell(
  order: WorkOrder,
  key: WorkOrderColumnKey,
): { className: string; content: React.ReactNode; title?: string } {
  switch (key) {
    case "orderNumber":
      return {
        className: "tnum px-4 font-medium text-foreground",
        content: order.orderNumber,
      };
    case "clientName":
      return { className: "px-4 text-foreground", content: order.clientName };
    case "jobDescription":
      return {
        className:
          "max-w-[220px] truncate px-4 text-[color:var(--iris-ink-soft)]",
        content: order.jobDescription,
        title: order.jobDescription,
      };
    case "assigned":
      return {
        className: "px-4 text-[color:var(--iris-ink-soft)]",
        content: order.assignment.assignedTo ?? "Nedodeljeno",
      };
    case "priority":
      return {
        className: "px-4 text-[color:var(--iris-ink-soft)]",
        content: getWorkOrderPriorityLabel(order.assignment.priority),
      };
    case "billing":
      return {
        className: "px-4 text-[color:var(--iris-ink-soft)]",
        content: order.billingDocumentType
          ? getWorkOrderBillingDocumentLabel(order.billingDocumentType)
          : "-",
      };
    case "schedule":
      return {
        className: "px-4 text-[color:var(--iris-ink-soft)]",
        content: order.dueDate ? formatWorkOrderDate(order.dueDate) : "-",
      };
    case "price":
      return {
        className: `tnum px-4 text-right ${
          order.price !== null
            ? "font-medium text-foreground"
            : "text-[color:var(--iris-ink-faint)]"
        }`,
        content: formatWorkOrderPrice(order.price),
      };
    case "status":
      return { className: "px-4", content: <IrisBadge status={order.status} /> };
  }
}

interface WorkOrdersTableProps {
  orders: WorkOrder[];
  totalFiltered: number;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: PageSize;
  onPageSizeChange: (pageSize: PageSize) => void;
  onDelete: (order: WorkOrder) => void;
  onDuplicate: (order: WorkOrder) => void;
  onEdit: (order: WorkOrder) => void;
  onToggleStatus: (order: WorkOrder) => void;
  onOpen?: (order: WorkOrder) => void;
  /** Delete is admin-only on the API; hide the affordance for non-admins. */
  canDelete: boolean;
}

function ActionTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function SortIcon({
  field,
  currentField,
  direction,
}: {
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
}): React.JSX.Element {
  if (field !== currentField) {
    return <ArrowUpDown className="h-3 w-3 text-[color:var(--iris-ink-faint)]" />;
  }
  return direction === "asc" ? (
    <ArrowUp className="h-3 w-3" />
  ) : (
    <ArrowDown className="h-3 w-3" />
  );
}

export function WorkOrdersTable({
  orders,
  totalFiltered,
  sortField,
  sortDirection,
  onSort,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  onDelete,
  onDuplicate,
  onEdit,
  onToggleStatus,
  onOpen,
  canDelete,
}: WorkOrdersTableProps): React.JSX.Element {
  const { t } = useTranslation();
  // Stagger the entrance animation only on the very first paint. Subsequent
  // sort / filter / page changes should swap rows in place - no shimmer.
  const isFirstPaintRef = useRef(true);
  useEffect(() => {
    isFirstPaintRef.current = false;
  }, []);
  const shouldStagger = isFirstPaintRef.current;

  const { density } = useListPreferences();
  const rowHeightClass = getRowHeightClass(density);

  const { isVisible } = useColumnVisibility();
  // Operators never see money: the price column is stripped regardless of the
  // saved column-visibility preference.
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";
  const dataColumns = WORK_ORDER_COLUMNS.filter(
    (col) => isVisible(col.key) && (isAdmin || col.key !== "price"),
  );

  // When the user pages while scrolled to the pagination bar, bring the top
  // of the new page back into view instead of leaving them at the bottom.
  const containerRef = useRef<HTMLDivElement>(null);
  const previousPageRef = useRef(currentPage);
  useEffect(() => {
    if (previousPageRef.current !== currentPage) {
      previousPageRef.current = currentPage;
      containerRef.current?.scrollIntoView({ block: "start" });
    }
  }, [currentPage]);

  return (
    <div ref={containerRef} className="scroll-mt-4 overflow-x-auto border border-border bg-card">
      <table className="min-w-[1100px] w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border">
            {dataColumns.map((col) => {
              const isActive = col.sortField === sortField;
              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`px-4 py-[10px] text-[10px] font-medium uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)] ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                  aria-sort={
                    isActive
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.sortField)}
                    className="iris-focusable iris-press inline-flex cursor-pointer items-center gap-1 bg-transparent p-0 text-[10px] font-medium uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
                    aria-label={
                      isActive
                        ? t("workOrders.table.sortedBy", {
                            col: columnLabel(col),
                            dir: sortDirection === "asc" ? t("workOrders.table.ascending") : t("workOrders.table.descending"),
                          })
                        : t("workOrders.table.sortBy", { col: columnLabel(col) })
                    }
                  >
                    {columnLabel(col)}
                    <SortIcon
                      field={col.sortField}
                      currentField={sortField}
                      direction={sortDirection}
                    />
                  </button>
                </th>
              );
            })}
            <th
              style={{ width: "172px" }}
              className="sticky right-0 z-20 bg-card px-4 py-[10px] text-right text-[10px] font-medium uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]"
            >
              Radnje
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => {
            const canToggleStatus = canToggleWorkOrderCompletion(order.status);
            const statusTransition = getPrimaryWorkOrderTransition(order.status);
            const statusActionLabel = canToggleStatus
              ? t("workOrders.table.changeStatusTo", { status: getWorkOrderStatusLabel(statusTransition!) })
              : t("workOrders.table.statusNotFromList");
            // Cap stagger so a 100-row page doesn't take 3s to settle.
            const rowDelayMs = Math.min(idx, 12) * 22;
            return (
              <tr
                key={order.id}
                onClick={onOpen ? () => onOpen(order) : undefined}
                tabIndex={onOpen ? 0 : undefined}
                aria-label={
                  onOpen
                    ? t("workOrders.table.openRow", { order: order.orderNumber, client: order.clientName })
                    : undefined
                }
                onKeyDown={
                  onOpen
                    ? (e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(order);
                        }
                      }
                    : undefined
                }
                style={
                  shouldStagger
                    ? {
                        animation:
                          "iris-fade-up 360ms var(--iris-ease-out) both",
                        animationDelay: `${rowDelayMs}ms`,
                      }
                    : undefined
                }
                className={`${rowHeightClass} border-b border-[color:var(--iris-border-soft)] transition-colors duration-150 last:border-b-0 ${
                  onOpen
                    ? "cursor-pointer hover:bg-black/[0.025] focus-visible:bg-black/[0.025] focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_var(--iris-accent)]"
                    : ""
                }`}
              >
                {dataColumns.map((col) => {
                  const cell = renderColumnCell(order, col.key);
                  return (
                    <td key={col.key} className={cell.className} title={cell.title}>
                      {cell.content}
                    </td>
                  );
                })}
                <td
                  className="sticky right-0 z-10 bg-card px-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1 text-[color:var(--iris-ink-soft)]">
                    <ActionTooltip label={statusActionLabel}>
                      <button
                        type="button"
                        disabled={!canToggleStatus}
                        aria-label={statusActionLabel}
                        onClick={() => onToggleStatus(order)}
                        className="iris-focusable iris-press relative grid size-9 place-items-center rounded-sm bg-transparent p-0 hover:bg-black/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check
                          className={`absolute h-[18px] w-[18px] transition-all duration-200 ease-out ${
                            order.status === "completed"
                              || order.status === "invoiced"
                              ? "scale-100 opacity-100"
                              : "scale-50 opacity-0"
                          }`}
                        />
                        <Circle
                          className={`absolute h-[18px] w-[18px] transition-all duration-200 ease-out ${
                            order.status === "completed"
                              || order.status === "invoiced"
                              ? "scale-50 opacity-0"
                              : "scale-100 opacity-100"
                          }`}
                        />
                      </button>
                    </ActionTooltip>
                    <ActionTooltip label={t("common.edit")}>
                      <button
                        type="button"
                        aria-label={t("common.edit")}
                        onClick={() => onEdit(order)}
                        className="iris-focusable iris-press grid size-9 place-items-center rounded-sm bg-transparent p-0 hover:bg-black/[0.05] hover:text-foreground"
                      >
                        <Pencil className="h-[18px] w-[18px]" />
                      </button>
                    </ActionTooltip>
                    <ActionTooltip label={t("workOrders.detail.duplicate")}>
                      <button
                        type="button"
                        aria-label={t("workOrders.detail.duplicate")}
                        onClick={() => onDuplicate(order)}
                        className="iris-focusable iris-press grid size-9 place-items-center rounded-sm bg-transparent p-0 hover:bg-black/[0.05] hover:text-foreground"
                      >
                        <Copy className="h-[18px] w-[18px]" />
                      </button>
                    </ActionTooltip>
                    {canDelete && (
                      <ActionTooltip label={t("common.delete")}>
                        <button
                          type="button"
                          aria-label={t("common.delete")}
                          onClick={() => onDelete(order)}
                          className="iris-focusable iris-press grid size-9 place-items-center rounded-sm bg-transparent p-0 text-[color:var(--iris-status-cancelled)] hover:bg-[color:var(--iris-status-cancelled)]/10"
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </ActionTooltip>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-background px-6 py-3 text-[11px] text-[color:var(--iris-ink-mute)]">
        <div>
          {t("workOrders.table.pageSummary", {
            total: totalFiltered,
            page: currentPage,
            pages: totalPages,
          })}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="iris-focusable iris-press border border-border bg-transparent px-2.5 py-1 text-[11px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("workOrders.table.prev")}
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              if (totalPages <= 7) return true;
              if (page === 1 || page === totalPages) return true;
              return Math.abs(page - currentPage) <= 1;
            })
            .map((page, idx, arr) => {
              const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
              const isCurrent = page === currentPage;
              return (
                <span key={page} className="contents">
                  {showEllipsis && (
                    <span className="px-1 text-[color:var(--iris-ink-faint)]">
                      …
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onPageChange(page)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`iris-focusable iris-press tnum min-w-7 border px-2.5 py-1 text-[11px] ${
                      isCurrent
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-transparent text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
                    }`}
                  >
                    {page}
                  </button>
                </span>
              );
            })}
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="iris-focusable iris-press border border-border bg-transparent px-2.5 py-1 text-[11px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("workOrders.table.next")}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span>{t("workOrders.table.perPage")}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) =>
              onPageSizeChange(Number(value) as PageSize)
            }
          >
            <SelectTrigger size="sm" className="h-7 w-16 rounded-none border-border text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
