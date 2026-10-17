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
  validateGraph,
} from '@/lib/process/graph'
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
}

function ProcessGraphEditorInner({
  mode,
  value,
  onChange,
  canEditStructure = true,
  className,
}: ProcessGraphEditorProps): React.JSX.Element {
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

  const readyIds = useMemo(
    () => (mode === 'order' ? new Set(readySteps(value).map((step) => step.id)) : new Set<string>()),
    [mode, value],
  )

  const nodes = useMemo<ProcessFlowNode[]>(
    () =>
      value.nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: { x: node.x, y: node.y },
        measured: measured[node.id],
        data: { node, mode, ready: readyIds.has(node.id) },
        selected: selection?.type === 'node' && selection.id === node.id,
        deletable: canEditStructure,
        connectable: canEditStructure,
        draggable: true,
      })),
    [value.nodes, mode, readyIds, selection, canEditStructure, measured],
  )

  const edges = useMemo<Edge[]>(
    () =>
      value.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: selection?.type === 'edge' && selection.id === edge.id,
        deletable: canEditStructure,
        reconnectable: false,
      })),
    [value.edges, selection, canEditStructure],
  )

  const errors = useMemo(() => validateGraph(value), [value])

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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div
          ref={canvasRef}
          role="group"
          aria-label={t('process.canvasLabel')}
          className="h-[420px] min-w-0 border border-border lg:h-[520px]"
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
            nodesDraggable
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

        <ProcessInspector
          graph={value}
          selection={selection}
          mode={mode}
          canEditStructure={canEditStructure}
          onNodeChange={patchNode}
          onEdgeChange={patchEdge}
          onDelete={deleteSelection}
        />
      </div>

      {canEditStructure && (
        <p className="text-[11px] text-[color:var(--iris-ink-soft)]">{t('process.rulesHint')}</p>
      )}

      {errors.length > 0 && (
        <ul
          role="alert"
          aria-label={t('process.validation.title')}
          className="space-y-1 border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
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
