import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name for the tablist. */
  "aria-label"?: string;
  className?: string;
}

/**
 * Iris editorial underline tabs — a row of triggers on a hairline baseline with
 * a sliding ember indicator under the active tab. Square, compact, and keyboard
 * navigable (←/→). The canonical section/view switcher per the Iris design
 * system; use instead of hand-rolled filled segmented toggles.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: TabsProps<T>): React.JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const enabled = tabs
      .map((tab, i) => ({ tab, i }))
      .filter(({ tab }) => !tab.disabled);
    const pos = enabled.findIndex(({ i }) => i === index);
    if (pos === -1) return;
    const nextPos =
      event.key === "ArrowRight"
        ? (pos + 1) % enabled.length
        : (pos - 1 + enabled.length) % enabled.length;
    const next = enabled[nextPos];
    onValueChange(next.tab.value);
    refs.current[next.i]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-5 border-b border-border", className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(tab.value)}
            onKeyDown={(event) => moveFocus(event, index)}
            className={cn(
              "iris-focusable relative -mb-px bg-transparent pb-2.5 text-[13px] transition-colors",
              "disabled:pointer-events-none disabled:opacity-40",
              active
                ? "font-medium text-foreground"
                : "text-[color:var(--iris-ink-soft)] hover:text-foreground",
            )}
          >
            {tab.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-0.5 origin-left bg-[color:var(--iris-accent)]"
                style={{
                  animation:
                    "iris-rule-grow var(--iris-dur-base) var(--iris-ease-out) both",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
