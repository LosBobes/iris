import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Check, RefreshCw } from "lucide-react";
import { BackofficeMenu } from "./BackofficeMenu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PlatformChangePassword } from "./PlatformChangePassword";
import { OrganizationsPanel } from "./OrganizationsPanel";
import { ActivityLog } from "./ActivityLog";
import type { PlatformMetrics, PlatformRangeDays } from "@/types/platform";
import { buildRows, buildSeries } from "./series";
import { formatBytes, formatCount, formatDate, formatDateTime, formatDuration } from "./format";

// recharts stays in its own lazily loaded chunk (see vite.config.ts).
const ChartPanel = lazy(() => import("./PlatformCharts"));

const RANGES: PlatformRangeDays[] = [7, 30, 90, 365];
const REFRESH_OPTIONS = [0, 30, 60, 300] as const;
const RANGE_KEY = "iris.platform.range";
const REFRESH_KEY = "iris.platform.refresh";

function readNumber<T extends number>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    // An unset key reads as null, which Number() would turn into 0 ("off").
    if (raw === null) return fallback;
    const value = Number(raw);
    return (allowed as readonly number[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function storeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // A per-device preference; losing it is harmless.
  }
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] px-4 py-3.5">
      <div className="truncate text-[12px] text-[color:var(--pf-text-2)]">{label}</div>
      <div className="mt-1 truncate text-[28px] font-medium leading-tight tabular-nums text-[color:var(--pf-text)]">
        {value}
      </div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-[color:var(--pf-muted)]">{hint}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="border-b border-[color:var(--pf-border)] px-4 py-3">
        <h2 className="text-[14px] font-medium text-[color:var(--pf-text)]">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function PlatformDashboard({
  username,
  role,
  onLogout,
}: {
  username: string;
  role?: string;
  onLogout: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [range, setRange] = useState<PlatformRangeDays>(() => readNumber(RANGE_KEY, RANGES, 30));
  const [refreshSeconds, setRefreshSeconds] = useState<number>(() =>
    readNumber(REFRESH_KEY, REFRESH_OPTIONS, 60),
  );
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Range and refresh sit in the header from tablet width up; on a phone the
  // range gets its own row and refresh moves into the menu.
  const isWide = useMediaQuery("(min-width: 768px)");
  // Sections: the metrics overview at /backoffice, organization management
  // and the activity log below it.
  const pathname = useLocation().pathname;
  const section: "overview" | "organizations" | "activity" = pathname.startsWith("/backoffice/organizations")
    ? "organizations"
    : pathname.startsWith("/backoffice/activity")
      ? "activity"
      : "overview";
  const showLog = section !== "overview";

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setMetrics(await window.api.getPlatformMetrics(range));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("platform.loadError"));
    } finally {
      setLoading(false);
    }
  }, [range, t]);

  useEffect(() => {
    if (!showLog) void load();
  }, [load, showLog]);

  useEffect(() => {
    if (!refreshSeconds || showLog) return;
    const id = window.setInterval(() => {
      // Don't poll a tab nobody is looking at.
      if (document.visibilityState === "visible") void load();
    }, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [load, refreshSeconds, showLog]);

  const bucketDays = range >= 90 ? 7 : 1;
  const { series, keyFor } = useMemo(
    () => buildSeries(metrics?.tenants ?? [], t("platform.charts.other")),
    [metrics?.tenants, t],
  );
  const workOrderRows = useMemo(
    () => (metrics ? buildRows(metrics.daily, "workOrders", series, keyFor, bucketDays) : []),
    [metrics, series, keyFor, bucketDays],
  );
  const loginRows = useMemo(
    () => (metrics ? buildRows(metrics.daily, "logins", series, keyFor, bucketDays) : []),
    [metrics, series, keyFor, bucketDays],
  );
  const bucketLabel = bucketDays === 7 ? t("platform.charts.perWeek") : t("platform.charts.perDay");
  const totals = metrics?.totals;
  const rangeHint = t("platform.rangeHint", { days: range });

  const rangeControl = (
    <div
      role="radiogroup"
      aria-label={t("platform.range")}
      className="grid grid-cols-4 rounded-md border border-[color:var(--pf-border)] p-0.5 md:inline-grid"
    >
      {RANGES.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={range === value}
          onClick={() => {
            setRange(value);
            storeNumber(RANGE_KEY, value);
          }}
          className={`iris-focusable min-h-9 rounded px-3.5 text-[13px] font-medium tabular-nums ${
            range === value
              ? "bg-white/10 text-[color:var(--pf-text)]"
              : "text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]"
          }`}
        >
          {t("platform.rangeOption", { days: value })}
        </button>
      ))}
    </div>
  );

  const refreshControls = (
    <div className="flex items-center gap-2">
      <label className="flex flex-1 items-center justify-between gap-2 text-[13px] text-[color:var(--pf-text-2)] md:flex-none">
        {t("platform.autoRefresh")}
        <select
          value={refreshSeconds}
          onChange={(event) => {
            const value = Number(event.target.value);
            setRefreshSeconds(value);
            storeNumber(REFRESH_KEY, value);
          }}
          className="iris-focusable h-10 rounded-md border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] px-2.5 text-[13px] text-[color:var(--pf-text)]"
        >
          {REFRESH_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value === 0
                ? t("platform.refreshOff")
                : value < 60
                  ? t("platform.refreshSeconds", { seconds: value })
                  : t("platform.refreshMinutes", { minutes: value / 60 })}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        aria-label={t("platform.refreshNow")}
        title={t("platform.refreshNow")}
        className="iris-focusable flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[color:var(--pf-border)] text-[color:var(--pf-text-2)] hover:bg-white/5 hover:text-[color:var(--pf-text)] disabled:opacity-60"
      >
        <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );

  // The section tabs sit beside the wordmark from tablet width up; on a phone
  // they don't fit next to the menu, so they move into it.
  const sections = [
    { to: "/backoffice", label: t("platform.nav.overview"), current: section === "overview" },
    { to: "/backoffice/organizations", label: t("platform.nav.organizations"), current: section === "organizations" },
    { to: "/backoffice/activity", label: t("platform.nav.activity"), current: section === "activity" },
  ];
  const navTabs = (
    <nav aria-label={t("platform.nav.label")} className="ml-1 flex items-center gap-1">
      {sections.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          aria-current={tab.current ? "page" : undefined}
          className={`iris-focusable flex min-h-9 items-center rounded-md px-2.5 text-[13px] font-medium ${
            tab.current
              ? "bg-white/10 text-[color:var(--pf-text)]"
              : "text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-[color:var(--pf-bg)] text-[color:var(--pf-text)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[color:var(--pf-border)] bg-[color:var(--pf-bg)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <span className="text-[18px] font-medium tracking-[-0.3px]">Iris</span>
            <span aria-hidden className="hidden h-5 w-px bg-[color:var(--pf-border)] sm:block" />
            <span className="hidden truncate text-[15px] text-[color:var(--pf-text-2)] sm:inline">{t("platform.title")}</span>
            {isWide ? navTabs : null}
          </div>

          {isWide && !showLog ? (
            <>
              {rangeControl}
              {refreshControls}
            </>
          ) : null}

          <BackofficeMenu
            username={username}
            role={role}
            sections={isWide ? undefined : sections}
            extra={isWide || showLog ? undefined : refreshControls}
            onChangePassword={() => setChangingPassword(true)}
            onLogout={onLogout}
          />
        </div>
        {isWide || showLog ? null : <div className="px-4 pb-3">{rangeControl}</div>}
      </header>

      {changingPassword ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("platform.password.title")}
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4"
        >
          <PlatformChangePassword
            onCancel={() => setChangingPassword(false)}
            onChanged={() => {
              setChangingPassword(false);
              setNotice(t("platform.password.changed"));
            }}
          />
        </div>
      ) : null}

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
        {notice ? (
          <div role="status" className="rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
            {notice}
          </div>
        ) : null}
        {showLog ? (
          <>
            <h1 className="text-[22px] font-medium tracking-[-0.3px]">
              {section === "organizations" ? t("platform.nav.organizations") : t("platform.nav.activity")}
            </h1>
            {section === "organizations" ? <OrganizationsPanel /> : <ActivityLog />}
          </>
        ) : (
        <>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h1 className="text-[22px] font-medium tracking-[-0.3px]">{t("platform.overview")}</h1>
          {metrics ? (
            <p className="text-[12px] text-[color:var(--pf-muted)]">
              {formatDate(metrics.rangeStart)} – {formatDate(metrics.generatedAt)} ·{" "}
              {t("platform.updatedAt", { time: formatDateTime(metrics.generatedAt) })}
            </p>
          ) : null}
        </div>
        {error ? (
          <div role="alert" className="rounded border border-[#e66767]/40 bg-[#e66767]/10 px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
            {error}
          </div>
        ) : null}

        {!metrics ? (
          <p className="py-24 text-center text-[13px] text-[color:var(--pf-muted)]">
            {error ? null : t("common.loading")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label={t("platform.tiles.tenants")} value={formatCount(totals!.tenants)} />
              <StatTile
                label={t("platform.tiles.users")}
                value={formatCount(totals!.users)}
                hint={t("platform.tiles.activeUsers", { value: formatCount(totals!.activeUsersInRange) })}
              />
              <StatTile label={t("platform.tiles.customers")} value={formatCount(totals!.customers)} />
              <StatTile
                label={t("platform.tiles.workOrders")}
                value={formatCount(totals!.workOrders)}
                hint={t("platform.tiles.open", { value: formatCount(totals!.openWorkOrders) })}
              />
              <StatTile
                label={t("platform.tiles.newWorkOrders")}
                value={formatCount(totals!.workOrdersInRange)}
                hint={rangeHint}
              />
              <StatTile label={t("platform.tiles.logins")} value={formatCount(totals!.loginsInRange)} hint={rangeHint} />
              <StatTile label={t("platform.tiles.sessions")} value={formatCount(totals!.activeSessions)} hint={t("platform.tiles.now")} />
              <StatTile label={t("platform.tiles.catalog")} value={formatCount(totals!.catalogItems)} />
              <StatTile label={t("platform.tiles.database")} value={formatBytes(totals!.databaseBytes)} />
              <StatTile label={t("platform.tiles.uptime")} value={formatDuration(metrics.system.uptimeSeconds)} hint={metrics.system.release || undefined} />
            </div>

            <Suspense
              fallback={<div className="h-72 rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]" />}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartPanel
                  title={t("platform.charts.workOrders")}
                  bucketLabel={bucketLabel}
                  kind="bar"
                  rows={workOrderRows}
                  series={series}
                />
                <ChartPanel
                  title={t("platform.charts.logins")}
                  bucketLabel={bucketLabel}
                  kind="line"
                  rows={loginRows}
                  series={series}
                />
              </div>
            </Suspense>

            <Panel title={t("platform.table.title")}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-[13px]">
                  <thead className="text-left text-[12px] text-[color:var(--pf-muted)]">
                    <tr>
                      <th className="px-4 py-2.5 font-normal">{t("platform.table.organization")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.users")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.customers")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.catalog")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.workOrders")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.inRange")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.open")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.logins")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.activeUsers")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.sessions")}</th>
                      <th className="px-3 py-2 font-normal">{t("platform.table.lastWorkOrder")}</th>
                      <th className="px-3 py-2 font-normal">{t("platform.table.lastLogin")}</th>
                      <th className="px-3 py-2 font-normal">{t("platform.table.logo")}</th>
                      <th className="px-4 py-2.5 font-normal">{t("platform.table.created")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.tenants.map((tenant) => {
                      const color = series.find((def) => def.key === keyFor(tenant.slug))?.color;
                      return (
                        <tr key={tenant.id} className="h-14 border-t border-[color:var(--pf-border)] hover:bg-white/[0.02]">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                              <div className="min-w-0">
                                <div className="truncate text-[color:var(--pf-text)]">{tenant.name}</div>
                                <div className="truncate text-[11px] text-[color:var(--pf-muted)]">{tenant.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCount(tenant.users)}
                            <span className="text-[color:var(--pf-muted)]"> / {formatCount(tenant.admins)}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.customers)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.catalogItems)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.workOrders)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.workOrdersInRange)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.openWorkOrders)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.loginsInRange)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.activeUsersInRange)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.activeSessions)}</td>
                          <td className="px-3 py-2 text-[color:var(--pf-text-2)]">{formatDateTime(tenant.lastWorkOrderAt) ?? "—"}</td>
                          <td className="px-3 py-2 text-[color:var(--pf-text-2)]">{formatDateTime(tenant.lastLoginAt) ?? "—"}</td>
                          <td className="px-3 py-2">
                            {tenant.hasLoginLogo ? (
                              <Check className="h-3.5 w-3.5 text-[color:var(--pf-text-2)]" aria-label={t("platform.table.hasLogo")} />
                            ) : (
                              <span className="text-[color:var(--pf-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[color:var(--pf-text-2)]">{formatDate(tenant.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-[color:var(--pf-border)] px-4 py-2 text-[11px] text-[color:var(--pf-muted)]">
                {t("platform.table.footnote")}
              </p>
            </Panel>

            <Panel title={t("platform.system.title")}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
                {[
                  [t("platform.system.release"), metrics.system.release || "—"],
                  [t("platform.system.go"), metrics.system.goVersion],
                  [t("platform.system.started"), formatDateTime(metrics.system.startedAt) ?? "—"],
                  [t("platform.system.goroutines"), formatCount(metrics.system.goroutines)],
                  [t("platform.system.heap"), formatBytes(metrics.system.heapBytes)],
                  [t("platform.system.range"), `${formatDate(metrics.rangeStart)} – ${formatDate(metrics.generatedAt)}`],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] text-[color:var(--pf-muted)]">{label}</dt>
                    <dd className="truncate tabular-nums text-[color:var(--pf-text)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </>
        )}
        </>
        )}
      </main>
    </div>
  );
}
