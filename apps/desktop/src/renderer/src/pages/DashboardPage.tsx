import { AppShell } from '@/components/layout/AppShell'

function DashboardPage(): React.JSX.Element {
  return (
    <AppShell>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Kontrolna tabla</p>
      </div>
    </AppShell>
  )
}

export default DashboardPage
