import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pencil,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle,
  Circle,
} from "lucide-react";
import type {
  WorkOrder,
  WorkOrderStatus,
  BillingDocumentType,
  DeliveryMethod,
} from "@/types/work-order";
import {
  PAGE_SIZE_OPTIONS,
  type PageSize,
  type SortField,
  type SortDirection,
} from "@/hooks/useWorkOrders";

// ---------------------------------------------------------------------------
// Serbian label maps
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: "Nacrt",
  active: "Aktivan",
  completed: "Završen",
  cancelled: "Otkazan",
};

const STATUS_VARIANT: Record<
  WorkOrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  active: "default",
  completed: "secondary",
  cancelled: "destructive",
};

const BILLING_LABELS: Record<BillingDocumentType, string> = {
  invoice: "Faktura",
  cashCollection: "Gotovinski račun",
  proforma: "Profaktura",
};

const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  pickup: "Lično preuzimanje",
  postExpress: "Post Express",
  cityExpress: "City Express",
  fieldVisit: "Terenski obilazak",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return (
    new Intl.NumberFormat("sr-Latn-RS", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price) + " RSD"
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Column header with sort indicator
// ---------------------------------------------------------------------------

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}

function SortableHeader({
  label,
  field,
  currentField,
  direction,
  onSort,
}: SortableHeaderProps): React.JSX.Element {
  const isActive = field === currentField;
  return (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
        )}
      </span>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
}: WorkOrdersTableProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader
              label="Br. naloga"
              field="orderNumber"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label="Klijent"
              field="clientName"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label="Opis posla"
              field="jobDescription"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label="Tip dokumenta"
              field="billingDocumentType"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label="Dostava"
              field="shipping.deliveryMethod"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label="Cena"
              field="price"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label="Status"
              field="status"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label="Datum izdavanja"
              field="issueDate"
              currentField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <TableHead>Radnje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const canToggleStatus =
              order.status === "active" || order.status === "completed";

            return (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  {order.orderNumber}
                </TableCell>
                <TableCell>{order.clientName}</TableCell>
                <TableCell
                  className="max-w-[200px] truncate"
                  title={order.jobDescription}
                >
                  {order.jobDescription}
                </TableCell>
                <TableCell>
                  {order.billingDocumentType
                    ? BILLING_LABELS[order.billingDocumentType]
                    : '—'}
                </TableCell>
                <TableCell>
                  {order.shipping.deliveryMethod
                    ? DELIVERY_LABELS[order.shipping.deliveryMethod]
                    : '—'}
                </TableCell>
                <TableCell>{formatPrice(order.price)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[order.status]}>
                    {STATUS_LABELS[order.status]}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(order.issueDate)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={!canToggleStatus}
                      title={
                        canToggleStatus
                          ? order.status === "completed"
                            ? "Označi kao aktivan"
                            : "Označi kao završen"
                          : "Status ovog naloga se ne menja iz liste"
                      }
                      onClick={() => onToggleStatus(order)}
                    >
                      {order.status === "completed" ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Izmeni"
                      onClick={() => onEdit(order)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Dupliraj"
                      onClick={() => onDuplicate(order)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Obriši"
                      onClick={() => onDelete(order)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          Ukupno {totalFiltered} naloga — stranica {currentPage} od {totalPages}
        </p>
        <div className="flex justify-center">
          {totalPages > 1 && (
            <Pagination className="w-auto">
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => onPageChange(currentPage - 1)}
                  >
                    Prethodna
                  </Button>
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    if (totalPages <= 7) return true;
                    if (page === 1 || page === totalPages) return true;
                    return Math.abs(page - currentPage) <= 1;
                  })
                  .map((page, idx, arr) => {
                    const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <span key={page} className="contents">
                        {showEllipsis && (
                          <PaginationItem>
                            <span className="flex h-8 w-8 items-center justify-center text-xs text-muted-foreground">
                              ...
                            </span>
                          </PaginationItem>
                        )}
                        <PaginationItem>
                          <Button
                            variant={
                              page === currentPage ? "default" : "outline"
                            }
                            size="icon"
                            onClick={() => onPageChange(page)}
                          >
                            {page}
                          </Button>
                        </PaginationItem>
                      </span>
                    );
                  })}
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                  >
                    Sledeća
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 sm:justify-self-end">
          <span className="text-xs text-muted-foreground">Po strani</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) =>
              onPageSizeChange(Number(value) as PageSize)
            }
          >
            <SelectTrigger size="sm" className="w-20">
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
