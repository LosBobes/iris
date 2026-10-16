import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRow, SeriesDef } from "./series";
import { formatCount, formatDate, formatShortDate } from "./format";

const AXIS = { stroke: "var(--pf-border)", tick: { fill: "var(--pf-muted)", fontSize: 11 } };

interface ChartPanelProps {
  title: string;
  /** e.g. "po danu" / "po nedelji". */
  bucketLabel: string;
  kind: "bar" | "line";
  rows: ChartRow[];
  series: SeriesDef[];
}

function SeriesTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
  series: SeriesDef[];
}): React.JSX.Element | null {
  if (!active || !payload?.length || !label) return null;
  const values = new Map(payload.map((entry) => [String(entry.dataKey), Number(entry.value ?? 0)]));
  const total = [...values.values()].reduce((sum, value) => sum + value, 0);
  return (
    <div className="min-w-40 rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-bg)] px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1.5 font-medium text-[color:var(--pf-text)]">{formatDate(label)}</div>
      {series.map((def) => (
        <div key={def.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex min-w-0 items-center gap-2 text-[color:var(--pf-text-2)]">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
            <span className="truncate">{def.label}</span>
          </span>
          <span className="tabular-nums text-[color:var(--pf-text)]">{formatCount(values.get(def.key) ?? 0)}</span>
        </div>
      ))}
      {series.length > 1 ? (
        <div className="mt-1 flex justify-between border-t border-[color:var(--pf-border)] pt-1 text-[color:var(--pf-text-2)]">
          <span>Σ</span>
          <span className="tabular-nums text-[color:var(--pf-text)]">{formatCount(total)}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One dashboard panel: a time series per organization, with a legend (for two
 * or more organizations), a hover tooltip and a table view of the same rows.
 */
export function ChartPanel({ title, bucketLabel, kind, rows, series }: ChartPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const empty = rows.every((row) => series.every((def) => Number(row[def.key]) === 0));

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--pf-border)] px-4 py-2">
        <h2 className="min-w-0 truncate text-[14px] font-medium text-[color:var(--pf-text)]">
          {title} <span className="font-normal text-[color:var(--pf-muted)]">· {bucketLabel}</span>
        </h2>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="iris-focusable min-h-9 shrink-0 rounded-md border border-[color:var(--pf-border)] px-3 text-[12px] text-[color:var(--pf-text-2)] hover:bg-white/5 hover:text-[color:var(--pf-text)]"
        >
          {asTable ? t("platform.charts.showChart") : t("platform.charts.showTable")}
        </button>
      </header>

      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-[12px] text-[color:var(--pf-text-2)]">
          {series.map((def) => (
            <li key={def.key} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: def.color }} />
              {def.label}
            </li>
          ))}
        </ul>
      ) : null}

      {asTable ? (
        <div className="max-h-72 overflow-auto px-4 py-3">
          <table className="w-full text-[12px]">
            <thead className="text-left text-[color:var(--pf-muted)]">
              <tr>
                <th className="py-1 pr-3 font-normal">{t("platform.charts.date")}</th>
                {series.map((def) => (
                  <th key={def.key} className="py-1 pr-3 text-right font-normal">{def.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[color:var(--pf-text)]">
              {rows.map((row) => (
                <tr key={row.date} className="border-t border-[color:var(--pf-border)]">
                  <td className="py-1 pr-3 text-[color:var(--pf-text-2)]">{formatDate(row.date)}</td>
                  {series.map((def) => (
                    <td key={def.key} className="py-1 pr-3 text-right tabular-nums">{formatCount(Number(row[def.key]))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : empty ? (
        <p className="flex h-64 items-center justify-center px-4 text-[12px] text-[color:var(--pf-muted)]">
          {t("platform.charts.empty")}
        </p>
      ) : (
        <div className="h-64 px-2 pt-2 pb-1" role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--pf-grid)" strokeDasharray="0" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={24} tickLine={false} {...AXIS} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} {...AXIS} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<SeriesTooltip series={series} />} />
                {series.map((def, index) => (
                  <Bar
                    key={def.key}
                    dataKey={def.key}
                    stackId="orders"
                    fill={def.color}
                    // A 2px panel-coloured edge separates stacked segments.
                    stroke="var(--pf-panel)"
                    strokeWidth={series.length > 1 ? 2 : 0}
                    radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--pf-grid)" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={24} tickLine={false} {...AXIS} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} {...AXIS} />
                <Tooltip cursor={{ stroke: "var(--pf-muted)", strokeWidth: 1 }} content={<SeriesTooltip series={series} />} />
                {series.map((def) => (
                  <Line
                    key={def.key}
                    dataKey={def.key}
                    type="linear"
                    stroke={def.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: "var(--pf-panel)", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default ChartPanel;
