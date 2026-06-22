import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Inbox, Loader2, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { WorkOrdersFilters } from "@/components/WorkOrders/WorkOrdersFilters";
import { WorkOrdersTable } from "@/components/WorkOrders/WorkOrdersTable";
import { DeleteWorkOrderDialog } from "@/components/WorkOrders/DeleteWorkOrderDialog";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { downloadWorkOrdersCsv } from "@/lib/work-orders/csv-export";
import {
  canToggleWorkOrderCompletion,
  getPrimaryWorkOrderTransition,
  getLocalIsoDate,
  getWorkOrderStatusLabel,
} from "@/shared/utils/work-orders";
import type { WorkOrder } from "@/types/work-order";

function WorkOrdersPage(): React.JSX.Element {
  const navigate = useNavigate();
  const {
    orders,
    filteredSortedOrders,
    totalFiltered,
    allOrdersCount,
    loading,
    error,
    filters,
    updateFilters,
    resetFilters,
    sortField,
    sortDirection,
    handleSort,
    currentPage,
    totalPages,
    setCurrentPage,
    pageSize,
    setPageSize,
    refreshOrders,
  } = useWorkOrders();
  const { visibleColumnSet } = useColumnVisibility();

  const [deleteTarget, setDeleteTarget] = useState<WorkOrder | null>(null);

  const handleExportCsv = useCallback(() => {
    if (filteredSortedOrders.length === 0) {
      toast.info("Nema naloga za izvoz");
      return;
    }
    downloadWorkOrdersCsv(filteredSortedOrders, visibleColumnSet);
    toast.success(`Izvezeno ${filteredSortedOrders.length} naloga`);
  }, [filteredSortedOrders, visibleColumnSet]);

  const handleToggleStatus = useCallback(
    async (order: WorkOrder) => {
      if (!canToggleWorkOrderCompletion(order.status)) {
        toast.info(`Status naloga ${order.orderNumber} se ne menja iz liste`);
        return;
      }

      const newStatus = getPrimaryWorkOrderTransition(order.status);
      if (!newStatus) return;
      const now = getLocalIsoDate();
      const isCompleting = newStatus === "completed" || newStatus === "invoiced";

      try {
        const updated = await window.api.updateWorkOrder(order.id, {
          status: newStatus,
          isCompleted: isCompleting,
          completionDate: isCompleting ? now : null,
        });
        if (!updated) {
          toast.error("Radni nalog nije pronađen.");
          return;
        }
        await refreshOrders();
        toast.success(`Nalog ${order.orderNumber}: ${getWorkOrderStatusLabel(newStatus)}`);
      } catch {
        toast.error("Greška pri promeni statusa");
      }
    },
    [refreshOrders],
  );

  const handleDeleteClick = useCallback((order: WorkOrder) => {
    setDeleteTarget(order);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const result = await window.api.deleteWorkOrder(deleteTarget.id);
      if (!result.success) {
        toast.error(result.message ?? "Greška pri brisanju naloga");
        return;
      }

      setDeleteTarget(null);
      await refreshOrders();
      toast.success(`Radni nalog ${deleteTarget.orderNumber} je obrisan`);
    } catch {
      toast.error("Neočekivana greška pri brisanju naloga");
    }
  }, [deleteTarget, refreshOrders]);

  const handleDuplicate = useCallback(
    (order: WorkOrder) => {
      navigate("/work-orders/new", {
        state: { duplicateFrom: order },
      });
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (order: WorkOrder) => {
      navigate(`/work-orders/${order.id}/edit`);
    },
    [navigate],
  );

  const handleOpen = useCallback(
    (order: WorkOrder) => {
      navigate(`/work-orders/${order.id}`);
    },
    [navigate],
  );

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.billingDocumentType !== "all" ||
    filters.deliveryMethod !== "all" ||
    filters.queue !== "all" ||
    filters.customerId !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                Iris · nalozi
              </div>
              <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
                Radni nalozi
              </h1>
              <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
                {allOrdersCount === 0
                  ? "Još nema naloga"
                  : `Ukupno ${totalFiltered} od ${allOrdersCount}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={totalFiltered === 0}
                className="iris-focusable iris-press flex items-center gap-1.5 border border-border bg-card px-4 py-2.5 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                Izvezi CSV
              </button>
              <button
                type="button"
                onClick={() => navigate("/work-orders/new")}
                className="iris-focusable iris-press group flex items-center gap-1.5 bg-foreground px-4 py-2.5 text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
              >
                <Plus className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:rotate-90" />
                Novi radni nalog
              </button>
            </div>
          </div>
        </div>

        <div className="animate-iris-enter px-5 sm:px-8" style={{ animationDelay: "60ms" }}>
          <WorkOrdersFilters
            filters={filters}
            updateFilters={updateFilters}
            resetFilters={resetFilters}
          />
        </div>

        {loading && (
          <div className="px-5 sm:px-8">
            <div
              className="flex items-center justify-center py-20 text-muted-foreground"
              style={{ animation: "iris-fade-in 280ms var(--iris-ease-out) both 200ms" }}
            >
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="text-sm">Učitavanje naloga...</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="px-5 sm:px-8">
            <div className="animate-iris-fade border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              Greška pri učitavanju naloga: {error}
            </div>
          </div>
        )}

        {!loading && !error && allOrdersCount === 0 && (
          <div className="px-5 sm:px-8">
            <div className="animate-iris-fade py-20 text-center">
              <Inbox className="mx-auto mb-3 h-8 w-8 text-[color:var(--iris-ink-faint)]" strokeWidth={1.25} />
              <p className="mb-4 text-sm text-muted-foreground">
                Nema radnih naloga. Kreirajte prvi radni nalog.
              </p>
              <Button size="sm" onClick={() => navigate("/work-orders/new")}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Novi radni nalog
              </Button>
            </div>
          </div>
        )}

        {!loading &&
          !error &&
          allOrdersCount > 0 &&
          totalFiltered === 0 &&
          hasActiveFilters && (
            <div className="px-5 sm:px-8">
              <div className="animate-iris-fade py-20 text-center">
                <SearchX className="mx-auto mb-3 h-8 w-8 text-[color:var(--iris-ink-faint)]" strokeWidth={1.25} />
                <p className="mb-4 text-sm text-muted-foreground">
                  Nema radnih naloga koji odgovaraju izabranim filterima.
                </p>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Poništi filtere
                </Button>
              </div>
            </div>
          )}

        {!loading && !error && totalFiltered > 0 && (
          <div
            className="animate-iris-enter px-5 pb-8 sm:px-8"
            style={{ animationDelay: "120ms" }}
          >
            <WorkOrdersTable
              orders={orders}
              totalFiltered={totalFiltered}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              onDelete={handleDeleteClick}
              onDuplicate={handleDuplicate}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onOpen={handleOpen}
            />
          </div>
        )}
      </div>

      <DeleteWorkOrderDialog
        orderNumber={deleteTarget?.orderNumber ?? ""}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
      />
    </AppShell>
  );
}

export default WorkOrdersPage;
