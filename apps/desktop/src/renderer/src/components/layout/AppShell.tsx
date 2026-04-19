import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface NavItemDef {
  label: string;
  to: string;
  num: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { label: "Kontrolna tabla", to: "/", num: "01" },
  { label: "Radni nalozi", to: "/work-orders", num: "02" },
  { label: "Novi nalog", to: "/work-orders/new", num: "03" },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const { currentUser, onLogout } = useAuth();
  const initials = (currentUser?.username ?? "??")
    .split(/[.\s_-]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="fixed inset-0 flex min-w-[1024px] overflow-hidden bg-background text-foreground">
      <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 pt-7 pb-5">
        <div className="mb-10">
          <div className="flex items-baseline gap-2">
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

        <div className="mb-3 pl-1 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          Sekcija
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-2.5 rounded-sm px-2 py-2 text-[13px]",
                  isActive
                    ? "bg-black/5 font-medium text-foreground"
                    : "font-normal text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute top-2 bottom-2 -left-5 w-0.5 bg-[color:var(--iris-accent)]"
                    />
                  )}
                  <span className="tnum text-[10px] text-[color:var(--iris-ink-faint)]">
                    {item.num}
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto text-[11px] text-[color:var(--iris-ink-mute)] leading-[1.5]">
          <div className="flex items-center gap-2 border-t border-[color:var(--iris-border-soft)] py-2">
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
            className="flex w-full items-center gap-2 bg-transparent py-1.5 text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <LogOut size={12} />
            Odjava
          </button>
        </div>
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
