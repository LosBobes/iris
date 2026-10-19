import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { planningKeys } from '@/lib/planning/query-keys'
import type { WorkstationLoadQuery } from '@/types/planning'

/**
 * Workstation load ("Zauzetost", D-028) of a range. Only runs inside the
 * planning `ModuleGate`; pass `enabled: false` while the range is invalid.
 * The previous range stays on screen while the next one loads.
 */
export function useWorkstationLoad(query: WorkstationLoadQuery, enabled = true) {
  return useQuery({
    queryKey: planningKeys.load(query.from, query.to, query.plan),
    queryFn: () => window.api.getPlanningLoad(query),
    placeholderData: keepPreviousData,
    enabled,
  })
}
