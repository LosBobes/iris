import { useQuery } from '@tanstack/react-query'
import { planningKeys } from '@/lib/planning/query-keys'
import type { PlanningCalibrationQuery } from '@/types/planning'

/**
 * The read-only calibration report (D-028, admins). Like the other planning
 * hooks it only runs inside `ModuleGate` or behind `enabled`. An empty query
 * uses the server's default window (the last 60 days).
 */
export function usePlanningCalibration(query: PlanningCalibrationQuery = {}, enabled = true) {
  return useQuery({
    queryKey: planningKeys.calibration(query.from ?? '', query.to ?? ''),
    queryFn: () => window.api.getPlanningCalibration(query),
    enabled,
  })
}
