import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { WorkOrderForm } from "@/components/WorkOrders/WorkOrderForm";
import { useAuth } from "@/hooks/useAuth";
import { getLocalIsoDate } from "@/shared/utils/work-orders";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";
import {
  clearWorkOrderDraft,
  readWorkOrderDraft,
  writeWorkOrderDraft,
} from "@/lib/work-orders/draft-cache";
import type { WorkOrder, WorkOrderNote } from "@/types/work-order";

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
    // Issue date is implied from the creation date, so a duplicate starts fresh
    // with today rather than copying the source order's issue date.
    issueDate: getLocalIsoDate(),
    proformaDueDate: source.proformaDueDate,
    dueDate: source.dueDate,
    issuedBy: source.issuedBy,
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  // Duplicate pre-fill: data passed via router state
  const duplicateSource =
    (location.state as { duplicateFrom?: WorkOrder })?.duplicateFrom ?? null;
  const duplicateInitialValues = getDuplicateInitialValues(duplicateSource);

  // Recover an in-progress draft cached before an accidental refresh. Read once on
  // mount; a recovered draft takes precedence over a duplicate pre-fill (the draft
  // already reflects whatever the operator had edited, duplicate included).
  const [recoveredDraft] = useState(() => readWorkOrderDraft());
  const initialValues = recoveredDraft?.values ?? duplicateInitialValues;

  // Reserve the next order number as soon as the form opens so the operator can
  // see it in the header. The server hands out a distinct number per open form,
  // so two operators creating orders at once never see or save the same number.
  const [reservedOrderNumber, setReservedOrderNumber] = useState<string | null>(null);
  const [reservationFailed, setReservationFailed] = useState(false);

  // Track the live reservation and whether it was consumed so we can release an
  // unsaved number when the operator abandons the form (see the unmount effect).
  const reservedRef = useRef<string | null>(null);
  const consumedRef = useRef(false);
  // Latest form values, kept so we can re-cache the draft once the reservation
  // resolves (a draft written before the number arrived would otherwise miss it).
  const latestValuesRef = useRef<WorkOrderFormValues | null>(null);

  useEffect(() => {
    reservedRef.current = reservedOrderNumber;
  }, [reservedOrderNumber]);

  useEffect(() => {
    // On refresh recovery, reuse the number from the cached draft instead of
    // reserving a fresh one: the browser reload skipped the release cleanup, so
    // the original reservation still stands server-side and the save will keep it.
    if (recoveredDraft?.orderNumber) {
      setReservedOrderNumber(recoveredDraft.orderNumber);
      return;
    }
    let active = true;
    window.api
      .reserveWorkOrderNumber()
      .then((reserved) => {
        if (active) setReservedOrderNumber(reserved.orderNumber);
      })
      .catch(() => {
        if (active) setReservationFailed(true);
      });
    return () => {
      active = false;
    };
  }, [recoveredDraft]);

  // Re-cache the draft once the reserved number is known, so a draft first written
  // before the reservation returned gets the number attached — that number is what
  // lets a refresh reuse the same reservation rather than stranding it.
  useEffect(() => {
    if (reservedOrderNumber && latestValuesRef.current) {
      writeWorkOrderDraft(reservedOrderNumber, latestValuesRef.current);
    }
  }, [reservedOrderNumber]);

  // Tell the operator their unsaved order was restored after the reload.
  useEffect(() => {
    if (recoveredDraft) {
      toast.success(t("workOrders.toast.draftRecovered"));
    }
  }, [recoveredDraft, t]);

  // Release the reserved number when the operator leaves the create form without
  // saving (cancel or navigating away both unmount this page), so it is reclaimed
  // immediately instead of lingering until the reservation expires. Leaving this
  // way is a deliberate abandon, so drop the cached draft too. A browser refresh
  // does not run this cleanup, which is exactly why the draft survives a reload.
  useEffect(() => {
    return () => {
      if (reservedRef.current && !consumedRef.current) {
        void window.api.releaseWorkOrderNumber(reservedRef.current);
        clearWorkOrderDraft();
      }
    };
  }, []);

  // Persist the in-progress draft (reserved number + current values) on every
  // form change so an accidental refresh can restore both.
  const handleValuesChange = useCallback((values: WorkOrderFormValues) => {
    latestValuesRef.current = values;
    writeWorkOrderDraft(reservedRef.current, values);
  }, []);

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      try {
        const result = await window.api.createWorkOrder({
          // Pass the reserved number so the saved order keeps the number shown in
          // the header; the server falls back to a fresh number if it lapsed.
          orderNumber: reservedOrderNumber,
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
          issuedBy: values.issuedBy || currentUser.username,
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
        // The save consumed the reservation server-side; mark it so the unmount
        // cleanup doesn't try to release an already-committed number, and drop the
        // cached draft now that the order is persisted.
        consumedRef.current = true;
        clearWorkOrderDraft();
        toast.success(t("workOrders.toast.created", { order: result.orderNumber }));
        navigate(`/work-orders/${result.id}`);
      } catch {
        toast.error(t("workOrders.toast.createError"));
      }
    },
    [currentUser.username, navigate, reservedOrderNumber, t],
  );

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
          <p className="text-[10px] font-medium uppercase tracking-[2px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.create.eyebrow")}
          </p>
          <div className="mt-3 inline-flex items-baseline gap-2 rounded-md border border-border bg-[color:var(--iris-surface-raised,transparent)] px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {t("workOrders.create.orderNumberLabel")}
            </span>
            <span className="font-mono text-[15px] font-medium tabular-nums text-foreground">
              {reservedOrderNumber ??
                (reservationFailed
                  ? t("workOrders.create.orderNumberError")
                  : t("workOrders.create.orderNumberPending"))}
            </span>
          </div>
          <h1 className="mt-2.5 text-[32px] font-normal leading-[1.08] tracking-[-0.5px] text-foreground">
            {t("workOrders.create.title")}
          </h1>
          <p className="mt-2 text-[13px] text-[color:var(--iris-ink-soft)]">
            {t("workOrders.create.subtitle")}
          </p>
        </header>

        <div className="animate-iris-enter pl-10 pr-0" style={{ animationDelay: "80ms" }}>
          <WorkOrderForm
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onValuesChange={handleValuesChange}
            previewOrderNumber={reservedOrderNumber}
          />
        </div>
      </div>
    </AppShell>
  );
}

export default WorkOrderCreatePage;
