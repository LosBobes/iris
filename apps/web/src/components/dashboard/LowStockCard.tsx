import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check } from 'lucide-react'
import { reportUnexpectedError } from '@/lib/errors'
import { formatStockQuantity } from '@/lib/stock/format'
import type { StockLevel } from '@/types/stock'

const PREVIEW = 4

/**
 * "Niske zalihe" attention card (admins): how many articles are below their
 * minimum and the first few of them, linking to the filtered warehouse list.
 * Stays out of the way when stock cannot be loaded.
 */
export function LowStockCard(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [state, setState] = useState<{ items: StockLevel[]; total: number } | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    window.api
      .getStockLevels({ lowOnly: true, limit: PREVIEW })
      .then((result) => {
        if (active) setState({ items: result.items, total: result.total })
      })
      .catch((cause: unknown) => {
        reportUnexpectedError('LowStockCard.load', cause)
        if (active) setState(null)
      })
    return () => {
      active = false
    }
  }, [])

  if (!state) return null
  const low = state.total > 0

  return (
    <section
      aria-label={t('dashboard.lowStock.title')}
      data-testid="low-stock-card"
      className="animate-iris-enter border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          {low ? (
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          ) : (
            <Check className="size-4 text-[color:var(--iris-status-done)]" aria-hidden />
          )}
          {t('dashboard.lowStock.title')}
        </h2>
        <Link
          to={low ? '/stock?low=1' : '/stock'}
          className="iris-focusable inline-flex items-center gap-1 text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
        >
          {t('dashboard.lowStock.open')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="px-4 py-3 text-[12px]">
        {low ? (
          <>
            <p className="text-foreground">{t('dashboard.lowStock.count', { count: state.total })}</p>
            <ul className="mt-2 space-y-1">
              {state.items.map((level) => (
                <li key={level.catalogItemId} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-foreground">{level.name}</span>
                  <span className={level.onHand < 0 ? 'tnum text-destructive' : 'tnum text-[color:var(--iris-ink-soft)]'}>
                    {formatStockQuantity(level.available, level.unit)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[color:var(--iris-ink-soft)]">{t('dashboard.lowStock.allGood')}</p>
        )}
      </div>
    </section>
  )
}
