import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LogOut,
  Home,
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  Users,
  PanelLeft,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function SidebarTooltip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

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
  { label: "Klijenti", to: "/customers", icon: Users },
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
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground lg:flex-row">
      <aside className={cn(
        "flex h-auto w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar px-5 py-4 transition-[width,padding] duration-300 ease-[var(--iris-ease-out-decisive)]",
        "lg:h-full lg:border-r lg:border-b-0 lg:pt-7 lg:pb-5",
        isCollapsed ? "lg:w-[68px] lg:px-3" : "lg:w-[220px] lg:px-5"
      )}>
        <div className="mb-4 lg:mb-10 flex items-center">
          <SidebarTooltip label="Iris" enabled={isCollapsed}>
            <NavLink
              to="/"
              className={cn(
                "flex min-w-0 items-center font-medium text-foreground hover:opacity-90 transition-all duration-300",
                isCollapsed ? "lg:w-full lg:justify-center lg:gap-0" : "gap-2.5"
              )}
            >
              <Home className="h-5 w-5 shrink-0 text-[color:var(--iris-accent)]" />
              <div className={cn(
                "flex flex-col transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
                isCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100"
              )}>
                <span className="text-[18px] font-semibold leading-none tracking-[-0.5px] whitespace-nowrap">
                  Iris
                </span>
                <span className="text-[9px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)] mt-0.5 whitespace-nowrap">
                  Grafika Čobanović
                </span>
              </div>
            </NavLink>
          </SidebarTooltip>
        </div>

        <div
          role="separator"
          className="mb-3 hidden border-t border-[color:var(--iris-border-soft)] lg:block"
        />
        <nav ref={navRef} className="relative flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute hidden w-0.5 bg-[color:var(--iris-accent)] motion-reduce:transition-none lg:block transition-all duration-300",
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
              <SidebarTooltip key={item.to} label={item.label} enabled={isCollapsed}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  className={() =>
                    cn(
                      "iris-focusable iris-press relative flex items-center rounded-sm px-2 py-2 text-[13px] transition-all duration-300",
                      isCollapsed ? "lg:w-full lg:justify-center lg:px-0 lg:gap-0" : "gap-2.5",
                      idx === activeNavIndex
                        ? "bg-black/5 font-medium text-foreground"
                        : "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                    )
                  }
                >
                  <Icon size={16} className="shrink-0" />
                  <span className={cn(
                    "whitespace-nowrap transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
                    isCollapsed ? "lg:hidden" : "lg:inline"
                  )}>
                    {item.label}
                  </span>
                </NavLink>
              </SidebarTooltip>
            );
          })}
        </nav>

        <div className={cn(
          "mt-3 flex items-center justify-between gap-4 border-t border-[color:var(--iris-border-soft)] pt-3 text-[11px] leading-[1.5] text-[color:var(--iris-ink-mute)]",
          "lg:mt-auto lg:flex lg:flex-col lg:gap-0.5 lg:border-t-0 lg:pt-0",
          isCollapsed ? "lg:items-center" : "lg:items-start"
        )}>
          <SidebarTooltip label="Proširi meni" enabled={isCollapsed}>
            <button
              onClick={toggleCollapse}
              className={cn(
                "hidden iris-focusable iris-press relative items-center rounded-sm px-2 py-2 text-[13px] transition-all duration-300 lg:flex lg:w-full",
                "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                isCollapsed ? "lg:justify-center lg:px-0 lg:gap-0" : "gap-2.5",
              )}
            >
              <PanelLeft size={16} className="shrink-0" />
              <span className={cn(
                "transition-all duration-300 ease-[var(--iris-ease-out-decisive)] whitespace-nowrap",
                isCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100",
              )}>
                Skupi meni
              </span>
            </button>
          </SidebarTooltip>
          <div className={cn(
            "flex items-center gap-2 lg:border-t lg:border-[color:var(--iris-border-soft)] lg:py-2 lg:w-full transition-all duration-300",
            isCollapsed ? "lg:justify-center lg:gap-0" : ""
          )}>
            <SidebarTooltip
              label={currentUser?.username ?? ""}
              enabled={isCollapsed}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--iris-accent)] text-[11px] font-medium text-white">
                {initials}
              </div>
            </SidebarTooltip>
            <div className={cn(
              "flex flex-col transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
              isCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100"
            )}>
              <div className="text-[12px] text-foreground font-medium whitespace-nowrap">
                {currentUser?.username ?? ""}
              </div>
              <div className="text-[10px] text-[color:var(--iris-ink-faint)] whitespace-nowrap">
                Operater
              </div>
            </div>
          </div>
          <SidebarTooltip label="Odjava" enabled={isCollapsed}>
            <button
              onClick={onLogout}
              className={cn(
                "iris-focusable iris-press flex items-center gap-2 bg-transparent py-1.5 text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground lg:w-full transition-all duration-300",
                isCollapsed ? "lg:justify-center lg:gap-0 lg:py-1" : ""
              )}
            >
              <LogOut size={14} className="shrink-0" />
              <span className={cn(
                "transition-all duration-300 ease-[var(--iris-ease-out-decisive)] whitespace-nowrap",
                isCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100"
              )}>
                Odjava
              </span>
            </button>
          </SidebarTooltip>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
