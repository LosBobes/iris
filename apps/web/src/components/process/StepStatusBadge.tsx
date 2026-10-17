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
  return (
    <span
      className={cn(
        'inline-flex h-4 items-center rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-[0.5px]',
        STATUS_CLASSES[status],
        className,
      )}
    >
      {t(`process.status.${status}`)}
    </span>
  )
}
