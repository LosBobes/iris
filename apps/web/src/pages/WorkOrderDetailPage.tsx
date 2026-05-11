import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { IrisBadge } from "@/components/WorkOrders/IrisBadge";
import type { WorkOrder } from "@/types/work-order";
import {
  WORK_ORDER_BILLING_LABELS,
  WORK_ORDER_DELIVERY_LABELS,
  formatWorkOrderDate,
  formatWorkOrderDateTime,
  formatWorkOrderPrice,
} from "@/shared/utils/work-orders";

function WorkOrderDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setOrder(null);
      setError("Radni nalog nije pronađen");
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
          setError("Radni nalog nije pronađen");
          return;
        }
        setOrder(data);
      } catch {
        if (!cancelled) {
          setOrder(null);
          setError("Greška pri učitavanju radnog naloga");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell>
      <div>
        <div className="animate-iris-enter border-b border-border px-10 pt-5 pb-6">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] text-[color:var(--iris-ink-mute)]">
            <button
              type="button"
              onClick={() => navigate("/work-orders")}
              className="iris-focusable iris-press group flex items-center gap-1 bg-transparent p-0 text-[color:var(--iris-ink-mute)] hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" />
              Radni nalozi
            </button>
            <span className="text-[color:var(--iris-ink-faint)]">/</span>
            <span className="tnum text-foreground">
              {order?.orderNumber ?? "…"}
            </span>
          </div>

          {order && (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-baseline gap-3.5">
                  <div className="tnum text-[28px] font-normal tracking-[-0.5px] text-foreground">
                    {order.orderNumber}
                  </div>
                  <IrisBadge status={order.status} />
                </div>
                <div className="mt-1 text-[14px] text-[color:var(--iris-ink-soft)]">
                  {order.jobDescription} ·{" "}
                  <span className="text-foreground">{order.clientName}</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="iris-focusable iris-press border border-border bg-transparent px-3 py-[7px] text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
                >
                  Štampaj
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate("/work-orders/new", {
                      state: { duplicateFrom: order },
                    })
                  }
                  className="iris-focusable iris-press border border-border bg-transparent px-3 py-[7px] text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
                >
                  Dupliraj
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/work-orders/${order.id}/edit`)}
                  className="iris-focusable iris-press bg-foreground px-3.5 py-[7px] text-[12px] font-medium text-background hover:bg-foreground/90"
                >
                  Izmeni
                </button>
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
            <span className="text-sm">Učitavanje naloga...</span>
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
    </AppShell>
  );
}

function DetailBody({ order }: { order: WorkOrder }): React.JSX.Element {
  const metaCells: Array<[string, string]> = [
    [
      "Tip dokumenta",
      order.billingDocumentType
        ? WORK_ORDER_BILLING_LABELS[order.billingDocumentType]
        : "-",
    ],
    ["Datum izdavanja", formatWorkOrderDate(order.issueDate)],
    [
      "Dostava",
      order.shipping.deliveryMethod
        ? WORK_ORDER_DELIVERY_LABELS[order.shipping.deliveryMethod]
        : "-",
    ],
    ["Rok", order.dueDate ? formatWorkOrderDate(order.dueDate) : "-"],
    [
      "Broj dokumenta",
      order.billingDocumentNumber ? order.billingDocumentNumber : "-",
    ],
  ];

  const total = order.price ?? 0;
  const base = total / 1.2;
  const pdv = total - base;

  const timeline: Array<{ time: string; label: string; who: string; state: "done" | "current" | "pending" }> = [
    {
      time: formatWorkOrderDateTime(order.createdAt),
      label: "Nalog kreiran",
      who: order.issuedBy,
      state: "done",
    },
    ...(order.status === "active"
      ? ([
          {
            time: "-",
            label: "U proizvodnji",
            who: "u toku",
            state: "current",
          },
        ] as const)
      : []),
    ...(order.status === "completed" && order.completionDate
      ? ([
          {
            time: formatWorkOrderDateTime(order.completionDate),
            label: "Nalog završen",
            who: order.executedBy ?? "-",
            state: "done",
          },
        ] as const)
      : []),
    ...(order.status === "cancelled"
      ? ([
          {
            time: formatWorkOrderDateTime(order.updatedAt),
            label: "Nalog otkazan",
            who: order.executedBy ?? "-",
            state: "done",
          },
        ] as const)
      : []),
    ...(order.status !== "completed" && order.status !== "cancelled"
      ? ([
          {
            time: order.dueDate ? formatWorkOrderDate(order.dueDate) : "-",
            label: "Isporuka",
            who: order.dueDate ? "zakazana" : "-",
            state: "pending",
          },
        ] as const)
      : []),
  ];

  return (
    <>
      <div className="grid grid-cols-5 border-b border-border bg-card">
        {metaCells.map(([k, v], i) => (
          <div
            key={k}
            className={`px-6 py-4 ${i < metaCells.length - 1 ? "border-r border-[color:var(--iris-border-soft)]" : ""}`}
          >
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {k}
            </div>
            <div className="tnum mt-1.5 text-[14px] text-foreground">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_1.6fr]">
        <div className="border-r border-border p-8">
          <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Tok posla
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
                    {e.label}
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
                Beleške
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
        </div>

        <div className="p-8">
          <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Stavke
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  Opis
                </th>
                <th className="w-24 py-2 text-right text-[10px] font-medium uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  Iznos
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[color:var(--iris-border-soft)]">
                <td className="py-3 text-foreground">
                  {order.jobDescription}
                </td>
                <td className="tnum py-3 text-right font-medium text-foreground">
                  {formatWorkOrderPrice(order.price)}
                </td>
              </tr>
            </tbody>
          </table>

          {order.price !== null && (
            <div className="mt-4 flex justify-end">
              <div className="w-64 text-[12px]">
                <div className="flex justify-between py-1.5 text-[color:var(--iris-ink-soft)]">
                  <span>Osnovica</span>
                  <span className="tnum">
                    {new Intl.NumberFormat("sr-Latn-RS", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    }).format(base)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 text-[color:var(--iris-ink-soft)]">
                  <span>PDV (20%)</span>
                  <span className="tnum">
                    {new Intl.NumberFormat("sr-Latn-RS", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    }).format(pdv)}
                  </span>
                </div>
                <div className="mt-1.5 flex justify-between border-t border-foreground py-2.5 text-foreground">
                  <span className="font-medium">Za uplatu</span>
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

export default WorkOrderDetailPage;
