import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { WorkOrderForm } from "@/components/WorkOrders/WorkOrderForm";
import { useAuth } from "@/hooks/useAuth";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";
import type { Location, WorkOrder, WorkOrderNote } from "@/types/work-order";

function getDuplicateInitialValues(
  source: WorkOrder | null,
): WorkOrderFormValues | undefined {
  if (!source) return undefined;

  return {
    customerId: source.customerId,
    locationId: source.locationId,
    clientName: source.clientName,
    contactPerson: source.contactPerson,
    jobDescription: source.jobDescription,
    jobDetails: source.jobDetails,
    billingDocumentType: source.billingDocumentType,
    billingDocumentNumber: source.billingDocumentNumber,
    shipping: source.shipping,
    assignment: {
      ...source.assignment,
      assignedTo: null,
    },
    price: source.price,
    note: source.note,
    issueDate: source.issueDate,
    dueDate: source.dueDate,
    executedBy: null,
    internalNotes: [],
    customerNotes: [],
    attachments: [],
    materialUsage: [],
    timeEntries: [],
    invoiceDraft: {
      status: "draft",
      invoiceNumber: null,
      lineItems: [],
      paidAt: null,
    },
    communication: {
      publicToken: "",
      notificationEmail: source.communication.notificationEmail,
      emailNotificationsEnabled: source.communication.emailNotificationsEnabled,
      signedBy: null,
      signedAt: null,
    },
  };
}

function cleanNotes(notes: WorkOrderNote[]): WorkOrderNote[] {
  return notes.filter((note) => note.body.trim() !== "");
}

function WorkOrderCreatePage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    void window.api.getLocations().then(setLocations);
  }, []);

  // Duplicate pre-fill: data passed via router state
  const duplicateSource =
    (location.state as { duplicateFrom?: WorkOrder })?.duplicateFrom ?? null;
  const duplicateInitialValues = getDuplicateInitialValues(duplicateSource);

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      try {
        const result = await window.api.createWorkOrder({
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
          issuedBy: currentUser.username,
          issueDate: values.issueDate,
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
        toast.success(`Radni nalog ${result.orderNumber} je kreiran`);
        navigate(`/work-orders/${result.id}`);
      } catch {
        toast.error("Greška pri kreiranju radnog naloga");
      }
    },
    [currentUser.username, navigate],
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
            Nazad na naloge
          </button>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · nalog
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            Novi radni nalog
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            Popunite podatke za novi nalog
          </div>
        </div>

        <div className="animate-iris-enter pl-10 pr-0" style={{ animationDelay: "80ms" }}>
          <WorkOrderForm
            initialValues={duplicateInitialValues}
            locations={locations}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </AppShell>
  );
}

export default WorkOrderCreatePage;
