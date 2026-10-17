import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { StockMovementKind } from '@/types/stock'

const KIND_TONE: Record<StockMovementKind, string> = {
  opening: 'text-[color:var(--iris-ink-soft)] border-border bg-muted/50',
  receipt: 'text-[color:var(--iris-status-done)] border-[color:var(--iris-status-done)]/30 bg-[color:var(--iris-status-done)]/10',
  consumption: 'text-[color:var(--iris-status-active)] border-[color:var(--iris-status-active)]/30 bg-[color:var(--iris-status-active)]/10',
  production: 'text-[color:var(--iris-proc-product)] border-[color:var(--iris-proc-product)]/30 bg-[color:var(--iris-proc-product)]/10',
  adjustment: 'text-[color:var(--iris-accent)] border-[color:var(--iris-accent)]/30 bg-[color:var(--iris-accent)]/10',
}

/** Movement kind label: Početno stanje / Prijem / Utrošak / Proizvodnja / Korekcija. */
export function MovementKindBadge({ kind }: { kind: StockMovementKind }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <span
      data-kind={kind}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[2px] text-[11px] font-medium',
        KIND_TONE[kind],
      )}
    >
      {t(`stock.kind.${kind}`)}
    </span>
  )
}
