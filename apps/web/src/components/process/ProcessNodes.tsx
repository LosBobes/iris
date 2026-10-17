import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { stepStatus } from '@/lib/process/graph'
import type { ProcessNode, ProcessNodeKind } from '@/types/process'
import { KIND_META } from './kind-meta'
import { StepStatusBadge } from './StepStatusBadge'

export type ProcessFlowNode = Node<
  { node: ProcessNode; mode: 'template' | 'order'; ready: boolean },
  ProcessNodeKind
>

function formatQuantity(quantity: number | undefined, unit: string | undefined): string | null {
  if (quantity === undefined) return null
  return `${quantity}${unit ? ` ${unit}` : ''}`
}

function ProcessNodeCardBase({ data, selected, type }: NodeProps<ProcessFlowNode>): React.JSX.Element {
  const { t } = useTranslation()
  const { node, mode, ready } = data
  const kind = type
  const meta = KIND_META[kind]
  const Icon = meta.icon
  const isStep = kind === 'step'
  const planned = formatQuantity(node.quantity, node.unit)
  const actual = formatQuantity(node.actualQuantity, node.unit)
  const status = stepStatus(node)

  return (
    <div
      className={cn(
        'w-[180px] rounded-sm border border-l-4 bg-card px-2.5 py-2 text-card-foreground shadow-sm',
        meta.accent,
        selected ? 'border-[color:var(--iris-accent)] ring-2 ring-[color:var(--iris-accent)]/30' : 'border-border',
        isStep && mode === 'order' && status === 'skipped' && 'opacity-60',
      )}
    >
      {kind !== 'input' && <Handle type="target" position={Position.Left} />}
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm', meta.iconWrap)}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
            {t(`process.kind.${kind}`)}
          </div>
          <div className="truncate text-[12px] font-medium leading-4 text-foreground" title={node.label}>
            {node.label || t('process.untitled')}
          </div>
        </div>
      </div>
      {isStep && mode === 'order' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StepStatusBadge status={status} />
          {ready && status !== 'done' && status !== 'skipped' && (
            <span className="text-[10px] text-[color:var(--iris-ink-soft)]">{t('process.ready')}</span>
          )}
        </div>
      )}
      {!isStep && (planned || (mode === 'order' && actual)) && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 text-[10px] text-[color:var(--iris-ink-soft)]">
          {planned && (
            <span>
              {t('process.planned')}: <span className="tnum text-foreground">{planned}</span>
            </span>
          )}
          {mode === 'order' && actual && (
            <span>
              {t('process.actual')}: <span className="tnum text-foreground">{actual}</span>
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export const ProcessNodeCard = memo(ProcessNodeCardBase)
