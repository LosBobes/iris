import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { UseFormWatch } from "react-hook-form";
import type { WorkOrderFormValues } from "@/lib/work-orders/validation";
import type { WorkOrder, WorkOrderNote } from "@/types/work-order";
import i18n from "@/i18n";

// A4 rendered at ~96dpi. The print sheet uses mm units, which the browser lays
// out at this pixel size; we scale the whole page down to fit the side pane.
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;

function cleanNotes(notes: WorkOrderNote[]): WorkOrderNote[] {
  return notes.filter((note) => note.body.trim() !== "");
}

/** Builds a full WorkOrder from the live form values for the preview render. */
function buildPreviewOrder(
  values: WorkOrderFormValues,
  initialData?: WorkOrder | null,
): WorkOrder {
  const now = new Date().toISOString();
  const base: WorkOrder =
    initialData ??
    ({
      id: "preview",
      orderNumber: i18n.t("workOrders.detail.previewOrderNumber"),
      issuedBy: "",
      executedBy: null,
      isCompleted: false,
      status: "new",
      profit: null,
      createdAt: now,
      updatedAt: now,
      completionDate: null,
      statusHistory: [],
      events: [],
    } as unknown as WorkOrder);

  return {
    ...base,
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
    issuedBy: values.issuedBy ?? base.issuedBy ?? "",
    executedBy: values.executedBy ?? base.executedBy ?? null,
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    price: values.price,
    note: values.note,
    invoiceDraft: values.invoiceDraft,
    communication: values.communication,
    internalNotes: cleanNotes(values.internalNotes),
    customerNotes: cleanNotes(values.customerNotes),
    attachments: values.attachments,
    materialUsage: values.materialUsage,
    timeEntries: values.timeEntries,
  } as WorkOrder;
}

/**
 * Renders the canonical print HTML for a work order inside a scaled A4 iframe.
 * The HTML is fetched from the API (debounced) so callers can pass a frequently
 * changing order without hammering the endpoint. Shared by the live form
 * preview and the detail-page PDF sidebar.
 */
export function WorkOrderPreviewPane({
  order,
}: {
  order: WorkOrder;
}): React.JSX.Element {
  const { t } = useTranslation();
  // Serialize the order so the fetch only re-runs when the rendered shape
  // actually changes (the form passes a fresh object on every keystroke).
  const orderKey = useMemo(() => JSON.stringify(order), [order]);

  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      setLoading(true);
      window.api
        .getWorkOrderPreviewHtml(JSON.parse(orderKey) as WorkOrder)
        .then((result) => {
          if (active) setHtml(result);
        })
        .catch(() => {
          if (active) setHtml("");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [orderKey]);

  // Scale the A4 page to the pane width.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.45);
  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = (): void => {
      setScale(node.clientWidth / PAGE_WIDTH_PX);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t("workOrders.detail.printPreview")}
        </div>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--iris-ink-mute)]" />
        )}
      </div>
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden border border-border bg-[#f7f3eb]"
        style={{ height: PAGE_HEIGHT_PX * scale }}
      >
        <iframe
          title="Pregled radnog naloga"
          srcDoc={html}
          aria-label="Pregled radnog naloga"
          className="origin-top-left border-0 bg-white"
          style={{
            width: PAGE_WIDTH_PX,
            height: PAGE_HEIGHT_PX,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}

interface WorkOrderPdfPreviewProps {
  watch: UseFormWatch<WorkOrderFormValues>;
  initialData?: WorkOrder | null;
}

/**
 * Live print preview shown beside the work-order form. It builds a full order
 * from the live form values and renders it through {@link WorkOrderPreviewPane},
 * so it updates as the operator edits the order.
 */
export function WorkOrderPdfPreview({
  watch,
  initialData,
}: WorkOrderPdfPreviewProps): React.JSX.Element {
  // watch() (no args) re-renders this component on any form change.
  const values = watch();
  const order = useMemo(
    () => buildPreviewOrder(values, initialData),
    [values, initialData],
  );
  return <WorkOrderPreviewPane order={order} />;
}
