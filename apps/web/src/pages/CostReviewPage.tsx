import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { WorkOrdersFilters } from "@/components/WorkOrders/WorkOrdersFilters";
import { WorkOrdersTable } from "@/components/WorkOrders/WorkOrdersTable";
import { DeleteWorkOrderDialog } from "@/components/WorkOrders/DeleteWorkOrderDialog";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import { useAuth } from "@/hooks/useAuth";
import {
  canToggleWorkOrderCompletion,
  getPrimaryWorkOrderTransition,
  getWorkOrderStatusLabel,
} from "@/shared/utils/work-orders";
import type { WorkOrder } from "@/types/work-order";

/**
 * Admin-only queue of work orders awaiting cost entry (line items with no
 * captured cost). It reuses the work-orders list machinery but pins the
 * needsCostReview filter on so the page always shows exactly that queue.
 */
function CostReviewPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    orders,
    totalFiltered,
    loading,
    error,
    filters,
    updateFilters,
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
  // Deleting a work order is admin-only on the API; this whole page is admin-only.
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";

  const [deleteTarget, setDeleteTarget] = useState<WorkOrder | null>(null);

  // Pin the cost-review filter so this route only ever lists that queue, even
  // after a reset from the filters bar.
  useEffect(() => {
    if (!filters.needsCostReview) {
      updateFilters({ needsCostReview: true });
    }
  }, [filters.needsCostReview, updateFilters]);

  const resetFilters = useCallback(() => {
    updateFilters({
      search: "",
      status: "all",
      billingDocumentType: "all",
      deliveryMethod: "all",
      queue: "all",
      customerId: "",
      assignedTo: "",
      dateFrom: "",
      dateTo: "",
      needsCostReview: true,
    });
  }, [updateFilters]);

  const handleToggleStatus = useCallback(
    async (order: WorkOrder) => {
      if (!canToggleWorkOrderCompletion(order.status)) {
        toast.info(
          t("workOrders.toast.statusNotFromList", { order: order.orderNumber }),
        );
        return;
      }

      const newStatus = getPrimaryWorkOrderTransition(order.status);
      if (!newStatus) return;

      try {
        const updated = await window.api.updateWorkOrder(order.id, {
          status: newStatus,
        });
        if (!updated) {
          toast.error(t("workOrders.toast.notFound"));
          return;
        }
        await refreshOrders();
        toast.success(
          t("workOrders.toast.statusChanged", {
            order: order.orderNumber,
            status: getWorkOrderStatusLabel(newStatus),
          }),
        );
      } catch {
        toast.error(t("workOrders.toast.statusError"));
      }
    },
    [refreshOrders, t],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const result = await window.api.deleteWorkOrder(deleteTarget.id);
      if (!result.success) {
        toast.error(result.message ?? t("workOrders.toast.deleteError"));
        return;
      }

      setDeleteTarget(null);
      await refreshOrders();
      toast.success(
        t("workOrders.toast.deleted", { order: deleteTarget.orderNumber }),
      );
    } catch {
      toast.error(t("workOrders.toast.deleteUnexpected"));
    }
  }, [deleteTarget, refreshOrders, t]);

  const handleDuplicate = useCallback(
    (order: WorkOrder) => {
      navigate("/work-orders/new", { state: { duplicateFrom: order } });
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

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {t("workOrders.costReview.eyebrow")}
            </div>
            <h1 className="flex items-center gap-2.5 text-[30px] font-normal tracking-[-0.8px] text-foreground">
              <Coins className="h-6 w-6 text-[color:var(--iris-accent)]" strokeWidth={1.5} />
              {t("workOrders.costReview.title")}
            </h1>
            <div className="text-[12px] text-[color:var(--iris-ink-soft)]">
              {t("workOrders.costReview.subtitle")}
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
              <span className="text-sm">{t("workOrders.list.loading")}</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="px-5 sm:px-8">
            <div className="animate-iris-fade border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              {t("workOrders.list.loadError", { error })}
            </div>
          </div>
        )}

        {!loading && !error && totalFiltered === 0 && (
          <div className="px-5 sm:px-8">
            <div className="animate-iris-fade py-20 text-center">
              <Coins className="mx-auto mb-3 h-8 w-8 text-[color:var(--iris-ink-faint)]" strokeWidth={1.25} />
              <p className="text-sm text-muted-foreground">
                {t("workOrders.costReview.empty")}
              </p>
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
              onDelete={(order) => setDeleteTarget(order)}
              onDuplicate={handleDuplicate}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onOpen={handleOpen}
              canDelete={isAdmin}
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

export default CostReviewPage;
