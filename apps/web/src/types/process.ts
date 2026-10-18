// Work-order process graph shapes. Contract-sync point with the Process*
// schemas in iris-api/openapi.yaml and internal/domain/types.go.

export type ProcessNodeKind = 'step' | 'input' | 'product' | 'byproduct'
export type ProcessStepStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export const PROCESS_NODE_KINDS: ProcessNodeKind[] = ['step', 'input', 'product', 'byproduct']
export const PROCESS_STEP_STATUSES: ProcessStepStatus[] = ['pending', 'in_progress', 'done', 'skipped']

export interface ProcessNode {
  id: string
  kind: ProcessNodeKind
  label: string
  x: number
  y: number
  /** Planned quantity; item nodes only. */
  quantity?: number
  /** Item nodes only. */
  unit?: string
  /** Optional link to a catalog item; item nodes only. */
  catalogItemId?: string
  note?: string
  /** Per-order state; step nodes only. */
  status?: ProcessStepStatus
  /** Per-order state; item nodes only. */
  actualQuantity?: number
}

export interface ProcessEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface ProcessGraph {
  nodes: ProcessNode[]
  edges: ProcessEdge[]
}

export interface ProcessTemplate {
  id: string
  name: string
  description: string
  isDefault: boolean
  graph: ProcessGraph
  createdAt: string
  updatedAt: string
}

export interface ProcessTemplateInput {
  name: string
  description?: string
  isDefault?: boolean
  graph: ProcessGraph
}

export interface WorkOrderProcess {
  workOrderId: string
  /** Null after the template was deleted. */
  templateId: string | null
  templateName: string
  graph: ProcessGraph
  updatedAt: string
  updatedBy: string
}

export interface ApplyProcessTemplateInput {
  templateId: string
}

export interface WorkOrderProcessInput {
  graph: ProcessGraph
}
