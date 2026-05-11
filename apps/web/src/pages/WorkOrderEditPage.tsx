import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { WorkOrderForm } from "@/components/WorkOrders/WorkOrderForm";
import {
  canToggleWorkOrderCompletion,
  getLocalIsoDate,
} from "@/shared/utils/work-orders";
import type { WorkOrder } from "@/types/work-order";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";

function WorkOrderEditPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError("Radni nalog nije pronađen");
          return;
        }

        setOrder(data);
      } catch {
        if (!isCancelled) {
          setError("Greška pri učitavanju radnog naloga");
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
  }, [id]);

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      if (!id || !order) return;

      try {
        const updated = await window.api.updateWorkOrder(id, {
          clientName: values.clientName,
          contactPerson: values.contactPerson,
          jobDescription: values.jobDescription,
          jobDetails: values.jobDetails,
          billingDocumentType: values.billingDocumentType,
          billingDocumentNumber: values.billingDocumentNumber,
          shipping: values.shipping,
          executedBy: values.executedBy,
          issueDate: values.issueDate,
          dueDate: values.dueDate,
          price: values.price,
          note: values.note,
        });
        if (!updated) {
          toast.error("Radni nalog nije pronađen.");
          return;
        }
        toast.success(`Radni nalog ${updated.orderNumber} je ažuriran`);
        navigate("/work-orders");
      } catch {
        toast.error("Greška pri ažuriranju radnog naloga");
      }
    },
    [id, order, navigate],
  );

  const handleToggleStatus = useCallback(async () => {
    if (!id || !order) return;
    const isCompleting = order.status === "active";
    const newStatus = isCompleting ? "completed" : "active";
    const now = getLocalIsoDate();

    try {
      const updated = await window.api.updateWorkOrder(id, {
        status: newStatus,
        isCompleted: isCompleting,
        completionDate: isCompleting ? now : null,
      });
      if (!updated) {
        toast.error("Radni nalog nije pronađen.");
        return;
      }
      setOrder(updated);
      toast.success(
        isCompleting
          ? `Nalog ${updated.orderNumber} označen kao završen`
          : `Nalog ${updated.orderNumber} označen kao aktivan`,
      );
    } catch {
      toast.error("Greška pri promeni statusa");
    }
  }, [id, order]);

  const handleCancel = useCallback(() => {
    navigate("/work-orders");
  }, [navigate]);

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-10 pt-7 pb-5">
          <button
            type="button"
            onClick={() => navigate("/work-orders")}
            className="iris-focusable iris-press group mb-2 inline-flex items-center gap-1 bg-transparent p-0 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
            Nazad na naloge
          </button>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                Iris · izmena
              </div>
              <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
                {order ? `Izmena naloga ${order.orderNumber}` : "Izmena naloga"}
              </h1>
              <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
                {order?.clientName ?? "Izmena postojećeg naloga"}
              </div>
            </div>
            {order && canToggleWorkOrderCompletion(order.status) && (
              <Button
                variant={order.status === "completed" ? "outline" : "secondary"}
                size="sm"
                onClick={handleToggleStatus}
              >
                {order.status === "active"
                  ? "Označi kao završeno"
                  : "Označi kao aktivno"}
              </Button>
            )}
          </div>
        </div>

        {loading && (
          <div className="px-8">
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
          <div className="px-8">
            <div className="animate-iris-fade border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              {error}
            </div>
          </div>
        )}

        {!loading && !error && order && (
          <div className="animate-iris-enter pl-10 pr-0" style={{ animationDelay: "80ms" }}>
            <WorkOrderForm
              initialData={order}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default WorkOrderEditPage;
