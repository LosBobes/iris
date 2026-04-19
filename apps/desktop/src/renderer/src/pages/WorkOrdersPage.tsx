import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { WorkOrdersFilters } from "@/components/WorkOrders/WorkOrdersFilters";
import { WorkOrdersTable } from "@/components/WorkOrders/WorkOrdersTable";
import { DeleteWorkOrderDialog } from "@/components/WorkOrders/DeleteWorkOrderDialog";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import {
  canToggleWorkOrderCompletion,
  getLocalIsoDate,
} from "@/shared/utils/work-orders";
import type { WorkOrder } from "@/types/work-order";

function WorkOrdersPage(): React.JSX.Element {
  const navigate = useNavigate();
  const {
    orders,
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

  const [deleteTarget, setDeleteTarget] = useState<WorkOrder | null>(null);

  const handleToggleStatus = useCallback(
    async (order: WorkOrder) => {
      if (!canToggleWorkOrderCompletion(order.status)) {
        toast.info(`Status naloga ${order.orderNumber} se ne menja iz liste`);
        return;
      }

      const isCompleting = order.status === "active";
      const newStatus = isCompleting ? "completed" : "active";
      const now = getLocalIsoDate();

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
        toast.success(
          isCompleting
            ? `Nalog ${order.orderNumber} označen kao završen`
            : `Nalog ${order.orderNumber} označen kao aktivan`,
        );
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
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="border-b border-border px-10 pt-7 pb-5">
          <div className="flex items-end justify-between">
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
            <button
              type="button"
              onClick={() => navigate("/work-orders/new")}
              className="flex items-center gap-1.5 bg-foreground px-4 py-2.5 text-[12px] font-medium tracking-[0.3px] text-background"
            >
              <Plus className="h-3.5 w-3.5" />
              Novi radni nalog
            </button>
          </div>
        </div>

        <div className="px-8">
          <WorkOrdersFilters
            filters={filters}
            updateFilters={updateFilters}
            resetFilters={resetFilters}
          />
        </div>

        {loading && (
          <div className="px-8">
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="text-sm">Učitavanje naloga...</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="px-8">
            <div className="border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              Greška pri učitavanju naloga: {error}
            </div>
          </div>
        )}

        {!loading && !error && allOrdersCount === 0 && (
          <div className="px-8">
            <div className="py-20 text-center">
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
            <div className="px-8">
              <div className="py-20 text-center">
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
          <div className="px-8 pb-8">
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
