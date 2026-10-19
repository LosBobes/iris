import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { attendanceKeys, planningKeys } from '@/lib/planning/query-keys'

// Read hook for the Prisustvo module. It only runs inside `ModuleGate`, so a
// disabled module is never requested.

export function useAttendance(date: string) {
  return useQuery({
    queryKey: attendanceKeys.day(date),
    queryFn: () => window.api.listAttendance(date),
  })
}

/**
 * Refreshes attendance after an override, plus the plans and forecasts that
 * read it (no-ops while the planning module is off).
 */
export function useInvalidateAttendance(): () => Promise<void> {
  const client = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: attendanceKeys.root }),
      client.invalidateQueries({ queryKey: planningKeys.planRoot }),
      client.invalidateQueries({ queryKey: planningKeys.forecast }),
    ])
  }, [client])
}
