import { useCallback, useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardCheck, Loader2, PackagePlus, Search } from 'lucide-react'
import { Pager } from '@/components/Pager'
import { StockCountDialog } from '@/components/Stock/StockCountDialog'
import { StockReceiptDialog } from '@/components/Stock/StockReceiptDialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/hooks/useAuth'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useStockList } from '@/hooks/useStockList'
import { staggerStyle } from '@/lib/motion'
import { formatStockQuantity } from '@/lib/stock/format'
import { cn } from '@/lib/utils'
import { formatWorkOrderDateTime } from '@/shared/utils/work-orders'
import type { StockLevel } from '@/types/stock'

const PAGE_SIZE = 25

/** Amber for low stock, red when the on-hand count went negative. */
function rowTone(level: StockLevel): string {
  if (level.onHand < 0) return 'bg-destructive/10 border-l-destructive'
  if (level.low) return 'bg-amber-500/10 border-l-amber-500'
  return 'border-l-transparent'
}

function StockBadge({ level }: { level: StockLevel }): React.JSX.Element | null {
  const { t } = useTranslation()
  if (level.onHand < 0) {
    return (
      <span className="shrink-0 border border-destructive/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-destructive">
        {t('stock.negativeBadge')}
      </span>
    )
  }
  if (level.low) {
    return (
      <span className="shrink-0 border border-amber-500/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
        {t('stock.lowBadge')}
      </span>
    )
  }
  return null
}

function StockPage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const isAdmin = currentUser.role === 'admin'
  const isTable = useMediaQuery('(min-width: 768px)')
  const [params, setParams] = useSearchParams()

  const lowOnly = params.get('low') === '1'
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [page, setPage] = useState(0)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [countOpen, setCountOpen] = useState(false)

  const { items, total, loading, failed, reload } = useStockList({
    search: deferredSearch.trim() || undefined,
    lowOnly: lowOnly || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const changeSearch = useCallback((next: string) => {
    setSearch(next)
    setPage(0)
  }, [])
  const changeLowOnly = useCallback(
    (next: boolean) => {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current)
          if (next) copy.set('low', '1')
          else copy.delete('low')
          return copy
        },
        { replace: true },
      )
      setPage(0)
    },
    [setParams],
  )

  const open = (level: StockLevel): void => {
    void navigate(`/stock/${encodeURIComponent(level.catalogItemId)}`)
  }
  const filtered = Boolean(deferredSearch.trim()) || lowOnly

  return (
    <>
      <div className="space-y-8">
        <div className="animate-iris-enter flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {t('stock.eyebrow')}
            </div>
            <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">{t('stock.title')}</h1>
            <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">{t('stock.subtitle')}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCountOpen(true)}
                className="iris-focusable iris-press inline-flex items-center gap-2 border border-border px-4 py-2 text-[12px] font-medium text-[color:var(--iris-ink-soft)] hover:text-foreground"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                {t('stock.count.button')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setReceiptOpen(true)}
              className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
            >
              <PackagePlus className="h-4 w-4" aria-hidden />
              {t('stock.receipt.button')}
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 pb-8 sm:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[12px] text-[color:var(--iris-ink-soft)]">
              <Checkbox checked={lowOnly} onCheckedChange={(checked) => changeLowOnly(checked === true)} />
              {t('stock.lowOnly')}
            </label>
            <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--iris-ink-mute)]" aria-hidden />
              <input
                type="search"
                aria-label={t('stock.searchAria')}
                value={search}
                onChange={(event) => changeSearch(event.target.value)}
                placeholder={t('stock.searchPlaceholder')}
                className="block w-full border border-border bg-background py-2 pl-8 pr-2 text-[13px] text-foreground"
              />
            </div>
          </div>

          <section className="min-w-0 border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-medium">
              <span>{t('stock.items')}</span>
              <span className="text-[11px] font-normal text-[color:var(--iris-ink-soft)]">
                {loading ? '' : t('stock.totalCount', { count: total })}
              </span>
            </div>

            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                {t('stock.loading')}
              </div>
            ) : failed ? (
              <div role="alert" className="px-4 py-10 text-center text-[12px] text-destructive">
                {t('stock.loadError')}
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
                {filtered ? t('stock.emptyFilters') : t('stock.empty')}
              </div>
            ) : isTable ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.columns.code')}</th>
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.columns.name')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-normal">{t('stock.columns.onHand')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-normal">{t('stock.columns.reserved')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-normal">{t('stock.columns.available')}</th>
                      <th scope="col" className="px-4 py-2 text-right font-normal">{t('stock.columns.minStock')}</th>
                      <th scope="col" className="px-4 py-2 font-normal">{t('stock.columns.lastMovement')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--iris-border-soft)]">
                    {items.map((level, index) => (
                      <tr
                        key={level.catalogItemId}
                        data-low={level.low ? 'true' : undefined}
                        data-negative={level.onHand < 0 ? 'true' : undefined}
                        onClick={() => open(level)}
                        style={staggerStyle(index)}
                        className={cn(
                          'iris-row animate-iris-rise iris-stagger cursor-pointer border-l-2 hover:bg-[color:var(--iris-accent)]/10',
                          rowTone(level),
                        )}
                      >
                        <td className="tnum px-4 py-2.5 text-[color:var(--iris-ink-soft)]">{level.code}</td>
                        <th scope="row" className="px-4 py-2.5 text-left font-normal">
                          <span className="flex items-center gap-2">
                            <Link
                              to={`/stock/${encodeURIComponent(level.catalogItemId)}`}
                              onClick={(event) => event.stopPropagation()}
                              className="iris-focusable truncate text-[13px] text-foreground hover:underline"
                            >
                              {level.name}
                            </Link>
                            {!level.isActive && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wide text-[color:var(--iris-status-cancelled)]">
                                {t('stock.inactive')}
                              </span>
                            )}
                            <StockBadge level={level} />
                          </span>
                        </th>
                        <td className={cn('tnum px-4 py-2.5 text-right font-medium', level.onHand < 0 ? 'text-destructive' : 'text-foreground')}>
                          {formatStockQuantity(level.onHand, level.unit)}
                        </td>
                        <td className="tnum px-4 py-2.5 text-right text-[color:var(--iris-ink-soft)]">
                          {formatStockQuantity(level.reserved, level.unit)}
                        </td>
                        <td className={cn('tnum px-4 py-2.5 text-right', level.available < 0 ? 'text-destructive' : 'text-foreground')}>
                          {formatStockQuantity(level.available, level.unit)}
                        </td>
                        <td className="tnum px-4 py-2.5 text-right text-[color:var(--iris-ink-soft)]">
                          {level.minStock === null ? '—' : formatStockQuantity(level.minStock, level.unit)}
                        </td>
                        <td className="tnum px-4 py-2.5 text-[color:var(--iris-ink-soft)]">
                          {level.lastMovementAt ? formatWorkOrderDateTime(level.lastMovementAt) : t('stock.never')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--iris-border-soft)]">
                {items.map((level, index) => (
                  <li
                    key={level.catalogItemId}
                    data-low={level.low ? 'true' : undefined}
                    data-negative={level.onHand < 0 ? 'true' : undefined}
                    style={staggerStyle(index)}
                    className={cn('animate-iris-rise iris-stagger border-l-2', rowTone(level))}
                  >
                    <button
                      type="button"
                      onClick={() => open(level)}
                      className="iris-focusable block w-full space-y-1.5 px-4 py-3 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] text-foreground">{level.name}</span>
                        <StockBadge level={level} />
                      </span>
                      <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">
                        {[level.code, !level.isActive ? t('stock.inactive') : null].filter(Boolean).join(' · ')}
                      </span>
                      <span className="grid grid-cols-3 gap-2 text-[11px] text-[color:var(--iris-ink-soft)]">
                        <span>
                          {t('stock.columns.onHand')}
                          <span className={cn('tnum block text-[13px]', level.onHand < 0 ? 'text-destructive' : 'text-foreground')}>
                            {formatStockQuantity(level.onHand, level.unit)}
                          </span>
                        </span>
                        <span>
                          {t('stock.columns.reserved')}
                          <span className="tnum block text-[13px] text-foreground">{formatStockQuantity(level.reserved, level.unit)}</span>
                        </span>
                        <span>
                          {t('stock.columns.available')}
                          <span className="tnum block text-[13px] text-foreground">{formatStockQuantity(level.available, level.unit)}</span>
                        </span>
                      </span>
                      <span className="block text-[11px] text-[color:var(--iris-ink-mute)]">
                        {t('stock.columns.minStock')}: {level.minStock === null ? '—' : formatStockQuantity(level.minStock, level.unit)}
                        {' · '}
                        {level.lastMovementAt ? formatWorkOrderDateTime(level.lastMovementAt) : t('stock.never')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
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

      <StockReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} onPosted={() => void reload()} />
      {isAdmin && <StockCountDialog open={countOpen} onOpenChange={setCountOpen} onPosted={() => void reload()} />}
    </>
  )
}

export default StockPage
