import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export interface SectionTab {
  to: string;
  label: string;
  current: boolean;
}

/**
 * Backoffice section links with an underline that slides to the active tab.
 * The indicator is a 1px-wide bar positioned with `translate` and stretched
 * with `scale`, so moving it never triggers layout.
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }): React.JSX.Element {
  const navRef = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ x: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = (): void => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setBar((previous) => {
        if (!active) return null;
        const next = { x: active.offsetLeft, width: active.offsetWidth };
        return previous && previous.x === next.x && previous.width === next.width ? previous : next;
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tabs]);

  return (
    <nav ref={navRef} aria-label={label} className="relative ml-1 flex items-center gap-1">
      {tabs.map((tab) => (
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
      {bar ? (
        <span
          aria-hidden
          data-testid="section-tab-indicator"
          className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-px origin-left bg-[color:var(--pf-text)] transition-[translate,scale] duration-[var(--iris-dur-slow)] ease-[var(--iris-ease-out-decisive)]"
          style={{ translate: `${bar.x}px 0`, scale: `${bar.width} 1` }}
        />
      ) : null}
    </nav>
  );
}
