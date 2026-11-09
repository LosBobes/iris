import type { WhatsNewId } from "@/lib/whats-new";
import "@/components/home/feature-scenes.css";

/**
 * Each What's new entry's moving picture: a small piece of the screen it is
 * about, playing on a loop. Built from the landing page's scene kit
 * (`feature-scenes.css`: `hs-at-N` builds a part in at N% of the cycle, an
 * `hs-fx-*` class picks the effect), so it follows the theme and, under
 * reduced motion, rests on its finished frame, which still tells the story.
 * Every scene has the same box (viewBox 240 × 96), so the dialog never
 * changes size from one page to the next.
 */

type Effect = "grow-x" | "grow-y" | "fade" | "fade-out" | "pop" | "draw" | "slide" | "drop";

function fx(effect: Effect, at: number): string {
  return `hs-fx-${effect} hs-at-${at}`;
}

/** The dialog itself: a bell rings and a little card with a demo pops up. */
const whatsNew = (
  <>
    <rect className="hs-card" x="16" y="12" width="92" height="72" rx="2" />
    <rect className="hs-soft" x="26" y="24" width="40" height="5" />
    <rect className="hs-soft" x="26" y="36" width="64" height="4" />
    <rect className="hs-soft" x="26" y="46" width="56" height="4" />
    <rect className="hs-soft" x="26" y="56" width="60" height="4" />
    <g className={fx("pop", 5)}>
      <circle className="hs-acc" cx="104" cy="16" r="6" />
      <text className="hs-text-on" x="104" y="19" textAnchor="middle">1</text>
    </g>
    <path className={`hs-acc-line ${fx("draw", 15)}`} pathLength={1} d="M110 30 C130 30 132 48 140 48" />
    <g className={fx("pop", 25)}>
      <rect className="hs-card" x="140" y="14" width="86" height="70" rx="3" />
      <rect className="hs-acc-wash" x="148" y="22" width="70" height="28" rx="2" />
    </g>
    <circle className={`hs-acc ${fx("pop", 35)}`} cx="166" cy="36" r="5" />
    <rect className={`hs-acc ${fx("grow-x", 40)}`} x="176" y="34" width="32" height="4" />
    <rect className={`hs-ink ${fx("grow-x", 50)}`} x="148" y="58" width="46" height="4" />
    <rect className={`hs-mute ${fx("grow-x", 55)}`} x="148" y="66" width="62" height="3" />
    <rect className={`hs-acc ${fx("slide", 65)}`} x="196" y="72" width="22" height="8" rx="1" />
  </>
);

/** Dashboard: a company is picked and its orders line up with revenue and profit. */
const companyOrders = (
  <>
    <rect className="hs-card" x="12" y="10" width="216" height="18" rx="2" />
    <circle className="hs-mute" cx="22" cy="19" r="3" />
    <rect className="hs-soft" x="30" y="17" width="40" height="4" />
    <rect className={`hs-ink ${fx("grow-x", 5)}`} x="30" y="17" width="58" height="4" />
    <rect className={`hs-acc-wash ${fx("fade", 5)}`} x="12" y="10" width="216" height="18" rx="2" />
    {[0, 1, 2].map((row) => (
      <g key={row} className={fx("slide", 20 + row * 10)}>
        <rect className="hs-card" x="12" y={36 + row * 18} width="216" height="14" />
        <rect className="hs-acc" x="20" y={41 + row * 18} width="22" height="4" />
        <rect className="hs-mute" x="50" y={41 + row * 18} width={[60, 44, 52][row]} height="4" />
        <text className="hs-text hs-tnum" x="176" y={46 + row * 18} textAnchor="end">
          {["48.000", "21.500", "33.200"][row]}
        </text>
        <text className="hs-text hs-tnum hs-acc-text" x="220" y={46 + row * 18} textAnchor="end">
          {["+12%", "+8%", "+15%"][row]}
        </text>
      </g>
    ))}
    <path className={`hs-ink-line ${fx("pop", 60)}`} d="M120 70 l0 9 l3 -3 l3 5 l2 -1 l-3 -5 l4 0 Z" />
  </>
);

/** Packages: boxes drop on a scale, the weight adds up and the PAKETI box fills in. */
const packages = (
  <>
    <rect className="hs-ink" x="22" y="78" width="80" height="6" rx="1" />
    <rect className="hs-card" x="44" y="84" width="36" height="6" />
    <g className={fx("drop", 5)}>
      <rect className="hs-card" x="30" y="58" width="30" height="20" />
      <line className="hs-line" x1="45" y1="58" x2="45" y2="78" />
    </g>
    <g className={fx("drop", 20)}>
      <rect className="hs-card" x="64" y="62" width="26" height="16" />
      <line className="hs-line" x1="77" y1="62" x2="77" y2="78" />
    </g>
    <text className={`hs-text-strong ${fx("fade-out", 20)}`} x="62" y="40" textAnchor="middle">4,2 kg</text>
    <text className={`hs-text-strong hs-acc-text ${fx("fade", 20)}`} x="62" y="40" textAnchor="middle">7,0 kg</text>
    <rect className="hs-card" x="128" y="12" width="96" height="74" />
    <text className="hs-text hs-caps" x="136" y="25">PAKETI</text>
    {[0, 1, 2].map((row) => (
      <g key={row}>
        <line className="hs-line hs-dashed" x1="136" y1={40 + row * 14} x2="216" y2={40 + row * 14} />
        {row < 2 ? (
          <rect className={`hs-ink ${fx("grow-x", 35 + row * 12)}`} x="138" y={34 + row * 14} width={row ? 52 : 64} height="4" />
        ) : null}
      </g>
    ))}
    <text className={`hs-text hs-acc-text ${fx("fade", 65)}`} x="216" y="80" textAnchor="end">~ 650 RSD</text>
  </>
);

/** The update strip: it slides in at the top, the button is pressed, the page refreshes. */
const updateBanner = (
  <>
    <rect className="hs-card" x="20" y="8" width="200" height="80" rx="2" />
    <g className={fx("drop", 10)}>
      <rect className="hs-acc-wash" x="20" y="8" width="200" height="16" />
      <circle className="hs-acc" cx="30" cy="16" r="3" />
      <rect className="hs-ink" x="38" y="14" width="110" height="4" />
      <rect className="hs-acc" x="180" y="11" width="34" height="10" rx="1" />
      <text className="hs-text-on" x="197" y="18.5" textAnchor="middle">↻</text>
    </g>
    {[0, 1, 2].map((row) => (
      <rect key={row} className="hs-soft" x="32" y={36 + row * 14} width={[120, 150, 96][row]} height="5" />
    ))}
    <g className={fx("pop", 45)}>
      <path className="hs-ink-line" d="M190 30 l0 10 l3 -3 l3 5 l2 -1 l-3 -5 l4 0 Z" />
    </g>
    <path className={`hs-acc-line hs-thick ${fx("draw", 60)}`} pathLength={1} d="M178 56 A12 12 0 1 1 190 70" />
  </>
);

const SCENES: Record<WhatsNewId, React.JSX.Element> = {
  whatsNew,
  companyOrders,
  packages,
  updateBanner,
};

export function WhatsNewArt({ demo }: { demo: WhatsNewId }): React.JSX.Element {
  return (
    <div data-demo={demo} data-playing="true" className="iris-scene border border-[color:var(--iris-border-soft)] bg-background">
      <svg aria-hidden viewBox="0 0 240 96" className="block h-auto w-full" focusable="false">
        {SCENES[demo]}
      </svg>
    </div>
  );
}
