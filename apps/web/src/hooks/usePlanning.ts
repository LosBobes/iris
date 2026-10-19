import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { REFERENCE_STALE_TIME_MS, queryKeys } from '@/lib/query-client'
import { planningKeys } from '@/lib/planning/query-keys'

// Read hooks for the Planiranje module. They only run inside `ModuleGate`
// (or behind an explicit `enabled`), so a disabled module is never requested.

export function useMachineTypes() {
  return useQuery({
    queryKey: planningKeys.machineTypes,
    queryFn: () => window.api.listMachineTypes(),
    staleTime: REFERENCE_STALE_TIME_MS,
  })
}

export function useMachines() {
  return useQuery({
    queryKey: planningKeys.machines,
    queryFn: () => window.api.listMachines(),
    staleTime: REFERENCE_STALE_TIME_MS,
  })
}

/** Downtime windows of one machine (D-028); fetched only while `enabled`. */
export function useMachineDowntimes(machineId: string, enabled = true) {
  return useQuery({
    queryKey: planningKeys.machineDowntimes(machineId),
    queryFn: () => window.api.listMachineDowntimes(machineId),
    staleTime: REFERENCE_STALE_TIME_MS,
    enabled,
  })
}

export function useQualifications() {
  return useQuery({
    queryKey: planningKeys.qualifications,
    queryFn: () => window.api.listQualifications(),
    staleTime: REFERENCE_STALE_TIME_MS,
  })
}

/** Pass `enabled: false` outside `ModuleGate` (e.g. the process panel while Planiranje is off). */
export function useWorkingHours(enabled = true) {
  return useQuery({
    queryKey: planningKeys.workingHours,
    queryFn: () => window.api.getWorkingHours(),
    staleTime: REFERENCE_STALE_TIME_MS,
    enabled,
  })
}

export function usePlanDay(date: string) {
  return useQuery({
    queryKey: planningKeys.planDay(date),
    queryFn: () => window.api.getPlanDay(date),
  })
}

export function useMyQueue(date: string) {
  return useQuery({
    queryKey: planningKeys.myQueue(date),
    queryFn: () => window.api.getMyQueue(date),
  })
}

/** The one shared forecast query (the planning page and the order detail line). */
export function usePlanningForecast(enabled = true) {
  return useQuery({
    queryKey: planningKeys.forecast,
    queryFn: () => window.api.getPlanningForecast(),
    enabled,
  })
}

/** userId to username, from the qualifications list (it covers every user). */
export function useUserNames(): Map<string, string> {
  const { data } = useQualifications()
  return useMemo(() => new Map((data ?? []).map((entry) => [entry.userId, entry.username])), [data])
}

/**
 * Marks every cached planning query stale after a write (and, when a step
 * status changed, the work-order queries too). Done here as well as in the
 * api wrapper so a stubbed `window.api` behaves the same.
 */
export function useInvalidatePlanning(): (options?: { workOrders?: boolean }) => Promise<void> {
  const client = useQueryClient()
  return useCallback(
    async (options = {}) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: planningKeys.root }),
        options.workOrders ? client.invalidateQueries({ queryKey: queryKeys.workOrders }) : Promise.resolve(),
      ])
    },
    [client],
  )
}
