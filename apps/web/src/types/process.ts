// Work-order process graph shapes. Contract-sync point with the Process*
// schemas in iris-api/openapi.yaml and internal/domain/types.go.

export type ProcessNodeKind = 'step' | 'input' | 'product' | 'byproduct'
export type ProcessStepStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export const PROCESS_NODE_KINDS: ProcessNodeKind[] = ['step', 'input', 'product', 'byproduct']
/** The roles an item node can switch between in place. */
export const PROCESS_ITEM_KINDS: ProcessNodeKind[] = ['input', 'product', 'byproduct']
export const PROCESS_STEP_STATUSES: ProcessStepStatus[] = ['pending', 'in_progress', 'done', 'skipped']

export interface ProcessNode {
  id: string
  kind: ProcessNodeKind
  label: string
  x: number
  y: number
  /**
   * Planned quantity **per unit of the order** (D-028); item nodes only. Scaled
   * by the order's `jobDetails.quantity` wherever a planned amount is used,
   * unless the process copy is flagged `quantitiesPerOrder`.
   */
  quantity?: number
  /** Item nodes only. */
  unit?: string
  /** Optional link to a catalog item; item nodes only. */
  catalogItemId?: string
  note?: string
  /** Marks a starting step (any number of steps may be marked); step nodes only. */
  start?: boolean
  /**
   * Marks a product/byproduct as an output of the process even when a later
   * step also consumes it; product and byproduct nodes only.
   */
  final?: boolean
  /** Planning (D-026), step nodes only: the machine type the step runs on. */
  machineTypeId?: string
  /** Planning, step nodes only: people the step needs (1-50; absent = 1). */
  crewSize?: number
  /** Planning, step nodes only: fixed minutes per order. */
  setupMinutes?: number
  /** Planning, step nodes only: minutes per unit of the order's quantity. */
  minutesPerUnit?: number
  /** Per-order state; step nodes only. */
  status?: ProcessStepStatus
  /**
   * Per-order state; item nodes only. An absolute amount for the whole order as
   * the operator recorded it; never multiplied by the order's quantity.
   */
  actualQuantity?: number
  /**
   * Actual step times (D-028), RFC 3339 UTC; step nodes only. The server fills
   * them on status transitions (in_progress → startedAt, done/skipped →
   * finishedAt; pending clears both); explicit values are kept as corrections.
   */
  startedAt?: string
  finishedAt?: string
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
  /**
   * True on copies made before item quantities became per unit (D-028): their
   * planned quantities are absolute per-order amounts and are not scaled.
   * False on every copy created since; re-attaching a template clears it.
   */
  quantitiesPerOrder: boolean
  updatedAt: string
  updatedBy: string
}

export interface ApplyProcessTemplateInput {
  templateId: string
}

export interface WorkOrderProcessInput {
  graph: ProcessGraph
}
