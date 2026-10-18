import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { staggerStyle } from "@/lib/motion";
import type { PlatformAuditAction, PlatformAuditEvent, PlatformImpersonationAction } from "@/types/platform";
import { formatCount, formatDateTime } from "./format";
import { actionLabelKey, actionTarget } from "./impersonation-actions";
import { backofficeError } from "./BackofficeDialog";

const PAGE_SIZE = 50;

const KIND_KEYS: Record<PlatformAuditAction, string> = {
  "tenant.create": "platform.activity.kinds.tenantCreate",
  "tenant.update": "platform.activity.kinds.tenantUpdate",
  "tenant.suspend": "platform.activity.kinds.tenantSuspend",
  "tenant.reactivate": "platform.activity.kinds.tenantReactivate",
  "tenant.modules": "platform.activity.kinds.tenantModules",
  "user.password_reset": "platform.activity.kinds.passwordReset",
  impersonate: "platform.activity.kinds.impersonate",
  "process_template.create": "platform.activity.kinds.processTemplateCreate",
  "process_template.update": "platform.activity.kinds.processTemplateUpdate",
  "process_template.delete": "platform.activity.kinds.processTemplateDelete",
  "backup.create": "platform.activity.kinds.backupCreate",
};

type Trail =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; actions: PlatformImpersonationAction[] };

/** The "what exactly" column: target user, renamed fields, session state. */
function EventDetails({ event, now }: { event: PlatformAuditEvent; now: number }): React.JSX.Element {
  const { t } = useTranslation();
  const lines: React.ReactNode[] = [];
  if (event.targetUsername) {
    lines.push(
      t(event.action === "tenant.create" ? "platform.activity.firstAdmin" : "platform.activity.targetUser", {
        username: event.targetUsername,
      }),
    );
  }
  if (event.action.startsWith("process_template.") && event.detail?.name) {
    lines.push(t("platform.activity.processTemplate", { name: event.detail.name }));
  }
  if (event.action === "backup.create" && event.detail?.name) {
    lines.push(t("platform.activity.backupFile", { name: event.detail.name }));
  }
  if (event.detail?.toName) {
    lines.push(t("platform.activity.renamed", { from: event.detail.fromName, to: event.detail.toName }));
  }
  if (event.detail?.toSlug) {
    lines.push(t("platform.activity.reslugged", { from: event.detail.fromSlug, to: event.detail.toSlug }));
  }
  if (event.action === "tenant.modules" && event.detail) {
    const state = (value: string | undefined): string =>
      t(value === "on" ? "platform.activity.moduleOn" : "platform.activity.moduleOff");
    lines.push(
      t("platform.activity.modules", {
        stock: state(event.detail.stock),
        processes: state(event.detail.processes),
      }),
    );
  }
  const session = event.impersonation;
  if (session) {
    const state = session.endedAt ? (
      t("platform.activity.sessionEnded", { time: formatDateTime(session.endedAt) })
    ) : Date.parse(session.expiresAt) <= now ? (
      t("platform.activity.sessionExpired", { time: formatDateTime(session.expiresAt) })
    ) : (
      <span className="text-[#f2b544]">{t("platform.activity.sessionActive")}</span>
    );
    lines.push(
      <>
        {state} · {t("platform.activity.changes", { count: session.actionCount })}
      </>,
    );
  }
  return (
    <div className="space-y-0.5">
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}

function TrailList({ trail }: { trail: Trail }): React.JSX.Element {
  const { t } = useTranslation();
  if (trail.kind === "loading") {
    return <p className="text-[12px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>;
  }
  if (trail.kind === "error") {
    return <p role="alert" className="text-[12px] text-[#e66767]">{trail.message}</p>;
  }
  if (trail.actions.length === 0) {
    return <p className="text-[12px] text-[color:var(--pf-muted)]">{t("platform.activity.noActions")}</p>;
  }
  return (
    <ol className="space-y-1.5">
      {trail.actions.map((action, index) => {
        const key = actionLabelKey(action);
        const target = actionTarget(action);
        const rejected = action.status >= 400;
        return (
          <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
            <span className="w-[130px] shrink-0 tabular-nums text-[color:var(--pf-muted)]">{formatDateTime(action.at)}</span>
            <span className={rejected ? "text-[color:var(--pf-text-2)] line-through" : "text-[color:var(--pf-text)]"}>
              {key ? t(key) : `${action.method} ${action.path}`}
            </span>
            {target ? (
              <span className="font-mono text-[11px] text-[color:var(--pf-text-2)]">
                {t("platform.activity.target", { id: target })}
              </span>
            ) : null}
            {rejected ? (
              <span className="text-[#e66767]">{t("platform.activity.rejected", { status: action.status })}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The Backoffice activity log: every superadmin operation, newest first. An
 * impersonation opens into the changes made during it (loaded on demand).
 */
export function ActivityLog(): React.JSX.Element {
  const { t } = useTranslation();
  const [items, setItems] = useState<PlatformAuditEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [trails, setTrails] = useState<Record<number, Trail>>({});
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  // "Active" is judged against when the page was opened, like the rest of it.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    window.api
      .getPlatformAudit({ limit: PAGE_SIZE, offset: 0 })
      .then((log) => {
        if (!active) return;
        setItems(log.items);
        setTotal(log.total);
      })
      .catch((cause: unknown) => {
        if (active) setError(backofficeError(cause, t("platform.loadError")));
      });
    return () => {
      active = false;
    };
  }, [t]);

  const loadMore = async (): Promise<void> => {
    setLoadingMore(true);
    try {
      const log = await window.api.getPlatformAudit({ limit: PAGE_SIZE, offset: items?.length ?? 0 });
      setItems((current) => [...(current ?? []), ...log.items]);
      setTotal(log.total);
      setError(null);
    } catch (cause) {
      setError(backofficeError(cause, t("platform.loadError")));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = useCallback(
    (impersonationId: number) => {
      setOpen((current) => {
        const next = new Set(current);
        if (next.has(impersonationId)) {
          next.delete(impersonationId);
        } else {
          next.add(impersonationId);
        }
        return next;
      });
      const existing = trails[impersonationId]?.kind;
      if (existing === "ready" || existing === "loading") return;
      setTrails((current) => ({ ...current, [impersonationId]: { kind: "loading" } }));
      window.api
        .getPlatformImpersonationActions(impersonationId)
        .then((actions) => setTrails((current) => ({ ...current, [impersonationId]: { kind: "ready", actions } })))
        .catch((cause: unknown) =>
          setTrails((current) => ({
            ...current,
            [impersonationId]: { kind: "error", message: backofficeError(cause, t("platform.loadError")) },
          })),
        );
    },
    [t, trails],
  );

  return (
    <section className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="border-b border-[color:var(--pf-border)] px-4 py-3">
        <h2 className="text-[14px] font-medium text-[color:var(--pf-text)]">{t("platform.activity.title")}</h2>
        <p className="mt-0.5 text-[12px] text-[color:var(--pf-muted)]">{t("platform.activity.note")}</p>
      </header>

      {error ? (
        <div role="alert" className="m-4 rounded border border-[#e66767]/40 bg-[#e66767]/10 px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
          {error}
        </div>
      ) : null}

      {items === null ? (
        error ? null : <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("platform.activity.empty")}</p>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="text-left text-[12px] text-[color:var(--pf-muted)]">
                <tr>
                  <th className="w-10 px-4 py-2.5 font-normal">
                    <span className="sr-only">{t("platform.activity.showTrail")}</span>
                  </th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.activity.time")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.activity.admin")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.activity.action")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.activity.organization")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.activity.details")}</th>
                  <th className="px-4 py-2.5 font-normal">{t("platform.activity.ip")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((event, index) => {
                  const session = event.impersonation;
                  const expanded = session ? open.has(session.id) : false;
                  return (
                    <Fragment key={event.id}>
                      <tr
                        style={staggerStyle(index)}
                        className="animate-iris-rise iris-stagger iris-row border-t border-[color:var(--pf-border)] align-top hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-2.5">
                          {session ? (
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={expanded ? t("platform.activity.hideTrail") : t("platform.activity.showTrail")}
                              onClick={() => toggle(session.id)}
                              className="iris-focusable -my-1 flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--pf-text-2)] hover:bg-white/5 hover:text-[color:var(--pf-text)]"
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[color:var(--pf-text-2)]">{formatDateTime(event.at)}</td>
                        <td className="px-3 py-2.5 text-[color:var(--pf-text)]">{event.adminUsername}</td>
                        <td className="px-3 py-2.5 text-[color:var(--pf-text)]">{t(KIND_KEYS[event.action] ?? event.action)}</td>
                        <td className="px-3 py-2.5">
                          <div className="text-[color:var(--pf-text)]">{event.tenantName || "—"}</div>
                          {event.tenantSlug ? <div className="text-[11px] text-[color:var(--pf-muted)]">{event.tenantSlug}</div> : null}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-[color:var(--pf-text-2)]">
                          <EventDetails event={event} now={now} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12px] text-[color:var(--pf-text-2)]">{event.ip || "—"}</td>
                      </tr>
                      {session && expanded ? (
                        <tr className="animate-iris-fade bg-black/20">
                          <td />
                          <td colSpan={6} className="px-3 pb-3 pt-1">
                            <TrailList trail={trails[session.id] ?? { kind: "loading" }} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--pf-border)] px-4 py-2.5">
            <span className="text-[11px] text-[color:var(--pf-muted)]">
              {t("platform.activity.shown", { shown: formatCount(items.length), total: formatCount(total) })}
            </span>
            {items.length < total ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="iris-focusable h-8 rounded-md border border-[color:var(--pf-border)] px-3 text-[12px] text-[color:var(--pf-text)] hover:bg-white/5 disabled:opacity-60"
              >
                {t("platform.activity.loadMore")}
              </button>
            ) : null}
          </footer>
        </>
      )}
    </section>
  );
}
