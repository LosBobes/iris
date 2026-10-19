import { ApiError } from '@/lib/errors'
import { STOCK_DISABLED_MESSAGE } from '@/lib/modules'
import { isLowStock, planCountPosting, planProcessPosting, reservedAcrossGraphs, roundQuantity } from '@/lib/stock/posting'
import type { ExistingNet } from '@/lib/stock/posting'
import type { WorkOrderStatus } from '@/types/work-order'
import type { ProcessGraph } from '@/types/process'
import type {
  StockCountInput,
  StockLevel,
  StockMovement,
  StockMovementKind,
  StockPostingResult,
  StockReceiptInput,
} from '@/types/stock'
import { MAX_COUNT_LINES, MAX_RECEIPT_LINES } from '@/types/stock'

// In-memory stock ledger for fixture mode. It mirrors the Magacin contract: a
// movement ledger (on-hand = sum of movements), receipts, counts (opening vs
// adjustment), automatic posting from work-order processes and the reserved /
// available computation. The Go service stays authoritative.

const MESSAGES = {
  loginRequired: 'Prijava je obavezna.',
  adminOnly: 'Potrebna je administratorska uloga.',
  articleMissing: 'Artikal nije pronađen u katalogu.',
  quantityPositive: 'Količina mora biti veća od nule.',
  countNegative: 'Izbrojana količina ne može biti negativna.',
  duplicate: 'Artikal se ponavlja.',
  noLines: 'Dodajte bar jednu stavku.',
  tooManyReceiptLines: `Prijem može imati najviše ${MAX_RECEIPT_LINES} stavki.`,
  tooManyCountLines: `Popis može imati najviše ${MAX_COUNT_LINES} stavki.`,
}

/** Error text of the delete-article 409, shared with the fixture catalog. */
export const ARTICLE_HAS_STOCK_MESSAGE = 'Artikal ima promet u magacinu i ne može se obrisati.'

const CLOSED_ORDER_STATUSES: WorkOrderStatus[] = ['completed', 'cancelled', 'invoiced']

function fixtureError(status: number, message: string): ApiError {
  return new ApiError(message, { status, url: 'fixture://stock', method: 'FIXTURE' })
}

export interface StockCatalogArticle {
  id: string
  code: string
  name: string
  kind: 'service' | 'article'
  unit: string
  isActive: boolean
  minStock: number | null
}

export interface StockFixtureContext {
  currentUser: () => { username: string; role: 'admin' | 'user' } | null
  /** Whether the organization's Magacin module is on; every /stock call is 403 otherwise. */
  enabled: () => boolean
  catalogItems: () => StockCatalogArticle[]
  workOrder: (id: string) => { number: string; status: WorkOrderStatus } | null
  /** Stock-tracked order graphs with their planned-quantity factor (see posting.reservedAcrossGraphs). */
  orderProcesses: () => { workOrderId: string; graph: ProcessGraph; factor?: number }[]
}

type StockApi = Pick<
  Window['api'],
  'getStockLevels' | 'getStockMovements' | 'postStockReceipt' | 'postStockCount'
>

interface LedgerRow {
  id: string
  catalogItemId: string
  kind: StockMovementKind
  quantity: number
  workOrderId: string | null
  processNodeId: string | null
  documentRef: string | null
  note: string | null
  createdAt: string
  createdBy: string
}

export interface StockFixtureStore {
  api: StockApi
  /**
   * Brings the ledger in line with an order's saved process graph (automatic
   * posting); planned quantities are multiplied by `factor` (default 1).
   */
  onProcessSaved: (workOrderId: string, graph: ProcessGraph, username: string, factor?: number) => void
  /** Seeds an opening balance without a session (demo data). */
  seedOpening: (catalogItemId: string, quantity: number, createdBy: string, note?: string) => void
  hasMovements: (catalogItemId: string) => boolean
  onHand: (catalogItemId: string) => number
}

export function createStockFixtureStore(context: StockFixtureContext): StockFixtureStore {
  const rows: LedgerRow[] = []
  let sequence = 0
  const nowIso = (): string => new Date().toISOString()

  const requireUser = (): { username: string; role: 'admin' | 'user' } => {
    if (!context.enabled()) throw fixtureError(403, STOCK_DISABLED_MESSAGE)
    const user = context.currentUser()
    if (!user) throw fixtureError(401, MESSAGES.loginRequired)
    return user
  }

  const articles = (): StockCatalogArticle[] => context.catalogItems().filter((item) => item.kind === 'article')
  const findArticle = (id: string): StockCatalogArticle | undefined => articles().find((item) => item.id === id)

  const onHand = (catalogItemId: string): number =>
    roundQuantity(rows.filter((row) => row.catalogItemId === catalogItemId).reduce((sum, row) => sum + row.quantity, 0))
  const hasMovements = (catalogItemId: string): boolean => rows.some((row) => row.catalogItemId === catalogItemId)

  const insert = (row: Omit<LedgerRow, 'id' | 'createdAt'>): LedgerRow => {
    sequence += 1
    const created: LedgerRow = { ...row, id: `sm-${sequence}`, createdAt: nowIso() }
    rows.push(created)
    return created
  }

  const toMovement = (row: LedgerRow): StockMovement => {
    const item = context.catalogItems().find((candidate) => candidate.id === row.catalogItemId)
    return {
      id: row.id,
      catalogItemId: row.catalogItemId,
      itemCode: item?.code ?? '',
      itemName: item?.name ?? '',
      unit: item?.unit ?? '',
      kind: row.kind,
      quantity: row.quantity,
      workOrderId: row.workOrderId,
      workOrderNumber: row.workOrderId ? (context.workOrder(row.workOrderId)?.number ?? null) : null,
      processNodeId: row.processNodeId,
      documentRef: row.documentRef,
      note: row.note,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }
  }

  // reserved per article across open orders (see posting.reservedAcrossGraphs)
  const reservedMap = (): Map<string, number> =>
    reservedAcrossGraphs(
      context
        .orderProcesses()
        .filter((entry) => {
          const order = context.workOrder(entry.workOrderId)
          return order !== null && !CLOSED_ORDER_STATUSES.includes(order.status)
        })
        .map((entry) => ({ graph: entry.graph, factor: entry.factor ?? 1 })),
    )

  const levelOf = (item: StockCatalogArticle, reserved: Map<string, number>): StockLevel => {
    const held = onHand(item.id)
    const hold = roundQuantity(reserved.get(item.id) ?? 0)
    const available = roundQuantity(held - hold)
    const last = rows.filter((row) => row.catalogItemId === item.id).at(-1)
    return {
      catalogItemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      isActive: item.isActive,
      onHand: held,
      reserved: hold,
      available,
      minStock: item.minStock,
      low: isLowStock(held, available, item.minStock),
      lastMovementAt: last?.createdAt ?? null,
    }
  }

  const checkUnique = (ids: string[]): void => {
    if (new Set(ids).size !== ids.length) throw fixtureError(422, MESSAGES.duplicate)
  }

  return {
    hasMovements,
    onHand,

    seedOpening(catalogItemId, quantity, createdBy, note) {
      insert({
        catalogItemId,
        kind: 'opening',
        quantity,
        workOrderId: null,
        processNodeId: null,
        documentRef: null,
        note: note ?? null,
        createdBy,
      })
    },

    onProcessSaved(workOrderId, graph, username, factor = 1) {
      const nets = new Map<string, ExistingNet>()
      for (const row of rows) {
        if (row.workOrderId !== workOrderId || !row.processNodeId) continue
        const key = `${row.processNodeId}\u0000${row.catalogItemId}`
        const net = nets.get(key)
        if (net) net.quantity += row.quantity
        else nets.set(key, { processNodeId: row.processNodeId, catalogItemId: row.catalogItemId, quantity: row.quantity })
      }
      for (const planned of planProcessPosting(graph, [...nets.values()], factor)) {
        insert({
          catalogItemId: planned.catalogItemId,
          kind: planned.kind,
          quantity: roundQuantity(planned.quantity),
          workOrderId,
          processNodeId: planned.processNodeId,
          documentRef: null,
          note: null,
          createdBy: username,
        })
      }
    },

    api: {
      async getStockLevels(query = {}) {
        requireUser()
        const reserved = reservedMap()
        const term = query.search?.trim().toLowerCase()
        let levels = articles()
          .map((item) => levelOf(item, reserved))
          .filter((level) => level.isActive || level.onHand !== 0)
        if (term) {
          levels = levels.filter(
            (level) => level.name.toLowerCase().includes(term) || level.code.toLowerCase().includes(term),
          )
        }
        if (query.lowOnly) levels = levels.filter((level) => level.low)
        levels.sort(
          (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'sr'),
        )
        const total = levels.length
        const start = Math.max(query.offset ?? 0, 0)
        const items = query.limit && query.limit > 0 ? levels.slice(start, start + query.limit) : levels
        return { items, total }
      },

      async getStockMovements(query = {}) {
        requireUser()
        let list = rows.filter(
          (row) =>
            (!query.catalogItemId || row.catalogItemId === query.catalogItemId) &&
            (!query.workOrderId || row.workOrderId === query.workOrderId),
        )
        list = [...list].reverse() // newest first (insertion order is chronological)
        const total = list.length
        const start = Math.max(query.offset ?? 0, 0)
        const page = query.limit && query.limit > 0 ? list.slice(start, start + query.limit) : list
        return { items: page.map(toMovement), total }
      },

      async postStockReceipt(input: StockReceiptInput): Promise<StockPostingResult> {
        const user = requireUser()
        if (input.lines.length === 0) throw fixtureError(422, MESSAGES.noLines)
        if (input.lines.length > MAX_RECEIPT_LINES) throw fixtureError(422, MESSAGES.tooManyReceiptLines)
        for (const line of input.lines) {
          if (!findArticle(line.catalogItemId)) throw fixtureError(422, MESSAGES.articleMissing)
          if (!(line.quantity > 0)) throw fixtureError(422, MESSAGES.quantityPositive)
        }
        checkUnique(input.lines.map((line) => line.catalogItemId))
        const documentRef = input.documentRef?.trim() || null
        const note = input.note?.trim() || null
        const movements = input.lines.map((line) =>
          insert({
            catalogItemId: line.catalogItemId,
            kind: 'receipt',
            quantity: roundQuantity(line.quantity),
            workOrderId: null,
            processNodeId: null,
            documentRef,
            note,
            createdBy: user.username,
          }),
        )
        return { movements: movements.map(toMovement) }
      },

      async postStockCount(input: StockCountInput): Promise<StockPostingResult> {
        const user = requireUser()
        if (user.role !== 'admin') throw fixtureError(403, MESSAGES.adminOnly)
        if (input.lines.length === 0) throw fixtureError(422, MESSAGES.noLines)
        if (input.lines.length > MAX_COUNT_LINES) throw fixtureError(422, MESSAGES.tooManyCountLines)
        for (const line of input.lines) {
          if (!findArticle(line.catalogItemId)) throw fixtureError(422, MESSAGES.articleMissing)
          if (!(line.countedQuantity >= 0)) throw fixtureError(422, MESSAGES.countNegative)
        }
        checkUnique(input.lines.map((line) => line.catalogItemId))
        const sources = new Map(
          input.lines.map((line) => [
            line.catalogItemId,
            {
              catalogItemId: line.catalogItemId,
              onHand: onHand(line.catalogItemId),
              hasMovements: hasMovements(line.catalogItemId),
            },
          ]),
        )
        const note = input.note?.trim() || null
        const movements = planCountPosting(input.lines, sources).map((posting) =>
          insert({
            catalogItemId: posting.catalogItemId,
            kind: posting.kind,
            quantity: posting.quantity,
            workOrderId: null,
            processNodeId: null,
            documentRef: null,
            note,
            createdBy: user.username,
          }),
        )
        return { movements: movements.map(toMovement) }
      },
    },
  }
}
