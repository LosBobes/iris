import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '@/contexts/AuthContext'
import { OrganizationContext } from '@/contexts/OrganizationContext'
import { DEFAULT_ORGANIZATION_MODULES, type OrganizationModules } from '@/types/settings'
import type { MyQueueItem, PlanAssignment, ProductionPlan } from '@/types/planning'
import { getLocalIsoDate } from '@/shared/utils/work-orders'
import { QueryWrapper } from './query'
import { useContext } from 'react'

export const PLANNING_MODULES: OrganizationModules = { processes: true, stock: true, planning: true, attendance: true }

export function today(): string {
  return getLocalIsoDate()
}

export function assignment(id: string, extra: Partial<PlanAssignment> = {}): PlanAssignment {
  const date = today()
  return {
    id,
    workOrderId: `wo-${id}`,
    orderNumber: `RN-2026-${id}`,
    clientName: 'Klijent d.o.o.',
    stepNodeId: `step-${id}`,
    stepLabel: 'Štampa',
    machineId: 'm1',
    machineName: 'Heidelberg 1',
    leadUserId: 'u1',
    userIds: ['u1', 'u2'],
    start: `${date}T08:00`,
    end: `${date}T10:00`,
    minutes: 120,
    part: 1,
    parts: 1,
    locked: false,
    ...extra,
  }
}

export function plan(
  status: 'draft' | 'published',
  assignments: PlanAssignment[],
  extra: Partial<ProductionPlan> = {},
): ProductionPlan {
  return {
    id: `plan-${status}`,
    date: today(),
    status,
    horizonEnd: today(),
    generatedAt: '2026-10-18T06:00:00Z',
    generatedBy: 'admin',
    updatedAt: '2026-10-18T06:00:00Z',
    updatedBy: 'admin',
    publishedAt: status === 'published' ? '2026-10-18T07:00:00Z' : null,
    publishedBy: status === 'published' ? 'admin' : null,
    assignments,
    issues: [],
    lateOrders: [],
    ...extra,
  }
}

export function queueItem(a: PlanAssignment, extra: Partial<MyQueueItem> = {}): MyQueueItem {
  return { ...a, stepStatus: 'pending', isLead: a.leadUserId === 'u1', ...extra }
}

function Modules({ modules, children }: { modules: OrganizationModules; children: React.ReactNode }) {
  const base = useContext(OrganizationContext)
  return <OrganizationContext value={{ ...base, modules }}>{children}</OrganizationContext>
}

/** Renders a planning page with auth, modules, a fresh query cache and a router. */
export function renderPlanningPage(
  element: React.ReactElement,
  options: { role?: 'admin' | 'user'; modules?: OrganizationModules; path?: string } = {},
) {
  const { role = 'admin', modules = PLANNING_MODULES, path = '/page' } = options
  return render(
    <QueryWrapper>
      <AuthContext value={{ currentUser: { id: 'u1', username: 'admin', role }, onLogout: () => {} }}>
        <Modules modules={modules}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/page" element={element} />
              <Route path="*" element={<div>elsewhere</div>} />
            </Routes>
          </MemoryRouter>
        </Modules>
      </AuthContext>
    </QueryWrapper>,
  )
}

export { DEFAULT_ORGANIZATION_MODULES }
