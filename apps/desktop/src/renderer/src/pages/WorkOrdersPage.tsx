import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        toast.info(
          t("workOrders.list.statusNotFromList", { order: order.orderNumber }),
        );
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
          toast.error(t("workOrders.list.notFoundToast"));
          return;
        }
        await refreshOrders();
        toast.success(
          isCompleting
            ? t("workOrders.list.markedCompleted", { order: order.orderNumber })
            : t("workOrders.list.markedActive", { order: order.orderNumber }),
        );
      } catch {
        toast.error(t("workOrders.list.statusChangeError"));
      }
    },
    [refreshOrders, t],
  );

  const handleDeleteClick = useCallback((order: WorkOrder) => {
    setDeleteTarget(order);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const result = await window.api.deleteWorkOrder(deleteTarget.id);
      if (!result.success) {
        toast.error(result.message ?? t("workOrders.list.deleteError"));
        return;
      }

      setDeleteTarget(null);
      await refreshOrders();
      toast.success(
        t("workOrders.list.deleted", { order: deleteTarget.orderNumber }),
      );
    } catch {
      toast.error(t("workOrders.list.deleteUnexpected"));
    }
  }, [deleteTarget, refreshOrders, t]);

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
        <div className="animate-iris-enter border-b border-border px-10 pt-7 pb-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.list.eyebrow")}
              </div>
              <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
                {t("workOrders.list.title")}
              </h1>
              <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
                {allOrdersCount === 0
                  ? t("workOrders.list.noOrders")
                  : t("workOrders.list.countSummary", {
                      shown: totalFiltered,
                      total: allOrdersCount,
                    })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/work-orders/new")}
              className="iris-focusable iris-press group flex items-center gap-1.5 bg-foreground px-4 py-2.5 text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
            >
              <Plus className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:rotate-90" />
              {t("workOrders.list.newOrder")}
            </button>
          </div>
        </div>

        <div className="animate-iris-enter px-8" style={{ animationDelay: "60ms" }}>
          <WorkOrdersFilters
            filters={filters}
            updateFilters={updateFilters}
            resetFilters={resetFilters}
          />
        </div>

        {loading && (
          <div className="px-8">
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
          <div className="px-8">
            <div className="animate-iris-fade border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              {t("workOrders.list.loadError", { error })}
            </div>
          </div>
        )}

        {!loading && !error && allOrdersCount === 0 && (
          <div className="px-8">
            <div className="animate-iris-fade py-20 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                {t("workOrders.list.emptyTitle")}
              </p>
              <Button size="sm" onClick={() => navigate("/work-orders/new")}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("workOrders.list.newOrder")}
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
              <div className="animate-iris-fade py-20 text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("workOrders.list.noMatches")}
                </p>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  {t("workOrders.list.resetFilters")}
                </Button>
              </div>
            </div>
          )}

        {!loading && !error && totalFiltered > 0 && (
          <div
            className="animate-iris-enter px-8 pb-8"
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
