import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { WorkOrdersFilters } from "@/components/WorkOrders/WorkOrdersFilters";
import { WorkOrdersTable } from "@/components/WorkOrders/WorkOrdersTable";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import type { WorkOrder } from "@/types/work-order";

function getLocalIsoDate(date = new Date()): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function canToggleCompletion(status: WorkOrder["status"]): boolean {
  return status === "active" || status === "completed";
}

function WorkOrdersPage(): React.JSX.Element {
  const navigate = useNavigate();
  const {
    orders,
    totalFiltered,
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

  const handleToggleStatus = useCallback(
    async (order: WorkOrder) => {
      if (!canToggleCompletion(order.status)) {
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

  const handleDelete = useCallback(
    async (order: WorkOrder) => {
      try {
        const result = await window.api.deleteWorkOrder(order.id);
        if (result.success) {
          await refreshOrders();
          toast.success(`Nalog ${order.orderNumber} je obrisan`);
        }
      } catch {
        toast.error("Greška pri brisanju naloga");
      }
    },
    [refreshOrders],
  );

  const handleDuplicate = useCallback(
    async (order: WorkOrder) => {
      try {
        await window.api.createWorkOrder({
          clientName: order.clientName,
          jobDescription: order.jobDescription,
          billingDocumentType: order.billingDocumentType,
          shipping: order.shipping,
          issuedBy: order.issuedBy,
          issueDate: getLocalIsoDate(),
          price: order.price,
        });
        await refreshOrders();
        toast.success(`Nalog ${order.orderNumber} je dupliran`);
      } catch {
        toast.error("Greška pri dupliranju naloga");
      }
    },
    [refreshOrders],
  );

  const handleEdit = useCallback(() => {
    // Edit form will be implemented in a future feature
    toast.info("Izmena naloga će biti dostupna uskoro");
  }, []);

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

        {!loading && !error && (
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
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onEdit={handleEdit}
            onToggleStatus={handleToggleStatus}
          />
        )}
      </div>
    </AppShell>
  );
}

export default WorkOrdersPage;
