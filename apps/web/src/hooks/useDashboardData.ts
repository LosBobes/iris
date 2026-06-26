import { useEffect, useMemo, useState } from 'react'
import type { DashboardFilters, WorkOrder } from '@/types/work-order'
import i18n from '@/i18n'
import {
  buildClientAttentionRows,
  buildSignalCounts,
  CORE_ATTENTION_SIGNALS,
  deliveryDistribution,
  deriveSummary,
  filterWorkOrders,
  INTERNAL_ATTENTION_SIGNALS,
  monthlyBuckets,
  topClients,
  type AttentionSignal,
} from '@/lib/dashboard/aggregations'
import {
  monthlyProfit,
  profitByItem,
  profitByKind,
  profitByCompany,
  totalRevenue,
  workOrderGroupKey,
} from '@/lib/dashboard/profit'
import { getLocalIsoDate } from '@/shared/utils/work-orders'
import { useAuth } from '@/hooks/useAuth'

const DEFAULT_FILTERS: DashboardFilters = {
  dateFrom: null,
  dateTo: null,
  issuedBy: null
}

export function useDashboardData() {
  const { currentUser } = useAuth()
  const [allOrders, setAllOrders] = useState<WorkOrder[]>([])
  const [operators, setOperators] = useState<string[]>([])
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [activeSignal, setActiveSignal] = useState<AttentionSignal | null>(null)
  // Company whose orders scope the per-item breakdown; null = all companies.
  const [selectedCompanyKey, setSelectedCompanyKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([window.api.getWorkOrders(), window.api.getWorkOrderOperators()])
      .then(([orders, ops]) => {
        setAllOrders(orders.items)
        setOperators(ops)
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : i18n.t('common.loadDataError')
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

  const monthlyRevenue = useMemo(() => {
    return buckets.map(({ month, revenue }) => ({ month, revenue }))
  }, [buckets])

  const deliveryDist = useMemo(() => deliveryDistribution(filtered), [filtered])

  const topClientsList = useMemo(() => topClients(filtered), [filtered])

  // Profit (admin-only): margin between sale and captured cost, broken down by
  // kind, by month, and by company. Cost is 0 in non-admin sessions, so these
  // only carry real numbers behind the admin-gated finance section.
  const profitTotals = useMemo(() => profitByKind(filtered), [filtered])
  const profitRevenue = useMemo(() => totalRevenue(filtered), [filtered])
  const monthlyProfitList = useMemo(() => monthlyProfit(filtered), [filtered])
  const companyProfitList = useMemo(() => profitByCompany(filtered), [filtered])

  // Per-item breakdown, optionally scoped to a single company's orders so the
  // widget can drill from "all companies" into one selected company.
  const itemBreakdownOrders = useMemo(
    () =>
      selectedCompanyKey
        ? filtered.filter((order) => workOrderGroupKey(order) === selectedCompanyKey)
        : filtered,
    [filtered, selectedCompanyKey],
  )
  const itemProfit = useMemo(
    () => profitByItem(itemBreakdownOrders),
    [itemBreakdownOrders],
  )

  const clientAttentionRows = useMemo(
    () => buildClientAttentionRows(allOrders, CORE_ATTENTION_SIGNALS),
    [allOrders]
  )

  const internalAttentionRows = useMemo(
    () => buildClientAttentionRows(allOrders, INTERNAL_ATTENTION_SIGNALS),
    [allOrders]
  )

  const signalCounts = useMemo(() => buildSignalCounts(allOrders), [allOrders])

  // Operator-personal queue: counts scoped to the signed-in operator's own open
  // work, powering the operator dashboard grid. "available" is the one shop-wide
  // cell — unassigned orders anyone can pick up.
  const operatorQueue = useMemo(() => {
    const today = getLocalIsoDate()
    const me = currentUser.username
    const dueDateOf = (order: WorkOrder): string | null =>
      order.dueDate ?? order.assignment.scheduledDate
    const mineOpen = allOrders.filter(
      (order) => order.assignment.assignedTo === me && !order.isCompleted,
    )
    return {
      assignedToMe: mineOpen.length,
      dueToday: mineOpen.filter((order) => dueDateOf(order) === today).length,
      overdue: mineOpen.filter((order) => {
        const due = dueDateOf(order)
        return Boolean(due && due < today)
      }).length,
      inProgress: mineOpen.filter((order) => order.status === 'inProgress').length,
      available: allOrders.filter(
        (order) => !order.assignment.assignedTo && !order.isCompleted,
      ).length,
    }
  }, [allOrders, currentUser.username])

  const queueSummary = useMemo(() => {
    const today = getLocalIsoDate()
    return {
      today: allOrders.filter((order) => (order.dueDate ?? order.assignment.scheduledDate) === today).length,
      overdue: allOrders.filter((order) => {
        const dueDate = order.dueDate ?? order.assignment.scheduledDate
        return Boolean(dueDate && dueDate < today && !order.isCompleted)
      }).length,
      unassigned: allOrders.filter((order) => !order.assignment.assignedTo).length,
    }
  }, [allOrders])

  return {
    summary,
    monthlyOrders,
    monthlyRevenue,
    deliveryDistribution: deliveryDist,
    topClients: topClientsList,
    profitTotals,
    profitRevenue,
    monthlyProfit: monthlyProfitList,
    companyProfit: companyProfitList,
    itemProfit,
    selectedCompanyKey,
    setSelectedCompanyKey,
    queueSummary,
    operatorQueue,
    currentUserName: currentUser.username,
    operators,
    filters,
    setFilters,
    clientAttentionRows,
    internalAttentionRows,
    signalCounts,
    activeSignal,
    setActiveSignal,
    showFinance: currentUser.role === 'admin',
    loading,
    error,
    hasSourceData: allOrders.length > 0,
  }
}
