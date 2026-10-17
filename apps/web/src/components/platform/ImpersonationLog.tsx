import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PlatformImpersonation, PlatformImpersonationAction } from "@/types/platform";
import { formatCount, formatDateTime } from "./format";
import { actionLabelKey, actionTarget } from "./impersonation-actions";

const PAGE_SIZE = 50;

type Trail = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; actions: PlatformImpersonationAction[] };

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function StatusBadge({ item, now }: { item: PlatformImpersonation; now: number }): React.JSX.Element {
  const { t } = useTranslation();
  if (item.endedAt) {
    return <span className="text-[color:var(--pf-text-2)]">{t("platform.impersonations.ended", { time: formatDateTime(item.endedAt) })}</span>;
  }
  if (Date.parse(item.expiresAt) <= now) {
    return <span className="text-[color:var(--pf-muted)]">{t("platform.impersonations.expired", { time: formatDateTime(item.expiresAt) })}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[#f2b544]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#f2b544]" />
      {t("platform.impersonations.active")}
    </span>
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
    return <p className="text-[12px] text-[color:var(--pf-muted)]">{t("platform.impersonations.noActions")}</p>;
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
                {t("platform.impersonations.target", { id: target })}
              </span>
            ) : null}
            {rejected ? (
              <span className="text-[#e66767]">{t("platform.impersonations.rejected", { status: action.status })}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Backoffice page listing every impersonation, newest first. Each row opens
 * the change requests made during it (loaded on demand).
 */
export function ImpersonationLog(): React.JSX.Element {
  const { t } = useTranslation();
  const [items, setItems] = useState<PlatformImpersonation[] | null>(null);
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
      .getPlatformImpersonations({ limit: PAGE_SIZE, offset: 0 })
      .then((log) => {
        if (!active) return;
        setItems(log.items);
        setTotal(log.total);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, t("platform.loadError")));
      });
    return () => {
      active = false;
    };
  }, [t]);

  const loadMore = async (): Promise<void> => {
    setLoadingMore(true);
    try {
      const log = await window.api.getPlatformImpersonations({ limit: PAGE_SIZE, offset: items?.length ?? 0 });
      setItems((current) => [...(current ?? []), ...log.items]);
      setTotal(log.total);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t("platform.loadError")));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = useCallback(
    (id: number) => {
      setOpen((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      if (trails[id]?.kind === "ready" || trails[id]?.kind === "loading") return;
      setTrails((current) => ({ ...current, [id]: { kind: "loading" } }));
      window.api
        .getPlatformImpersonationActions(id)
        .then((actions) => setTrails((current) => ({ ...current, [id]: { kind: "ready", actions } })))
        .catch((cause: unknown) =>
          setTrails((current) => ({ ...current, [id]: { kind: "error", message: errorMessage(cause, t("platform.loadError")) } })),
        );
    },
    [t, trails],
  );

  return (
    <section className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="border-b border-[color:var(--pf-border)] px-4 py-3">
        <h2 className="text-[14px] font-medium text-[color:var(--pf-text)]">{t("platform.impersonations.title")}</h2>
        <p className="mt-0.5 text-[12px] text-[color:var(--pf-muted)]">{t("platform.impersonations.note")}</p>
      </header>

      {error ? (
        <div role="alert" className="m-4 rounded border border-[#e66767]/40 bg-[#e66767]/10 px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
          {error}
        </div>
      ) : null}

      {items === null ? (
        error ? null : <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("platform.impersonations.empty")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-[13px]">
              <thead className="text-left text-[12px] text-[color:var(--pf-muted)]">
                <tr>
                  <th className="w-10 px-4 py-2.5 font-normal">
                    <span className="sr-only">{t("platform.impersonations.showTrail")}</span>
                  </th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.impersonations.started")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.impersonations.admin")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.impersonations.organization")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.impersonations.user")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.impersonations.ip")}</th>
                  <th className="px-3 py-2.5 font-normal">{t("platform.impersonations.status")}</th>
                  <th className="px-4 py-2.5 text-right font-normal">{t("platform.impersonations.changes")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const expanded = open.has(item.id);
                  return (
                    <Fragment key={item.id}>
                      <tr className="h-12 border-t border-[color:var(--pf-border)] hover:bg-white/[0.02]">
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={expanded ? t("platform.impersonations.hideTrail") : t("platform.impersonations.showTrail")}
                            onClick={() => toggle(item.id)}
                            className="iris-focusable flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--pf-text-2)] hover:bg-white/5 hover:text-[color:var(--pf-text)]"
                          >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--pf-text-2)]">{formatDateTime(item.startedAt)}</td>
                        <td className="px-3 py-2 text-[color:var(--pf-text)]">{item.adminUsername}</td>
                        <td className="px-3 py-2">
                          <div className="text-[color:var(--pf-text)]">{item.tenantName}</div>
                          <div className="text-[11px] text-[color:var(--pf-muted)]">{item.tenantSlug}</div>
                        </td>
                        <td className="px-3 py-2 text-[color:var(--pf-text)]">{item.username}</td>
                        <td className="px-3 py-2 font-mono text-[12px] text-[color:var(--pf-text-2)]">{item.ip || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <StatusBadge item={item} now={now} />
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatCount(item.actionCount)}</td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-black/20">
                          <td />
                          <td colSpan={7} className="px-3 pb-3 pt-1">
                            <TrailList trail={trails[item.id] ?? { kind: "loading" }} />
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
              {t("platform.impersonations.shown", { shown: formatCount(items.length), total: formatCount(total) })}
            </span>
            {items.length < total ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="iris-focusable h-8 rounded-md border border-[color:var(--pf-border)] px-3 text-[12px] text-[color:var(--pf-text)] hover:bg-white/5 disabled:opacity-60"
              >
                {t("platform.impersonations.loadMore")}
              </button>
            ) : null}
          </footer>
        </>
      )}
    </section>
  );
}
