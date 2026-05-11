import { z } from 'zod'

const deliveryMethodEnum = z.enum(['pickup', 'postExpress', 'cityExpress', 'fieldVisit'])
const billingDocumentTypeEnum = z.enum(['invoice', 'cashCollection', 'proforma'])

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

export const workOrderFormSchema = z
  .object({
    clientName: z.string().min(1, { message: 'Naziv klijenta je obavezan' }),
    contactPerson: z.string().nullable(),
    jobDescription: z.string().min(1, { message: 'Opis posla je obavezan' }),
    jobDetails: jobDetailsSchema.nullable(),
    billingDocumentType: billingDocumentTypeEnum.nullable(),
    billingDocumentNumber: z.string().nullable(),
    shipping: shippingSchema,
    price: z.number().min(0, { message: 'Cena ne može biti negativna' }).nullable(),
    note: z.string().nullable(),
    issueDate: z.string().min(1, { message: 'Datum izdavanja je obavezan' }),
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
        message: 'Adresa za dostavu je obavezna kada je izabran način dostave',
        path: ['shipping', 'shippingAddress'],
      })
    }
  })

export type WorkOrderFormValues = z.infer<typeof workOrderFormSchema>
