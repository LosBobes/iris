import { cn } from '@/lib/utils'
import { LayoutDashboard } from 'lucide-react'

interface NavItem {
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  active?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Kontrolna tabla', icon: LayoutDashboard, active: true },
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
            <div
              key={item.label}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                item.active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                  : 'text-sidebar-foreground'
              )}
            >
              <item.icon size={16} />
              {item.label}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  )
}
