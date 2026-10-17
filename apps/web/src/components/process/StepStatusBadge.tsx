import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ProcessStepStatus } from '@/types/process'
import { STATUS_CLASSES } from './kind-meta'

export function StepStatusBadge({
  status,
  className,
}: {
  status: ProcessStepStatus
  className?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  // Pop the badge when the status changes after first render (key restarts the animation).
  const [prev, setPrev] = useState(status)
  const [changes, setChanges] = useState(0)
  if (status !== prev) {
    setPrev(status)
    setChanges((count) => count + 1)
  }
  return (
    <span
      key={changes}
      className={cn(
        changes > 0 && 'animate-iris-pop',
        'transition-colors duration-[var(--iris-dur-base)]',
        'inline-flex h-4 items-center rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-[0.5px]',
        STATUS_CLASSES[status],
        className,
      )}
    >
      {t(`process.status.${status}`)}
    </span>
  )
}
