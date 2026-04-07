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
        await window.api.updateWorkOrder(order.id, {
          status: newStatus,
          isCompleted: isCompleting,
          completionDate: isCompleting ? now : null,
        });
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
      if (result.success) {
        await refreshOrders();
        toast.success(`Radni nalog ${deleteTarget.orderNumber} je obrisan`);
      }
    } catch {
      toast.error("Greška pri brisanju naloga");
    } finally {
      setDeleteTarget(null);
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

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.billingDocumentType !== "all" ||
    filters.deliveryMethod !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <AppShell>
      <div className="space-y-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">Radni nalozi</h1>
          <Button size="sm" onClick={() => navigate("/work-orders/new")}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Novi radni nalog
          </Button>
        </div>

        <WorkOrdersFilters
          filters={filters}
          updateFilters={updateFilters}
          resetFilters={resetFilters}
        />

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Učitavanje naloga...</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
            <p className="text-sm text-destructive">
              Greška pri učitavanju naloga: {error}
            </p>
          </div>
        )}

        {!loading && !error && allOrdersCount === 0 && (
          <div className="py-20 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              Nema radnih naloga. Kreirajte prvi radni nalog.
            </p>
            <Button size="sm" onClick={() => navigate("/work-orders/new")}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Novi radni nalog
            </Button>
          </div>
        )}

        {!loading &&
          !error &&
          allOrdersCount > 0 &&
          totalFiltered === 0 &&
          hasActiveFilters && (
            <div className="py-20 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Nema radnih naloga koji odgovaraju izabranim filterima.
              </p>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Poništi filtere
              </Button>
            </div>
          )}

        {!loading && !error && totalFiltered > 0 && (
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
          />
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
