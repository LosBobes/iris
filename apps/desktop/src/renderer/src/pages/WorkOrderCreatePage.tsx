import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { WorkOrderForm } from "@/components/WorkOrders/WorkOrderForm";
import { useAuth } from "@/hooks/useAuth";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";
import type { WorkOrder } from "@/types/work-order";

function getDuplicateInitialValues(
  source: WorkOrder | null,
): WorkOrderFormValues | undefined {
  if (!source) return undefined;

  return {
    clientName: source.clientName,
    contactPerson: source.contactPerson,
    jobDescription: source.jobDescription,
    jobDetails: source.jobDetails,
    billingDocumentType: source.billingDocumentType,
    billingDocumentNumber: source.billingDocumentNumber,
    shipping: source.shipping,
    price: source.price,
    note: source.note,
    issueDate: source.issueDate,
    dueDate: source.dueDate,
    executedBy: null,
  };
}

function WorkOrderCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { currentUser } = useAuth();

  // Duplicate pre-fill: data passed via router state
  const duplicateSource =
    (location.state as { duplicateFrom?: WorkOrder })?.duplicateFrom ?? null;
  const duplicateInitialValues = getDuplicateInitialValues(duplicateSource);

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      try {
        const result = await window.api.createWorkOrder({
          clientName: values.clientName,
          contactPerson: values.contactPerson,
          jobDescription: values.jobDescription,
          jobDetails: values.jobDetails,
          billingDocumentType: values.billingDocumentType,
          billingDocumentNumber: values.billingDocumentNumber,
          shipping: values.shipping,
          issuedBy: currentUser.username,
          issueDate: values.issueDate,
          dueDate: values.dueDate,
          price: values.price,
          note: values.note,
        });
        toast.success(t("workOrders.create.created", { order: result.orderNumber }));
        navigate("/work-orders");
      } catch {
        toast.error(t("workOrders.create.createError"));
      }
    },
    [currentUser.username, navigate, t],
  );

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
            {t("workOrders.create.back")}
          </button>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.create.eyebrow")}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            {t("workOrders.create.title")}
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            {t("workOrders.create.subtitle")}
          </div>
        </div>

        <div
          className="animate-iris-enter pl-10 pr-0"
          style={{ animationDelay: "80ms" }}
        >
          <WorkOrderForm
            initialValues={duplicateInitialValues}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </AppShell>
  );
}

export default WorkOrderCreatePage;
