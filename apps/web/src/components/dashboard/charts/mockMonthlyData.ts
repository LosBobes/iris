import { getLast12Months } from './utils'

const MOCK_ORDER_COUNTS = [9, 12, 10, 15, 18, 16, 20, 23, 19, 24, 21, 27] as const
const MOCK_REVENUE_VALUES = [
  145000, 188000, 172000, 231000, 264000, 249000, 298000, 327000, 289000, 358000,
  336000, 391000,
] as const

export function getMockMonthlyOrders(): { month: string; count: number }[] {
  return getLast12Months().map((month, index) => ({
    month,
    count: MOCK_ORDER_COUNTS[index],
  }))
}

export function getMockMonthlyRevenue(): { month: string; revenue: number }[] {
  return getLast12Months().map((month, index) => ({
    month,
    revenue: MOCK_REVENUE_VALUES[index],
  }))
}