import { z } from 'zod'
import i18n from '@/i18n'

// Delivery, postage, billing, and priority allow admin-defined custom values in
// addition to the built-ins, so these accept any non-empty string. The set of
// offered options is controlled by the form, and the backend validates the
// value against the built-in defaults plus the active custom values.
const deliveryMethodEnum = z.string().min(1)
const postagePaymentTypeEnum = z.string().min(1)
const billingDocumentTypeEnum = z.string().min(1)
const priorityEnum = z.string().min(1)
const invoiceDraftStatusEnum = z.enum(['none', 'draft', 'issued', 'paid'])
const invoiceLineItemKindEnum = z.enum(['service', 'goods'])
// Unit of measure is admin-extensible (the `invoiceUnit` managed enum), so any
// non-empty value is accepted here; the built-in `set` stays service-only via
// the line-item refine below.
const invoiceUnitEnum = z.string().min(1)

const emptyToNullString = z
  .union([z.string(), z.null()])
  .transform((value) => (value === '' ? null : value))

const jobDetailsSchema = z.object({
  productCode: z.string().nullable(),
  paperWeightGsm: z.number().positive({ message: 'Gramatura mora biti pozitivan broj' }).nullable(),
  dimensions: z.string().nullable(),
  quantity: z
    .number()
    .int({ message: i18n.t('validation.quantityInteger') })
    .positive({ message: i18n.t('validation.quantityPositive') })
    .nullable(),
  finishingNote: z.string().nullable(),
})

const shippingSchema = z.object({
  deliveryMethod: deliveryMethodEnum.nullable(),
  drivesOut: z.boolean(),
  postagePaymentType: postagePaymentTypeEnum.nullable(),
  waitForPayment: z.boolean(),
  hasPackaging: z.boolean(),
  hasLabeling: z.boolean(),
  isFragile: z.boolean(),
  requiresSignature: z.boolean(),
  hasInsurance: z.boolean(),
  shippingAddress: z.string().nullable(),
})

const assignmentSchema = z.object({
  assignedTo: emptyToNullString,
  priority: priorityEnum,
  scheduledDate: emptyToNullString,
})

const noteSchema = z.object({
  id: z.string(),
  visibility: z.enum(['internal', 'customer']),
  author: z.string(),
  body: z.string(),
  createdAt: z.string(),
})

const attachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  url: z.string().nullable(),
  uploadedAt: z.string(),
})

const materialUsageSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().nonnegative(),
  unit: z.string(),
  unitCost: z.number().min(0).nullable(),
})

const timeEntrySchema = z.object({
  id: z.string(),
  operator: z.string(),
  minutes: z.number().int().nonnegative(),
  loggedAt: z.string(),
})

const invoiceLineItemSchema = z
  .object({
    id: z.string(),
    kind: invoiceLineItemKindEnum,
    description: z.string(),
    quantity: z.number().int().positive(),
    unit: invoiceUnitEnum,
    unitPrice: z.number().min(0),
    // Per-unit cost. Server-derived for catalog lines; for ad-hoc lines an admin
    // may enter it. null/absent = not yet captured (flags the order for review).
    unitCost: z.number().min(0).nullable().optional(),
    // Set when the line was added from the catalog; null for ad-hoc services.
    catalogItemId: z.string().nullable().optional(),
  })
  .superRefine((line, ctx) => {
    if (line.kind === 'goods' && line.unit === 'set') {
      ctx.addIssue({
        code: 'custom',
        message: 'Set je dozvoljen samo za usluge',
        path: ['unit'],
      })
    }
  })

const invoiceDraftSchema = z.object({
  status: invoiceDraftStatusEnum,
  invoiceNumber: emptyToNullString,
  lineItems: z.array(invoiceLineItemSchema),
  paidAt: emptyToNullString,
})

const communicationSchema = z.object({
  publicToken: z.string(),
  notificationEmail: emptyToNullString,
  emailNotificationsEnabled: z.boolean(),
  signedBy: emptyToNullString,
  signedAt: emptyToNullString,
})

export const workOrderFormSchema = z
  .object({
    customerId: emptyToNullString,
    locationId: emptyToNullString,
    clientName: z.string().min(1, { message: 'Naziv klijenta je obavezan' }),
    contactPerson: emptyToNullString,
    jobDescription: z.string().min(1, { message: 'Opis posla je obavezan' }),
    jobDetails: jobDetailsSchema.nullable(),
    billingDocumentType: billingDocumentTypeEnum.nullable(),
    billingDocumentNumber: emptyToNullString,
    shipping: shippingSchema,
    assignment: assignmentSchema,
    price: z.number().min(0, { message: i18n.t('validation.priceNegative') }).nullable(),
    note: emptyToNullString,
    issueDate: z.string().min(1, { message: i18n.t('validation.issueDateRequired') }),
    dueDate: emptyToNullString,
    executedBy: emptyToNullString,
    internalNotes: z.array(noteSchema),
    customerNotes: z.array(noteSchema),
    attachments: z.array(attachmentSchema),
    materialUsage: z.array(materialUsageSchema),
    timeEntries: z.array(timeEntrySchema),
    invoiceDraft: invoiceDraftSchema,
    communication: communicationSchema,
  })
  .superRefine((val, ctx) => {
    const { shipping } = val
    if (
      shipping.deliveryMethod !== null &&
      shipping.deliveryMethod !== 'pickup' &&
      (!shipping.shippingAddress || shipping.shippingAddress.trim() === '')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: i18n.t('validation.shippingAddressRequired'),
        path: ['shipping', 'shippingAddress'],
      })
    }
  })

export type WorkOrderFormValues = z.infer<typeof workOrderFormSchema>
