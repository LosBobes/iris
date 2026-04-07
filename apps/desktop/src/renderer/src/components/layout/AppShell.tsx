import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ClipboardList } from 'lucide-react'

interface NavItemDef {
  label: string
  to: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItemDef[] = [
  { label: 'Kontrolna tabla', to: '/', icon: LayoutDashboard },
  { label: 'Radni nalozi', to: '/work-orders', icon: ClipboardList },
]

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps): React.JSX.Element {
  return (
    <div className="flex h-screen min-w-[1024px] bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <span className="text-sm font-semibold tracking-wide text-sidebar-foreground">
            Iris
          </span>
        </div>
        <nav className="flex-1 p-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  )
}
