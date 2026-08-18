import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { WorkOrderForm } from "@/components/WorkOrders/WorkOrderForm";
import { useAuth } from "@/hooks/useAuth";
import { getLocalIsoDate } from "@/shared/utils/work-orders";
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
    // Issue date is implied from the creation date, so a duplicate starts fresh
    // with today rather than copying the source order's issue date.
    issueDate: getLocalIsoDate(),
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

  // Reserve the next order number as soon as the form opens so the operator can
  // see it in the header. The server hands out a distinct number per open form,
  // so two operators creating orders at once never see or save the same number.
  const [reservedOrderNumber, setReservedOrderNumber] = useState<string | null>(null);
  const [reservationFailed, setReservationFailed] = useState(false);

  // Track the live reservation and whether it was consumed so we can release an
  // unsaved number when the operator abandons the form (see the unmount effect).
  const reservedRef = useRef<string | null>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    reservedRef.current = reservedOrderNumber;
  }, [reservedOrderNumber]);

  useEffect(() => {
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
  }, []);

  // Release the reserved number when the operator leaves the create form without
  // saving (cancel or navigating away both unmount this page), so it is reclaimed
  // immediately instead of lingering until the reservation expires.
  useEffect(() => {
    return () => {
      if (reservedRef.current && !consumedRef.current) {
        void window.api.releaseWorkOrderNumber(reservedRef.current);
      }
    };
  }, []);

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      try {
        const result = await window.api.createWorkOrder({
          // Pass the reserved number so the saved order keeps the number shown in
          // the header; the server falls back to a fresh number if it lapsed.
          orderNumber: reservedOrderNumber,
          clientName: values.clientName,
          contactPerson: values.contactPerson,
          jobDescription: values.jobDescription,
          jobDetails: values.jobDetails,
          billingDocumentType: values.billingDocumentType,
          billingDocumentNumber: values.billingDocumentNumber,
          shipping: values.shipping,
          issuedBy: currentUser.username,
          issueDate: values.issueDate,
          // Desktop form does not collect the proforma deadline yet.
          proformaDueDate: null,
          dueDate: values.dueDate,
          price: values.price,
          note: values.note,
        });
        // The save consumed the reservation server-side; mark it so the unmount
        // cleanup doesn't try to release an already-committed number.
        consumedRef.current = true;
        toast.success(t("workOrders.create.created", { order: result.orderNumber }));
        navigate("/work-orders");
      } catch {
        toast.error(t("workOrders.create.createError"));
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
          <div className="mt-2 inline-flex items-baseline gap-2 rounded-md border border-border px-3 py-1.5">
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
