import type { DashboardData, DashboardQuery } from '@/types/dashboard'
import type { WorkOrder } from '@/types/work-order'
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
} from '@/lib/dashboard/aggregations'
import {
  monthlyProfit,
  profitByCompany,
  profitByItem,
  profitByKind,
  totalRevenue,
  workOrderGroupKey,
} from '@/lib/dashboard/profit'
import { countsTowardWorkQueue, getLocalIsoDate } from '@/shared/utils/work-orders'

export interface DashboardViewer {
  username: string
  isAdmin: boolean
}

/**
 * Reference implementation of `GET /dashboard` (iris-api/internal/dashboard).
 * Fixture mode serves the dashboard from this so it behaves like the API:
 * filters apply to the summary/charts/finance, attention signals and queues
 * always cover every order, and finance is admin-only.
 */
export function buildDashboardData(
  orders: WorkOrder[],
  query: DashboardQuery,
  viewer: DashboardViewer,
): DashboardData {
  const today = query.today ?? getLocalIsoDate()
  const filtered = filterWorkOrders(orders, {
    dateFrom: query.dateFrom ?? null,
    dateTo: query.dateTo ?? null,
    issuedBy: query.issuedBy ?? null,
  })

  let finance: DashboardData['finance'] = null
  if (viewer.isAdmin) {
    const scoped = query.companyKey
      ? filtered.filter((order) => workOrderGroupKey(order) === query.companyKey)
      : filtered
    finance = {
      profitTotals: profitByKind(filtered),
      revenue: totalRevenue(filtered),
      monthlyProfit: monthlyProfit(filtered),
      companyProfit: profitByCompany(filtered),
      itemProfit: profitByItem(scoped),
    }
  }

  const queueable = orders.filter(countsTowardWorkQueue)
  // Cancelled orders drop out of the operator's queue the same way completed
  // ones do — neither is work still waiting on them.
  const openQueueable = queueable.filter((order) => !order.isCompleted)
  const mineOpen = openQueueable.filter(
    (order) => order.assignment.assignedTo === viewer.username,
  )
  const isOverdue = (order: WorkOrder): boolean =>
    Boolean(order.dueDate && order.dueDate < today)

  return {
    hasOrders: orders.length > 0,
    summary: deriveSummary(filtered),
    monthlyBuckets: monthlyBuckets(filtered),
    deliveryDistribution: deliveryDistribution(filtered),
    topClients: topClients(filtered),
    finance,
    signalCounts: buildSignalCounts(orders, today),
    clientAttentionRows: buildClientAttentionRows(orders, CORE_ATTENTION_SIGNALS, today),
    internalAttentionRows: buildClientAttentionRows(orders, INTERNAL_ATTENTION_SIGNALS, today),
    queueSummary: {
      today: queueable.filter((order) => order.dueDate === today).length,
      overdue: openQueueable.filter(isOverdue).length,
      unassigned: queueable.filter((order) => !order.assignment.assignedTo).length,
    },
    operatorQueue: {
      assignedToMe: mineOpen.length,
      dueToday: mineOpen.filter((order) => order.dueDate === today).length,
      overdue: mineOpen.filter(isOverdue).length,
      inProgress: mineOpen.filter((order) => order.status === 'inProgress').length,
      available: openQueueable.filter((order) => !order.assignment.assignedTo).length,
    },
  }
}
