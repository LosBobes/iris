// TanStack Query keys for the Planiranje module. Every key lives under the
// `planning` root so a single invalidation refreshes all planning data.

export const planningKeys = {
  root: ['planning'] as const,
  machineTypes: ['planning', 'machine-types'] as const,
  machines: ['planning', 'machines'] as const,
  qualifications: ['planning', 'qualifications'] as const,
  attendance: (date: string) => ['planning', 'attendance', date] as const,
  attendanceRoot: ['planning', 'attendance'] as const,
  workingHours: ['planning', 'working-hours'] as const,
  planDay: (date: string) => ['planning', 'plan', date] as const,
  planRoot: ['planning', 'plan'] as const,
  myQueue: (date?: string) => ['planning', 'my-queue', date ?? 'today'] as const,
  myQueueRoot: ['planning', 'my-queue'] as const,
  forecast: ['planning', 'forecast'] as const,
}
