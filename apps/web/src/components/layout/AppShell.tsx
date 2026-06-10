import { useCallback, useEffect, useState } from "react";
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
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function useIsLg(): boolean {
  const [isLg, setIsLg] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => setIsLg(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isLg;
}

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
  const isLg = useIsLg();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSidebarCollapsed = isCollapsed && isLg;

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  useEffect(() => {
    closeMobileMenu();
  }, [location.pathname, closeMobileMenu]);

  useEffect(() => {
    if (isLg) closeMobileMenu();
  }, [isLg, closeMobileMenu]);

  useEffect(() => {
    if (!mobileMenuOpen || isLg) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen, isLg]);

  const toggleCollapse = useCallback(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

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

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground lg:flex-row">
      {mobileMenuOpen && !isLg && (
        <button
          type="button"
          aria-label="Zatvori meni"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <header className="relative z-50 flex shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5 font-medium text-foreground">
          <Home className="h-5 w-5 shrink-0 text-[color:var(--iris-accent)]" />
          <div className="flex flex-col">
            <span className="text-[18px] font-semibold leading-none tracking-[-0.5px] whitespace-nowrap">
              Iris
            </span>
            <span className="text-[9px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)] mt-0.5 whitespace-nowrap">
              Grafika Čobanović
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-controls="app-sidebar"
          aria-label={mobileMenuOpen ? "Zatvori meni" : "Otvori meni"}
          className="iris-focusable iris-press flex h-9 w-9 items-center justify-center rounded-sm text-foreground hover:bg-black/[0.03]"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col border-r border-sidebar-border bg-sidebar px-5 py-4 transition-[transform,width,padding] duration-300 ease-[var(--iris-ease-out-decisive)]",
          mobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full pointer-events-none",
          "lg:pointer-events-auto lg:static lg:z-auto lg:flex lg:h-full lg:shrink-0 lg:translate-x-0 lg:border-b-0 lg:pt-7 lg:pb-5",
          isSidebarCollapsed ? "lg:w-[68px] lg:px-3" : "lg:w-[220px] lg:px-5",
        )}
      >
        <div className="mb-4 hidden lg:mb-10 lg:flex items-center">
          <SidebarTooltip
            label={isSidebarCollapsed ? "Proširi meni" : "Skupi meni"}
            enabled={isSidebarCollapsed}
          >
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label={isSidebarCollapsed ? "Proširi meni" : "Skupi meni"}
              className={cn(
                "iris-focusable iris-press hidden min-w-0 items-center font-medium text-foreground hover:opacity-90 transition-all duration-300 lg:flex",
                isSidebarCollapsed ? "lg:w-full lg:justify-center lg:gap-0" : "gap-2.5"
              )}
            >
              <Home className="h-5 w-5 shrink-0 text-[color:var(--iris-accent)]" />
              <div className={cn(
                "flex flex-col transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
                isSidebarCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100"
              )}>
                <span className="text-[18px] font-semibold leading-none tracking-[-0.5px] whitespace-nowrap">
                  Iris
                </span>
                <span className="text-[9px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)] mt-0.5 whitespace-nowrap">
                  Grafika Čobanović
                </span>
              </div>
            </button>
          </SidebarTooltip>
        </div>

        <div
          role="separator"
          className="mb-3 hidden border-t border-[color:var(--iris-border-soft)] lg:block"
        />
        <nav className="relative flex flex-col gap-0.5">
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <SidebarTooltip key={item.to} label={item.label} enabled={isSidebarCollapsed}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={closeMobileMenu}
                  className={() =>
                    cn(
                      "iris-focusable iris-press relative flex items-center rounded-sm px-2 py-2 text-[13px] transition-all duration-300",
                      isSidebarCollapsed ? "lg:w-full lg:justify-center lg:px-0 lg:gap-0" : "gap-2.5",
                      idx === activeNavIndex
                        ? cn(
                            "bg-black/5 font-medium text-foreground",
                            !isSidebarCollapsed &&
                              "lg:before:pointer-events-none lg:before:absolute lg:before:top-2 lg:before:bottom-2 lg:before:left-[-20px] lg:before:w-0.5 lg:before:bg-[color:var(--iris-accent)] lg:before:content-['']",
                          )
                        : "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                    )
                  }
                >
                  <Icon size={16} className="shrink-0" />
                  <span className={cn(
                    "whitespace-nowrap transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
                    isSidebarCollapsed ? "lg:hidden" : "lg:inline"
                  )}>
                    {item.label}
                  </span>
                </NavLink>
              </SidebarTooltip>
            );
          })}
        </nav>

        <div className={cn(
          "mt-auto flex flex-col gap-0.5 border-t border-[color:var(--iris-border-soft)] pt-3 text-[11px] leading-[1.5] text-[color:var(--iris-ink-mute)]",
          "lg:border-t-0 lg:pt-0",
          isSidebarCollapsed ? "lg:items-center" : "lg:items-start"
        )}>
          <SidebarTooltip label="Podešavanja" enabled={isSidebarCollapsed}>
            <NavLink
              to="/settings"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                cn(
                  "iris-focusable iris-press relative flex items-center rounded-sm px-2 py-2 text-[13px] transition-all duration-300 lg:w-full",
                  isSidebarCollapsed ? "lg:justify-center lg:px-0 lg:gap-0" : "gap-2.5",
                  isActive
                    ? "bg-black/5 font-medium text-foreground"
                    : "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                )
              }
            >
              <Settings size={16} className="shrink-0" />
              <span className={cn(
                "transition-all duration-300 ease-[var(--iris-ease-out-decisive)] whitespace-nowrap",
                isSidebarCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100",
              )}>
                Podešavanja
              </span>
            </NavLink>
          </SidebarTooltip>
          <SidebarTooltip label="Proširi meni" enabled={isSidebarCollapsed}>
            <button
              onClick={toggleCollapse}
              className={cn(
                "hidden iris-focusable iris-press relative items-center rounded-sm px-2 py-2 text-[13px] transition-all duration-300 lg:flex lg:w-full",
                "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                isSidebarCollapsed ? "lg:justify-center lg:px-0 lg:gap-0" : "gap-2.5",
              )}
            >
              <PanelLeft size={16} className="shrink-0" />
              <span className={cn(
                "transition-all duration-300 ease-[var(--iris-ease-out-decisive)] whitespace-nowrap",
                isSidebarCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100",
              )}>
                Skupi meni
              </span>
            </button>
          </SidebarTooltip>
          <div className={cn(
            "flex items-center gap-2 lg:border-t lg:border-[color:var(--iris-border-soft)] lg:py-2 lg:w-full transition-all duration-300",
            isSidebarCollapsed ? "lg:justify-center lg:gap-0" : ""
          )}>
            <SidebarTooltip
              label={currentUser?.username ?? ""}
              enabled={isSidebarCollapsed}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--iris-accent)] text-[11px] font-medium text-white">
                {initials}
              </div>
            </SidebarTooltip>
            <div className={cn(
              "flex flex-col transition-all duration-300 ease-[var(--iris-ease-out-decisive)]",
              isSidebarCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100"
            )}>
              <div className="text-[12px] text-foreground font-medium whitespace-nowrap">
                {currentUser?.username ?? ""}
              </div>
              <div className="text-[10px] text-[color:var(--iris-ink-faint)] whitespace-nowrap">
                Operater
              </div>
            </div>
          </div>
          <SidebarTooltip label="Odjava" enabled={isSidebarCollapsed}>
            <button
              onClick={() => {
                closeMobileMenu();
                onLogout();
              }}
              className={cn(
                "iris-focusable iris-press flex items-center gap-2 bg-transparent py-1.5 text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground lg:w-full transition-all duration-300",
                isSidebarCollapsed ? "lg:justify-center lg:gap-0 lg:py-1" : ""
              )}
            >
              <LogOut size={14} className="shrink-0" />
              <span className={cn(
                "transition-all duration-300 ease-[var(--iris-ease-out-decisive)] whitespace-nowrap",
                isSidebarCollapsed ? "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none" : "lg:w-auto lg:opacity-100"
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
