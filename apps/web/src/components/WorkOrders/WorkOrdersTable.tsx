import { useEffect, useRef } from "react";
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
import {
  WORK_ORDER_BILLING_LABELS,
  canToggleWorkOrderCompletion,
  formatWorkOrderDate,
  formatWorkOrderPrice,
  getPrimaryWorkOrderTransition,
  getWorkOrderPriorityLabel,
  getWorkOrderStatusLabel,
} from "@/shared/utils/work-orders";

interface ColDef {
  key: string;
  label: string;
  field?: SortField;
  width?: string;
  align?: "left" | "right";
}

const COLUMNS: ColDef[] = [
  { key: "orderNumber", label: "Br. naloga", field: "orderNumber", width: "110px" },
  { key: "clientName", label: "Klijent", field: "clientName", width: "140px" },
  { key: "jobDescription", label: "Opis posla", field: "jobDescription" },
  { key: "assigned", label: "Operater", field: "assignment.assignedTo", width: "120px" },
  { key: "priority", label: "Prioritet", field: "assignment.priority", width: "90px" },
  { key: "billing", label: "Tip dokumenta", field: "billingDocumentType", width: "130px" },
  { key: "schedule", label: "Plan", field: "assignment.scheduledDate", width: "110px" },
  { key: "price", label: "Cena", field: "price", width: "110px", align: "right" },
  { key: "status", label: "Status", field: "status", width: "110px" },
  { key: "actions", label: "", width: "110px" },
];

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
}: WorkOrdersTableProps): React.JSX.Element {
  // Stagger the entrance animation only on the very first paint. Subsequent
  // sort / filter / page changes should swap rows in place - no shimmer.
  const isFirstPaintRef = useRef(true);
  useEffect(() => {
    isFirstPaintRef.current = false;
  }, []);
  const shouldStagger = isFirstPaintRef.current;
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="min-w-[1180px] w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((col) => {
              const isSortable = !!col.field;
              const isActive = col.field === sortField;
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
                      : isSortable
                        ? "none"
                        : undefined
                  }
                >
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.field!)}
                      className="iris-focusable iris-press inline-flex cursor-pointer items-center gap-1 bg-transparent p-0 text-[10px] font-medium uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
                      aria-label={
                        isActive
                          ? `Sortirano po ${col.label}, ${sortDirection === "asc" ? "rastuće" : "opadajuće"}`
                          : `Sortiraj po ${col.label}`
                      }
                    >
                      {col.label}
                      <SortIcon
                        field={col.field!}
                        currentField={sortField}
                        direction={sortDirection}
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => {
            const canToggleStatus = canToggleWorkOrderCompletion(order.status);
            const statusTransition = getPrimaryWorkOrderTransition(order.status);
            const statusActionLabel = canToggleStatus
              ? `Promeni u ${getWorkOrderStatusLabel(statusTransition!)}`
              : "Status ovog naloga se ne menja iz liste";
            // Cap stagger so a 100-row page doesn't take 3s to settle.
            const rowDelayMs = Math.min(idx, 12) * 22;
            return (
              <tr
                key={order.id}
                onClick={onOpen ? () => onOpen(order) : undefined}
                style={
                  shouldStagger
                    ? {
                        animation:
                          "iris-fade-up 360ms var(--iris-ease-out) both",
                        animationDelay: `${rowDelayMs}ms`,
                      }
                    : undefined
                }
                className={`h-10 border-b border-[color:var(--iris-border-soft)] transition-colors duration-150 last:border-b-0 ${
                  onOpen ? "cursor-pointer hover:bg-black/[0.025]" : ""
                }`}
              >
                <td className="tnum px-4 font-medium text-foreground">
                  {order.orderNumber}
                </td>
                <td className="px-4 text-foreground">{order.clientName}</td>
                <td
                  className="max-w-[220px] truncate px-4 text-[color:var(--iris-ink-soft)]"
                  title={order.jobDescription}
                >
                  {order.jobDescription}
                </td>
                <td className="px-4 text-[color:var(--iris-ink-soft)]">
                  {order.assignment.assignedTo ?? "Nedodeljeno"}
                </td>
                <td className="px-4 text-[color:var(--iris-ink-soft)]">
                  {getWorkOrderPriorityLabel(order.assignment.priority)}
                </td>
                <td className="px-4 text-[color:var(--iris-ink-soft)]">
                  {order.billingDocumentType
                    ? WORK_ORDER_BILLING_LABELS[order.billingDocumentType]
                    : "-"}
                </td>
                <td className="px-4 text-[color:var(--iris-ink-soft)]">
                  {order.assignment.scheduledDate
                    ? formatWorkOrderDate(order.assignment.scheduledDate)
                    : order.dueDate
                      ? formatWorkOrderDate(order.dueDate)
                      : "-"}
                </td>
                <td
                  className={`tnum px-4 text-right ${
                    order.price !== null
                      ? "font-medium text-foreground"
                      : "text-[color:var(--iris-ink-faint)]"
                  }`}
                >
                  {formatWorkOrderPrice(order.price)}
                </td>
                <td className="px-4">
                  <IrisBadge status={order.status} />
                </td>
                <td className="px-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2.5 text-[color:var(--iris-ink-mute)]">
                    <ActionTooltip label={statusActionLabel}>
                      <button
                        type="button"
                        disabled={!canToggleStatus}
                        aria-label={statusActionLabel}
                        onClick={() => onToggleStatus(order)}
                        className="iris-focusable iris-press relative grid size-3.5 place-items-center bg-transparent p-0 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check
                          className={`absolute h-3.5 w-3.5 transition-all duration-200 ease-out ${
                            order.status === "completed"
                              || order.status === "invoiced"
                              ? "scale-100 opacity-100"
                              : "scale-50 opacity-0"
                          }`}
                        />
                        <Circle
                          className={`absolute h-3.5 w-3.5 transition-all duration-200 ease-out ${
                            order.status === "completed"
                              || order.status === "invoiced"
                              ? "scale-50 opacity-0"
                              : "scale-100 opacity-100"
                          }`}
                        />
                      </button>
                    </ActionTooltip>
                    <ActionTooltip label="Izmeni">
                      <button
                        type="button"
                        aria-label="Izmeni"
                        onClick={() => onEdit(order)}
                        className="iris-focusable iris-press bg-transparent p-0 hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </ActionTooltip>
                    <ActionTooltip label="Dupliraj">
                      <button
                        type="button"
                        aria-label="Dupliraj"
                        onClick={() => onDuplicate(order)}
                        className="iris-focusable iris-press bg-transparent p-0 hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </ActionTooltip>
                    <ActionTooltip label="Obriši">
                      <button
                        type="button"
                        aria-label="Obriši"
                        onClick={() => onDelete(order)}
                        className="iris-focusable iris-press bg-transparent p-0 text-[color:var(--iris-status-cancelled)] hover:opacity-80"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </ActionTooltip>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex items-center justify-between border-t border-border bg-background px-6 py-3 text-[11px] text-[color:var(--iris-ink-mute)]">
        <div>
          Ukupno {totalFiltered} naloga · stranica {currentPage} od {totalPages}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="iris-focusable iris-press border border-border bg-transparent px-2.5 py-1 text-[11px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prethodna
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
            Sledeća →
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span>Po strani</span>
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
