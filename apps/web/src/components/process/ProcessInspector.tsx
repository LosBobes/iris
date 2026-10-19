import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Link2Off, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { CatalogPickerDialog } from '@/components/WorkOrders/CatalogPickerDialog'
import { useMachineTypes } from '@/hooks/usePlanning'
import { MAX_CREW_SIZE, MAX_STEP_MINUTES } from '@/types/planning'
import { formatStockQuantity } from '@/lib/stock/format'
import type { StockLevelMap } from '@/lib/stock/posting'
import {
  MAX_EDGE_LABEL_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_UNIT_LENGTH,
  canBeFinal,
  isItemKind,
  isStepReady,
  stepStatus,
} from '@/lib/process/graph'
import {
  PROCESS_ITEM_KINDS,
  PROCESS_STEP_STATUSES,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type ProcessNodeKind,
  type ProcessStepStatus,
} from '@/types/process'

export type ProcessSelection = { type: 'node' | 'edge'; id: string } | null

interface ProcessInspectorProps {
  graph: ProcessGraph
  selection: ProcessSelection
  mode: 'template' | 'order'
  canEditStructure: boolean
  /** Warehouse levels by article id (names and on-hand of linked articles). */
  stock?: StockLevelMap
  /** Show the catalog-article link control (needs an organization session). */
  articleLinking?: boolean
  /** Hides the article section entirely (Magacin module off). */
  articlesHidden?: boolean
  /**
   * Shows the planning fields of step nodes (machine type, crew, times). Only
   * for the in-app editor while the Planiranje module is on: it also fetches the
   * machine types, so it must stay false everywhere else.
   */
  planningEnabled?: boolean
  onNodeChange: (id: string, patch: Partial<ProcessNode>) => void
  /** Switches an item node's role in place (input / product / byproduct). */
  onKindChange?: (id: string, kind: ProcessNodeKind) => void
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
  stock,
  articleLinking = false,
  articlesHidden = false,
  planningEnabled = false,
  onNodeChange,
  onKindChange,
  onEdgeChange,
  onDelete,
}: ProcessInspectorProps): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId()
  const [pickerOpen, setPickerOpen] = useState(false)
  // Names of articles picked in this session (the stock list may not know them yet).
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({})
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
  const linkedId = isItem ? current.catalogItemId : undefined
  const linkedLevel = linkedId ? stock?.[linkedId] : undefined
  const linkedName = linkedId ? (linkedLevel?.name ?? pickedNames[linkedId] ?? linkedId) : ''

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

      {isItem && canEditStructure && onKindChange && (
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-kind`}>{t('process.inspector.role')}</Label>
          <Select value={current.kind} onValueChange={(value) => onKindChange(current.id, value as ProcessNodeKind)}>
            <SelectTrigger id={`${uid}-kind`} className="w-full" aria-describedby={`${uid}-kind-hint`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROCESS_ITEM_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`process.kind.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={`${uid}-kind-hint`} className="text-[10px] text-[color:var(--iris-ink-soft)]">
            {t('process.inspector.roleHint')}
          </p>
        </div>
      )}

      {isStep && (
        <MarkerToggle
          id={`${uid}-start`}
          checked={Boolean(current.start)}
          disabled={!canEditStructure}
          label={t('process.inspector.start')}
          hint={t('process.inspector.startHint')}
          onChange={(start) => onNodeChange(current.id, { start: start || undefined })}
        />
      )}

      {canBeFinal(current.kind) && (
        <MarkerToggle
          id={`${uid}-final`}
          checked={Boolean(current.final)}
          disabled={!canEditStructure}
          label={t('process.inspector.final')}
          hint={t('process.inspector.finalHint')}
          onChange={(final) => onNodeChange(current.id, { final: final || undefined })}
        />
      )}

      {isStep && planningEnabled && (
        <StepPlanningFields
          idPrefix={uid}
          node={current}
          editable={canEditStructure}
          onChange={(patch) => onNodeChange(current.id, patch)}
        />
      )}

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
              readOnly={!canEditStructure || Boolean(linkedId)}
              aria-describedby={linkedId ? `${uid}-unit-hint` : undefined}
              onChange={(event) => onNodeChange(current.id, { unit: event.target.value || undefined })}
            />
            {linkedId && (
              <p id={`${uid}-unit-hint`} className="text-[10px] text-[color:var(--iris-ink-soft)]">
                {t('process.inspector.unitFollowsArticle')}
              </p>
            )}
          </div>
        </div>
      )}

      {isItem && !articlesHidden && (articleLinking || linkedId) && (
        <div className="space-y-1.5" data-testid="inspector-article">
          <Label>{t('process.inspector.article')}</Label>
          {linkedId ? (
            <p className="text-foreground">
              {t('process.inspector.articleLinked', { name: linkedName })}
              {linkedLevel && (
                <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">
                  {t('process.inspector.articleOnStock', {
                    qty: formatStockQuantity(linkedLevel.onHand, linkedLevel.unit),
                  })}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('process.inspector.articleNone')}</p>
          )}
          {articleLinking && canEditStructure && (
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <Link2 aria-hidden />{' '}
                {linkedId ? t('process.inspector.articleChange') : t('process.inspector.articlePick')}
              </Button>
              {linkedId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onNodeChange(current.id, { catalogItemId: undefined })}
                >
                  <Link2Off aria-hidden /> {t('process.inspector.articleUnlink')}
                </Button>
              )}
            </div>
          )}
          <CatalogPickerDialog
            kind="article"
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            usedIds={new Set()}
            onSelect={(item) => {
              setPickedNames((names) => ({ ...names, [item.id]: item.name }))
              // The node keeps the article's unit from now on.
              onNodeChange(current.id, { catalogItemId: item.id, unit: item.unit })
            }}
          />
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

const NO_MACHINE_TYPE = '__none__'

function parseMinutes(raw: string): number | undefined {
  const parsed = parseQuantity(raw)
  return parsed === undefined ? undefined : Math.min(Math.max(parsed, 0), MAX_STEP_MINUTES)
}

/** Duration of a step for `quantity` units: setup + per-unit time x quantity. */
export function stepMinutesFor(node: ProcessNode, quantity = 1): number {
  return Math.ceil((node.setupMinutes ?? 0) + (node.minutesPerUnit ?? 0) * Math.max(1, quantity) - 1e-9)
}

/** Planning fields (D-026) of a step node; mounted only while the module is on. */
function StepPlanningFields({
  idPrefix,
  node,
  editable,
  onChange,
}: {
  idPrefix: string
  node: ProcessNode
  editable: boolean
  onChange: (patch: Partial<ProcessNode>) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { data: machineTypes } = useMachineTypes()
  const typeId = node.machineTypeId
  const known = !typeId || (machineTypes ?? []).some((type) => type.id === typeId)
  const timed = node.setupMinutes !== undefined || node.minutesPerUnit !== undefined

  return (
    <div className="space-y-3" data-testid="inspector-planning">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-machine-type`}>{t('process.inspector.machineType')}</Label>
        <Select
          value={typeId ?? NO_MACHINE_TYPE}
          disabled={!editable}
          onValueChange={(value) => onChange({ machineTypeId: value === NO_MACHINE_TYPE ? undefined : value })}
        >
          <SelectTrigger id={`${idPrefix}-machine-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MACHINE_TYPE}>{t('process.inspector.machineTypeNone')}</SelectItem>
            {(machineTypes ?? []).map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
            {machineTypes && !known && typeId && (
              <SelectItem value={typeId}>{t('process.inspector.machineTypeUnknown')}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-crew`}>{t('process.inspector.crewSize')}</Label>
          <Input
            id={`${idPrefix}-crew`}
            type="number"
            min={1}
            max={MAX_CREW_SIZE}
            step={1}
            inputMode="numeric"
            value={node.crewSize ?? ''}
            readOnly={!editable}
            onChange={(event) => {
              const parsed = parseQuantity(event.target.value)
              onChange({
                crewSize: parsed === undefined ? undefined : Math.min(Math.max(Math.round(parsed), 1), MAX_CREW_SIZE),
              })
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-setup`}>{t('process.inspector.setupMinutes')}</Label>
          <Input
            id={`${idPrefix}-setup`}
            type="number"
            min={0}
            max={MAX_STEP_MINUTES}
            step="any"
            inputMode="decimal"
            value={node.setupMinutes ?? ''}
            readOnly={!editable}
            onChange={(event) => onChange({ setupMinutes: parseMinutes(event.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-per-unit`}>{t('process.inspector.minutesPerUnit')}</Label>
          <Input
            id={`${idPrefix}-per-unit`}
            type="number"
            min={0}
            max={MAX_STEP_MINUTES}
            step="any"
            inputMode="decimal"
            value={node.minutesPerUnit ?? ''}
            readOnly={!editable}
            onChange={(event) => onChange({ minutesPerUnit: parseMinutes(event.target.value) })}
          />
        </div>
      </div>
      <p className="text-[10px] text-[color:var(--iris-ink-soft)]" data-testid="inspector-duration">
        {timed
          ? t('process.inspector.durationHint', { minutes: stepMinutesFor(node) })
          : t('process.inspector.durationMissing')}
      </p>
    </div>
  )
}

function MarkerToggle({
  id,
  checked,
  disabled,
  label,
  hint,
  onChange,
}: {
  id: string
  checked: boolean
  disabled: boolean
  label: string
  hint: string
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="mt-1 text-[10px] text-[color:var(--iris-ink-soft)]">
          {hint}
        </p>
      </div>
    </div>
  )
}
