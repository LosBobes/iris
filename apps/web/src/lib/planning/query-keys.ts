// TanStack Query keys for the Planiranje module. Every key lives under the
// `planning` root so a single invalidation refreshes all planning data.

export const planningKeys = {
  root: ['planning'] as const,
  machineTypes: ['planning', 'machine-types'] as const,
  machines: ['planning', 'machines'] as const,
  machineDowntimesRoot: ['planning', 'machine-downtimes'] as const,
  machineDowntimes: (machineId: string) => ['planning', 'machine-downtimes', machineId] as const,
  qualifications: ['planning', 'qualifications'] as const,
  workingHours: ['planning', 'working-hours'] as const,
  planDay: (date: string) => ['planning', 'plan', date] as const,
  planHorizon: (date: string) => ['planning', 'plan', 'horizon', date] as const,
  planRoot: ['planning', 'plan'] as const,
  myQueue: (date?: string) => ['planning', 'my-queue', date ?? 'today'] as const,
  myQueueRoot: ['planning', 'my-queue'] as const,
  forecast: ['planning', 'forecast'] as const,
}

// Prisustvo is its own module, so its keys live outside the planning root
// (setting attendance still invalidates plans and forecasts; see query-client).
export const attendanceKeys = {
  root: ['attendance'] as const,
  day: (date: string) => ['attendance', date] as const,
}
