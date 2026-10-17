import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatActionError, reportUnexpectedError } from '@/lib/errors'
import { fetchAllStockLevels } from '@/lib/stock/api'
import { formatSignedQuantity, formatStockQuantity } from '@/lib/stock/format'
import { planCountPosting, roundQuantity } from '@/lib/stock/posting'
import { countLinesSchema, parseQuantityInput } from '@/lib/stock/validation'
import { cn } from '@/lib/utils'
import type { StockLevel } from '@/types/stock'
import { StockDialog } from './StockDialog'

interface StockCountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the stocktake was booked so the host can refresh its data. */
  onPosted: () => void
}

/**
 * "Popis" (admin): enter counted quantities for many articles at once. Counted
 * fields start at the recorded on-hand; only lines that differ are booked, as
 * adjustments, or as the opening balance for articles without movements.
 */
export function StockCountDialog({ open, onOpenChange, onPosted }: StockCountDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [levels, setLevels] = useState<StockLevel[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // Raw text of the counted fields the admin touched; untouched rows show on-hand.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    setLevels(null)
    setLoadFailed(false)
    setEdits({})
    setNote('')
    setFilter('')
    fetchAllStockLevels()
      .then((list) => {
        if (active) setLevels(list)
      })
      .catch((cause: unknown) => {
        if (!active) return
        reportUnexpectedError('StockCountDialog.load', cause)
        setLoadFailed(true)
        setLevels([])
      })
    return () => {
      active = false
    }
  }, [open])

  const rows = useMemo(
    () =>
      (levels ?? []).map((level) => {
        const raw = edits[level.catalogItemId]
        const counted = raw === undefined ? level.onHand : parseQuantityInput(raw)
        const invalid = counted === null || counted < 0
        const delta = invalid ? null : roundQuantity(counted - level.onHand)
        return { level, raw: raw ?? String(level.onHand), counted, invalid, delta }
      }),
    [levels, edits],
  )
  const changed = rows.filter((row) => row.delta !== null && row.delta !== 0)
  const hasInvalid = rows.some((row) => row.invalid)
  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return term === ''
      ? rows
      : rows.filter((row) => row.level.name.toLowerCase().includes(term) || row.level.code.toLowerCase().includes(term))
  }, [rows, filter])

  const submit = async (): Promise<void> => {
    const lines = changed.map((row) => ({ catalogItemId: row.level.catalogItemId, countedQuantity: row.counted as number }))
    const parsed = countLinesSchema(t('stock.count.negative'), t('stock.count.nothing')).safeParse(lines)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('stock.count.nothing'))
      return
    }
    setSubmitting(true)
    try {
      const result = await window.api.postStockCount({ note: note.trim() || undefined, lines: parsed.data })
      toast.success(
        result.movements.length === 0
          ? t('stock.count.successNone')
          : t('stock.count.success', { count: result.movements.length }),
      )
      onOpenChange(false)
      onPosted()
    } catch (cause) {
      reportUnexpectedError('StockCountDialog.submit', cause)
      toast.error(formatActionError(t('stock.count.error'), cause))
    } finally {
      setSubmitting(false)
    }
  }

  // Which rows would become an opening balance (article has no movements yet).
  const preview = useMemo(
    () =>
      new Map(
        planCountPosting(
          changed.map((row) => ({ catalogItemId: row.level.catalogItemId, countedQuantity: row.counted as number })),
          new Map(
            (levels ?? []).map((level) => [
              level.catalogItemId,
              { catalogItemId: level.catalogItemId, onHand: level.onHand, hasMovements: level.lastMovementAt !== null },
            ]),
          ),
        ).map((posting) => [posting.catalogItemId, posting.kind] as const),
      ),
    [changed, levels],
  )

  return (
    <StockDialog
      wide
      open={open}
      onOpenChange={onOpenChange}
      title={t('stock.count.title')}
      description={t('stock.count.description')}
    >
      {levels === null ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-[color:var(--iris-ink-soft)]">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t('stock.count.loading')}
        </div>
      ) : loadFailed ? (
        <p role="alert" className="py-6 text-[12px] text-destructive">
          {t('stock.count.loadError')}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="count-filter">{t('stock.count.search')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-[color:var(--iris-ink-mute)]" aria-hidden />
                <Input id="count-filter" className="pl-7" value={filter} onChange={(event) => setFilter(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="count-note">{t('stock.count.note')}</Label>
              <Textarea id="count-note" rows={1} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">{t('stock.count.empty')}</p>
          ) : (
            <div className="max-h-[48vh] overflow-auto border border-border">
              <table className="w-full min-w-[560px] text-left text-[12px]">
                <thead className="sticky top-0 bg-popover">
                  <tr className="border-b border-border text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                    <th scope="col" className="px-3 py-2 font-normal">{t('stock.count.article')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">{t('stock.count.recorded')}</th>
                    <th scope="col" className="w-36 px-3 py-2 text-right font-normal">{t('stock.count.counted')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">{t('stock.count.delta')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                  {visible.map((row) => {
                    const opening = preview.get(row.level.catalogItemId) === 'opening'
                    return (
                      <tr key={row.level.catalogItemId} className="iris-row hover:bg-muted/40">
                        <th scope="row" className="px-3 py-1.5 font-normal text-foreground">
                          <span className="block truncate">{row.level.name}</span>
                          <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">{row.level.code}</span>
                          {opening && (
                            <span
                              title={t('stock.count.openingExplain')}
                              className="mt-0.5 inline-block border border-border px-1.5 text-[10px] uppercase tracking-wide text-[color:var(--iris-accent)]"
                            >
                              {t('stock.count.openingHint')}
                            </span>
                          )}
                        </th>
                        <td className="tnum px-3 py-1.5 text-right">{formatStockQuantity(row.level.onHand, row.level.unit)}</td>
                        <td className="px-3 py-1.5">
                          <Input
                            inputMode="decimal"
                            className="text-right"
                            value={row.raw}
                            aria-label={t('stock.count.countedAria', { name: row.level.name })}
                            aria-invalid={row.invalid ? true : undefined}
                            onFocus={(event) => event.target.select()}
                            onChange={(event) => setEdits((current) => ({ ...current, [row.level.catalogItemId]: event.target.value }))}
                          />
                          {row.invalid && (
                            <p role="alert" className="mt-0.5 text-right text-[10px] text-destructive">
                              {t('stock.count.negative')}
                            </p>
                          )}
                        </td>
                        <td
                          className={cn(
                            'tnum px-3 py-1.5 text-right',
                            row.delta && row.delta > 0 && 'text-[color:var(--iris-status-done)]',
                            row.delta && row.delta < 0 && 'text-destructive',
                          )}
                        >
                          {row.delta ? formatSignedQuantity(row.delta, row.level.unit) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-[color:var(--iris-ink-soft)]">
              {changed.length > 0 ? t('stock.count.changes', { count: changed.length }) : t('stock.count.nothing')}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" disabled={submitting || hasInvalid || changed.length === 0} onClick={() => void submit()}>
                {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardCheck aria-hidden />}
                {t('stock.count.submit')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </StockDialog>
  )
}
