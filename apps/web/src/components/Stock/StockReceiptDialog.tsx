import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Loader2, PackagePlus, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CatalogPickerDialog } from '@/components/WorkOrders/CatalogPickerDialog'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { formatStockQuantity } from '@/lib/stock/format'
import { roundQuantity } from '@/lib/stock/posting'
import { parseQuantityInput, receiptSchema, type ReceiptFormValues } from '@/lib/stock/validation'
import { staggerStyle } from '@/lib/motion'
import { MAX_RECEIPT_LINES } from '@/types/stock'
import type { CatalogItem } from '@/types/catalog'
import { StockDialog } from './StockDialog'

interface StockReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the receipt was recorded so the host can refresh its data. */
  onPosted: () => void
  /** Pre-selects an article (e.g. from the article's stock page). */
  initialArticle?: CatalogItem
}

const EMPTY: ReceiptFormValues = { documentRef: '', note: '', lines: [] }

function lineFor(item: CatalogItem): ReceiptFormValues['lines'][number] {
  return {
    catalogItemId: item.id,
    name: item.name,
    code: item.code,
    unit: item.unit,
    onHand: item.stockOnHand ?? 0,
    quantity: '',
  }
}

/** "Prijem robe": document, note and any number of article lines (any user). */
export function StockReceiptDialog({
  open,
  onOpenChange,
  onPosted,
  initialArticle,
}: StockReceiptDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const schema = useMemo(
    () =>
      receiptSchema({
        documentRefTooLong: t('stock.receipt.documentRefTooLong'),
        noteTooLong: t('stock.receipt.noteTooLong'),
        linesRequired: t('stock.receipt.linesRequired'),
        tooManyLines: t('stock.receipt.tooManyLines', { max: MAX_RECEIPT_LINES }),
        articleRequired: t('stock.receipt.articleRequired'),
        quantityPositive: t('stock.receipt.quantityPositive'),
        duplicate: t('stock.receipt.duplicate'),
      }),
    [t],
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ReceiptFormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = watch('lines')

  // Every opening starts from a clean form (optionally with one article).
  useEffect(() => {
    if (open) reset({ ...EMPTY, lines: initialArticle ? [lineFor(initialArticle)] : [] })
  }, [open, initialArticle, reset])

  const submit = handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      const result = await window.api.postStockReceipt({
        documentRef: values.documentRef.trim() || undefined,
        note: values.note.trim() || undefined,
        lines: values.lines.map((line) => ({
          catalogItemId: line.catalogItemId,
          quantity: parseQuantityInput(line.quantity) as number,
        })),
      })
      toast.success(t('stock.receipt.success', { count: result.movements.length }))
      onOpenChange(false)
      onPosted()
    } catch (cause) {
      reportUnexpectedError('StockReceiptDialog.submit', cause)
      toast.error(formatActionError(t('stock.receipt.error'), cause))
    } finally {
      setSubmitting(false)
    }
  })

  // Message for the array itself ("add at least one line").
  const listError = errors.lines?.root?.message ?? errors.lines?.message

  return (
    <StockDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('stock.receipt.title')}
      description={t('stock.receipt.description')}
    >
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="receipt-document">{t('stock.receipt.documentRef')}</Label>
            <Input
              id="receipt-document"
              maxLength={120}
              placeholder={t('stock.receipt.documentRefHint')}
              aria-invalid={errors.documentRef ? true : undefined}
              {...register('documentRef')}
            />
            {errors.documentRef && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.documentRef.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receipt-note">{t('stock.receipt.note')}</Label>
            <Textarea id="receipt-note" rows={2} aria-invalid={errors.note ? true : undefined} {...register('note')} />
            {errors.note && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.note.message}
              </p>
            )}
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t('stock.receipt.lines')}
          </legend>
          {fields.length > 0 && (
            <ul className="divide-y divide-[color:var(--iris-border-soft)] border border-border">
              {fields.map((field, index) => {
                const line = lines?.[index]
                const quantity = parseQuantityInput(line?.quantity ?? '')
                const lineErrors = errors.lines?.[index]
                return (
                  <li
                    key={field.id}
                    className="animate-iris-rise iris-stagger grid items-start gap-2 p-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
                    style={staggerStyle(index)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-foreground">{field.name}</div>
                      <div className="truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                        {[field.code, field.unit].filter(Boolean).join(' · ')}
                      </div>
                      {lineErrors?.catalogItemId && (
                        <p role="alert" className="text-[11px] text-destructive">
                          {lineErrors.catalogItemId.message}
                        </p>
                      )}
                      {quantity !== null && quantity > 0 && (
                        <p className="tnum text-[11px] text-[color:var(--iris-status-done)]" data-testid="receipt-preview">
                          {t('stock.receipt.resulting', {
                            value: formatStockQuantity(roundQuantity(field.onHand + quantity), field.unit),
                          })}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        inputMode="decimal"
                        aria-label={`${t('stock.receipt.quantity')}: ${field.name}`}
                        placeholder={t('stock.receipt.quantity')}
                        aria-invalid={lineErrors?.quantity ? true : undefined}
                        {...register(`lines.${index}.quantity` as const)}
                      />
                      {lineErrors?.quantity && (
                        <p role="alert" className="mt-1 text-[11px] text-destructive">
                          {lineErrors.quantity.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('stock.receipt.removeLine', { name: field.name })}
                      onClick={() => remove(index)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {listError && (
            <p role="alert" className="text-[11px] text-destructive">
              {listError}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fields.length >= MAX_RECEIPT_LINES}
            onClick={() => setPickerOpen(true)}
          >
            <Plus aria-hidden /> {t('stock.receipt.addLine')}
          </Button>
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <PackagePlus aria-hidden />}
            {t('stock.receipt.submit')}
          </Button>
        </div>
      </form>

      <CatalogPickerDialog
        kind="article"
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        usedIds={new Set(fields.map((field) => field.catalogItemId))}
        onSelect={(item) => append(lineFor(item))}
      />
    </StockDialog>
  )
}
