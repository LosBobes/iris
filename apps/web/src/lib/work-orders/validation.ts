import { z } from 'zod'

const deliveryMethodEnum = z.enum(['pickup', 'postExpress', 'cityExpress', 'fieldVisit'])
const billingDocumentTypeEnum = z.enum(['invoice', 'cashCollection', 'proforma'])
const priorityEnum = z.enum(['low', 'normal', 'high', 'urgent'])
const invoiceDraftStatusEnum = z.enum(['none', 'draft', 'issued', 'paid'])
const invoiceLineItemKindEnum = z.enum(['service', 'goods'])
const invoiceUnitEnum = z.enum(['kom', 'm2', 'set'])

const emptyToNullString = z
  .union([z.string(), z.null()])
  .transform((value) => (value === '' ? null : value))

const jobDetailsSchema = z.object({
  productCode: z.string().nullable(),
  paperWeightGsm: z.number().positive({ message: 'Gramatura mora biti pozitivan broj' }).nullable(),
  dimensions: z.string().nullable(),
  quantity: z
    .number()
    .int({ message: 'Količina mora biti ceo broj' })
    .positive({ message: 'Količina mora biti pozitivan broj' })
    .nullable(),
  finishingNote: z.string().nullable(),
})

const shippingSchema = z.object({
  deliveryMethod: deliveryMethodEnum.nullable(),
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
    price: z.number().min(0, { message: 'Cena ne može biti negativna' }).nullable(),
    note: emptyToNullString,
    issueDate: z.string().min(1, { message: 'Datum izdavanja je obavezan' }),
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
        message: 'Adresa za dostavu je obavezna kada je izabran način dostave',
        path: ['shipping', 'shippingAddress'],
      })
    }
  })

export type WorkOrderFormValues = z.infer<typeof workOrderFormSchema>
