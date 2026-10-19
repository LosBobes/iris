import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Typography and layout pieces the documentation chapters are written with.
 * The chapters are long-form Serbian text, so these stay small and plain:
 * a paragraph, headings, callouts, a figure frame and a definition list.
 */

export function P({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="text-[14px] leading-[1.75] text-[color:var(--iris-ink-soft)] [&_strong]:font-medium [&_strong]:text-foreground">
      {children}
    </p>
  );
}

export function H2({ id, children }: { id?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <h2
      id={id}
      className="scroll-mt-24 pt-4 text-[19px] font-medium tracking-[-0.3px] text-foreground"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="pt-2 text-[15px] font-medium tracking-[-0.1px] text-foreground">
      {children}
    </h3>
  );
}

/** A bulleted list with the same rhythm as `P`. */
export function List({
  items,
  ordered = false,
}: {
  items: React.ReactNode[];
  ordered?: boolean;
}): React.JSX.Element {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "space-y-1.5 pl-5 text-[14px] leading-[1.7] text-[color:var(--iris-ink-soft)] [&_strong]:font-medium [&_strong]:text-foreground",
        ordered ? "list-decimal" : "list-disc",
      )}
    >
      {items.map((item, index) => (
        <li key={index} className="pl-1 marker:text-[color:var(--iris-ink-mute)]">
          {item}
        </li>
      ))}
    </Tag>
  );
}

const CALLOUT_STYLES = {
  tip: { icon: Lightbulb, color: "var(--iris-status-done)", label: "Savet" },
  note: { icon: Info, color: "var(--iris-proc-step)", label: "Dobro je znati" },
  warn: { icon: TriangleAlert, color: "var(--iris-accent)", label: "Pažnja" },
} as const;

export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: keyof typeof CALLOUT_STYLES;
  title?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const style = CALLOUT_STYLES[kind];
  const Icon = style.icon;
  return (
    <aside
      className="flex gap-3 border-l-2 px-4 py-3.5"
      style={{
        borderColor: style.color,
        background: `color-mix(in oklch, ${style.color} 7%, transparent)`,
      }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: style.color }} aria-hidden />
      <div className="space-y-1 text-[13px] leading-[1.7] text-[color:var(--iris-ink-soft)] [&_strong]:font-medium [&_strong]:text-foreground">
        <div className="text-[11px] font-medium uppercase tracking-[1px]" style={{ color: style.color }}>
          {title ?? style.label}
        </div>
        <div>{children}</div>
      </div>
    </aside>
  );
}

/**
 * Frames a diagram with a caption. Diagrams are drawn for a desktop width, so
 * on a phone the frame scrolls sideways instead of shrinking the labels into
 * something nobody can read.
 */
export function Figure({
  caption,
  children,
  minWidth = 560,
}: {
  caption: React.ReactNode;
  children: React.ReactNode;
  minWidth?: number;
}): React.JSX.Element {
  return (
    <figure className="my-2 border border-border bg-card">
      <div className="overflow-x-auto px-3 py-4 sm:px-5">
        <div style={{ minWidth }}>{children}</div>
      </div>
      <figcaption className="border-t border-[color:var(--iris-border-soft)] px-4 py-2.5 text-[12px] leading-relaxed text-[color:var(--iris-ink-mute)]">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Term/definition pairs, two columns on wide screens. */
export function Terms({
  items,
}: {
  items: Array<{ term: string; body: React.ReactNode; tag?: string }>;
}): React.JSX.Element {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(({ term, body, tag }) => (
        <div key={term} className="border-t border-[color:var(--iris-border-soft)] pt-3">
          <dt className="flex flex-wrap items-baseline gap-2 text-[14px] font-medium text-foreground">
            {term}
            {tag && (
              <span className="text-[11px] font-normal text-[color:var(--iris-ink-mute)]">{tag}</span>
            )}
          </dt>
          <dd className="mt-1 text-[13px] leading-[1.7] text-[color:var(--iris-ink-soft)] [&_strong]:font-medium [&_strong]:text-foreground">
            {body}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Inline name of a button or screen, so it reads as "the thing you click". */
export function Ui({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="whitespace-nowrap rounded-sm border border-border bg-muted px-1.5 py-[1px] text-[12px] font-medium text-foreground">
      {children}
    </span>
  );
}
