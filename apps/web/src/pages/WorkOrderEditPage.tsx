import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { WorkOrderForm } from "@/components/WorkOrders/WorkOrderForm";
import { useWorkOrderEditLock } from "@/hooks/useWorkOrderEditLock";
import {
  canToggleWorkOrderCompletion,
  getPrimaryWorkOrderTransition,
  getWorkOrderStatusLabel,
} from "@/shared/utils/work-orders";
import type {
  WorkOrder,
  WorkOrderNote,
} from "@/types/work-order";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";

function cleanNotes(notes: WorkOrderNote[]): WorkOrderNote[] {
  return notes.filter((note) => note.body.trim() !== "");
}

function WorkOrderEditPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lockedBy, readOnly } = useWorkOrderEditLock(id);

  useEffect(() => {
    if (!id) return;
    let isCancelled = false;

    const loadOrder = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      setOrder(null);

      try {
        const data = await window.api.getWorkOrderById(id);
        if (isCancelled) return;

        if (!data) {
          setError(t("workOrders.detail.notFound"));
          return;
        }

        setOrder(data);
      } catch {
        if (!isCancelled) {
          setError(t("workOrders.detail.loadError"));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadOrder();

    return () => {
      isCancelled = true;
    };
  }, [id, t]);

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      if (!id || !order) return;

      try {
        const updated = await window.api.updateWorkOrder(id, {
          customerId: values.customerId,
          locationId: values.locationId,
          clientName: values.clientName,
          contactPerson: values.contactPerson,
          jobDescription: values.jobDescription,
          jobDetails: values.jobDetails,
          billingDocumentType: values.billingDocumentType,
          billingDocumentNumber: values.billingDocumentNumber,
          shipping: values.shipping,
          assignment: values.assignment,
          issuedBy: values.issuedBy ?? undefined,
          executedBy: values.executedBy,
          issueDate: values.issueDate,
          proformaDueDate: values.proformaDueDate,
          dueDate: values.dueDate,
          price: values.price,
          note: values.note,
          internalNotes: cleanNotes(values.internalNotes),
          customerNotes: cleanNotes(values.customerNotes),
          attachments: values.attachments,
          materialUsage: values.materialUsage,
          timeEntries: values.timeEntries,
          invoiceDraft: values.invoiceDraft,
          communication: values.communication,
        });
        if (!updated) {
          toast.error(t("workOrders.toast.notFound"));
          return;
        }
        toast.success(t("workOrders.toast.updated", { order: updated.orderNumber }));
        navigate(`/work-orders/${updated.id}`);
      } catch {
        toast.error(t("workOrders.toast.updateError"));
      }
    },
    [id, order, navigate, t],
  );

  const handleToggleStatus = useCallback(async () => {
    if (!id || !order) return;
    const newStatus = getPrimaryWorkOrderTransition(order.status);
    if (!newStatus) return;

    try {
      // The server derives isCompleted and stamps/clears the completion date
      // from the status transition, so we send only the status and let the
      // backend own the completion date (avoids racing its own update).
      const updated = await window.api.updateWorkOrder(id, {
        status: newStatus,
      });
      if (!updated) {
        toast.error(t("workOrders.toast.notFound"));
        return;
      }
      setOrder(updated);
      toast.success(
        t("workOrders.toast.statusChanged", {
          order: updated.orderNumber,
          status: getWorkOrderStatusLabel(newStatus),
        }),
      );
    } catch {
      toast.error(t("workOrders.toast.statusError"));
    }
  }, [id, order, t]);

  const handleCancel = useCallback(() => {
    navigate("/work-orders");
  }, [navigate]);

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="animate-iris-enter border-b border-border px-10 pt-8 pb-7">
          <button
            type="button"
            onClick={() => navigate("/work-orders")}
            className="iris-focusable iris-press group mb-6 inline-flex items-center gap-1.5 bg-transparent p-0 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
            {t("workOrders.create.back")}
          </button>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[2px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.edit.eyebrow")}
              </p>
              <h1 className="mt-2.5 text-[32px] font-normal leading-[1.08] tracking-[-0.5px] text-foreground">
                {order ? t("workOrders.edit.title", { order: order.orderNumber }) : t("workOrders.edit.titleNew")}
              </h1>
              <p className="mt-2 text-[13px] text-[color:var(--iris-ink-soft)]">
                {order?.clientName ?? t("workOrders.edit.subtitleFallback")}
              </p>
            </div>
            {order && !readOnly && canToggleWorkOrderCompletion(order.status) && (
              <Button
                variant={order.status === "completed" ? "outline" : "secondary"}
                size="sm"
                onClick={handleToggleStatus}
              >
                {t("workOrders.detail.moveTo")} {getWorkOrderStatusLabel(getPrimaryWorkOrderTransition(order.status)!)}
              </Button>
            )}
          </div>
        </header>

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
              {error}
            </div>
          </div>
        )}

        {!loading && !error && order && (
          <div className="animate-iris-enter pl-10 pr-0" style={{ animationDelay: "80ms" }}>
            {readOnly && (
              <div className="mb-6 mr-10 flex items-center gap-2.5 border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
                <Lock className="h-4 w-4 shrink-0" />
                <span>{t("workOrders.edit.locked", { user: lockedBy ?? "" })}</span>
              </div>
            )}
            <WorkOrderForm
              initialData={order}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default WorkOrderEditPage;
