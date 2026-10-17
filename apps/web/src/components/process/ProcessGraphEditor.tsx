import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  canConnect,
  generateEdgeId,
  generateNodeId,
  readySteps,
  stepStatus,
  validateGraph,
} from '@/lib/process/graph'
import { hasNewItems } from '@/lib/motion'
import type { SimNodeState } from '@/lib/process/simulation'
import { materialRows, type StockLevelMap } from '@/lib/stock/posting'
import {
  PROCESS_NODE_KINDS,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type ProcessNodeKind,
} from '@/types/process'
import { KIND_META } from './kind-meta'
import { ProcessNodeCard, type ProcessFlowNode } from './ProcessNodes'
import { ProcessInspector, type ProcessSelection } from './ProcessInspector'

const nodeTypes = {
  step: ProcessNodeCard,
  input: ProcessNodeCard,
  product: ProcessNodeCard,
  byproduct: ProcessNodeCard,
}

export interface ProcessGraphEditorProps {
  mode: 'template' | 'order'
  /** Controlled graph. */
  value: ProcessGraph
  onChange: (graph: ProcessGraph) => void
  /** False for operators: structure is read-only, state fields and dragging stay editable. */
  canEditStructure?: boolean
  /** Extra classes for the outer wrapper. */
  className?: string
  /** Simulator mode: no editing, dragging, inspector or toolbar; nodes can still be selected. */
  readOnly?: boolean
  /** Simulator playback state per node id. */
  simStates?: ReadonlyMap<string, SimNodeState>
  /** Nodes to show as selected from outside (e.g. tester issues). */
  highlightIds?: readonly string[]
  /** Warehouse levels by article id; linked item nodes then show live stock and shortages. */
  stock?: StockLevelMap
  /** Lets admins link item nodes to catalog articles in the inspector (needs an organization session). */
  articleLinking?: boolean
}

function ProcessGraphEditorInner({
  mode,
  value,
  onChange,
  canEditStructure: canEditStructureProp = true,
  className,
  readOnly = false,
  simStates,
  highlightIds,
  stock,
  articleLinking = false,
}: ProcessGraphEditorProps): React.JSX.Element {
  const canEditStructure = canEditStructureProp && !readOnly
  const highlighted = useMemo(() => new Set(highlightIds ?? []), [highlightIds])
  const { t } = useTranslation()
  const { screenToFlowPosition } = useReactFlow<ProcessFlowNode, Edge>()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<ProcessSelection>(null)
  // Measured node sizes reported by React Flow. In a controlled flow they must
  // be fed back on each node, or the minimap (which skips unmeasured nodes)
  // stays empty.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})

  // Handlers can fire several times before the parent re-renders (a drag batch,
  // a node delete that also drops edges); always build on the latest graph.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const emit = useCallback(
    (graph: ProcessGraph) => {
      latest.current = graph
      onChange(graph)
    },
    [onChange],
  )

  // Nodes present when the editor first mounts reveal with a stagger (by order);
  // anything added afterwards gets a quick pop instead. Never replayed on drag.
  const [initialOrder] = useState(() => new Map(value.nodes.map((node, index) => [node.id, index])))

  const readyIds = useMemo(
    () => (mode === 'order' ? new Set(readySteps(value).map((step) => step.id)) : new Set<string>()),
    [mode, value],
  )

  // Per-node stock line + shortage badge. Shortage is per article (all its
  // input nodes together) and is shown on each of its input nodes.
  const nodeStock = useMemo(() => {
    const map = new Map<string, { onHand: number; unit: string; shortage: number }>()
    if (!stock) return map
    const shortageByNode = new Map<string, number>()
    for (const row of materialRows(value, mode, stock)) {
      for (const id of row.nodeIds) shortageByNode.set(id, row.shortage)
    }
    for (const node of value.nodes) {
      const level = node.kind !== 'step' && node.catalogItemId ? stock[node.catalogItemId] : undefined
      if (level) map.set(node.id, { onHand: level.onHand, unit: level.unit, shortage: shortageByNode.get(node.id) ?? 0 })
    }
    return map
  }, [stock, value, mode])

  const nodes = useMemo<ProcessFlowNode[]>(
    () =>
      value.nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: { x: node.x, y: node.y },
        measured: measured[node.id],
        data: {
          node,
          mode,
          ready: readyIds.has(node.id),
          sim: simStates?.get(node.id),
          stock: nodeStock.get(node.id),
          enter: initialOrder.has(node.id)
            ? { index: initialOrder.get(node.id) as number }
            : ('pop' as const),
        },
        selected: (selection?.type === 'node' && selection.id === node.id) || highlighted.has(node.id),
        deletable: canEditStructure,
        connectable: canEditStructure,
        draggable: !readOnly,
      })),
    [value.nodes, mode, readyIds, selection, canEditStructure, measured, initialOrder, simStates, highlighted, readOnly, nodeStock],
  )

  // Edges feeding a step that is in progress flow (dashes); reduced motion stops
  // the dash animation in CSS.
  const activeTargets = useMemo(
    () =>
      mode === 'order'
        ? new Set(value.nodes.filter((n) => n.kind === 'step' && stepStatus(n) === 'in_progress').map((n) => n.id))
        : new Set<string>(),
    [mode, value.nodes],
  )

  const edges = useMemo<Edge[]>(
    () =>
      value.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: activeTargets.has(edge.target),
        selected: selection?.type === 'edge' && selection.id === edge.id,
        deletable: canEditStructure,
        reconnectable: false,
      })),
    [value.edges, selection, canEditStructure, activeTargets],
  )

  const errors = useMemo(() => validateGraph(value), [value])

  // Shake the error list only when a new message appears after mount (e.g. the
  // user connected an invalid edge), not for errors already present on load.
  const [prevErrors, setPrevErrors] = useState(errors)
  const [shakeKey, setShakeKey] = useState(0)
  if (errors !== prevErrors) {
    setPrevErrors(errors)
    if (hasNewItems(prevErrors, errors)) setShakeKey((count) => count + 1)
  }

  const handleNodesChange = useCallback(
    (changes: NodeChange<ProcessFlowNode>[]) => {
      let moved: Map<string, { x: number; y: number }> | null = null
      const sized: Record<string, { width: number; height: number }> = {}
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) {
          sized[change.id] = change.dimensions
        } else if (change.type === 'position' && change.position) {
          moved ??= new Map()
          moved.set(change.id, change.position)
        } else if (change.type === 'select') {
          setSelection((current) => {
            if (change.selected) return { type: 'node', id: change.id }
            return current?.type === 'node' && current.id === change.id ? null : current
          })
        }
      }
      if (Object.keys(sized).length > 0) {
        setMeasured((current) => ({ ...current, ...sized }))
      }
      if (moved) {
        const positions = moved
        emit({
          ...latest.current,
          nodes: latest.current.nodes.map((node) => {
            const position = positions.get(node.id)
            return position ? { ...node, x: Math.round(position.x), y: Math.round(position.y) } : node
          }),
        })
      }
    },
    [emit],
  )

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type !== 'select') continue
      setSelection((current) => {
        if (change.selected) return { type: 'edge', id: change.id }
        return current?.type === 'edge' && current.id === change.id ? null : current
      })
    }
  }, [])

  const removeElements = useCallback(
    (nodeIds: Set<string>, edgeIds: Set<string>) => {
      if (!canEditStructure) return
      const graph = latest.current
      emit({
        nodes: graph.nodes.filter((node) => !nodeIds.has(node.id)),
        edges: graph.edges.filter(
          (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target),
        ),
      })
      setSelection(null)
    },
    [canEditStructure, emit],
  )

  const handleDelete = useCallback(
    ({ nodes: removedNodes, edges: removedEdges }: { nodes: { id: string }[]; edges: { id: string }[] }) =>
      removeElements(new Set(removedNodes.map((n) => n.id)), new Set(removedEdges.map((e) => e.id))),
    [removeElements],
  )

  const deleteSelection = useCallback(() => {
    if (!selection) return
    if (selection.type === 'node') removeElements(new Set([selection.id]), new Set())
    else removeElements(new Set(), new Set([selection.id]))
  }, [selection, removeElements])

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      canEditStructure && canConnect(latest.current, connection.source, connection.target),
    [canEditStructure],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      const graph = latest.current
      if (!canEditStructure || !canConnect(graph, connection.source, connection.target)) return
      const edge: ProcessEdge = {
        id: generateEdgeId(graph),
        source: connection.source,
        target: connection.target,
      }
      emit({ ...graph, edges: [...graph.edges, edge] })
    },
    [canEditStructure, emit],
  )

  const addNode = useCallback(
    (kind: ProcessNodeKind) => {
      const graph = latest.current
      const rect = canvasRef.current?.getBoundingClientRect()
      const center = screenToFlowPosition({
        x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
        y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
      })
      const offset = (graph.nodes.length % 6) * 28
      const node: ProcessNode = {
        id: generateNodeId(graph, kind),
        kind,
        label: t(`process.defaultLabel.${kind}`),
        x: Math.round(center.x - 90 + offset),
        y: Math.round(center.y - 30 + offset),
        ...(mode === 'order' && kind === 'step' ? { status: 'pending' as const } : {}),
      }
      emit({ ...graph, nodes: [...graph.nodes, node] })
      setSelection({ type: 'node', id: node.id })
    },
    [emit, mode, screenToFlowPosition, t],
  )

  const patchNode = useCallback(
    (id: string, patch: Partial<ProcessNode>) => {
      const graph = latest.current
      emit({ ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) })
    },
    [emit],
  )

  const patchEdge = useCallback(
    (id: string, patch: Partial<ProcessEdge>) => {
      const graph = latest.current
      emit({ ...graph, edges: graph.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)) })
    },
    [emit],
  )

  return (
    <div className={cn('space-y-3', className)}>
      {canEditStructure && (
        <div
          role="toolbar"
          aria-label={t('process.toolbar.label')}
          className="flex flex-wrap items-center gap-1.5"
        >
          {PROCESS_NODE_KINDS.map((kind) => {
            const Icon = KIND_META[kind].icon
            return (
              <Button key={kind} type="button" variant="outline" size="sm" onClick={() => addNode(kind)}>
                <Icon aria-hidden /> {t(`process.toolbar.add.${kind}`)}
              </Button>
            )
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selection}
            onClick={deleteSelection}
          >
            <Trash2 aria-hidden /> {t('process.toolbar.deleteSelected')}
          </Button>
        </div>
      )}

      <div className={cn('grid gap-3', !readOnly && 'lg:grid-cols-[minmax(0,1fr)_280px]')}>
        <div
          ref={canvasRef}
          role="group"
          aria-label={t('process.canvasLabel')}
          className="animate-iris-fade h-[420px] min-w-0 border border-border lg:h-[520px]"
        >
          <ReactFlow<ProcessFlowNode, Edge>
            className="iris-flow"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onDelete={handleDelete}
            isValidConnection={isValidConnection}
            nodesConnectable={canEditStructure}
            nodesDraggable={!readOnly}
            elementsSelectable
            edgesReconnectable={false}
            deleteKeyCode={canEditStructure ? 'Delete' : null}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.75}
            onPaneClick={() => setSelection(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => `var(--iris-proc-${node.type})`}
              className="!hidden sm:!block"
            />
          </ReactFlow>
        </div>

        {!readOnly && (
          <ProcessInspector
            graph={value}
            selection={selection}
            mode={mode}
            canEditStructure={canEditStructure}
            stock={stock}
            articleLinking={articleLinking}
            onNodeChange={patchNode}
            onEdgeChange={patchEdge}
            onDelete={deleteSelection}
          />
        )}
      </div>

      {canEditStructure && (
        <p className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('process.rulesHint')}</p>
      )}

      {!readOnly && errors.length > 0 && (
        <ul
          key={shakeKey}
          role="alert"
          aria-label={t('process.validation.title')}
          className={cn(
            'space-y-1 border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive',
            shakeKey > 0 ? 'animate-iris-shake' : 'animate-iris-rise',
          )}
        >
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Graph canvas + inspector for process templates and per-order processes. */
export function ProcessGraphEditor(props: ProcessGraphEditorProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ProcessGraphEditorInner {...props} />
    </ReactFlowProvider>
  )
}

export default ProcessGraphEditor
