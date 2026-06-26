import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import {
  ArrowLeft,
  Ban,
  Coins,
  Copy,
  Download,
  Eye,
  Files,
  Loader2,
  Pencil,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { CancelWorkOrderDialog } from "@/components/WorkOrders/CancelWorkOrderDialog";
import { DeleteWorkOrderDialog } from "@/components/WorkOrders/DeleteWorkOrderDialog";
import { useAuth } from "@/hooks/useAuth";
import { IrisBadge } from "@/components/WorkOrders/IrisBadge";
import { WorkOrderPreviewPane } from "@/components/WorkOrders/WorkOrderPdfPreview";
import { WorkOrderPrintSheet } from "@/components/WorkOrders/WorkOrderPrintSheet";
import type { Location, WorkOrder } from "@/types/work-order";
import {
  buildWorkOrderCustomerNotice,
  getWorkOrderBillingDocumentLabel,
  getWorkOrderDeliveryLabel,
  getWorkOrderStatusLabel,
  getPrimaryWorkOrderTransition,
  getAllowedWorkOrderTransitions,
  formatWorkOrderEventLabel,
  formatWorkOrderDate,
  formatWorkOrderDateTime,
  formatWorkOrderPrice,
  getLocalIsoDate,
  getWorkOrderCustomerNextStep,
} from "@/shared/utils/work-orders";


/**
 * Masks the monetary *amount* in a price-change timeline event for non-admin
 * operators: they still see that the price was entered/changed (lifecycle), just
 * not the figure. The stored label is "Cena: <before> → <after>" (see diffPrice
 * in the store); "—" on the before side means the price was set for the first
 * time. Cost-workflow markers ("Čeka unos troška", "Trošak unet") carry no
 * figure already, so they pass through unchanged. Returns the original label for
 * every non-price event.
 */
function maskMoneyTimelineLabel(label: string, kind: string): string {
  if (kind !== "change" || !label.startsWith("Cena:")) return label;
  const arrow = label.indexOf(" → ");
  const before = (arrow === -1 ? label.slice(5) : label.slice(5, arrow)).trim();
  const firstTime = before === "" || before === "—";
  return i18n.t(
    firstTime ? "workOrders.detail.priceEntered" : "workOrders.detail.priceChanged",
  );
}

// Renders a timeline label. Field-change events arrive as
// "<polje>: <pre> → <posle>"; we style the before/after so the diff reads at a
// glance. Anything else (status, created, completed) renders as plain text.
function renderTimelineLabel(label: string, kind: string): React.ReactNode {
  if (kind !== "change") return label;

  const separator = label.indexOf(": ");
  const arrow = label.indexOf(" → ");
  if (separator === -1 || arrow === -1 || arrow < separator) return label;

  const field = label.slice(0, separator);
  const before = label.slice(separator + 2, arrow);
  const after = label.slice(arrow + 3);

  return (
    <>
      <span className="text-[color:var(--iris-ink-soft)]">{field}: </span>
      <span className="text-[color:var(--iris-ink-mute)] line-through">{before}</span>
      <span className="text-[color:var(--iris-ink-faint)]"> → </span>
      <span className="text-foreground">{after}</span>
    </>
  );
}

/**
 * Prints the canonical print layout — the same HTML the PDF is generated from,
 * fetched from the API and printed inside a hidden same-origin iframe. This
 * avoids the browser printing the whole app page (app chrome, drifted print CSS,
 * clipped columns). Falls back to opening the PDF report if rendering fails.
 */
export async function printWorkOrder(order: WorkOrder): Promise<void> {
  let html: string;
  try {
    html = await window.api.getWorkOrderPreviewHtml(order);
  } catch {
    window.open(
      window.api.getWorkOrderReportUrl(order.id),
      "_blank",
      "noopener,noreferrer",
    );
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  // srcdoc keeps the iframe same-origin, so contentWindow.print() is allowed.
  iframe.srcdoc = html;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }
    const cleanup = (): void => iframe.remove();
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 60000);
    win.focus();
    win.print();
  };
  document.body.appendChild(iframe);
}

export function openWorkOrderPdf(orderId: string): void {
  window.open(window.api.getWorkOrderReportUrl(orderId), "_blank", "noopener,noreferrer");
}

function WorkOrderDetailPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Deleting is admin-only on the API; gate the button to match.
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";
  const canCancelOrder = order
    ? getAllowedWorkOrderTransitions(order.status).includes("cancelled")
    : false;

  const handleAdvanceStatus = async (): Promise<void> => {
    if (!order) return;
    const newStatus = getPrimaryWorkOrderTransition(order.status);
    if (!newStatus) return;
    const isCompleting = newStatus === "completed" || newStatus === "invoiced";
    const now = getLocalIsoDate();
    try {
      const updated = await window.api.updateWorkOrder(order.id, {
        status: newStatus,
        isCompleted: isCompleting,
        completionDate: isCompleting ? now : null,
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
  };

  const handleCancelConfirm = async (): Promise<void> => {
    if (!order) return;
    try {
      const updated = await window.api.updateWorkOrder(order.id, {
        status: "cancelled",
      });
      if (!updated) {
        toast.error(t("workOrders.toast.notFound"));
        return;
      }
      setOrder(updated);
      setCancelOpen(false);
      toast.success(
        t("workOrders.toast.cancelled", { order: updated.orderNumber }),
      );
    } catch {
      toast.error(t("workOrders.toast.cancelError"));
    }
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!order) return;
    try {
      const result = await window.api.deleteWorkOrder(order.id);
      if (!result.success) {
        toast.error(result.message ?? t("workOrders.toast.deleteError"));
        return;
      }
      setDeleteOpen(false);
      toast.success(
        t("workOrders.toast.deleted", { order: order.orderNumber }),
      );
      navigate("/work-orders");
    } catch {
      toast.error(t("workOrders.toast.deleteUnexpected"));
    }
  };

  useEffect(() => {
    if (!id) {
      setOrder(null);
      setError(t("workOrders.detail.notFound"));
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      setOrder(null);

      try {
        const data = await window.api.getWorkOrderById(id);
        if (cancelled) return;
        if (!data) {
          setOrder(null);
          setError(t("workOrders.detail.notFound"));
          return;
        }
        setOrder(data);
      } catch {
        if (!cancelled) {
          setOrder(null);
          setError(t("workOrders.detail.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [id, t]);

  useEffect(() => {
    void window.api.getLocations().then(setLocations);
  }, []);

  return (
    <>
      <div className="work-order-screen-root">
        <AppShell>
          <div className="flex items-stretch">
          <div className="min-w-0 flex-1">
        <div className="animate-iris-enter border-b border-border px-10 pt-5 pb-6">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] text-[color:var(--iris-ink-mute)]">
            <button
              type="button"
              onClick={() => navigate("/work-orders")}
              className="iris-focusable iris-press group flex items-center gap-1 bg-transparent p-0 text-[color:var(--iris-ink-mute)] hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
              {t("workOrders.list.title")}
            </button>
            <span className="text-[color:var(--iris-ink-faint)]">/</span>
            <span className="tnum text-foreground">
              {order?.orderNumber ?? "…"}
            </span>
          </div>

          {order && (
            <div className="flex flex-wrap items-start justify-between gap-y-3">
              <div>
                <div className="flex flex-wrap items-baseline gap-3.5">
                  <div className="tnum text-[28px] font-normal tracking-[-0.5px] text-foreground">
                    {order.orderNumber}
                  </div>
                  <IrisBadge status={order.status} />
                  {isAdmin && order.needsCostReview && (
                    <span className="inline-flex items-center gap-1 border border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--iris-accent)]">
                      <Coins className="h-3 w-3" />
                      {t("workOrders.list.needsCostReview")}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[14px] text-[color:var(--iris-ink-soft)]">
                  {order.jobDescription} ·{" "}
                  <span className="text-foreground">{order.clientName}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {getPrimaryWorkOrderTransition(order.status) && (
                  <button
                    type="button"
                    onClick={() => void handleAdvanceStatus()}
                    className="iris-focusable iris-press flex items-center gap-1.5 border border-[color:var(--iris-accent)] bg-transparent px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-accent)] hover:bg-[color:var(--iris-accent)]/10"
                  >
                    {t("workOrders.detail.moveTo")}{" "}
                    {getWorkOrderStatusLabel(
                      getPrimaryWorkOrderTransition(order.status)!,
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void printWorkOrder(order)}
                  title={t("workOrders.detail.print")}
                  className="iris-focusable iris-press flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t("workOrders.detail.print")}
                </button>
                <button
                  type="button"
                  onClick={() => openWorkOrderPdf(order.id)}
                  title={t("workOrders.detail.pdf")}
                  className="iris-focusable iris-press flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("workOrders.detail.pdf")}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewOpen((open) => !open)}
                  aria-pressed={previewOpen}
                  title={t("workOrders.detail.preview")}
                  className={`iris-focusable iris-press flex items-center gap-1.5 border px-3 py-2 text-[12px] font-medium tracking-[0.3px] ${
                    previewOpen
                      ? "border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)]/10 text-[color:var(--iris-accent)]"
                      : "border-border bg-card text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {t("workOrders.detail.preview")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      window.api.getPublicTrackingUrl(
                        order.communication.publicToken,
                      ),
                    );
                  }}
                  title={t("workOrders.detail.publicLink")}
                  className="iris-focusable iris-press flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t("workOrders.detail.publicLink")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate("/work-orders/new", {
                      state: { duplicateFrom: order },
                    })
                  }
                  title={t("workOrders.detail.duplicate")}
                  className="iris-focusable iris-press flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground"
                >
                  <Files className="h-3.5 w-3.5" />
                  {t("workOrders.detail.duplicate")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/work-orders/${order.id}/edit`)}
                  className="iris-focusable iris-press flex items-center gap-1.5 bg-foreground px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("common.edit")}
                </button>
                {/* Destructive actions grouped together behind a divider so
                    cancel + delete read as one "danger" cluster, not scattered. */}
                {(canCancelOrder || isAdmin) && (
                  <div className="flex items-center gap-1.5 sm:ml-1 sm:border-l sm:border-border sm:pl-2.5">
                    {canCancelOrder && (
                      <button
                        type="button"
                        onClick={() => setCancelOpen(true)}
                        title={t("workOrders.detail.cancelOrder")}
                        className="iris-focusable iris-press flex items-center gap-1.5 border border-[color:var(--iris-status-cancelled)] bg-transparent px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-status-cancelled)] hover:bg-[color:var(--iris-status-cancelled)]/10"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {t("workOrders.detail.cancelOrder")}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeleteOpen(true)}
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                        className="iris-focusable iris-press flex items-center gap-1.5 border border-[color:var(--iris-status-cancelled)] bg-transparent px-3 py-2 text-[12px] font-medium tracking-[0.3px] text-[color:var(--iris-status-cancelled)] hover:bg-[color:var(--iris-status-cancelled)]/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("common.delete")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div
            className="flex items-center justify-center py-20 text-muted-foreground"
            style={{ animation: "iris-fade-in 280ms var(--iris-ease-out) both 200ms" }}
          >
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">{t("workOrders.list.loading")}</span>
          </div>
        )}

        {!loading && error && (
          <div className="px-10 pt-6">
            <div className="animate-iris-fade border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-[12px] text-[color:var(--iris-status-cancelled)]">
              {error}
            </div>
          </div>
        )}

        {!loading && !error && order && (
          <div className="animate-iris-enter" style={{ animationDelay: "80ms" }}>
            <DetailBody order={order} />
          </div>
        )}
          </div>
          {previewOpen && order && (
            <aside className="animate-iris-enter sticky top-0 hidden h-screen w-[380px] shrink-0 self-start overflow-auto border-l border-border bg-card p-6 lg:block">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.detail.pdfPreview")}
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  aria-label={t("workOrders.detail.closePreview")}
                  className="iris-focusable iris-press flex items-center justify-center bg-transparent p-1 text-[color:var(--iris-ink-mute)] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <WorkOrderPreviewPane order={order} />
            </aside>
          )}
          </div>
        </AppShell>
      </div>
      {order && <WorkOrderPrintSheet order={order} locations={locations} />}
      <CancelWorkOrderDialog
        orderNumber={order?.orderNumber ?? ""}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={() => void handleCancelConfirm()}
      />
      <DeleteWorkOrderDialog
        orderNumber={order?.orderNumber ?? ""}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

function DetailBody({ order }: { order: WorkOrder }): React.JSX.Element {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";
  const metaCells: Array<[string, string]> = [
    [
      t("workOrders.detail.documentType"),
      order.billingDocumentType
        ? getWorkOrderBillingDocumentLabel(order.billingDocumentType)
        : "-",
    ],
    [t("workOrders.detail.operator"), order.assignment.assignedTo ?? t("workOrders.detail.unassigned")],
    [t("workOrders.detail.planned"), order.assignment.scheduledDate ? formatWorkOrderDate(order.assignment.scheduledDate) : "-"],
    [t("workOrders.detail.issueDate"), formatWorkOrderDate(order.issueDate)],
    [
      t("workOrders.detail.delivery"),
      order.shipping.deliveryMethod
        ? getWorkOrderDeliveryLabel(order.shipping.deliveryMethod)
        : "-",
    ],
    [t("workOrders.notice.dueDate"), order.dueDate ? formatWorkOrderDate(order.dueDate) : "-"],
    [
      t("workOrders.detail.documentNumber"),
      order.billingDocumentNumber ? order.billingDocumentNumber : "-",
    ],
  ];

  const total = order.price ?? 0;
  const base = total / 1.2;
  const pdv = total - base;

  const timeline: Array<{
    time: string;
    label: string;
    kind: string;
    who: string;
    state: "done" | "current" | "pending";
  }> =
    order.events.length > 0
      ? order.events.map((event, index) => {
          // Operators keep every event but never see the price amount — the
          // price-change label is replaced with an amount-free marker.
          const formatted = formatWorkOrderEventLabel(event.label, event.kind);
          return {
            time: formatWorkOrderDateTime(event.createdAt),
            label: isAdmin ? formatted : maskMoneyTimelineLabel(formatted, event.kind),
            kind: event.kind,
            who: event.actor,
            state: index === order.events.length - 1 ? "current" : "done",
          };
        })
      : [
          {
            time: formatWorkOrderDateTime(order.createdAt),
            label: t("workOrders.detail.orderCreated"),
            kind: "created",
            who: order.issuedBy,
            state: "done",
          },
        ];

  return (
    <>
      <CustomerSummaryPanel order={order} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] border-b border-border bg-card">
        {metaCells.map(([k, v]) => (
          <div
            key={k}
            className="min-w-0 border-r border-b border-[color:var(--iris-border-soft)] px-6 py-4"
          >
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {k}
            </div>
            <div className="tnum mt-1.5 break-words text-[14px] text-foreground">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_1.6fr]">
        <div className="border-r border-border p-8">
          <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.detail.workflow")}
          </div>
          {timeline.map((e, i) => {
            const isLast = i === timeline.length - 1;
            const dotBg =
              e.state === "done"
                ? "var(--foreground)"
                : e.state === "current"
                  ? "var(--iris-accent)"
                  : "transparent";
            const dotBorder =
              e.state === "done"
                ? "var(--foreground)"
                : e.state === "current"
                  ? "var(--iris-accent)"
                  : "var(--iris-border-soft)";
            const lineBg =
              e.state === "done"
                ? "var(--foreground)"
                : "var(--iris-border-soft)";
            return (
              <div
                key={i}
                className={`relative flex gap-3.5 ${isLast ? "" : "pb-4"}`}
              >
                <div className="relative flex-shrink-0 pt-0.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full border-[1.5px]"
                    style={{ background: dotBg, borderColor: dotBorder }}
                  />
                  {!isLast && (
                    <div
                      className="absolute top-3.5 -bottom-3 left-[4.25px] w-[1.5px]"
                      style={{ background: lineBg }}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <div
                    className={`text-[12px] text-foreground ${e.state === "current" ? "font-medium" : ""}`}
                  >
                    {renderTimelineLabel(e.label, e.kind)}
                  </div>
                  <div className="tnum mt-0.5 text-[11px] text-[color:var(--iris-ink-mute)]">
                    {e.time} · {e.who}
                  </div>
                </div>
              </div>
            );
          })}

          {order.note && (
            <div className="mt-6 border-t border-[color:var(--iris-border-soft)] pt-5">
              <div className="mb-3 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.detail.inheritedNote")}
              </div>
              <div
                className="px-3.5 py-2.5 text-[12px] leading-[1.6] text-[color:var(--iris-ink-soft)]"
                style={{
                  background: "var(--background)",
                  borderLeft: "2px solid var(--iris-accent)",
                }}
              >
                {order.note}
              </div>
            </div>
          )}

          {(order.internalNotes.length > 0 || order.customerNotes.length > 0) && (
            <div className="mt-6 border-t border-[color:var(--iris-border-soft)] pt-5">
              <div className="mb-3 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.detail.notes")}
              </div>
              <div className="space-y-3">
                {order.internalNotes.map((note) => (
                  <div key={note.id} className="border-l-2 border-foreground bg-background px-3.5 py-2.5 text-[12px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
                    <div className="mb-1 text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                      {t("workOrders.detail.internal")}
                    </div>
                    {note.body}
                  </div>
                ))}
                {order.customerNotes.map((note) => (
                  <div key={note.id} className="border-l-2 border-[color:var(--iris-accent)] bg-background px-3.5 py-2.5 text-[12px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
                    <div className="mb-1 text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                      {t("workOrders.detail.forCustomer")}
                    </div>
                    {note.body}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-8">
          <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.detail.items")}
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.detail.description")}
                </th>
                <th className="w-28 py-2 text-right text-[10px] font-medium uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.detail.quantity")}
                </th>
                {isAdmin && (
                  <th className="w-24 py-2 text-right text-[10px] font-medium uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.detail.amount")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(order.invoiceDraft.lineItems.length > 0
                ? order.invoiceDraft.lineItems
                : [
                    {
                      id: "legacy",
                      kind: "service" as const,
                      description: order.jobDescription,
                      quantity: 1,
                      unit: "kom" as const,
                      unitPrice: order.price ?? 0,
                    },
                  ]
              ).map((line) => (
                <tr key={line.id} className="border-b border-[color:var(--iris-border-soft)]">
                  <td className="py-3 text-foreground">
                    <div>{line.description}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.7px] text-[color:var(--iris-ink-mute)]">
                      {t(`workOrders.lineKind.${line.kind}`)}
                    </div>
                  </td>
                  <td className="tnum py-3 text-right text-[color:var(--iris-ink-soft)]">
                    {line.quantity} {line.unit}
                  </td>
                  {isAdmin && (
                    <td className="tnum py-3 text-right font-medium text-foreground">
                      {formatWorkOrderPrice(line.quantity * line.unitPrice)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 grid grid-cols-2 gap-6">
            <InfoList
              title={t("workOrders.detail.material")}
              empty={t("workOrders.detail.materialEmpty")}
              rows={order.materialUsage.map((item) => [
                item.name,
                `${item.quantity} ${item.unit}`,
              ])}
            />
            <InfoList
              title={t("workOrders.detail.time")}
              empty={t("workOrders.detail.timeEmpty")}
              rows={order.timeEntries.map((entry) => [
                entry.operator,
                `${entry.minutes} min`,
              ])}
            />
            <InfoList
              title={t("workOrders.detail.attachments")}
              empty={t("workOrders.detail.attachmentsEmpty")}
              rows={order.attachments.map((attachment) => [
                attachment.fileName,
                attachment.url ? "otvori" : attachment.fileType,
              ])}
            />
            {isAdmin && (
              <InfoList
                title={t("workOrders.detail.invoice")}
                empty={t("workOrders.detail.invoiceEmpty")}
                rows={[
                  [t("workOrders.notice.status"), order.invoiceDraft.status],
                  [t("workOrders.detail.invoiceNumber"), order.invoiceDraft.invoiceNumber ?? "-"],
                  [t("workOrders.detail.paid"), order.invoiceDraft.paidAt ? formatWorkOrderDate(order.invoiceDraft.paidAt) : "-"],
                ]}
              />
            )}
          </div>

          {isAdmin && order.price !== null && (
            <div className="mt-4 flex justify-end">
              <div className="w-64 text-[12px]">
                <div className="flex justify-between py-1.5 text-[color:var(--iris-ink-soft)]">
                  <span>{t("workOrders.detail.base")}</span>
                  <span className="tnum">
                    {new Intl.NumberFormat("sr-Latn-RS", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    }).format(base)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 text-[color:var(--iris-ink-soft)]">
                  <span>{t("workOrders.detail.vat")}</span>
                  <span className="tnum">
                    {new Intl.NumberFormat("sr-Latn-RS", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    }).format(pdv)}
                  </span>
                </div>
                <div className="mt-1.5 flex justify-between border-t border-foreground py-2.5 text-foreground">
                  <span className="font-medium">{t("workOrders.detail.toPay")}</span>
                  <span className="tnum text-[14px] font-medium">
                    {formatWorkOrderPrice(total)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CustomerSummaryPanel({ order }: { order: WorkOrder }): React.JSX.Element {
  const { t } = useTranslation();
  const customerDueDate = order.dueDate ?? order.assignment.scheduledDate;
  const isOverdue = Boolean(
    customerDueDate && customerDueDate < getLocalIsoDate() && !order.isCompleted,
  );
  const customerNotice = buildWorkOrderCustomerNotice(order);

  return (
    <div className="border-b border-border px-8 py-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.detail.customerSummary")}
          </div>
          <div className="mt-1 text-[13px] leading-6 text-[color:var(--iris-ink-soft)]">
            {getWorkOrderCustomerNextStep(order.status)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!navigator.clipboard) {
              toast.error(t("workOrders.detail.copyUnavailable"));
              return;
            }
            void navigator.clipboard
              .writeText(customerNotice)
              .then(() => toast.success(t("workOrders.detail.copySuccess")))
              .catch(() => toast.error(t("workOrders.detail.copyFailed")));
          }}
          className="iris-focusable iris-press flex shrink-0 items-center gap-1.5 border border-border bg-transparent px-3 py-[7px] text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
          {t("workOrders.detail.copyNotice")}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-[color:var(--iris-border-soft)] px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.notice.status")}
          </div>
          <div className="mt-1.5 text-[13px] text-foreground">
            {getWorkOrderStatusLabel(order.status)}
          </div>
        </div>
        <div
          className={`border px-3.5 py-3 ${
            isOverdue
              ? "border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10"
              : "border-[color:var(--iris-border-soft)]"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.notice.dueDate")}
          </div>
          <div
            className={`tnum mt-1.5 text-[13px] ${
              isOverdue
                ? "text-[color:var(--iris-status-cancelled)]"
                : "text-foreground"
            }`}
          >
            {customerDueDate ? formatWorkOrderDate(customerDueDate) : "-"}
          </div>
        </div>
        <div className="border border-[color:var(--iris-border-soft)] px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.detail.orderNumber")}
          </div>
          <div className="tnum mt-1.5 text-[13px] text-foreground">
            {order.orderNumber}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<[string, string]>;
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-[color:var(--iris-ink-mute)]">{empty}</div>
      ) : (
        <div className="space-y-1.5 text-[12px]">
          {rows.map(([label, value]) => (
            <div key={`${label}-${value}`} className="flex justify-between gap-4">
              <span className="text-[color:var(--iris-ink-soft)]">{label}</span>
              <span className="tnum text-foreground">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkOrderDetailPage;
