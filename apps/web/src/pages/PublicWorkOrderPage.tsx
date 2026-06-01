import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import type { PublicWorkOrderStatus } from "@/types/work-order";
import {
  WORK_ORDER_STATUS_LABELS,
  formatWorkOrderDate,
} from "@/shared/utils/work-orders";

function PublicWorkOrderPage(): React.JSX.Element {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PublicWorkOrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError("Javni link nije ispravan.");
      setLoading(false);
      return;
    }

    window.api
      .getPublicWorkOrderStatus(token)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError("Radni nalog nije pronađen.");
          return;
        }
        setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setError("Greška pri učitavanju statusa naloga.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <section className="mx-auto max-w-2xl border border-border bg-card px-6 py-7">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          Iris · javni status
        </div>
        {loading && (
          <div className="mt-8 flex items-center gap-2 text-sm text-[color:var(--iris-ink-soft)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Učitavanje statusa...
          </div>
        )}
        {!loading && error && (
          <p className="mt-8 border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-4 py-3 text-sm text-[color:var(--iris-status-cancelled)]">
            {error}
          </p>
        )}
        {!loading && status && (
          <div className="mt-5">
            <h1 className="text-[28px] font-normal tracking-[-0.6px]">
              {status.orderNumber}
            </h1>
            <p className="mt-2 text-sm text-[color:var(--iris-ink-soft)]">
              {status.clientName}
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <PublicField label="Opis posla" value={status.jobDescription} />
              <PublicField
                label="Status"
                value={WORK_ORDER_STATUS_LABELS[status.status]}
              />
              <PublicField
                label="Rok"
                value={status.dueDate ? formatWorkOrderDate(status.dueDate) : "-"}
              />
              <PublicField
                label="Napomene za klijenta"
                value={String(status.customerNoteCount)}
              />
            </div>
            {status.signedBy && (
              <p className="mt-6 text-sm text-[color:var(--iris-ink-soft)]">
                Potpisao/la: <span className="text-foreground">{status.signedBy}</span>
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function PublicField({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="border border-[color:var(--iris-border-soft)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[1.2px] text-[color:var(--iris-ink-mute)]">
        {label}
      </div>
      <div className="mt-1.5 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default PublicWorkOrderPage;
