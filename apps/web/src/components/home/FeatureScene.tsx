import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { staggerStyle } from "@/lib/motion";
import "./feature-scenes.css";

/**
 * The landing page's feature cards, each topped by a small looping animation
 * that shows what the card is about (an order filling in and printing, a
 * request stopped at the server, a price frozen on an old order...). The
 * scenes are inline SVG over the theme tokens, so they follow light and dark
 * mode; the timing lives in `feature-scenes.css`. A scene plays only while it
 * is on screen, and with reduced motion it shows its finished frame instead.
 */

export type SceneId =
  | "orders"
  | "clients"
  | "catalog"
  | "dashboard"
  | "tracking"
  | "devices"
  | "isolation"
  | "server"
  | "audit"
  | "export"
  | "deadlines"
  | "stock"
  | "calls"
  | "frozen";

export interface Feature {
  scene: SceneId;
  title: string;
  body: string;
}

export function FeatureCard({ feature, index }: { feature: Feature; index: number }): React.JSX.Element {
  return (
    <li
      className="animate-iris-rise iris-stagger flex flex-col overflow-hidden border border-border bg-card"
      style={staggerStyle(index)}
    >
      <FeatureScene scene={feature.scene} />
      <div className="px-5 pb-5 pt-4">
        <h3 className="text-[15px] font-medium tracking-[-0.2px]">{feature.title}</h3>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">{feature.body}</p>
      </div>
    </li>
  );
}

export function FeatureScene({ scene }: { scene: SceneId }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (jsdom, very old browsers) just play.
  const [playing, setPlaying] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPlaying(entry.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-scene={scene}
      data-playing={playing ? "true" : "false"}
      className="iris-scene border-b border-[color:var(--iris-border-soft)] bg-background"
    >
      <svg aria-hidden viewBox="0 0 240 96" className="block h-auto w-full" focusable="false">
        {SCENES[scene]}
      </svg>
    </div>
  );
}

/** Classes for an element that builds in at `at`% of the scene's cycle with the given effect. */
function fx(effect: "grow-x" | "grow-y" | "fade" | "fade-out" | "pop" | "draw" | "slide" | "drop", at: number): string {
  return `hs-fx-${effect} hs-at-${at}`;
}

function delay(seconds: number): CSSProperties {
  return { animationDelay: `${seconds}s` };
}

// ---------------------------------------------------------------------------
// Scenes (viewBox 240 × 96)
// ---------------------------------------------------------------------------

/** Radni nalozi: the order's fields fill in, it gets a status and the shop copy prints. */
const orders = (
  <>
    <rect className="hs-card" x="24" y="8" width="96" height="80" rx="2" />
    <rect className={`hs-acc ${fx("grow-x", 0)}`} x="32" y="16" width="34" height="5" />
    {[50, 38, 56, 30].map((width, i) => (
      <g key={i}>
        <rect className="hs-soft" x="32" y={32 + i * 13} width="14" height="4" />
        <rect className={`hs-mute ${fx("grow-x", 5 + i * 10)}`} x="52" y={32 + i * 13} width={width} height="4" />
      </g>
    ))}
    <rect className="hs-soft" x="92" y="14" width="20" height="9" rx="4.5" />
    <rect className={`hs-ok ${fx("pop", 45)}`} x="92" y="14" width="20" height="9" rx="4.5" />
    <g className="hs-orders-paper">
      <rect className="hs-card" x="150" y="50" width="44" height="36" />
      <rect className="hs-acc" x="157" y="57" width="16" height="3" />
      <rect className="hs-mute" x="157" y="65" width="30" height="3" />
      <rect className="hs-mute" x="157" y="72" width="22" height="3" />
    </g>
    <rect className="hs-card" x="138" y="14" width="68" height="40" rx="3" />
    <line className="hs-line" x1="146" y1="46" x2="198" y2="46" />
    <rect className="hs-soft" x="146" y="22" width="26" height="4" />
    <circle className="hs-acc hs-orders-led" cx="196" cy="24" r="2.5" />
  </>
);

const PIN = "M0 9 C-3.5 5 -5.5 2.5 -5.5 0 A5.5 5.5 0 0 1 5.5 0 C5.5 2.5 3.5 5 0 9 Z";

/** Klijenti: a company card branches out to its delivery addresses. */
const clients = (
  <>
    <rect className="hs-card" x="16" y="20" width="84" height="56" rx="2" />
    <path className="hs-line" d="M24 64 H46 M28 64 V32 H42 V64 M32 38 h2 M36 38 h2 M32 45 h2 M36 45 h2 M32 52 h2 M36 52 h2" />
    <rect className="hs-ink" x="50" y="31" width="40" height="4" />
    <rect className="hs-mute" x="50" y="40" width="28" height="3" />
    <rect className="hs-mute" x="50" y="47" width="34" height="3" />
    <circle className={`hs-blue ${fx("pop", 0)}`} cx="56" cy="62" r="4" />
    <circle className={`hs-blue ${fx("pop", 5)}`} cx="67" cy="62" r="4" />
    {[
      { d: "M100 48 C130 48 140 22 166 22", x: 166, y: 22, at: 15 },
      { d: "M100 48 C140 48 160 52 196 52", x: 196, y: 52, at: 30 },
      { d: "M100 48 C130 48 140 78 166 78", x: 166, y: 78, at: 45 },
    ].map((pin) => (
      <g key={pin.x + pin.y}>
        <path className={`hs-line ${fx("draw", pin.at)}`} pathLength={1} d={pin.d} />
        <g transform={`translate(${pin.x} ${pin.y - 10})`}>
          <g className={fx("pop", pin.at + 10)}>
            <path className="hs-acc" d={PIN} />
            <circle className="hs-bg" cx="0" cy="0" r="2" />
          </g>
        </g>
        <rect className={`hs-mute ${fx("slide", pin.at + 10)}`} x={pin.x + 10} y={pin.y - 12} width="22" height="3" />
      </g>
    ))}
  </>
);

/** Katalog: the price changes by itself once time passes the date you set. */
const catalog = (
  <>
    <line className="hs-line" x1="20" y1="74" x2="220" y2="74" />
    {[40, 60, 80, 100, 120, 160, 180, 200].map((x) => (
      <line key={x} className="hs-line" x1={x} y1="71" x2={x} y2="77" />
    ))}
    <line className="hs-acc-line hs-dashed" x1="140" y1="42" x2="140" y2="80" />
    <circle className="hs-acc-ring hs-catalog-ring hs-transient" cx="140" cy="74" r="3" />
    <text className="hs-text" x="140" y="90" textAnchor="middle">
      01.11.
    </text>
    <g className="hs-catalog-cursor">
      <line className="hs-line" x1="40" y1="46" x2="40" y2="70" />
      <circle className="hs-ink" cx="40" cy="74" r="4" />
      <rect className="hs-card" x="12" y="20" width="56" height="26" rx="3" />
      <circle className="hs-mute" cx="19" cy="33" r="1.6" />
      <text className={`hs-text-strong ${fx("fade-out", 50)}`} x="44" y="37" textAnchor="middle">
        1.200
      </text>
      <text className={`hs-text-strong hs-acc-text ${fx("fade", 50)}`} x="44" y="37" textAnchor="middle">
        1.350
      </text>
    </g>
  </>
);

const BAR_HEIGHTS = [24, 36, 30, 46, 40, 58];
const BAR_MARGINS = [0.35, 0.42, 0.3, 0.45, 0.38, 0.5];

/** Kontrolna tabla: late / due / unassigned counts, and revenue with margin by month. */
const dashboard = (
  <>
    {[
      { label: "3 kasni", dot: "hs-bad" },
      { label: "5 danas", dot: "hs-warn" },
      { label: "2 čeka", dot: "hs-blue" },
    ].map((chip, i) => (
      <g key={chip.label} className={fx("slide", i * 5)}>
        <rect className="hs-card" x="12" y={12 + i * 26} width="72" height="20" rx="2" />
        <circle className={chip.dot} cx="22" cy={22 + i * 26} r="3" />
        {i === 0 ? <circle className="hs-bad-ring hs-ping" cx="22" cy="22" r="3" /> : null}
        <text className="hs-text" x="30" y={25 + i * 26}>
          {chip.label}
        </text>
      </g>
    ))}
    <line className="hs-line" x1="100" y1="84" x2="228" y2="84" />
    {BAR_HEIGHTS.map((height, i) => (
      <g key={i} className={fx("grow-y", 15 + i * 5)}>
        <rect className="hs-soft" x={106 + i * 20} y={84 - height} width="12" height={height} />
        <rect
          className="hs-acc"
          x={106 + i * 20}
          y={84 - height * BAR_MARGINS[i]}
          width="12"
          height={height * BAR_MARGINS[i]}
        />
      </g>
    ))}
  </>
);

/** Praćenje za klijenta: a link opens the order's progress on the client's phone, prices hidden. */
const tracking = (
  <>
    <rect className="hs-card" x="12" y="36" width="78" height="24" rx="12" />
    <rect className="hs-acc-line" x="20" y="44" width="12" height="8" rx="4" />
    <rect className="hs-acc-line" x="27" y="44" width="12" height="8" rx="4" />
    <rect className="hs-mute" x="46" y="46" width="34" height="4" />
    <line className="hs-line hs-dotted" x1="94" y1="48" x2="146" y2="48" />
    <circle className="hs-acc hs-tracking-packet hs-transient" cx="0" cy="0" r="3" />
    <rect className="hs-card" x="150" y="6" width="52" height="84" rx="7" />
    <line className="hs-line" x1="170" y1="12" x2="182" y2="12" />
    <rect className="hs-ink" x="160" y="19" width="24" height="4" />
    <line className="hs-line" x1="164" y1="32" x2="164" y2="68" />
    {[20, 30, 40, 50].map((at, i) => (
      <g key={at}>
        <circle className="hs-card" cx="164" cy={32 + i * 12} r="3.5" />
        <circle className={`${i === 3 ? "hs-acc" : "hs-ok"} ${fx("pop", at)}`} cx="164" cy={32 + i * 12} r="3.5" />
        <rect className="hs-mute" x="172" y={30.5 + i * 12} width={[20, 24, 18, 22][i]} height="3" />
      </g>
    ))}
    <rect className="hs-mute" x="160" y="79" width="7" height="6" rx="1" />
    <path className="hs-line" d="M161.5 79 v-2 a2 2 0 0 1 4 0 v2" />
    <text className="hs-text" x="171" y="85">
      •••• RSD
    </text>
  </>
);

function Screen({ x, y, w, header, lines, pill, at }: {
  x: number;
  y: number;
  w: number;
  header: number;
  lines: number[];
  pill: [number, number];
  at: number;
}): React.JSX.Element {
  return (
    <>
      <rect className="hs-acc" x={x} y={y} width={header} height="4" />
      <rect className="hs-soft" x={x + w - pill[0]} y={y - 1} width={pill[0]} height={pill[1]} rx={pill[1] / 2} />
      <rect className={`hs-ok ${fx("pop", at + 20)}`} x={x + w - pill[0]} y={y - 1} width={pill[0]} height={pill[1]} rx={pill[1] / 2} />
      {lines.map((width, i) => (
        <g key={i}>
          <rect className="hs-soft" x={x} y={y + 12 + i * 8} width={width} height="3" />
          {i === 0 ? (
            <rect className={`hs-mute ${fx("grow-x", at)}`} x={x} y={y + 12} width={width} height="3" />
          ) : null}
        </g>
      ))}
    </>
  );
}

/** Svi uređaji: the same order updates on a computer, a tablet and a phone. */
const devices = (
  <>
    <rect className="hs-card" x="12" y="12" width="96" height="62" rx="3" />
    <path className="hs-card" d="M12 74 H108 L118 82 H2 Z" />
    <Screen x={20} y={20} w={80} header={34} lines={[60, 46, 54, 40]} pill={[16, 7]} at={10} />
    <rect className="hs-card" x="128" y="18" width="54" height="70" rx="5" />
    <Screen x={135} y={27} w={40} header={20} lines={[38, 30, 34, 26]} pill={[12, 6]} at={15} />
    <rect className="hs-card" x="194" y="32" width="34" height="56" rx="5" />
    <Screen x={199} y={41} w={24} header={12} lines={[24, 18, 22]} pill={[8, 5]} at={20} />
  </>
);

const BOXES = [
  { x: 12, colors: ["hs-acc"] },
  { x: 88, colors: ["hs-blue", "hs-blue"] },
  { x: 164, colors: ["hs-green", "hs-green"] },
];

/** Odvojeni podaci: each organization's data moves only inside its own box. */
const isolation = (
  <>
    {BOXES.map((box, b) => (
      <g key={box.x}>
        <rect className="hs-card" x={box.x} y="14" width="64" height="68" rx="2" />
        <path
          className="hs-line"
          d={`M${box.x + 6} 30 h13 M${box.x + 8} 30 v-12 h9 v12 M${box.x + 10.5} 22 h1 M${box.x + 13.5} 22 h1 M${box.x + 10.5} 26 h1 M${box.x + 13.5} 26 h1`}
        />
        <rect className="hs-mute" x={box.x + 24} y="21" width="26" height="3" />
        {box.colors.map((color, i) => (
          <circle
            key={i}
            className={`${color} ${i === 0 ? "hs-iso-orbit" : "hs-iso-orbit-rev"}`}
            cx={box.x + (i === 0 ? 18 : 34)}
            cy={i === 0 ? 42 : 52}
            r="3.5"
            style={delay(-b * 1.3 - i * 2.1)}
          />
        ))}
      </g>
    ))}
    <circle className="hs-acc hs-iso-probe" cx="54" cy="62" r="3.5" />
    <line className="hs-bad-line hs-iso-flash hs-transient" x1="76" y1="16" x2="76" y2="80" />
  </>
);

const SHIELD = "M138 32 l12 4 v10 c0 8 -5 13 -12 16 c-7 -3 -12 -8 -12 -16 v-10 z";

/** Provera na serveru: the admin's request passes the check, the operator's is turned back. */
const server = (
  <>
    <circle className="hs-acc" cx="26" cy="22" r="5" />
    <path className="hs-acc" d="M16 38 a10 9 0 0 1 20 0 z" />
    <text className="hs-text" x="42" y="33">
      Admin
    </text>
    <circle className="hs-mute" cx="26" cy="64" r="5" />
    <path className="hs-mute" d="M16 80 a10 9 0 0 1 20 0 z" />
    <text className="hs-text" x="42" y="75">
      Operater
    </text>
    <path className="hs-line hs-dotted" d="M74 30 L124 46 M80 72 L124 50" />
    <line className="hs-line" x1="150" y1="48" x2="172" y2="48" />
    <path className="hs-card" d={SHIELD} />
    <g className="hs-server-ok hs-transient">
      <path className="hs-ok-line" d={SHIELD} />
      <path className="hs-ok-line hs-thick" d="M132.5 47 l4 4 l7 -8" />
    </g>
    <g className="hs-server-deny hs-transient">
      <path className="hs-bad-line" d={SHIELD} />
      <path className="hs-bad-line hs-thick" d="M133.5 42.5 l9 9 M142.5 42.5 l-9 9" />
    </g>
    <rect className="hs-card" x="172" y="18" width="54" height="60" rx="3" />
    {[0, 1, 2].map((row) => (
      <g key={row}>
        {row > 0 ? <line className="hs-line" x1="172" y1={18 + row * 20} x2="226" y2={18 + row * 20} /> : null}
        <circle className="hs-ok" cx="182" cy={28 + row * 20} r="2" />
        <rect className="hs-mute" x="190" y={26.5 + row * 20} width="26" height="3" />
      </g>
    ))}
    <rect className="hs-acc hs-server-a hs-transient" x="-4" y="-4" width="8" height="8" rx="1.5" />
    <rect className="hs-ink hs-server-b hs-transient" x="-4" y="-4" width="8" height="8" rx="1.5" />
  </>
);

/** Zabeležen pristup: we come in only when you ask, and every step lands in the log. */
const audit = (
  <>
    <g className={fx("pop", 0)}>
      <rect className="hs-card hs-acc-stroke" x="10" y="6" width="30" height="16" rx="8" />
      <text className="hs-text-strong hs-acc-text" x="25" y="17.5" textAnchor="middle">
        ?
      </text>
    </g>
    <rect className="hs-soft" x="18" y="30" width="34" height="58" />
    <g className="hs-audit-door">
      <rect className="hs-card" x="18" y="30" width="34" height="58" />
      <circle className="hs-mute" cx="46" cy="60" r="1.8" />
    </g>
    <rect className="hs-card" x="68" y="6" width="160" height="84" rx="2" />
    <text className="hs-text hs-caps" x="76" y="18">
      DNEVNIK PRISTUPA
    </text>
    {[
      { time: "09:14", text: "Zatražena pomoć", at: 5, dot: "hs-acc" },
      { time: "09:15", text: "Pristup otvoren", at: 20, dot: "hs-acc" },
      { time: "09:21", text: "Izmenjen nalog", at: 30, dot: "hs-blue" },
      { time: "09:32", text: "Pristup zatvoren", at: 50, dot: "hs-ok" },
    ].map((row, i) => (
      <g key={row.time} className={fx("slide", row.at)}>
        <text className="hs-text hs-tnum" x="76" y={36 + i * 15}>
          {row.time}
        </text>
        <circle className={row.dot} cx="106" cy={33.5 + i * 15} r="2.5" />
        <text className="hs-text hs-text-ink" x="114" y={36 + i * 15}>
          {row.text}
        </text>
      </g>
    ))}
  </>
);

/** Izvoz podataka: every table empties into one file you download. */
const exportScene = (
  <>
    <rect className="hs-card" x="12" y="16" width="76" height="60" rx="2" />
    <rect className="hs-soft" x="12.6" y="16.6" width="74.8" height="11.4" />
    <path className="hs-line" d="M12 40 H88 M12 52 H88 M12 64 H88 M38 28 V76 M62 28 V76" />
    {[0, 1, 2].map((row) => (
      <g key={row} transform={`translate(0 ${row * 12})`}>
        <rect className="hs-acc hs-export-fly hs-transient" x="0" y="0" width="22" height="6" rx="1" style={delay(row * 0.45)} />
      </g>
    ))}
    <path className="hs-card" d="M150 10 H186 L198 22 V70 H150 Z" />
    <path className="hs-line" d="M186 10 V22 H198" />
    <text className="hs-text" x="168" y="22" textAnchor="middle">
      JSON
    </text>
    {[30, 35, 45].map((at, level) => (
      <rect
        key={level}
        className={`hs-acc-soft ${fx("grow-y", at)}`}
        x="156"
        y={52 - level * 12}
        width="36"
        height="12"
      />
    ))}
    <g className={fx("drop", 60)}>
      <path className="hs-acc-line hs-thick" d="M174 74 v11 M169 80 l5 5 l5 -5" />
    </g>
    <line className="hs-line" x1="164" y1="91" x2="184" y2="91" />
  </>
);

const DAYS = ["P", "U", "S", "Č", "P", "S", "N"];

/** Rokovi pod kontrolom: as today moves, the late order turns red before the client calls. */
const deadlines = (
  <>
    {DAYS.map((day, i) => (
      <g key={i}>
        <text className="hs-text" x={27 + i * 30} y="18" textAnchor="middle">
          {day}
        </text>
        <rect className="hs-frame" x={14 + i * 30} y="24" width="26" height="64" rx="2" />
      </g>
    ))}
    <rect className="hs-acc-wash hs-deadline-today" x="14" y="24" width="26" height="64" rx="2" />
    {[
      { col: 1, y: 40, tint: "hs-bad", at: 25 },
      { col: 3, y: 54, tint: "hs-warn", at: 25 },
      { col: 4, y: 40 },
      { col: 6, y: 64 },
    ].map((chip) => (
      <g key={chip.col}>
        <rect className="hs-mute" x={17 + chip.col * 30} y={chip.y} width="20" height="9" rx="1.5" />
        {chip.tint ? (
          <rect className={`${chip.tint} ${fx("fade", chip.at)}`} x={17 + chip.col * 30} y={chip.y} width="20" height="9" rx="1.5" />
        ) : null}
      </g>
    ))}
    <g className={fx("pop", 30)}>
      <circle className="hs-bad-ring hs-ping" cx="66" cy="38" r="5" />
      <circle className="hs-bad" cx="66" cy="38" r="5" />
      <text className="hs-text-on" x="66" y="41" textAnchor="middle">
        !
      </text>
    </g>
  </>
);

/** Materijal na vreme: a finished step takes material off stock and a low level reaches the dashboard. */
const stock = (
  <>
    <rect className="hs-card" x="10" y="28" width="66" height="40" rx="3" />
    <rect className={`hs-ok-line hs-no-fill ${fx("fade", 10)}`} x="10" y="28" width="66" height="40" rx="3" />
    <rect className="hs-frame" x="18" y="42" width="12" height="12" rx="2" />
    <path className={`hs-ok-line hs-thick ${fx("draw", 5)}`} pathLength={1} d="M20.5 48 l3 3 l5 -6" />
    <rect className="hs-mute" x="36" y="43" width="32" height="3" />
    <rect className="hs-soft" x="36" y="50" width="24" height="3" />
    {[0, 1].map((i) => (
      <rect key={i} className="hs-green hs-stock-take hs-transient" x="0" y="0" width="6" height="6" rx="1" style={delay(i * 0.35)} />
    ))}
    <rect className="hs-card" x="104" y="14" width="30" height="70" rx="3" />
    <rect className="hs-stock-level" x="107" y="17" width="24" height="64" rx="1.5" />
    <line className="hs-acc-line hs-dashed" x1="100" y1="56" x2="138" y2="56" />
    <text className="hs-text" x="140" y="58">
      min
    </text>
    <rect className="hs-bad hs-stock-alert hs-transient" x="0" y="0" width="16" height="8" rx="4" />
    <rect className="hs-card" x="160" y="14" width="68" height="70" rx="3" />
    <rect className="hs-acc" x="168" y="22" width="24" height="4" />
    <rect className="hs-soft" x="168" y="34" width="48" height="3" />
    <rect className="hs-soft" x="168" y="43" width="40" height="3" />
    <g className={fx("slide", 60)}>
      <rect className="hs-bad-wash" x="166" y="54" width="56" height="14" rx="2" />
      <circle className="hs-bad" cx="174" cy="61" r="2.5" />
      <rect className="hs-mute" x="181" y="59.5" width="32" height="3" />
    </g>
  </>
);

/** Manje poziva: the phone stops ringing once the client has the tracking link. */
const calls = (
  <>
    <g className="hs-calls-shake">
      <rect className="hs-card" x="22" y="16" width="38" height="64" rx="6" />
      <line className="hs-line" x1="36" y1="22" x2="46" y2="22" />
    </g>
    <path className="hs-acc-line hs-calls-wave hs-transient" d="M66 38 a14 14 0 0 1 0 20" />
    <path className="hs-acc-line hs-calls-wave hs-transient" d="M72 31 a22 22 0 0 1 0 34" style={delay(0.12)} />
    <g className={fx("pop", 70)}>
      <circle className="hs-ok" cx="41" cy="48" r="8" />
      <path className="hs-on-line hs-thick" d="M37 48 l3 3 l5 -6" />
    </g>
    <line className="hs-line hs-dotted" x1="80" y1="48" x2="176" y2="48" />
    <g className="hs-calls-link hs-transient">
      <rect className="hs-card hs-acc-stroke" x="0" y="0" width="34" height="14" rx="7" />
      <rect className="hs-acc-line" x="7" y="4" width="9" height="6" rx="3" />
      <rect className="hs-acc-line" x="12" y="4" width="9" height="6" rx="3" />
      <rect className="hs-mute" x="24" y="5.5" width="5" height="3" />
    </g>
    <rect className="hs-card" x="180" y="16" width="38" height="64" rx="6" />
    <line className="hs-line" x1="194" y1="22" x2="204" y2="22" />
    <rect className="hs-ink" x="187" y="30" width="16" height="3" />
    <rect className="hs-soft" x="187" y="44" width="24" height="4" />
    <rect className={`hs-acc ${fx("grow-x", 55)}`} x="187" y="44" width="24" height="4" />
    {[55, 60, 65].map((at, i) => (
      <circle key={at} className={`hs-ok ${fx("pop", at)}`} cx={190 + i * 9} cy="60" r="2.5" />
    ))}
  </>
);

/** Zarada po tadašnjoj ceni: the purchase price rises, the old order keeps the cost it was made at. */
const frozen = (
  <>
    <path className="hs-line" d="M20 10 V82 H224" />
    <path className="hs-ink-line hs-frozen-line" pathLength={1} d="M20 64 H122 V34 H224" />
    <text className="hs-text" x="26" y="76">
      nabavna cena
    </text>
    <line className="hs-line hs-dashed" x1="64" y1="68" x2="64" y2="82" />
    <circle className="hs-mute hs-frozen-ghost hs-transient" cx="64" cy="64" r="4" />
    <circle className={`hs-acc ${fx("pop", 10)}`} cx="64" cy="64" r="4" />
    <text className={`hs-text-strong ${fx("fade", 10)}`} x="64" y="56" textAnchor="middle">
      1.200
    </text>
    <g className={fx("pop", 15)}>
      <path className="hs-acc-line hs-frozen-shackle" d="M60.5 32 v-3 a3.5 3.5 0 0 1 7 0 v3" />
      <rect className="hs-acc" x="58" y="32" width="12" height="9" rx="1.5" />
    </g>
    <line className="hs-line hs-dashed" x1="178" y1="38" x2="178" y2="82" />
    <circle className={`hs-acc ${fx("pop", 35)}`} cx="178" cy="34" r="4" />
    <text className={`hs-text-strong ${fx("fade", 35)}`} x="178" y="25" textAnchor="middle">
      1.350
    </text>
  </>
);

const SCENES: Record<SceneId, ReactNode> = {
  orders,
  clients,
  catalog,
  dashboard,
  tracking,
  devices,
  isolation,
  server,
  audit,
  export: exportScene,
  deadlines,
  stock,
  calls,
  frozen,
};
