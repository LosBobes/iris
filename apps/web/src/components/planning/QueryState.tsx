import type { UseQueryResult } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface QueryStateProps<T> {
  query: UseQueryResult<T[]>
  /** Message for an empty list. */
  empty: string
  loadError: string
  children: (items: T[]) => React.ReactNode
}

/** Loading, error and empty states of a list query; renders the list otherwise. */
export function QueryState<T>({ query, empty, loadError, children }: QueryStateProps<T>): React.JSX.Element {
  const { t } = useTranslation()
  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 py-8 text-[12px] text-[color:var(--iris-ink-soft)]">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
      </div>
    )
  }
  if (query.isError) {
    return (
      <p role="alert" className="py-6 text-[12px] text-destructive">
        {loadError}
      </p>
    )
  }
  if (query.data.length === 0) {
    return <p className="py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">{empty}</p>
  }
  return <>{children(query.data)}</>
}
