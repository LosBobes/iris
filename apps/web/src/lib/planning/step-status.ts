import type { ProcessStepStatus, WorkOrderProcess } from '@/types/process'

/**
 * Sets one step's status on an order's process through the ordinary process
 * update: fetches the current graph and PUTs it back with only that node's
 * `status` changed (a status-only change, which operators may make).
 * Returns the saved process.
 */
export async function setProcessStepStatus(
  workOrderId: string,
  stepNodeId: string,
  status: ProcessStepStatus,
): Promise<WorkOrderProcess> {
  const process = await window.api.getWorkOrderProcess(workOrderId)
  if (!process) throw new Error('Nalog nema proces rada.')
  if (!process.graph.nodes.some((node) => node.id === stepNodeId)) {
    throw new Error('Korak više ne postoji u procesu naloga.')
  }
  const graph = {
    ...process.graph,
    nodes: process.graph.nodes.map((node) => (node.id === stepNodeId ? { ...node, status } : node)),
  }
  return window.api.updateWorkOrderProcess(workOrderId, { graph })
}
