import { useEffect, useState } from 'react'
import type { DashboardFilters } from '@/types/work-order'
import type { AttentionSignal, DashboardData } from '@/types/dashboard'
import i18n from '@/i18n'
import { WORK_ORDER_STATUS_ORDER, getLocalIsoDate } from '@/shared/utils/work-orders'
import { useAuth } from '@/hooks/useAuth'

const DEFAULT_FILTERS: DashboardFilters = {
  dateFrom: null,
  dateTo: null,
  issuedBy: null
}

const EMPTY_SIGNAL_COUNTS = { overdue: 0, dueToday: 0, dueThisWeek: 0, unassigned: 0 }

// Rendered before the first response arrives; never shown as real numbers
// because the page waits on `loading`.
const EMPTY_DASHBOARD: DashboardData = {
  hasOrders: false,
  summary: {
    totalOrders: 0,
    statusCounts: Object.fromEntries(
      WORK_ORDER_STATUS_ORDER.map((status) => [status, 0]),
    ) as DashboardData['summary']['statusCounts'],
    totalRevenue: 0,
  },
  monthlyBuckets: [],
  deliveryDistribution: [],
  topClients: [],
  finance: null,
  signalCounts: EMPTY_SIGNAL_COUNTS,
  clientAttentionRows: [],
  internalAttentionRows: [],
  queueSummary: { today: 0, overdue: 0, unassigned: 0 },
  operatorQueue: { assignedToMe: 0, dueToday: 0, overdue: 0, inProgress: 0, available: 0 },
}

const EMPTY_PROFIT = { service: 0, article: 0, total: 0 }
const EMPTY_ITEM_PROFIT = { services: [], articles: [] }

export function useDashboardData() {
  const { currentUser } = useAuth()
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD)
  const [operators, setOperators] = useState<string[]>([])
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [activeSignal, setActiveSignal] = useState<AttentionSignal | null>(null)
  // Company whose orders scope the per-item breakdown; null = all companies.
  const [selectedCompanyKey, setSelectedCompanyKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getWorkOrderOperators()
      .then(setOperators)
      .catch(() => setOperators([]))
  }, [])

  // The API aggregates server-side, so every filter or company change is a
  // small request rather than a re-download of every order. The previous
  // numbers stay on screen while a refetch is in flight; only the first load
  // shows the spinner.
  useEffect(() => {
    let cancelled = false
    window.api
      .getDashboard({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        issuedBy: filters.issuedBy,
        companyKey: selectedCompanyKey,
        today: getLocalIsoDate(),
      })
      .then((next) => {
        if (cancelled) return
        setData(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : i18n.t('common.loadDataError')
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, selectedCompanyKey])

  const finance = data.finance

  return {
    summary: data.summary,
    monthlyOrders: data.monthlyBuckets.map(({ month, count }) => ({ month, count })),
    monthlyRevenue: data.monthlyBuckets.map(({ month, revenue }) => ({ month, revenue })),
    deliveryDistribution: data.deliveryDistribution,
    topClients: data.topClients,
    // Profit (admin-only): the API omits finance for operators entirely.
    profitTotals: finance?.profitTotals ?? EMPTY_PROFIT,
    profitRevenue: finance?.revenue ?? 0,
    monthlyProfit: finance?.monthlyProfit ?? [],
    companyProfit: finance?.companyProfit ?? [],
    itemProfit: finance?.itemProfit ?? EMPTY_ITEM_PROFIT,
    selectedCompanyKey,
    setSelectedCompanyKey,
    queueSummary: data.queueSummary,
    operatorQueue: data.operatorQueue,
    currentUserName: currentUser.username,
    operators,
    filters,
    setFilters,
    clientAttentionRows: data.clientAttentionRows,
    internalAttentionRows: data.internalAttentionRows,
    signalCounts: data.signalCounts,
    activeSignal,
    setActiveSignal,
    // The UI role check is a convenience; the API is what withholds finance.
    showFinance: currentUser.role === 'admin' && finance !== null,
    loading,
    error,
    hasSourceData: data.hasOrders,
  }
}
