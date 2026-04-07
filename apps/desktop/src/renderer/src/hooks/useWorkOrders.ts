import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  WorkOrder,
  WorkOrderStatus,
  BillingDocumentType,
  DeliveryMethod,
} from '@/types/work-order'

export type SortField =
  | 'orderNumber'
  | 'clientName'
  | 'jobDescription'
  | 'billingDocumentType'
  | 'shipping.deliveryMethod'
  | 'price'
  | 'status'
  | 'issueDate'

export type SortDirection = 'asc' | 'desc'

export interface WorkOrdersFiltersState {
  search: string
  status: WorkOrderStatus | 'all'
  billingDocumentType: BillingDocumentType | 'all'
  deliveryMethod: DeliveryMethod | 'all'
  dateFrom: string
  dateTo: string
}

const INITIAL_FILTERS: WorkOrdersFiltersState = {
  search: '',
  status: 'all',
  billingDocumentType: 'all',
  deliveryMethod: 'all',
  dateFrom: '',
  dateTo: '',
}

const PAGE_SIZE = 20

export function useWorkOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<WorkOrdersFiltersState>(INITIAL_FILTERS)
  const [sortField, setSortField] = useState<SortField>('issueDate')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getWorkOrders()
      setOrders(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepoznata greška')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const matches =
          order.orderNumber.toLowerCase().includes(q) ||
          order.clientName.toLowerCase().includes(q) ||
          order.jobDescription.toLowerCase().includes(q)
        if (!matches) return false
      }
      if (filters.status !== 'all' && order.status !== filters.status) return false
      if (
        filters.billingDocumentType !== 'all' &&
        order.billingDocumentType !== filters.billingDocumentType
      )
        return false
      if (
        filters.deliveryMethod !== 'all' &&
        order.shipping.deliveryMethod !== filters.deliveryMethod
      )
        return false
      if (filters.dateFrom && order.issueDate < filters.dateFrom) return false
      if (filters.dateTo && order.issueDate > filters.dateTo) return false
      return true
    })
  }, [orders, filters])

  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders]
    sorted.sort((a, b) => {
      let aVal: string | number | null
      let bVal: string | number | null

      switch (sortField) {
        case 'shipping.deliveryMethod':
          aVal = a.shipping.deliveryMethod
          bVal = b.shipping.deliveryMethod
          break
        case 'price':
          aVal = a.price
          bVal = b.price
          break
        default:
          aVal = a[sortField]
          bVal = b[sortField]
      }

      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1
      if (bVal === null) return -1

      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), 'sr-Latn')

      return sortDirection === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredOrders, sortField, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / PAGE_SIZE))

  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE
    return sortedOrders.slice(start, start + PAGE_SIZE)
  }, [sortedOrders, safeCurrentPage])

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDirection('asc')
      }
      setCurrentPage(1)
    },
    [sortField]
  )

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS)
    setCurrentPage(1)
  }, [])

  const updateFilters = useCallback((patch: Partial<WorkOrdersFiltersState>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setCurrentPage(1)
  }, [])

  return {
    orders: paginatedOrders,
    totalFiltered: sortedOrders.length,
    loading,
    error,
    filters,
    updateFilters,
    resetFilters,
    sortField,
    sortDirection,
    handleSort,
    currentPage: safeCurrentPage,
    totalPages,
    setCurrentPage,
    refreshOrders: fetchOrders,
  }
}
