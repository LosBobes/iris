import rawCustomers from '@/fixtures/customers.json'
import rawLocations from '@/fixtures/locations.json'
import rawUsers from '@/fixtures/users.json'
import rawWorkOrders from '@/fixtures/work-orders.json'
import { createHttpApi } from '@/lib/api-client'
import type {
  Assignment,
  Attachment,
  Customer,
  CustomerCommunication,
  InvoiceDraft,
  JobDetails,
  Location,
  MaterialUsage,
  Shipping,
  TimeEntry,
  WorkOrder,
  WorkOrderEvent,
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

function normalizeInvoiceDraft(
  invoiceDraft: Partial<InvoiceDraft> | null | undefined,
  raw: FixtureWorkOrder,
): InvoiceDraft {
  const hasPrice = raw.price !== null && raw.price !== undefined
  return {
    status: invoiceDraft?.status ?? (hasPrice ? 'draft' : 'none'),
    invoiceNumber: normalizeNullableString(invoiceDraft?.invoiceNumber),
    lineItems:
      invoiceDraft?.lineItems ??
      (hasPrice
        ? [
            {
              id: 'line-1',
              description: raw.jobDescription,
              quantity: 1,
              unitPrice: raw.price ?? 0,
            },
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

function getWorkOrderSnapshot(): WorkOrder[] {
  return cloneValue(workOrders)
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

function createFixtureApi(): Window['api'] {
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

    async getCustomers() {
      return cloneValue(customers)
    },

    async getLocations() {
      return cloneValue(locations)
    },

    async getWorkOrders() {
      return getWorkOrderSnapshot()
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

const apiMode = import.meta.env.VITE_IRIS_API_MODE ?? 'http'
const apiBaseUrl = import.meta.env.VITE_IRIS_API_BASE_URL ?? 'http://127.0.0.1:8080'

window.api = apiMode === 'fixtures' ? createFixtureApi() : createHttpApi(apiBaseUrl)
