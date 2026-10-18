import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { APP_VERSION, formatVersion, isVersionMismatch } from "@/lib/app-version";
import type { PlatformMetrics } from "@/types/platform";
import { formatBytes, formatCount, formatDate, formatDateTime } from "./format";

/**
 * The Backoffice "Sistem" panel: which web build this browser runs, which API
 * build answers it, the database engine, and the API process' vitals. A web
 * version that differs from the API's usually means a stale cached frontend.
 */
export function PlatformSystemPanel({
  metrics,
  webVersion = APP_VERSION,
}: {
  metrics: PlatformMetrics;
  /** The web app's own version; overridable for tests. */
  webVersion?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const system = metrics.system;
  const apiVersion = formatVersion(system.version);
  const commit = system.commit ? system.commit.slice(0, 7) : "";
  const engine =
    system.databaseEngine === "postgres"
      ? t("platform.system.databasePostgres")
      : system.databaseEngine === "sqlite"
        ? t("platform.system.databaseSqlite")
        : "—";
  const mismatch = isVersionMismatch(webVersion, system.version);

  const rows: Array<[key: string, label: string, value: string]> = [
    ["web", t("platform.system.webVersion"), formatVersion(webVersion)],
    ["api", t("platform.system.apiVersion"), commit ? `${apiVersion} · ${commit}` : apiVersion],
    ["database", t("platform.system.database"), engine],
    ["release", t("platform.system.release"), system.release || "—"],
    ["go", t("platform.system.go"), system.goVersion],
    ["started", t("platform.system.started"), formatDateTime(system.startedAt) ?? "—"],
    ["goroutines", t("platform.system.goroutines"), formatCount(system.goroutines)],
    ["heap", t("platform.system.heap"), formatBytes(system.heapBytes)],
    ["range", t("platform.system.range"), `${formatDate(metrics.rangeStart)} – ${formatDate(metrics.generatedAt)}`],
  ];

  return (
    <section
      aria-labelledby="platform-system-title"
      className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]"
    >
      <header className="border-b border-[color:var(--pf-border)] px-4 py-3">
        <h2 id="platform-system-title" className="text-[14px] font-medium text-[color:var(--pf-text)]">
          {t("platform.system.title")}
        </h2>
      </header>
      {mismatch ? (
        <p
          role="status"
          className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-[#e6a23c]/40 bg-[#e6a23c]/10 px-3 py-2.5 text-[12px] leading-5 text-[color:var(--pf-text)]"
        >
          <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e6a23c]" />
          {t("platform.system.versionMismatch", { web: formatVersion(webVersion), api: apiVersion })}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 text-[13px] sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([key, label, value]) => (
          <div key={key} className="min-w-0" data-testid={`platform-system-${key}`}>
            <dt className="text-[11px] text-[color:var(--pf-muted)]">{label}</dt>
            <dd className="truncate tabular-nums text-[color:var(--pf-text)]" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
