import type {
  DashboardSummary,
  DeliveryMethod,
  InvoiceLineItemKind,
  WorkOrderStatus,
} from '@/types/work-order'

// Mirrors the `Dashboard*` schemas in iris-api/openapi.yaml (GET /dashboard).
// The API computes these server-side; fixture mode builds the same shape with
// the reference implementation in `lib/dashboard/build.ts`.

export interface MonthlyBucket {
  /** 'YYYY-MM' */
  month: string
  count: number
  /** Sum of price for orders with price !== null */
  revenue: number
}

export interface DeliveryCount {
  method: DeliveryMethod
  count: number
}

export interface ClientCount {
  clientName: string
  count: number
}

export type AttentionSignal = 'overdue' | 'dueToday' | 'dueThisWeek' | 'unassigned'

export type AttentionSignalCounts = Record<AttentionSignal, number>

/** The slim order projection the attention list renders and links to. */
export interface DashboardAttentionOrder {
  id: string
  orderNumber: string
  jobDescription: string
  status: WorkOrderStatus
  dueDate: string | null
}

export interface ClientAttentionRow {
  groupKey: string
  customerId: string | null
  displayName: string
  counts: AttentionSignalCounts
  orders: DashboardAttentionOrder[]
  severity: number
}

export interface ProfitTotals {
  /** Margin from service lines (invoice kind 'service'). */
  service: number
  /** Margin from article lines (invoice kind 'goods'). */
  article: number
  /** service + article. */
  total: number
}

export interface MonthlyProfit extends ProfitTotals {
  /** 'YYYY-MM' */
  month: string
}

export interface CompanyProfit {
  groupKey: string
  customerId: string | null
  name: string
  profit: number
  /** Profit contributed by service lines (invoice kind 'service'). */
  serviceProfit: number
  /** Profit contributed by article/goods lines (invoice kind 'goods'). */
  articleProfit: number
  revenue: number
  orderCount: number
}

/** A single catalog item / ad-hoc line aggregated across the period. */
export interface ItemProfit {
  groupKey: string
  /** Set when the lines share a catalog item; null for ad-hoc lines. */
  catalogItemId: string | null
  name: string
  kind: InvoiceLineItemKind
  profit: number
  revenue: number
  /** Total billed quantity across the grouped lines. */
  quantity: number
}

export interface ItemProfitBreakdown {
  /** Service lines grouped by item, sorted by profit descending. */
  services: ItemProfit[]
  /** Article/goods lines grouped by item, sorted by profit descending. */
  articles: ItemProfit[]
}

export interface DashboardFinance {
  profitTotals: ProfitTotals
  /** Line-item sale revenue (unitPrice * quantity). */
  revenue: number
  monthlyProfit: MonthlyProfit[]
  companyProfit: CompanyProfit[]
  /** Scoped to `companyKey` when one is requested. */
  itemProfit: ItemProfitBreakdown
}

export interface DashboardQueueSummary {
  today: number
  overdue: number
  unassigned: number
}

export interface DashboardOperatorQueue {
  assignedToMe: number
  dueToday: number
  overdue: number
  inProgress: number
  available: number
}

export interface DashboardQuery {
  dateFrom?: string | null
  dateTo?: string | null
  issuedBy?: string | null
  /** Scopes only the per-item profit breakdown to one company group. */
  companyKey?: string | null
  /** The viewer's local date (YYYY-MM-DD) for attention signals and queues. */
  today?: string
}

export interface DashboardData {
  /** Whether the tenant has any work order at all, ignoring filters. */
  hasOrders: boolean
  summary: DashboardSummary
  monthlyBuckets: MonthlyBucket[]
  deliveryDistribution: DeliveryCount[]
  topClients: ClientCount[]
  /** Admin-only; null for operators. */
  finance: DashboardFinance | null
  signalCounts: AttentionSignalCounts
  clientAttentionRows: ClientAttentionRow[]
  internalAttentionRows: ClientAttentionRow[]
  queueSummary: DashboardQueueSummary
  operatorQueue: DashboardOperatorQueue
}
