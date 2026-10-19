import { useQuery } from '@tanstack/react-query'
import { planningKeys } from '@/lib/planning/query-keys'
import type { MaterialNeedsQuery } from '@/types/planning'

/**
 * Material needs by week (D-028). Call it only while both the planning and
 * the stock module are on. It refetches whenever the tab mounts, since
 * publishing a plan, posting stock or finishing a step all change it.
 */
export function useMaterialNeeds(query: MaterialNeedsQuery = {}) {
  return useQuery({
    queryKey: planningKeys.materialNeeds(query.from, query.to),
    queryFn: () => window.api.getMaterialNeeds(query),
    refetchOnMount: 'always',
  })
}
