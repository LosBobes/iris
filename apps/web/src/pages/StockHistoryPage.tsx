import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, PackagePlus } from 'lucide-react'
import { Pager } from '@/components/Pager'
import { MovementKindBadge } from '@/components/Stock/MovementKindBadge'
import { StockReceiptDialog } from '@/components/Stock/StockReceiptDialog'
import { reportUnexpectedError } from '@/lib/errors'
import { staggerStyle } from '@/lib/motion'
import { formatSignedQuantity, formatStockQuantity } from '@/lib/stock/format'
import { cn } from '@/lib/utils'
import { formatWorkOrderDateTime } from '@/shared/utils/work-orders'
import type { CatalogItem } from '@/types/catalog'
import type { StockLevel, StockMovement } from '@/types/stock'

const PAGE_SIZE = 25

/** Movement history of one article (newest first) plus its current stock figures. */
function StockHistoryPage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { catalogItemId = '' } = useParams<{ catalogItemId: string }>()

  const [item, setItem] = useState<CatalogItem | null | undefined>(undefined)
  const [level, setLevel] = useState<StockLevel | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const found = await window.api.getCatalogItemById(catalogItemId)
      if (requestId.current !== id) return
      if (!found || found.kind !== 'article') {
        setItem(null)
        return
      }
      const [levels, history] = await Promise.all([
        window.api.getStockLevels({ search: found.code, limit: 50 }),
        window.api.getStockMovements({ catalogItemId, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
      ])
      if (requestId.current !== id) return
      setItem(found)
      setLevel(levels.items.find((entry) => entry.catalogItemId === catalogItemId) ?? null)
      setMovements(history.items)
      setTotal(history.total)
      setFailed(false)
    } catch (cause: unknown) {
      if (requestId.current !== id) return
      reportUnexpectedError('StockHistoryPage.load', cause)
      setFailed(true)
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }, [catalogItemId, page])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const unit = item?.unit ?? ''

  if (item === null) {
    return (
      <div className="px-8 py-20 text-center text-sm text-muted-foreground">
        <p>{t('stock.history.notFound')}</p>
        <button
          type="button"
          onClick={() => void navigate('/stock')}
          className="iris-focusable iris-press mt-4 inline-flex items-center gap-2 border border-border px-3 py-2 text-[12px]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('stock.history.back')}
        </button>
      </div>
    )
  }

  const figures: { key: string; label: string; value: string; tone?: string }[] = level
    ? [
        { key: 'onHand', label: t('stock.history.onHand'), value: formatStockQuantity(level.onHand, unit), tone: level.onHand < 0 ? 'text-destructive' : undefined },
        { key: 'reserved', label: t('stock.history.reserved'), value: formatStockQuantity(level.reserved, unit) },
        { key: 'available', label: t('stock.history.available'), value: formatStockQuantity(level.available, unit), tone: level.low ? 'text-amber-700 dark:text-amber-400' : undefined },
        { key: 'minStock', label: t('stock.history.minStock'), value: level.minStock === null ? '—' : formatStockQuantity(level.minStock, unit) },
      ]
    : []

  return (
    <>
      <div className="space-y-6">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <Link
            to="/stock"
            className="iris-focusable iris-press mb-2 inline-flex items-center gap-1 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('stock.history.back')}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t('stock.history.eyebrow')}
              </div>
              <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
                {item ? t('stock.history.title', { name: item.name }) : t('stock.title')}
              </h1>
              {item && (
                <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
                  {[item.code, item.unit].filter(Boolean).join(' · ')} ·{' '}
                  <Link to={`/catalog/${encodeURIComponent(item.id)}`} className="iris-focusable underline-offset-2 hover:underline">
                    {t('stock.history.openCatalog')}
                  </Link>
                </div>
              )}
            </div>
            {item && (
              <button
                type="button"
                onClick={() => setReceiptOpen(true)}
                className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
              >
                <PackagePlus className="h-4 w-4" aria-hidden />
                {t('stock.receipt.button')}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4 px-5 pb-8 sm:px-8">
          {figures.length > 0 && (
            <dl className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
              {figures.map((figure, index) => (
                <div
                  key={figure.key}
                  className="animate-iris-enter iris-stagger bg-card px-4 py-3"
                  style={staggerStyle(index)}
                >
                  <dt className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">{figure.label}</dt>
                  <dd className={cn('tnum mt-1 text-[20px] text-foreground', figure.tone)}>{figure.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <section className="min-w-0 border border-border bg-card" aria-label={t('stock.history.movements')}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-medium">
              <span>{t('stock.history.movements')}</span>
              <span className="text-[11px] font-normal text-[color:var(--iris-ink-soft)]">
                {loading ? '' : t('stock.totalCount', { count: total })}
              </span>
            </div>
            {loading && movements.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                {t('stock.history.loading')}
              </div>
            ) : failed ? (
              <div role="alert" className="px-4 py-10 text-center text-[12px] text-destructive">
                {t('stock.history.loadError')}
              </div>
            ) : movements.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
                {t('stock.history.empty')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.history.when')}</th>
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.history.kind')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-normal">{t('stock.history.quantity')}</th>
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.history.order')}</th>
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.history.document')}</th>
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.history.user')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                    {movements.map((movement, index) => (
                      <tr
                        key={movement.id}
                        className="iris-row animate-iris-rise iris-stagger hover:bg-muted/40"
                        style={staggerStyle(index)}
                      >
                        <td className="tnum px-4 py-2.5 text-[color:var(--iris-ink-soft)]">
                          {formatWorkOrderDateTime(movement.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <MovementKindBadge kind={movement.kind} />
                        </td>
                        <td
                          className={cn(
                            'tnum px-4 py-2.5 text-right font-medium',
                            movement.quantity > 0 ? 'text-[color:var(--iris-status-done)]' : 'text-destructive',
                          )}
                        >
                          {formatSignedQuantity(movement.quantity, movement.unit)}
                        </td>
                        <td className="px-4 py-2.5">
                          {movement.workOrderId && movement.workOrderNumber ? (
                            <Link
                              to={`/work-orders/${encodeURIComponent(movement.workOrderId)}`}
                              className="iris-focusable tnum text-foreground underline-offset-2 hover:underline"
                            >
                              {movement.workOrderNumber}
                            </Link>
                          ) : (
                            <span className="text-[color:var(--iris-ink-mute)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[color:var(--iris-ink-soft)]">
                          {movement.documentRef || '—'}
                          {movement.note && <span className="block text-[11px] text-[color:var(--iris-ink-mute)]">{movement.note}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[color:var(--iris-ink-soft)]">{movement.createdBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !failed && total > 0 && (
              <Pager
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPrev={() => setPage((current) => Math.max(0, current - 1))}
                onNext={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              />
            )}
          </section>
        </div>
      </div>

      {item && (
        <StockReceiptDialog
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          initialArticle={item}
          onPosted={() => void load()}
        />
      )}
    </>
  )
}

export default StockHistoryPage
