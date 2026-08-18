import { z } from 'zod'
import i18n from '@/i18n'

const deliveryMethodEnum = z.enum(['pickup', 'postExpress', 'cityExpress', 'fieldVisit'])
const billingDocumentTypeEnum = z.enum(['invoice', 'cashCollection', 'proforma'])

const jobDetailsSchema = z.object({
  productCode: z.string().nullable(),
  paperWeightGsm: z.number().positive({ message: i18n.t('validation.paperWeightPositive') }).nullable(),
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
  hasPackaging: z.boolean(),
  hasLabeling: z.boolean(),
  isFragile: z.boolean(),
  requiresSignature: z.boolean(),
  hasInsurance: z.boolean(),
  shippingAddress: z.string().nullable(),
})

export const workOrderFormSchema = z
  .object({
    clientName: z.string().min(1, { message: i18n.t('validation.clientNameRequired') }),
    contactPerson: z.string().nullable(),
    jobDescription: z.string().min(1, { message: i18n.t('validation.jobDescriptionRequired') }),
    jobDetails: jobDetailsSchema.nullable(),
    billingDocumentType: billingDocumentTypeEnum.nullable(),
    billingDocumentNumber: z.string().nullable(),
    shipping: shippingSchema,
    price: z.number().min(0, { message: i18n.t('validation.priceNegative') }).nullable(),
    note: z.string().nullable(),
    issueDate: z.string().min(1, { message: i18n.t('validation.issueDateRequired') }),
    dueDate: z.string().nullable(),
    executedBy: z.string().nullable(),
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
