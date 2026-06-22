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

const users = rawUsers as FixtureUser[]
const customers = rawCustomers as Customer[]
const locations = rawLocations as Location[]

function cloneValue<T>(value: T): T {
  return structuredClone(value)
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
    scheduledDate: normalizeNullableString(assignment?.scheduledDate ?? raw.dueDate),
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

function generateOrderNumber(sequence: number): string {
  return `RN-${new Date().getUTCFullYear()}-${String(sequence).padStart(4, '0')}`
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

    async getCustomers() {
      return cloneValue(customers)
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

    async getLocations() {
      return cloneValue(locations)
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

    async getWorkOrders(query) {
      return listFixtureWorkOrders(query)
    },

    async getWorkOrderOperators() {
      return [
        ...new Set(
          workOrders
            .flatMap((order) => [
              order.issuedBy,
              order.assignment.assignedTo,
              order.executedBy,
            ])
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, 'sr-Latn'))
    },

    async getWorkOrderById(id) {
      const order = workOrders.find((candidate) => candidate.id === id)
      return order ? cloneValue(order) : null
    },

    async createWorkOrder(input) {
      const sequence = nextSequence
      nextSequence += 1

      const now = new Date().toISOString()
      const order: WorkOrder = {
        ...input,
        id: String(sequence),
        orderNumber: generateOrderNumber(sequence),
        status: 'new',
        executedBy: null,
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
