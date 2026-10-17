import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MAX_EDGE_LABEL_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_UNIT_LENGTH,
  isItemKind,
  isStepReady,
  stepStatus,
} from '@/lib/process/graph'
import {
  PROCESS_STEP_STATUSES,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type ProcessStepStatus,
} from '@/types/process'

export type ProcessSelection = { type: 'node' | 'edge'; id: string } | null

interface ProcessInspectorProps {
  graph: ProcessGraph
  selection: ProcessSelection
  mode: 'template' | 'order'
  canEditStructure: boolean
  onNodeChange: (id: string, patch: Partial<ProcessNode>) => void
  onEdgeChange: (id: string, patch: Partial<ProcessEdge>) => void
  onDelete: () => void
}

function parseQuantity(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function ProcessInspector({
  graph,
  selection,
  mode,
  canEditStructure,
  onNodeChange,
  onEdgeChange,
  onDelete,
}: ProcessInspectorProps): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId()
  const node = selection?.type === 'node' ? graph.nodes.find((n) => n.id === selection.id) : undefined
  const edge = selection?.type === 'edge' ? graph.edges.find((e) => e.id === selection.id) : undefined

  const shell = (children: React.ReactNode): React.JSX.Element => (
    <aside
      aria-label={t('process.inspector.title')}
      className="border border-border bg-card p-3 text-[12px]"
    >
      {/* Re-keyed per selection so the panel content eases in on every change. */}
      <div key={selection ? `${selection.type}:${selection.id}` : 'none'} className="animate-iris-rise space-y-3">
        {children}
      </div>
    </aside>
  )

  if (!node && !edge) {
    return shell(
      <p className="text-[color:var(--iris-ink-soft)]">{t('process.inspector.empty')}</p>,
    )
  }

  if (edge) {
    const from = graph.nodes.find((n) => n.id === edge.source)
    const to = graph.nodes.find((n) => n.id === edge.target)
    return shell(
      <>
        <div className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
          {t('process.inspector.edge')}
        </div>
        <p className="text-foreground">
          {from?.label} → {to?.label}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-edge-label`}>{t('process.inspector.edgeLabel')}</Label>
          <Input
            id={`${uid}-edge-label`}
            value={edge.label ?? ''}
            maxLength={MAX_EDGE_LABEL_LENGTH}
            readOnly={!canEditStructure}
            onChange={(event) => onEdgeChange(edge.id, { label: event.target.value })}
          />
        </div>
        {canEditStructure && (
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 aria-hidden /> {t('process.inspector.deleteEdge')}
          </Button>
        )}
      </>,
    )
  }

  const current = node as ProcessNode
  const isItem = isItemKind(current.kind)
  const isStep = current.kind === 'step'
  const noteEditable = canEditStructure || mode === 'order'

  return shell(
    <>
      <div className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
        {t(`process.kind.${current.kind}`)}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-label`}>{t('process.inspector.label')}</Label>
        <Input
          id={`${uid}-label`}
          value={current.label}
          maxLength={MAX_LABEL_LENGTH}
          readOnly={!canEditStructure}
          aria-invalid={current.label.trim() === ''}
          onChange={(event) => onNodeChange(current.id, { label: event.target.value })}
        />
      </div>

      {isItem && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-qty`}>{t('process.inspector.quantity')}</Label>
            <Input
              id={`${uid}-qty`}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={current.quantity ?? ''}
              readOnly={!canEditStructure}
              onChange={(event) => onNodeChange(current.id, { quantity: parseQuantity(event.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-unit`}>{t('process.inspector.unit')}</Label>
            <Input
              id={`${uid}-unit`}
              value={current.unit ?? ''}
              maxLength={MAX_UNIT_LENGTH}
              readOnly={!canEditStructure}
              onChange={(event) => onNodeChange(current.id, { unit: event.target.value || undefined })}
            />
          </div>
        </div>
      )}

      {mode === 'order' && isItem && (
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-actual`}>{t('process.inspector.actualQuantity')}</Label>
          <Input
            id={`${uid}-actual`}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={current.actualQuantity ?? ''}
            onChange={(event) =>
              onNodeChange(current.id, { actualQuantity: parseQuantity(event.target.value) })
            }
          />
        </div>
      )}

      {mode === 'order' && isStep && (
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-status`}>{t('process.inspector.status')}</Label>
          <Select
            value={stepStatus(current)}
            onValueChange={(value) => onNodeChange(current.id, { status: value as ProcessStepStatus })}
          >
            <SelectTrigger id={`${uid}-status`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROCESS_STEP_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`process.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {isStepReady(graph, current.id) ? t('process.inspector.readyHint') : t('process.inspector.waitingHint')}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-note`}>{t('process.inspector.note')}</Label>
        <Textarea
          id={`${uid}-note`}
          rows={3}
          value={current.note ?? ''}
          maxLength={MAX_NOTE_LENGTH}
          readOnly={!noteEditable}
          onChange={(event) => onNodeChange(current.id, { note: event.target.value || undefined })}
        />
      </div>

      {canEditStructure && (
        <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 aria-hidden /> {t('process.inspector.deleteNode')}
        </Button>
      )}
    </>,
  )
}
