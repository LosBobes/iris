import rawCustomers from '@/fixtures/customers.json'
import rawLocations from '@/fixtures/locations.json'
import rawUsers from '@/fixtures/users.json'
import rawWorkOrders from '@/fixtures/work-orders.json'
import type {
  Assignment,
  Attachment,
  Customer,
  CustomerCommunication,
  EnumField,
  EnumValue,
  InvoiceDraft,
  InvoiceLineItem,
  InvoiceLineItemKind,
  InvoiceUnit,
  JobDetails,
  Location,
  MaterialUsage,
  Shipping,
  TimeEntry,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderListQuery,
  WorkOrderListResult,
  WorkOrderNote,
  WorkOrderStatus,
  WorkOrderStatusHistory,
} from '@/types/work-order'
import type { CatalogItem, CatalogItemCost } from '@/types/catalog'
import {
  DEFAULT_BILLING_DEFAULTS,
  DEFAULT_FIRM_NAME,
  DEFAULT_PDF_SECTIONS,
  DEFAULT_PRIORITY_DEFAULTS,
  DEFAULT_SHOW_SHIPPING_OPTIONS,
  type BillingDefaults,
  type OrganizationSettings,
  type PDFSections,
  type PriorityDefaults,
} from '@/types/settings'

interface FixtureUser extends AuthenticatedUser {
  password: string
}

type LegacyWorkOrderStatus = WorkOrderStatus | 'draft' | 'active'

type FixtureWorkOrder = Partial<
  Omit<
    WorkOrder,
    | 'jobDetails'
    | 'shipping'
    | 'status'
    | 'assignment'
    | 'statusHistory'
    | 'internalNotes'
    | 'customerNotes'
    | 'events'
    | 'attachments'
    | 'materialUsage'
    | 'timeEntries'
    | 'invoiceDraft'
    | 'communication'
  >
> &
  Pick<
    WorkOrder,
    'id' | 'orderNumber' | 'clientName' | 'jobDescription' | 'issuedBy' | 'issueDate'
  > & {
    jobDetails?: Partial<JobDetails> | null
    shipping?: Partial<Shipping> | null
    status?: LegacyWorkOrderStatus
    assignment?: Partial<Assignment> | null
    statusHistory?: WorkOrderStatusHistory[]
    internalNotes?: WorkOrderNote[]
    customerNotes?: WorkOrderNote[]
    events?: WorkOrderEvent[]
    attachments?: Attachment[]
    materialUsage?: MaterialUsage[]
    timeEntries?: TimeEntry[]
    invoiceDraft?: Partial<InvoiceDraft> | null
    communication?: Partial<CustomerCommunication> | null
  }

const APP_VERSION = '0.1.0-dev'
const INVALID_CREDENTIALS = 'Neispravno korisničko ime ili lozinka.'
const INVALID_WORK_ORDER = 'Prosleđeni podaci nisu ispravni.'

let users = [...(rawUsers as FixtureUser[])]
let nextUserSequence = users.length + 1
// Fixture JSON predates the emails/contacts collections; backfill them (and
// seed one row from the legacy single fields) so the in-memory store matches
// the API shape.
const customers = (rawCustomers as Partial<Customer>[]).map((raw): Customer => {
  const contactName = raw.contactName ?? null
  const email = raw.email ?? null
  const phone = raw.phone ?? null
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    contactName,
    email,
    phone,
    pib: raw.pib ?? null,
    mb: raw.mb ?? null,
    emails: raw.emails ?? (email ? [{ id: `cem-${raw.id}`, email, label: null, sortOrder: 0 }] : []),
    contacts:
      raw.contacts ??
      (contactName
        ? [{ id: `cct-${raw.id}`, name: contactName, email, phone, role: null, sortOrder: 0 }]
        : []),
  }
})
const locations = rawLocations as Location[]

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

// Mirrors the server's limit/offset paging; limit <= 0 (or undefined) returns all.
function paginate<T>(items: T[], limit?: number, offset?: number): T[] {
  if (!limit || limit <= 0) return items
  const start = Math.max(offset ?? 0, 0)
  return items.slice(start, start + limit)
}

function normalizeNullableString(value: string | null | undefined): string | null {
  return value ?? null
}

function normalizeStatus(rawStatus: LegacyWorkOrderStatus | undefined): WorkOrderStatus {
  if (!rawStatus || rawStatus === 'draft') return 'new'
  if (rawStatus === 'active') return 'inProgress'
  return rawStatus
}

function normalizeCustomerId(raw: FixtureWorkOrder): string | null {
  if (raw.customerId) return raw.customerId
  return customers.find((customer) => customer.name === raw.clientName)?.id ?? null
}

function normalizeLocationId(customerId: string | null, rawLocationId: string | null | undefined): string | null {
  if (rawLocationId) return rawLocationId
  if (!customerId) return null
  return locations.find((location) => location.customerId === customerId)?.id ?? null
}

function normalizeJobDetails(
  jobDetails: Partial<JobDetails> | null | undefined,
): JobDetails | null {
  if (!jobDetails) return null

  return {
    productCode: normalizeNullableString(jobDetails.productCode),
    paperWeightGsm: jobDetails.paperWeightGsm ?? null,
    dimensions: normalizeNullableString(jobDetails.dimensions),
    quantity: jobDetails.quantity ?? null,
    finishingNote: normalizeNullableString(jobDetails.finishingNote),
  }
}

function normalizeShipping(shipping: Partial<Shipping> | null | undefined): Shipping {
  return {
    deliveryMethod: shipping?.deliveryMethod ?? null,
    drivesOut: shipping?.drivesOut ?? false,
    postagePaymentType: shipping?.postagePaymentType ?? null,
    waitForPayment: shipping?.waitForPayment ?? false,
    hasPackaging: shipping?.hasPackaging ?? false,
    hasLabeling: shipping?.hasLabeling ?? false,
    isFragile: shipping?.isFragile ?? false,
    requiresSignature: shipping?.requiresSignature ?? false,
    hasInsurance: shipping?.hasInsurance ?? false,
    shippingAddress: normalizeNullableString(shipping?.shippingAddress),
  }
}

function normalizeAssignment(
  assignment: Partial<Assignment> | null | undefined,
  raw: FixtureWorkOrder,
): Assignment {
  return {
    assignedTo:
      normalizeNullableString(assignment?.assignedTo) ??
      normalizeNullableString(raw.executedBy) ??
      raw.issuedBy,
    priority: assignment?.priority ?? 'normal',
  }
}

function isInvoiceLineItemKind(value: unknown): value is InvoiceLineItemKind {
  return value === 'service' || value === 'goods'
}

// Unit of measure is admin-extensible, so any non-empty string is preserved.
// Only the built-in `set` keeps its service-only restriction.
function normalizeInvoiceUnit(kind: InvoiceLineItemKind, unit: unknown): InvoiceUnit {
  if (typeof unit !== 'string' || unit.trim() === '') return 'kom'
  if (unit === 'set' && kind !== 'service') return 'kom'
  return unit
}

function normalizeInvoiceLineItem(
  line: Partial<InvoiceLineItem>,
  index: number,
): InvoiceLineItem {
  const kind = isInvoiceLineItemKind(line.kind) ? line.kind : 'service'
  return {
    id: line.id || `line-${index + 1}`,
    kind,
    description: line.description ?? '',
    quantity: line.quantity ?? 1,
    unit: normalizeInvoiceUnit(kind, line.unit),
    unitPrice: line.unitPrice ?? 0,
  }
}

function normalizeInvoiceDraft(
  invoiceDraft: Partial<InvoiceDraft> | null | undefined,
  raw: FixtureWorkOrder,
): InvoiceDraft {
  const hasPrice = raw.price !== null && raw.price !== undefined
  return {
    status: invoiceDraft?.status ?? (hasPrice ? 'draft' : 'none'),
    invoiceNumber: normalizeNullableString(invoiceDraft?.invoiceNumber),
    lineItems:
      invoiceDraft?.lineItems?.map((line, index) =>
        normalizeInvoiceLineItem(line, index)
      ) ??
      (hasPrice
        ? [
            normalizeInvoiceLineItem({
              id: 'line-1',
              kind: 'service',
              description: raw.jobDescription,
              quantity: 1,
              unit: 'kom',
              unitPrice: raw.price ?? 0,
            }, 0),
          ]
        : []),
    paidAt: normalizeNullableString(invoiceDraft?.paidAt),
  }
}

function normalizeCommunication(
  communication: Partial<CustomerCommunication> | null | undefined,
  raw: FixtureWorkOrder,
  customerId: string | null,
): CustomerCommunication {
  const customer = customers.find((candidate) => candidate.id === customerId)
  return {
    publicToken: communication?.publicToken ?? `wo-${raw.id.padStart(4, '0')}`,
    notificationEmail:
      normalizeNullableString(communication?.notificationEmail) ?? customer?.email ?? null,
    emailNotificationsEnabled: communication?.emailNotificationsEnabled ?? false,
    signedBy: normalizeNullableString(communication?.signedBy),
    signedAt: normalizeNullableString(communication?.signedAt),
  }
}

function normalizeWorkOrder(raw: FixtureWorkOrder): WorkOrder {
  const now = new Date().toISOString()
  const status = normalizeStatus(raw.status)
  const customerId = normalizeCustomerId(raw)
  const locationId = normalizeLocationId(customerId, raw.locationId)
  const createdAt = raw.createdAt ?? now
  const updatedAt = raw.updatedAt ?? createdAt

  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    customerId,
    locationId,
    clientName: raw.clientName,
    contactPerson: normalizeNullableString(raw.contactPerson),
    jobDescription: raw.jobDescription,
    jobDetails: normalizeJobDetails(raw.jobDetails),
    billingDocumentType: raw.billingDocumentType ?? null,
    billingDocumentNumber: normalizeNullableString(raw.billingDocumentNumber),
    shipping: normalizeShipping(raw.shipping),
    issuedBy: raw.issuedBy,
    executedBy: normalizeNullableString(raw.executedBy),
    assignment: normalizeAssignment(raw.assignment, raw),
    issueDate: raw.issueDate,
    proformaDueDate: normalizeNullableString(raw.proformaDueDate),
    dueDate: normalizeNullableString(raw.dueDate),
    isCompleted: status === 'completed' || status === 'invoiced',
    status,
    price: raw.price ?? null,
    note: normalizeNullableString(raw.note),
    createdAt,
    updatedAt,
    completionDate: normalizeNullableString(raw.completionDate),
    statusHistory: raw.statusHistory ?? [
      { status, changedAt: createdAt, changedBy: raw.issuedBy },
    ],
    internalNotes: raw.internalNotes ?? [],
    customerNotes: raw.customerNotes ?? [],
    events: raw.events ?? [
      { id: 'event-created', kind: 'created', label: 'Nalog kreiran', actor: raw.issuedBy, createdAt },
    ],
    attachments: raw.attachments ?? [],
    materialUsage: raw.materialUsage ?? [],
    timeEntries: raw.timeEntries ?? [],
    invoiceDraft: normalizeInvoiceDraft(raw.invoiceDraft, raw),
    communication: normalizeCommunication(raw.communication, raw, customerId),
  }
}

let workOrders = (rawWorkOrders as FixtureWorkOrder[]).map(normalizeWorkOrder)
let nextSequence =
  workOrders.reduce((max, order) => {
    const value = Number.parseInt(order.id, 10)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0) + 1

// Order-number reservation ledger, mirroring the backend "reserve on open" flow
// so concurrent create forms in fixtures mode each see a distinct RN number.
interface FixtureOrderNumberReservation {
  orderNumber: string
  year: number
  sequence: number
  expiresAt: number
}

const ORDER_NUMBER_RESERVATION_TTL_MS = 12 * 60 * 60 * 1000
let orderNumberReservations: FixtureOrderNumberReservation[] = []

function orderNumberSequenceFor(orderNumber: string, year: number): number | null {
  const prefix = `RN-${year}-`
  if (!orderNumber.startsWith(prefix)) return null
  const sequence = Number.parseInt(orderNumber.slice(prefix.length), 10)
  return Number.isFinite(sequence) ? sequence : null
}

function formatOrderNumber(year: number, sequence: number): string {
  return `RN-${year}-${String(sequence).padStart(5, '0')}`
}

function nextOrderNumberForYear(year: number, now: number): string {
  let maxSequence = 0
  for (const order of workOrders) {
    const sequence = orderNumberSequenceFor(order.orderNumber, year)
    if (sequence !== null && sequence > maxSequence) maxSequence = sequence
  }
  for (const reservation of orderNumberReservations) {
    if (reservation.year === year && reservation.expiresAt > now && reservation.sequence > maxSequence) {
      maxSequence = reservation.sequence
    }
  }
  return formatOrderNumber(year, maxSequence + 1)
}

function pruneOrderNumberReservations(now: number): void {
  orderNumberReservations = orderNumberReservations.filter((reservation) => reservation.expiresAt > now)
}

// Edit locks for fixtures mode mirror the server's pessimistic lock: one holder
// per work order, auto-expiring shortly after heartbeats stop.
const EDIT_LOCK_TTL_MS = 2 * 60 * 1000
interface FixtureEditLock {
  lockedBy: string
  lockedAt: number
  expiresAt: number
}
const editLocks = new Map<string, FixtureEditLock>()

function resolveOrderNumber(
  requested: string | null | undefined,
  year: number,
  now: number,
): string {
  if (requested) {
    const reserved = orderNumberReservations.some((reservation) => reservation.orderNumber === requested)
    const taken = workOrders.some((order) => order.orderNumber === requested)
    if (reserved && !taken) {
      orderNumberReservations = orderNumberReservations.filter(
        (reservation) => reservation.orderNumber !== requested,
      )
      return requested
    }
  }
  return nextOrderNumberForYear(year, now)
}

// Built-in (locked) picklist values, mirrored from the backend defaults.
const BUILTIN_ENUM_VALUES: ReadonlyArray<Omit<EnumValue, 'id' | 'sortOrder'>> = [
  { field: 'deliveryMethod', value: 'pickup', label: 'Lično preuzimanje', isBuiltin: true },
  { field: 'deliveryMethod', value: 'postExpress', label: 'Post Express', isBuiltin: true },
  { field: 'deliveryMethod', value: 'cityExpress', label: 'City Express', isBuiltin: true },
  { field: 'deliveryMethod', value: 'fieldVisit', label: 'Terenski obilazak', isBuiltin: true },
  { field: 'postagePaymentType', value: 'cod', label: 'Poštarina pouzećem', isBuiltin: true },
  { field: 'postagePaymentType', value: 'ourAccount', label: 'Poštarina na naš račun', isBuiltin: true },
  { field: 'postagePaymentType', value: 'advance', label: 'Avans poštarina', isBuiltin: true },
  { field: 'postagePaymentType', value: 'viaInvoice', label: 'Poštarina preko fakture', isBuiltin: true },
  { field: 'billingDocumentType', value: 'invoice', label: 'Faktura', isBuiltin: true },
  { field: 'billingDocumentType', value: 'cashCollection', label: 'Gotovinski račun', isBuiltin: true },
  { field: 'billingDocumentType', value: 'proforma', label: 'Profaktura', isBuiltin: true },
  { field: 'priority', value: 'low', label: 'Nizak', isBuiltin: true },
  { field: 'priority', value: 'normal', label: 'Normalan', isBuiltin: true },
  { field: 'priority', value: 'high', label: 'Visok', isBuiltin: true },
  { field: 'priority', value: 'urgent', label: 'Hitno', isBuiltin: true },
  { field: 'invoiceUnit', value: 'kom', label: 'Kom', isBuiltin: true },
  { field: 'invoiceUnit', value: 'm2', label: 'm²', isBuiltin: true },
  { field: 'invoiceUnit', value: 'set', label: 'Set', isBuiltin: true },
]

const ENUM_FIELD_ORDER: EnumField[] = [
  'deliveryMethod',
  'postagePaymentType',
  'billingDocumentType',
  'priority',
  'invoiceUnit',
]

let customEnumValues: EnumValue[] = []
let nextEnumSequence = 1

let catalogItems: CatalogItem[] = [
  {
    id: 'cat-1',
    code: 'SVC-1',
    name: 'Štampa vizit karata',
    kind: 'service',
    unit: 'set',
    purchasePrice: 700,
    salePrice: 1200,
    barcode: null,
    taxGroup: null,
    description: null,
    isActive: true,
  },
  {
    id: 'cat-2',
    code: 'SVC-2',
    name: 'Štampa flajera A5',
    kind: 'service',
    unit: 'kom',
    purchasePrice: 8,
    salePrice: 15,
    barcode: null,
    taxGroup: null,
    description: null,
    isActive: true,
  },
  {
    id: 'cat-3',
    code: 'ART-1',
    name: 'USB memorija 32GB',
    kind: 'article',
    unit: 'kom',
    purchasePrice: 400,
    salePrice: 620,
    barcode: null,
    taxGroup: null,
    description: null,
    isActive: true,
  },
]
let nextCatalogSequence = 4

let firmName = DEFAULT_FIRM_NAME
let pdfSections: PDFSections = { ...DEFAULT_PDF_SECTIONS }
let billingDefaults: BillingDefaults = { ...DEFAULT_BILLING_DEFAULTS }
let priorityDefaults: PriorityDefaults = { ...DEFAULT_PRIORITY_DEFAULTS }
let showShippingOptions = DEFAULT_SHOW_SHIPPING_OPTIONS

function isBuiltinEnumValue(field: EnumField, value: string): boolean {
  return BUILTIN_ENUM_VALUES.some((entry) => entry.field === field && entry.value === value)
}

function listEnumValues(): EnumValue[] {
  const builtins: EnumValue[] = BUILTIN_ENUM_VALUES.map((entry, index) => ({
    ...entry,
    id: `builtin:${entry.field}:${entry.value}`,
    sortOrder: index,
  }))
  const merged = [...builtins, ...customEnumValues]
  return cloneValue(
    merged.sort((a, b) => {
      const fieldDelta = ENUM_FIELD_ORDER.indexOf(a.field) - ENUM_FIELD_ORDER.indexOf(b.field)
      if (fieldDelta !== 0) return fieldDelta
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.label.localeCompare(b.label)
    }),
  )
}

function listFixtureWorkOrders(query: WorkOrderListQuery = {}): WorkOrderListResult {
  const search = query.search?.trim().toLowerCase() ?? ''
  let items = workOrders.filter((order) => {
    if (search) {
      const haystack = `${order.orderNumber} ${order.clientName} ${order.jobDescription}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    if (query.status && order.status !== query.status) return false
    if (query.assignedTo && order.assignment.assignedTo !== query.assignedTo) return false
    if (query.dateFrom && order.issueDate < query.dateFrom) return false
    if (query.dateTo && order.issueDate > query.dateTo) return false
    if (query.needsCostReview && !order.needsCostReview) return false
    return true
  })

  const sort = query.sort ?? '-issueDate'
  const desc = sort.startsWith('-')
  const field = desc ? sort.slice(1) : sort
  items = [...items].sort((a, b) => {
    const av = fixtureSortValue(a, field)
    const bv = fixtureSortValue(b, field)
    const cmp = av.localeCompare(bv, 'sr-Latn')
    return desc ? -cmp : cmp
  })

  const total = items.length
  const offset = query.offset ?? 0
  const limit = query.limit ?? 0
  const paged = limit > 0 ? items.slice(offset, offset + limit) : items.slice(offset)
  return { items: cloneValue(paged), total }
}

function fixtureSortValue(order: WorkOrder, field: string): string {
  switch (field) {
    case 'orderNumber':
      return order.orderNumber
    case 'clientName':
      return order.clientName
    case 'status':
      return order.status
    case 'assignedTo':
      return order.assignment.assignedTo ?? ''
    case 'dueDate':
      return order.dueDate ?? ''
    default:
      return order.issueDate
  }
}

function validateCreateInput(input: WorkOrder): void {
  if (
    input.clientName.trim() === '' ||
    input.jobDescription.trim() === '' ||
    input.issuedBy.trim() === '' ||
    input.issueDate.trim() === ''
  ) {
    throw new Error(INVALID_WORK_ORDER)
  }
}

export function createFixtureApi(): Window['api'] {
  return {
    async getAppVersion() {
      return APP_VERSION
    },

    async getBackendStatus() {
      return { ready: true }
    },

    async login(credentials) {
      const user = users.find(
        (candidate) =>
          candidate.username === credentials.username &&
          candidate.password === credentials.password,
      )

      if (!user) {
        return { success: false, error: INVALID_CREDENTIALS }
      }

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      }
    },

    async getCurrentSession() {
      return { success: false }
    },

    async logout() {
      return undefined
    },

    async listUsers() {
      return users.map((user) => ({ id: user.id, username: user.username, role: user.role }))
    },

    async createUser(input) {
      const username = input.username.trim()
      if (!username) throw new Error('Korisničko ime je obavezno.')
      if ((input.password ?? '').trim().length < 6)
        throw new Error('Lozinka mora imati najmanje 6 karaktera.')
      if (users.some((user) => user.username.toLowerCase() === username.toLowerCase()))
        throw new Error('Korisničko ime već postoji.')
      const created: FixtureUser = {
        id: `user-${nextUserSequence++}`,
        username,
        role: input.role,
        password: input.password,
      }
      users.push(created)
      return { id: created.id, username: created.username, role: created.role }
    },

    async updateUser(id, input) {
      const index = users.findIndex((user) => user.id === id)
      if (index === -1) throw new Error('Korisnik nije pronađen.')
      const target = users[index]
      if (
        target.role === 'admin' &&
        input.role !== 'admin' &&
        users.filter((user) => user.role === 'admin').length <= 1
      ) {
        throw new Error('Mora postojati bar jedan administrator.')
      }
      if (input.password && input.password.trim() !== '' && input.password.trim().length < 6)
        throw new Error('Lozinka mora imati najmanje 6 karaktera.')
      users[index] = {
        ...target,
        role: input.role,
        password:
          input.password && input.password.trim() !== '' ? input.password : target.password,
      }
      return { id: target.id, username: target.username, role: input.role }
    },

    async deleteUser(id) {
      const target = users.find((user) => user.id === id)
      if (
        target?.role === 'admin' &&
        users.filter((user) => user.role === 'admin').length <= 1
      ) {
        throw new Error('Mora postojati bar jedan administrator.')
      }
      users = users.filter((user) => user.id !== id)
      return { success: true }
    },

    async getCustomers(query = {}) {
      let matched = customers
      if (query.q) {
        const term = query.q.toLowerCase()
        matched = matched.filter((c) =>
          `${c.name} ${c.pib ?? ''} ${c.mb ?? ''}`.toLowerCase().includes(term),
        )
      }
      const total = matched.length
      const items = paginate(matched, query.limit, query.offset)
      return { items: cloneValue(items), total }
    },

    async getCustomerById(id) {
      const found = customers.find((candidate) => candidate.id === id)
      return found ? cloneValue(found) : null
    },

    async upsertCustomer(customer) {
      const index = customers.findIndex((candidate) => candidate.id === customer.id)
      if (index === -1) {
        customers.push(cloneValue(customer))
      } else {
        customers[index] = cloneValue(customer)
      }
      return cloneValue(customer)
    },

    async deleteCustomer(id) {
      const index = customers.findIndex((candidate) => candidate.id === id)
      if (index >= 0) customers.splice(index, 1)
      return { success: true }
    },

    async getLocations(customerId?: string) {
      const scoped = customerId
        ? locations.filter((location) => location.customerId === customerId)
        : locations
      return cloneValue(scoped)
    },

    async upsertLocation(location) {
      const index = locations.findIndex((candidate) => candidate.id === location.id)
      if (index === -1) {
        locations.push(cloneValue(location))
      } else {
        locations[index] = cloneValue(location)
      }
      return cloneValue(location)
    },

    async deleteLocation(id) {
      const index = locations.findIndex((candidate) => candidate.id === id)
      if (index >= 0) locations.splice(index, 1)
      return { success: true }
    },

    async getEnumValues() {
      return listEnumValues()
    },

    async createEnumValue(input) {
      const value = input.value.trim()
      const label = input.label.trim()
      if (!value || !label) {
        throw new Error('Prosleđeni podaci nisu ispravni.')
      }
      if (isBuiltinEnumValue(input.field, value)) {
        throw new Error('Ova vrednost je već ugrađena i ne može se menjati.')
      }
      if (customEnumValues.some((entry) => entry.field === input.field && entry.value === value)) {
        throw new Error('Vrednost sa istom šifrom već postoji.')
      }
      const created: EnumValue = {
        id: `enum-${nextEnumSequence++}`,
        field: input.field,
        value,
        label,
        sortOrder: input.sortOrder,
        isBuiltin: false,
      }
      customEnumValues.push(created)
      return cloneValue(created)
    },

    async updateEnumValue(id, input) {
      const index = customEnumValues.findIndex((entry) => entry.id === id)
      if (index === -1) throw new Error('Vrednost nije pronađena.')
      const field = customEnumValues[index].field
      const value = input.value.trim()
      const label = input.label.trim()
      if (!value || !label || isBuiltinEnumValue(field, value)) {
        throw new Error('Prosleđeni podaci nisu ispravni.')
      }
      if (
        customEnumValues.some(
          (entry, entryIndex) =>
            entryIndex !== index && entry.field === field && entry.value === value,
        )
      ) {
        throw new Error('Vrednost sa istom šifrom već postoji.')
      }
      const updated: EnumValue = {
        ...customEnumValues[index],
        value,
        label,
        sortOrder: input.sortOrder,
      }
      customEnumValues[index] = updated
      return cloneValue(updated)
    },

    async deleteEnumValue(id) {
      customEnumValues = customEnumValues.filter((entry) => entry.id !== id)
      return { success: true }
    },

    async getCatalogItems(query = {}) {
      let items = cloneValue(catalogItems)
      if (query.kind) items = items.filter((item) => item.kind === query.kind)
      if (query.active) items = items.filter((item) => item.isActive)
      if (query.q) {
        const term = query.q.toLowerCase()
        items = items.filter(
          (item) =>
            item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term),
        )
      }
      items.sort((a, b) => a.name.localeCompare(b.name, 'sr'))
      const total = items.length
      return { items: paginate(items, query.limit, query.offset), total }
    },

    async getCatalogItemById(id) {
      const found = catalogItems.find((item) => item.id === id)
      return found ? cloneValue(found) : null
    },

    async getCatalogItemCostHistory(id) {
      // The fixture store does not model historical price periods (a SQLite-only
      // concern), so it reports the item's current price as a single open record.
      const found = catalogItems.find((item) => item.id === id)
      if (!found) return []
      const now = new Date().toISOString()
      const record: CatalogItemCost = {
        id: `cph-${found.id}`,
        catalogItemId: found.id,
        purchasePrice: found.purchasePrice,
        salePrice: found.salePrice,
        effectiveFrom: (found.createdAt ?? now).slice(0, 10),
        effectiveTo: null,
        createdAt: found.createdAt ?? now,
      }
      return [record]
    },

    async createCatalogItem(input) {
      const name = input.name.trim()
      if (!name) throw new Error('Naziv artikla je obavezan.')
      const code = input.code.trim()
      if (code && catalogItems.some((item) => item.code === code)) {
        throw new Error('Artikal sa istom šifrom već postoji.')
      }
      const id = `cat-${nextCatalogSequence++}`
      const created: CatalogItem = {
        ...input,
        id,
        code: code || id,
        name,
        unit: (input.unit || 'kom').toLowerCase(),
      }
      catalogItems.push(created)
      return cloneValue(created)
    },

    async updateCatalogItem(id, input) {
      const index = catalogItems.findIndex((item) => item.id === id)
      if (index === -1) throw new Error('Artikal nije pronađen.')
      const name = input.name.trim()
      if (!name) throw new Error('Naziv artikla je obavezan.')
      const code = input.code.trim() || catalogItems[index].code
      if (catalogItems.some((item, itemIndex) => itemIndex !== index && item.code === code)) {
        throw new Error('Artikal sa istom šifrom već postoji.')
      }
      const updated: CatalogItem = {
        ...catalogItems[index],
        ...input,
        id,
        code,
        name,
        unit: (input.unit || 'kom').toLowerCase(),
      }
      catalogItems[index] = updated
      return cloneValue(updated)
    },

    async deleteCatalogItem(id) {
      catalogItems = catalogItems.filter((item) => item.id !== id)
      return { success: true }
    },

    async getSettings(): Promise<OrganizationSettings> {
      return { firmName, pdfSections, billingDefaults, priorityDefaults, showShippingOptions }
    },

    async updateSettings(
      settings: Partial<OrganizationSettings>,
    ): Promise<OrganizationSettings> {
      if (settings.firmName !== undefined) {
        const next = settings.firmName.trim()
        if (!next) throw new Error('Naziv firme je obavezan.')
        firmName = next
      }
      if (settings.pdfSections !== undefined) {
        pdfSections = { ...settings.pdfSections }
      }
      if (settings.billingDefaults !== undefined) {
        billingDefaults = { ...settings.billingDefaults }
      }
      if (settings.priorityDefaults !== undefined) {
        priorityDefaults = { ...settings.priorityDefaults }
      }
      if (settings.showShippingOptions !== undefined) {
        showShippingOptions = settings.showShippingOptions
      }
      return { firmName, pdfSections, billingDefaults, priorityDefaults, showShippingOptions }
    },

    async getWorkOrders(query) {
      return listFixtureWorkOrders(query)
    },

    async getWorkOrderOperators() {
      // Registered operator users (role 'user'), matching the API which sources
      // the assignable-operator list from the user registry.
      return users
        .filter((user) => user.role === 'user')
        .map((user) => user.username)
        .sort((a, b) => a.localeCompare(b, 'sr-Latn'))
    },

    async getWorkOrderById(id) {
      const order = workOrders.find((candidate) => candidate.id === id)
      return order ? cloneValue(order) : null
    },

    async reserveWorkOrderNumber() {
      const now = Date.now()
      pruneOrderNumberReservations(now)
      const year = new Date().getUTCFullYear()
      const orderNumber = nextOrderNumberForYear(year, now)
      const sequence = orderNumberSequenceFor(orderNumber, year) ?? 1
      const expiresAt = now + ORDER_NUMBER_RESERVATION_TTL_MS
      orderNumberReservations = [
        ...orderNumberReservations,
        { orderNumber, year, sequence, expiresAt },
      ]
      return { orderNumber, expiresAt: new Date(expiresAt).toISOString() }
    },

    async releaseWorkOrderNumber(orderNumber) {
      orderNumberReservations = orderNumberReservations.filter(
        (reservation) => reservation.orderNumber !== orderNumber,
      )
    },

    async acquireWorkOrderEditLock(id) {
      // Fixtures mode is single-user dev, so there is no competing operator; the
      // caller always wins and simply refreshes the lock's expiry.
      const now = Date.now()
      const existing = editLocks.get(id)
      const lockedAt = existing && existing.expiresAt > now ? existing.lockedAt : now
      const expiresAt = now + EDIT_LOCK_TTL_MS
      editLocks.set(id, { lockedBy: 'demo', lockedAt, expiresAt })
      return {
        acquired: true,
        lock: {
          workOrderId: id,
          lockedBy: 'demo',
          lockedAt: new Date(lockedAt).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
        },
      }
    },

    async releaseWorkOrderEditLock(id) {
      editLocks.delete(id)
    },

    async createWorkOrder(input) {
      const sequence = nextSequence
      nextSequence += 1

      const now = new Date().toISOString()
      const order: WorkOrder = {
        ...input,
        id: String(sequence),
        orderNumber: resolveOrderNumber(input.orderNumber, new Date().getUTCFullYear(), Date.now()),
        status: 'new',
        executedBy: input.executedBy ?? null,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        completionDate: null,
        statusHistory: [
          { status: 'new', changedAt: now, changedBy: input.issuedBy },
        ],
        events: [
          { id: 'event-created', kind: 'created', label: 'Nalog kreiran', actor: input.issuedBy, createdAt: now },
        ],
        communication: {
          ...input.communication,
          publicToken: input.communication.publicToken || `wo-${String(sequence).padStart(4, '0')}`,
        },
      }
      validateCreateInput(order)

      workOrders = [...workOrders, order]
      return cloneValue(order)
    },

    async updateWorkOrder(id, changes) {
      const index = workOrders.findIndex((candidate) => candidate.id === id)
      if (index === -1) return null

      const current = workOrders[index]
      const nextStatus = changes.status ?? current.status
      const isCompleted = nextStatus === 'completed' || nextStatus === 'invoiced'
      const updated: WorkOrder = {
        ...current,
        ...changes,
        jobDetails:
          'jobDetails' in changes
            ? normalizeJobDetails(changes.jobDetails)
            : current.jobDetails,
        shipping:
          'shipping' in changes ? normalizeShipping(changes.shipping) : current.shipping,
        isCompleted,
        completionDate: isCompleted
          ? changes.completionDate ?? current.completionDate ?? new Date().toISOString().slice(0, 10)
          : null,
        updatedAt: new Date().toISOString(),
      }

      workOrders = [
        ...workOrders.slice(0, index),
        updated,
        ...workOrders.slice(index + 1),
      ]

      return cloneValue(updated)
    },

    async deleteWorkOrder(id) {
      const initialLength = workOrders.length
      workOrders = workOrders.filter((order) => order.id !== id)

      return initialLength === workOrders.length
        ? { success: false, message: 'Radni nalog nije pronađen.' }
        : { success: true }
    },

    async getWorkOrderPreviewHtml(order) {
      // The real print template lives in the Go service; in fixtures mode we
      // return a lightweight stand-in so the preview pane still renders.
      const esc = (value: string): string =>
        value.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)
      const lines = order.invoiceDraft.lineItems
        .map((li) => `<li>${esc(li.description)} — ${li.quantity} ${esc(li.unit)}</li>`)
        .join('')
      return `<!doctype html><html lang="sr-Latn"><head><meta charset="utf-8"><style>
        body{font-family:Geist,system-ui,sans-serif;margin:0;padding:24px;color:#24201d;background:#fff}
        h1{font-size:18px;letter-spacing:1px;margin:0 0 16px}
        .k{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#8a8178}
        .v{font-size:14px;margin:0 0 12px}
        ul{padding-left:18px}
      </style></head><body>
        <h1>RADNI NALOG ${esc(order.orderNumber || '')}</h1>
        <div class="k">Klijent</div><div class="v">${esc(order.clientName || '-')}</div>
        <div class="k">Opis</div><div class="v">${esc(order.jobDescription || '-')}</div>
        <div class="k">Rok</div><div class="v">${esc(order.dueDate || '-')}</div>
        <div class="k">Stavke</div><ul>${lines || '<li>—</li>'}</ul>
        <p style="color:#8a8178;font-size:11px">Pregled (demo režim) — stvarni izgled generiše servis.</p>
      </body></html>`
    },

    async getPublicWorkOrderStatus(token) {
      const order = workOrders.find((candidate) => candidate.communication.publicToken === token)
      if (!order) return null
      return {
        orderNumber: order.orderNumber,
        clientName: order.clientName,
        jobDescription: order.jobDescription,
        status: order.status,
        dueDate: order.dueDate,
        customerNoteCount: order.customerNotes.length,
        internalNoteCount: 0,
        signedBy: order.communication.signedBy,
        signedAt: order.communication.signedAt,
      }
    },

    getPublicTrackingUrl(token) {
      return `${window.location.origin}/public/work-orders/${encodeURIComponent(token)}`
    },

    getWorkOrderReportUrl(id) {
      return `${window.location.origin}/work-orders/${encodeURIComponent(id)}/report`
    },
  }
}
