import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LogOut,
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  Package,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_FIRM_NAME } from "@/types/settings";
import { IrisMark } from "@/components/brand/IrisMark";

interface NavItemDef {
  label: string;
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const NAV_ITEMS: NavItemDef[] = [
  { label: "Kontrolna tabla", to: "/", end: true, icon: LayoutDashboard },
  { label: "Radni nalozi", to: "/work-orders", icon: ClipboardList },
  { label: "Novi nalog", to: "/work-orders/new", icon: PlusCircle },
  { label: "Katalog", to: "/catalog", icon: Package },
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
  const [firmName, setFirmName] = useState(DEFAULT_FIRM_NAME);
  const location = useLocation();

  // The firm name is shop branding configured by an admin in the web app; load
  // it once. Optional-chained so partial api stubs (tests) and failures just keep
  // the default name.
  useEffect(() => {
    let active = true;
    void Promise.resolve(window.api?.getSettings?.())
      .then((settings) => {
        if (active && settings?.firmName) setFirmName(settings.firmName);
      })
      .catch(() => {
        // Keep the default firm name.
      });
    return () => {
      active = false;
    };
  }, []);
  const activeNavIndex = getActiveNavItemIndex(location.pathname);
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState<{
    top: number;
    height: number;
    visible: boolean;
  }>({ top: 0, height: 0, visible: false });

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

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
    <div className="fixed inset-0 flex min-w-[1024px] overflow-hidden bg-background text-foreground">
      <aside className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-7 pb-5 transition-[width,padding] duration-300 ease-[var(--iris-ease-out-decisive)]",
        isCollapsed ? "w-[68px] px-3" : "w-[220px] px-5"
      )}>
        <div className={cn(
          "mb-10 flex items-center",
          isCollapsed ? "flex-col items-center gap-4 justify-center" : "flex-row justify-between gap-2"
        )}>
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "Proširi meni" : "Skupi meni"}
            className={cn(
              "iris-focusable iris-press flex items-center font-medium text-foreground hover:opacity-90 transition-all duration-300",
              isCollapsed ? "gap-0 justify-center w-full" : "gap-2.5"
            )}
          >
            <IrisMark className="h-8 w-8 shrink-0 text-foreground" />
            <div className={cn(
              "flex flex-col items-start text-left transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
              isCollapsed ? "w-0 opacity-0 overflow-hidden pointer-events-none" : "w-auto opacity-100"
            )}>
              <span className="text-[18px] font-semibold leading-none tracking-[-0.5px] whitespace-nowrap">
                Iris
              </span>
              <span className="text-[9px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)] mt-0.5 whitespace-nowrap">
                {firmName}
              </span>
            </div>
          </button>

          <button
            onClick={toggleCollapse}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--iris-border-soft)] bg-background text-[color:var(--iris-ink-soft)] hover:text-foreground hover:bg-black/[0.03] transition-colors iris-focusable iris-press shrink-0"
            title={isCollapsed ? "Proširi" : "Skupi"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <div className={cn(
          "mb-3 pl-1 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)] transition-all duration-300",
          isCollapsed ? "opacity-0 h-0 mb-0 overflow-hidden" : "opacity-100"
        )}>
          Sekcija
        </div>
        <nav ref={navRef} className="relative flex flex-col gap-0.5">
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute w-0.5 bg-[color:var(--iris-accent)] motion-reduce:transition-none transition-all duration-300",
              isCollapsed ? "-left-3" : "-left-5"
            )}
            style={{
              top: indicator.top,
              height: indicator.height,
              opacity: indicator.visible ? 1 : 0,
              transform: indicator.visible ? "scaleY(1)" : "scaleY(0.5)",
              transformOrigin: "center",
              transition:
                "top 320ms var(--iris-ease-out-decisive), height 320ms var(--iris-ease-out-decisive), opacity 220ms var(--iris-ease-out), transform 220ms var(--iris-ease-out), left 300ms var(--iris-ease-out-decisive)",
            }}
          />
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className={() =>
                  cn(
                    "iris-focusable iris-press relative flex items-center rounded-sm px-2 py-2 text-[13px] transition-all duration-300",
                    isCollapsed ? "w-full justify-center px-0 gap-0" : "gap-2.5",
                    idx === activeNavIndex
                      ? "bg-black/5 font-medium text-foreground"
                      : "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                  )
                }
                title={isCollapsed ? item.label : undefined}
              >
                <Icon size={16} className="shrink-0" />
                <span className={cn(
                  "whitespace-nowrap transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
                  isCollapsed ? "hidden" : "inline"
                )}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div className={cn(
          "mt-auto text-[11px] text-[color:var(--iris-ink-mute)] leading-[1.5] flex flex-col gap-3 transition-all duration-300",
          isCollapsed ? "items-center w-full" : "items-start w-full"
        )}>
          <div className={cn(
            "flex items-center gap-2 border-t border-[color:var(--iris-border-soft)] py-2 w-full transition-all duration-300",
            isCollapsed ? "justify-center gap-0 border-t-0 py-0" : ""
          )}>
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--iris-accent)] text-[11px] font-medium text-white"
              title={isCollapsed ? currentUser?.username ?? "" : undefined}
            >
              {initials}
            </div>
            <div className={cn(
              "flex flex-col transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
              isCollapsed ? "w-0 opacity-0 overflow-hidden pointer-events-none" : "w-auto opacity-100"
            )}>
              <div className="text-[12px] text-foreground font-medium whitespace-nowrap">
                {currentUser?.username ?? ""}
              </div>
              <div className="text-[10px] text-[color:var(--iris-ink-faint)] whitespace-nowrap">
                {currentUser?.role === "admin" ? "Administrator" : "Operater"}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className={cn(
              "iris-focusable iris-press flex w-full items-center bg-transparent py-1.5 text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground transition-all duration-300",
              isCollapsed ? "justify-center gap-0 py-1" : "gap-2"
            )}
            title={isCollapsed ? "Odjava" : undefined}
          >
            <LogOut size={14} className="shrink-0" />
            <span className={cn(
              "transition-all duration-300 ease-[var(--iris-ease-out-decisive)] whitespace-nowrap",
              isCollapsed ? "w-0 opacity-0 overflow-hidden pointer-events-none" : "w-auto opacity-100"
            )}>
              Odjava
            </span>
          </button>
        </div>
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
