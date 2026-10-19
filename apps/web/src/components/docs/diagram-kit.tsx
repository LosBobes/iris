/**
 * A tiny SVG vocabulary for the documentation diagrams: boxes, arrows, pills
 * and free text. Colors come from the theme's CSS variables, so every diagram
 * follows light/dark mode without its own palette.
 */

export type Tone =
  | "neutral"
  | "accent"
  | "done"
  | "active"
  | "draft"
  | "cancelled"
  | "step"
  | "input"
  | "product"
  | "byproduct";

export const TONE: Record<Tone, string> = {
  neutral: "var(--iris-ink-mute)",
  accent: "var(--iris-accent)",
  done: "var(--iris-status-done)",
  active: "var(--iris-status-active)",
  draft: "var(--iris-status-draft)",
  cancelled: "var(--iris-status-cancelled)",
  step: "var(--iris-proc-step)",
  input: "var(--iris-proc-input)",
  product: "var(--iris-proc-product)",
  byproduct: "var(--iris-proc-byproduct)",
};

export const INK = "var(--foreground)";
export const INK_SOFT = "var(--iris-ink-soft)";
export const INK_MUTE = "var(--iris-ink-mute)";
export const RULE = "var(--border)";
export const CARD = "var(--card)";

/**
 * Fill for a tinted shape: a little of the tone over the card color. Mixed in
 * oklab, not oklch: an oklch mix interpolates hue and would swing a blue tone
 * through red on its way to the warm card color.
 */
export function tint(tone: Tone, percent = 12): string {
  return `color-mix(in oklab, ${TONE[tone]} ${percent}%, var(--card))`;
}

export function Diagram({
  title,
  width,
  height,
  children,
}: {
  title: string;
  width: number;
  height: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      className="block h-auto w-full"
      style={{ fontFamily: "inherit" }}
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

export function Text({
  x,
  y,
  children,
  size = 12,
  weight = 400,
  color = INK_SOFT,
  anchor = "middle",
  italic = false,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
}): React.JSX.Element {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      style={{
        fill: color,
        fontSize: size,
        fontWeight: weight,
        fontStyle: italic ? "italic" : undefined,
      }}
    >
      {children}
    </text>
  );
}

/**
 * A rounded box with a centered title and an optional muted subtitle; both
 * accept "\n" for extra lines.
 */
export function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  tone = "neutral",
  strong = false,
  dashed = false,
  faded = false,
  titleSize = 13,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  sub?: string;
  tone?: Tone;
  strong?: boolean;
  dashed?: boolean;
  faded?: boolean;
  titleSize?: number;
}): React.JSX.Element {
  const color = TONE[tone];
  const titleLines = title ? title.split("\n") : [];
  const subLines = sub ? sub.split("\n") : [];
  const titleLead = titleSize + 4;
  const subLead = 15;
  const total = titleLines.length * titleLead + subLines.length * subLead;
  const top = y + h / 2 - total / 2;
  // Baseline of line i: titles first, then subtitles under them.
  const titleY = (i: number) => top + (i + 1) * titleLead - 4;
  const subY = (i: number) => top + titleLines.length * titleLead + (i + 1) * subLead - 3;
  return (
    <g opacity={faded ? 0.45 : 1}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={7}
        style={{
          fill: strong ? tint(tone, 22) : tint(tone, 9),
          stroke: `color-mix(in oklch, ${color} ${strong ? 80 : 50}%, transparent)`,
          strokeWidth: strong ? 1.6 : 1.2,
          strokeDasharray: dashed ? "5 4" : undefined,
        }}
      />
      {titleLines.map((line, i) => (
        <Text key={`t${i}`} x={x + w / 2} y={titleY(i)} size={titleSize} weight={500} color={INK}>
          {line}
        </Text>
      ))}
      {subLines.map((line, i) => (
        <Text key={`s${i}`} x={x + w / 2} y={subY(i)} size={11} color={INK_SOFT}>
          {line}
        </Text>
      ))}
    </g>
  );
}

/** A status-like pill: tinted capsule with colored text. */
export function Pill({
  x,
  y,
  w,
  label,
  tone,
  h = 26,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  tone: Tone;
  h?: number;
}): React.JSX.Element {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2}
        style={{
          fill: tint(tone, 16),
          stroke: `color-mix(in oklch, ${TONE[tone]} 45%, transparent)`,
          strokeWidth: 1.2,
        }}
      />
      <Text x={x + w / 2} y={y + h / 2 + 4.5} size={12.5} weight={500} color={TONE[tone]}>
        {label}
      </Text>
    </g>
  );
}

/**
 * A polyline arrow through the given points with a head at the last point
 * and an optional label at `labelAt` (defaults to the middle of the first
 * segment).
 */
export function Arrow({
  points,
  tone = "neutral",
  dashed = false,
  label,
  labelAt,
  head = true,
  width = 1.4,
}: {
  points: Array<[number, number]>;
  tone?: Tone;
  dashed?: boolean;
  label?: string;
  labelAt?: [number, number];
  head?: boolean;
  width?: number;
}): React.JSX.Element {
  const color = TONE[tone];
  const [x2, y2] = points[points.length - 1];
  const [x1, y1] = points[points.length - 2];
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 7;
  const left: [number, number] = [
    x2 - size * Math.cos(angle - Math.PI / 7),
    y2 - size * Math.sin(angle - Math.PI / 7),
  ];
  const right: [number, number] = [
    x2 - size * Math.cos(angle + Math.PI / 7),
    y2 - size * Math.sin(angle + Math.PI / 7),
  ];
  const [lx, ly] =
    labelAt ?? [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2 - 7];
  return (
    <g>
      <polyline
        points={points.map((p) => p.join(",")).join(" ")}
        style={{
          fill: "none",
          stroke: color,
          strokeWidth: width,
          strokeDasharray: dashed ? "4 4" : undefined,
          strokeLinejoin: "round",
        }}
      />
      {head && (
        <polygon points={[left, [x2, y2], right].map((p) => p.join(",")).join(" ")} style={{ fill: color }} />
      )}
      {label && (
        <Text x={lx} y={ly} size={11} color={INK_MUTE}>
          {label}
        </Text>
      )}
    </g>
  );
}

/** A small numbered circle used to mark steps in a diagram. */
export function Badge({
  x,
  y,
  n,
  tone = "accent",
}: {
  x: number;
  y: number;
  n: string | number;
  tone?: Tone;
}): React.JSX.Element {
  return (
    <g>
      <circle cx={x} cy={y} r={10} style={{ fill: TONE[tone] }} />
      <Text x={x} y={y + 4} size={11} weight={600} color={CARD}>
        {n}
      </Text>
    </g>
  );
}
