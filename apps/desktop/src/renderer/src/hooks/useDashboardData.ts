import { useEffect, useMemo, useState } from 'react'
import type { DashboardFilters, WorkOrder } from '@/types/work-order'
import {
  deliveryDistribution,
  deriveSummary,
  filterWorkOrders,
  monthlyBuckets,
  topClients
} from '@/lib/dashboard/aggregations'

const DEFAULT_FILTERS: DashboardFilters = {
  dateFrom: null,
  dateTo: null,
  issuedBy: null
}

export function useDashboardData() {
  const [allOrders, setAllOrders] = useState<WorkOrder[]>([])
  const [operators, setOperators] = useState<string[]>([])
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([window.api.getWorkOrders(), window.api.getWorkOrderOperators()])
      .then(([orders, ops]) => {
        setAllOrders(orders)
        setOperators(ops)
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Greška pri učitavanju podataka.'
        )
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => filterWorkOrders(allOrders, filters),
    [allOrders, filters]
  )

  const summary = useMemo(() => deriveSummary(filtered), [filtered])

  const buckets = useMemo(() => monthlyBuckets(filtered), [filtered])

  const monthlyOrders = useMemo(
    () => buckets.map(({ month, count }) => ({ month, count })),
    [buckets]
  )

  const monthlyRevenue = useMemo(
    () => buckets.map(({ month, revenue }) => ({ month, revenue })),
    [buckets],
  )

  const deliveryDist = useMemo(() => deliveryDistribution(filtered), [filtered])

  const topClientsList = useMemo(() => topClients(filtered), [filtered])

  return {
    summary,
    monthlyOrders,
    monthlyRevenue,
    deliveryDistribution: deliveryDist,
    topClients: topClientsList,
    operators,
    filters,
    setFilters,
    loading,
    error,
    hasSourceData: allOrders.length > 0,
  }
}
