import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface NavItemDef {
  label: string;
  to: string;
  end?: boolean;
}

const NAV_ITEMS: NavItemDef[] = [
  { label: "Kontrolna tabla", to: "/", end: true },
  { label: "Radni nalozi", to: "/work-orders" },
  { label: "Novi nalog", to: "/work-orders/new" },
  { label: "Klijenti", to: "/customers" },
];

interface AppShellProps {
  children: React.ReactNode;
}

function isActivePath(currentPath: string, item: NavItemDef): boolean {
  if (item.end) return currentPath === item.to;
  return currentPath === item.to || currentPath.startsWith(`${item.to}/`);
}

function getActiveNavItemIndex(currentPath: string): number {
  return NAV_ITEMS.reduce((activeIndex, item, index) => {
    if (!isActivePath(currentPath, item)) return activeIndex;

    const activeItem = activeIndex >= 0 ? NAV_ITEMS[activeIndex] : null;
    return !activeItem || item.to.length > activeItem.to.length
      ? index
      : activeIndex;
  }, -1);
}

export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const { currentUser, onLogout } = useAuth();
  const location = useLocation();
  const activeNavIndex = getActiveNavItemIndex(location.pathname);
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState<{
    top: number;
    height: number;
    visible: boolean;
  }>({ top: 0, height: 0, visible: false });

  const initials = (currentUser?.username ?? "??")
    .split(/[.\s_-]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const recomputeIndicator = useCallback(() => {
    const activeIdx = activeNavIndex;
    if (activeIdx === -1) {
      setIndicator((prev) => ({ ...prev, visible: false }));
      return;
    }
    const el = itemRefs.current[activeIdx];
    if (!el || !navRef.current) return;
    const navRect = navRef.current.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();
    setIndicator({
      top: itemRect.top - navRect.top + 8,
      height: itemRect.height - 16,
      visible: true,
    });
  }, [activeNavIndex]);

  useLayoutEffect(() => {
    recomputeIndicator();
  }, [recomputeIndicator]);

  useLayoutEffect(() => {
    if (!navRef.current) return;
    const observer = new ResizeObserver(() => recomputeIndicator());
    observer.observe(navRef.current);
    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });
    window.addEventListener("resize", recomputeIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recomputeIndicator);
    };
  }, [recomputeIndicator]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground lg:flex-row">
      <aside className="flex h-auto w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar px-5 py-4 lg:h-full lg:w-[220px] lg:border-r lg:border-b-0 lg:pt-7 lg:pb-5">
        <div className="mb-4 lg:mb-10">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[22px] font-medium tracking-[-0.5px] text-foreground">
              Iris
            </span>
            <span className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
              Grafika Čobanović
            </span>
          </div>
          {/* TODO: Change this based on the feedback from the team */}
          {/* <div className="mt-1 text-[10px] tracking-[0.3px] text-[color:var(--iris-ink-faint)]">
            Radni nalozi · v0.0.1
          </div> */}
        </div>

        <div className="mb-3 hidden pl-1 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)] lg:block">
          Sekcija
        </div>
        <nav ref={navRef} className="relative flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-5 hidden w-0.5 bg-[color:var(--iris-accent)] motion-reduce:transition-none lg:block"
            style={{
              top: indicator.top,
              height: indicator.height,
              opacity: indicator.visible ? 1 : 0,
              transform: indicator.visible ? "scaleY(1)" : "scaleY(0.5)",
              transformOrigin: "center",
              transition:
                "top 320ms var(--iris-ease-out-decisive), height 320ms var(--iris-ease-out-decisive), opacity 220ms var(--iris-ease-out), transform 220ms var(--iris-ease-out)",
            }}
          />
          {NAV_ITEMS.map((item, idx) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              className={() =>
                cn(
                  "iris-focusable iris-press relative flex items-center gap-2.5 rounded-sm px-2 py-2 text-[13px]",
                  idx === activeNavIndex
                    ? "bg-black/5 font-medium text-foreground"
                    : "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                )
              }
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-3 flex items-center justify-between gap-4 border-t border-[color:var(--iris-border-soft)] pt-3 text-[11px] leading-[1.5] text-[color:var(--iris-ink-mute)] lg:mt-auto lg:block lg:border-t-0 lg:pt-0">
          <div className="flex items-center gap-2 lg:border-t lg:border-[color:var(--iris-border-soft)] lg:py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--iris-accent)] text-[11px] font-medium text-white">
              {initials}
            </div>
            <div>
              <div className="text-[12px] text-foreground">
                {currentUser?.username ?? ""}
              </div>
              <div className="text-[10px] text-[color:var(--iris-ink-faint)]">
                Operater
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="iris-focusable iris-press flex items-center gap-2 bg-transparent py-1.5 text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground lg:w-full"
          >
            <LogOut size={12} />
            Odjava
          </button>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
