import { memo, useState } from 'react'
import { Check } from 'lucide-react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { stepStatus } from '@/lib/process/graph'
import { staggerStyle } from '@/lib/motion'
import type { SimNodeState } from '@/lib/process/simulation'
import { formatStockQuantity } from '@/lib/stock/format'
import type { ProcessNode, ProcessNodeKind } from '@/types/process'
import { KIND_META } from './kind-meta'
import { StepStatusBadge } from './StepStatusBadge'

export type ProcessFlowNode = Node<
  {
    node: ProcessNode
    mode: 'template' | 'order'
    ready: boolean
    /** First reveal: `{ index }` staggers in with the canvas; `'pop'` is a node added later. */
    enter?: { index: number } | 'pop'
    /** Simulator playback state; absent outside the simulator. */
    sim?: SimNodeState
    /** Live warehouse state of a node linked to an article; absent when unlinked or unknown. */
    stock?: { onHand: number; unit: string; shortage: number }
  },
  ProcessNodeKind
>

function formatQuantity(quantity: number | undefined, unit: string | undefined): string | null {
  if (quantity === undefined) return null
  return `${quantity}${unit ? ` ${unit}` : ''}`
}

function ProcessNodeCardBase({ data, selected, type }: NodeProps<ProcessFlowNode>): React.JSX.Element {
  const { t } = useTranslation()
  const { node, mode, ready, enter, sim, stock } = data
  const kind = type
  const meta = KIND_META[kind]
  const Icon = meta.icon
  const isStep = kind === 'step'
  const planned = formatQuantity(node.quantity, node.unit)
  const actual = formatQuantity(node.actualQuantity, node.unit)
  const status = stepStatus(node)

  // One-shot success ring when a step becomes done (not on first render).
  const [prevStatus, setPrevStatus] = useState(status)
  const [pulse, setPulse] = useState(0)
  if (status !== prevStatus) {
    setPrevStatus(status)
    if (status === 'done') setPulse((count) => count + 1)
  }
  const showReady = isStep && mode === 'order' && ready && status !== 'done' && status !== 'skipped'

  return (
    <div
      style={typeof enter === 'object' ? staggerStyle(enter.index) : undefined}
      data-sim={sim}
      className={cn(
        sim === 'produced' && 'animate-iris-pop',
        sim === 'consumed' && 'opacity-55',
        sim === 'unavailable' && 'opacity-40',
        sim === 'running' && 'border-[color:var(--iris-status-active)] ring-2 ring-[color:var(--iris-status-active)]/30',
        'iris-node-card w-[180px] rounded-sm border border-l-4 bg-card px-2.5 py-2 text-card-foreground shadow-sm',
        typeof enter === 'object' && 'iris-node-enter',
        enter === 'pop' && 'iris-node-pop',
        meta.accent,
        selected ? 'border-[color:var(--iris-accent)] ring-2 ring-[color:var(--iris-accent)]/30' : 'border-border',
        isStep && mode === 'order' && status === 'skipped' && 'opacity-60',
      )}
    >
      {sim === 'consumed' && (
        <span
          aria-hidden
          className="animate-iris-pop absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-[color:var(--iris-status-done)] text-background"
        >
          <Check className="size-3" />
        </span>
      )}
      {showReady && <span aria-hidden className="iris-node-ready" />}
      {pulse > 0 && <span key={pulse} aria-hidden className="iris-node-pulse" />}
      {/* Main flow runs left to right (step → step → product); inputs drop in from
          the top of a step and byproducts leave from its bottom. See edgeHandles. */}
      {(kind === 'step' || kind === 'product') && <Handle type="target" position={Position.Left} id="in" />}
      {(kind === 'step' || kind === 'byproduct') && <Handle type="target" position={Position.Top} id="top" />}
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
      {(node.start || node.final) && (
        <div className="mt-1.5">
          <span
            data-testid={node.start ? 'node-start' : 'node-final'}
            className="rounded-sm bg-[color:var(--iris-accent)]/10 px-1 py-px text-[9px] font-medium uppercase tracking-[1px] text-[color:var(--iris-accent)]"
          >
            {node.start ? t('process.marker.start') : t('process.marker.final')}
          </span>
        </div>
      )}
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
      {!isStep && stock && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[color:var(--iris-ink-soft)]">
          <span data-testid="node-stock">
            {t('process.stock.onStock', { qty: formatStockQuantity(stock.onHand, stock.unit || node.unit) })}
          </span>
          {stock.shortage > 0 && (
            <span
              data-testid="node-shortage"
              aria-label={t('process.stock.shortAria', { qty: formatStockQuantity(stock.shortage, stock.unit || node.unit) })}
              className="animate-iris-pop rounded-sm bg-destructive/10 px-1 py-px font-medium text-destructive"
            >
              {t('process.stock.short', { qty: formatStockQuantity(stock.shortage, stock.unit || node.unit) })}
            </span>
          )}
        </div>
      )}
      {kind !== 'input' && <Handle type="source" position={Position.Right} id="out" />}
      {(kind === 'step' || kind === 'input') && <Handle type="source" position={Position.Bottom} id="bottom" />}
    </div>
  )
}

export const ProcessNodeCard = memo(ProcessNodeCardBase)
