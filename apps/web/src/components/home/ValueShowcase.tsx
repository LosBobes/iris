import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FeatureCard, type Feature } from "@/components/home/FeatureScene";
import { formatPercent, formatWhole } from "@/lib/home/format";

/**
 * "What you get": the two things Iris tells an owner that a spreadsheet
 * doesn't, each as a small sample of the real report, plus the smaller wins
 * underneath. The money panel mirrors the dashboard's profit by customer and
 * by catalog item (`companyProfit` / `itemProfit`); the production panel
 * mirrors the planner's calibration report (planned vs measured minutes per
 * step) and workstation load (planned vs available minutes). All sample data.
 */

interface ProfitRow {
  name: string;
  revenue: number;
  profit: number;
  /** The row the insight under the chart is about. */
  flag?: boolean;
}

const PROFIT_BY_CLIENT: ProfitRow[] = [
  { name: "Apoteka Lipa", revenue: 640_000, profit: 211_000 },
  { name: "Pekara Zlatno Zrno", revenue: 1_240_000, profit: 186_000, flag: true },
  { name: "Studio Kvadrat", revenue: 410_000, profit: 168_000 },
  { name: "Hotel Morava", revenue: 280_000, profit: 59_000 },
];

const PROFIT_BY_ITEM: ProfitRow[] = [
  { name: "Mat plastifikacija", revenue: 320_000, profit: 195_000 },
  { name: "Vizit karte 4/4", revenue: 540_000, profit: 189_000 },
  { name: "Katalozi A4", revenue: 880_000, profit: 158_000, flag: true },
  { name: "Nalepnice", revenue: 210_000, profit: 92_000 },
];

const PROFIT_VIEWS = {
  client: {
    label: "Po klijentu",
    rows: PROFIT_BY_CLIENT,
    insight: "Najveći klijent Vam donosi najmanju maržu. Vreme je za novi cenovnik.",
  },
  item: {
    label: "Po artiklu",
    rows: PROFIT_BY_ITEM,
    insight: "Katalozi donose najviše prometa, a plastifikacija najviše zarade.",
  },
} as const;

/** `reference` is the plan (steps) or the shift's available minutes (machines); `measured` is what happened or what is booked. */
interface ProductionRow {
  label: string;
  reference: number;
  measured: number;
}

const STEP_TIMES: ProductionRow[] = [
  { label: "Priprema za štampu", reference: 30, measured: 34 },
  { label: "Štampa", reference: 120, measured: 126 },
  { label: "Sečenje", reference: 40, measured: 88 },
  { label: "Plastifikacija", reference: 60, measured: 55 },
  { label: "Pakovanje", reference: 20, measured: 22 },
];

const MACHINE_LOAD: ProductionRow[] = [
  { label: "Heidelberg SM 52", reference: 450, measured: 420 },
  { label: "Giljotina Polar", reference: 450, measured: 500 },
  { label: "Plastifikator", reference: 450, measured: 190 },
  { label: "Digitalna mašina", reference: 450, measured: 330 },
];

const PRODUCTION_VIEWS = {
  steps: {
    label: "Vreme po koraku",
    legend: ["Plan", "Stvarno"],
    insight: "Sečenje traje duplo duže od plana, nalog za nalogom. Tu je usko grlo.",
  },
  load: {
    label: "Zauzetost mašina",
    legend: ["Raspoloživo", "Zakazano"],
    insight: "Giljotina je zakazana preko smene, a plastifikator stoji pola dana.",
  },
} as const;

const MORE_WINS: Feature[] = [
  {
    scene: "deadlines",
    title: "Rokovi pod kontrolom",
    body: "Nalozi koji kasne ili dospevaju danas vidite pre nego što klijent pozove.",
  },
  {
    scene: "stock",
    title: "Materijal na vreme",
    body: "Završen korak sam skida materijal sa stanja, a niske zalihe stižu na kontrolnu tablu.",
  },
  {
    scene: "calls",
    title: "Manje poziva",
    body: "Klijent prati posao preko linka, pa ne zove da pita dokle se stiglo.",
  },
  {
    scene: "frozen",
    title: "Zarada po tadašnjoj ceni",
    body: "Nalog pamti nabavnu cenu iz dana kad je rađen, pa poskupljenje ne kvari staru računicu.",
  },
];

export function ValueShowcase(): React.JSX.Element {
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfitPanel />
        <ProductionPanel />
      </div>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MORE_WINS.map((win, index) => (
          <FeatureCard key={win.title} feature={win} index={index} />
        ))}
      </ul>
    </div>
  );
}

function ProfitPanel(): React.JSX.Element {
  const [view, setView] = useState<keyof typeof PROFIT_VIEWS>("client");
  const { rows, insight } = PROFIT_VIEWS[view];
  const maxRevenue = Math.max(...rows.map((row) => row.revenue));

  return (
    <Panel
      kicker="Novac"
      title="Ko i šta Vam donosi zaradu"
      body="Iris od svakog naloga računa zaradu i maržu, pa vidite koji klijenti i artikli Vas hrane, a koji samo prave promet."
      toggle={
        <Toggle
          label="Prikaz zarade"
          options={PROFIT_VIEWS}
          value={view}
          onChange={setView}
        />
      }
      legend={[
        { label: "Promet", swatch: "bg-[color:var(--iris-border-soft)]" },
        { label: "Zarada", swatch: "bg-[color:var(--iris-accent)]" },
      ]}
      insight={insight}
    >
      <ul aria-label={PROFIT_VIEWS[view].label} className="space-y-4">
        {rows.map((row) => {
          const margin = (row.profit / row.revenue) * 100;
          return (
            <li key={row.name}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{row.name}</span>
                <span
                  className={cn(
                    "shrink-0 tnum",
                    row.flag ? "font-medium text-[color:var(--iris-status-cancelled)]" : "text-[color:var(--iris-ink-soft)]",
                  )}
                >
                  marža {formatPercent(margin)}
                </span>
              </div>
              <div aria-hidden className="mt-1.5 h-2.5 bg-transparent">
                <div
                  className="relative h-full bg-[color:var(--iris-border-soft)] transition-[width] duration-500 ease-out"
                  style={{ width: `${(row.revenue / maxRevenue) * 100}%` }}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-[color:var(--iris-accent)] transition-[width] duration-500 ease-out"
                    style={{ width: `${(row.profit / row.revenue) * 100}%` }}
                  />
                </div>
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--iris-ink-mute)] tnum">
                zarada {formatWhole(row.profit)} od {formatWhole(row.revenue)} RSD
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ProductionPanel(): React.JSX.Element {
  const [view, setView] = useState<keyof typeof PRODUCTION_VIEWS>("steps");
  const { legend, insight } = PRODUCTION_VIEWS[view];
  const rows = view === "steps" ? STEP_TIMES : MACHINE_LOAD;
  const max = Math.max(...rows.flatMap((row) => [row.reference, row.measured]));

  return (
    <Panel
      kicker="Proizvodnja"
      title="Gde radionica gubi vreme"
      body="Operateri štikliraju korake, a Iris meri koliko su stvarno trajali i koliko je koja mašina zauzeta. Usko grlo se vidi samo."
      toggle={
        <Toggle
          label="Prikaz proizvodnje"
          options={PRODUCTION_VIEWS}
          value={view}
          onChange={setView}
        />
      }
      legend={[
        { label: legend[0], swatch: "border border-[color:var(--iris-ink-faint)]" },
        { label: legend[1], swatch: "bg-[color:var(--iris-proc-step)]" },
      ]}
      insight={insight}
      note="Uz module Procesi rada i Planiranje"
    >
      <ul aria-label={PRODUCTION_VIEWS[view].label} className="space-y-4">
        {rows.map((row) => {
          const { reference, measured } = row;
          const over = measured > reference * 1.25 || (view === "load" && measured > reference);
          const under = view === "load" && measured < reference * 0.5;
          const detail =
            view === "steps"
              ? `${measured} min umesto ${reference}`
              : `${formatPercent((measured / reference) * 100)} smene`;
          return (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{row.label}</span>
                <span
                  className={cn(
                    "shrink-0 tnum",
                    over
                      ? "font-medium text-[color:var(--iris-status-cancelled)]"
                      : under
                        ? "font-medium text-[color:var(--iris-status-active)]"
                        : "text-[color:var(--iris-ink-soft)]",
                  )}
                >
                  {detail}
                </span>
              </div>
              <div aria-hidden className="relative mt-1.5 h-2.5">
                <div
                  className="absolute inset-y-0 left-0 border border-[color:var(--iris-ink-faint)] transition-[width] duration-500 ease-out"
                  style={{ width: `${(reference / max) * 100}%` }}
                />
                <div
                  className={cn(
                    "absolute left-0 top-[3px] h-1 transition-[width] duration-500 ease-out",
                    over ? "bg-[color:var(--iris-status-cancelled)]" : "bg-[color:var(--iris-proc-step)]",
                  )}
                  style={{ width: `${(measured / max) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Panel({
  kicker,
  title,
  body,
  toggle,
  legend,
  insight,
  note,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  toggle: ReactNode;
  legend: Array<{ label: string; swatch: string }>;
  insight: string;
  note?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <article className="flex flex-col border border-border bg-card px-5 py-6 sm:px-7">
      <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-accent)]">{kicker}</div>
      <h3 className="mt-2 text-[20px] font-normal leading-[1.2] tracking-[-0.5px] sm:text-[22px]">{title}</h3>
      <p className="mt-2 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">{body}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {toggle}
        <div aria-hidden className="flex gap-3 text-[11px] text-[color:var(--iris-ink-mute)]">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span className={cn("inline-block h-2 w-3", item.swatch)} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-5">{children}</div>
      <p className="mt-6 border-l-2 border-[color:var(--iris-accent)] pl-3 text-[13px] leading-[1.55]">{insight}</p>
      {note ? (
        <p className="mt-auto pt-4 text-[11px] text-[color:var(--iris-ink-mute)]">{note}</p>
      ) : null}
    </article>
  );
}

function Toggle<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<K, { label: string }>;
  value: K;
  onChange: (next: K) => void;
}): React.JSX.Element {
  return (
    <div role="group" aria-label={label} className="inline-flex border border-border bg-background p-0.5 text-[12px]">
      {(Object.keys(options) as K[]).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "iris-focusable px-3 py-1.5 tracking-[0.2px] transition-colors",
            value === key ? "bg-foreground text-background" : "text-[color:var(--iris-ink-soft)] hover:text-foreground",
          )}
        >
          {options[key].label}
        </button>
      ))}
    </div>
  );
}
