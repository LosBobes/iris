import { ipcMain } from "electron";
import type {
  WorkOrder,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../../../model/work-order";
import { loadFixtureJson } from "../shared/load-fixture";

const DEFAULT_SHIPPING = {
  deliveryMethod: null,
  hasPackaging: false,
  hasLabeling: false,
  isFragile: false,
  requiresSignature: false,
  hasInsurance: false,
  shippingAddress: null,
} as const;

/** Ensure fixture records that predate the schema expansion have all fields. */
function normalizeWorkOrder(
  raw: Partial<WorkOrder> & { id: string },
): WorkOrder {
  return {
    id: raw.id,
    orderNumber: raw.orderNumber ?? "",
    clientName: raw.clientName ?? "",
    contactPerson: raw.contactPerson ?? null,
    jobDescription: raw.jobDescription ?? "",
    jobDetails: raw.jobDetails ?? null,
    billingDocumentType: raw.billingDocumentType ?? null,
    billingDocumentNumber: raw.billingDocumentNumber ?? null,
    shipping: {
      ...DEFAULT_SHIPPING,
      ...raw.shipping,
    },
    issuedBy: raw.issuedBy ?? "",
    executedBy: raw.executedBy ?? null,
    issueDate: raw.issueDate ?? "",
    dueDate: raw.dueDate ?? null,
    isCompleted: raw.isCompleted ?? false,
    status: raw.status ?? "active",
    price: raw.price ?? null,
    note: raw.note ?? null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    completionDate: raw.completionDate ?? null,
  };
}

export function registerWorkOrderHandlers(): void {
  const rawOrders = loadFixtureJson<Partial<WorkOrder>[]>("work-orders.json");
  const workOrders: WorkOrder[] = rawOrders.map((raw) =>
    normalizeWorkOrder(raw as Partial<WorkOrder> & { id: string }),
  );
  let sequenceCounter = workOrders.length + 1;

  function generateOrderNumber(): string {
    const year = new Date().getFullYear();
    const num = String(sequenceCounter++).padStart(4, "0");
    return `RN-${year}-${num}`;
  }

  ipcMain.handle("workorders:getAll", async (): Promise<WorkOrder[]> => {
    return workOrders;
  });

  ipcMain.handle("workorders:getOperators", async (): Promise<string[]> => {
    const operators = [...new Set(workOrders.map((order) => order.issuedBy))];
    return operators.sort();
  });

  ipcMain.handle(
    "workorders:getById",
    async (_event, { id }: { id: string }): Promise<WorkOrder | null> => {
      return workOrders.find((order) => order.id === id) ?? null;
    },
  );

  ipcMain.handle(
    "workorders:create",
    async (_event, input: CreateWorkOrderInput): Promise<WorkOrder> => {
      const now = new Date().toISOString();
      const newOrder: WorkOrder = {
        id: String(sequenceCounter),
        orderNumber: generateOrderNumber(),
        clientName: input.clientName,
        contactPerson: input.contactPerson ?? null,
        jobDescription: input.jobDescription,
        jobDetails: input.jobDetails ?? null,
        billingDocumentType: input.billingDocumentType ?? null,
        billingDocumentNumber: input.billingDocumentNumber ?? null,
        shipping: { ...DEFAULT_SHIPPING, ...input.shipping },
        issuedBy: input.issuedBy,
        executedBy: null,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        isCompleted: false,
        status: "active",
        price: input.price,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
        completionDate: null,
      };
      workOrders.push(newOrder);
      return newOrder;
    },
  );

  ipcMain.handle(
    "workorders:update",
    async (
      _event,
      { id, ...changes }: { id: string } & UpdateWorkOrderInput,
    ): Promise<WorkOrder | null> => {
      const index = workOrders.findIndex((order) => order.id === id);
      if (index === -1) return null;

      const updated: WorkOrder = {
        ...workOrders[index],
        ...changes,
        updatedAt: new Date().toISOString(),
      };
      workOrders[index] = updated;
      return updated;
    },
  );

  ipcMain.handle(
    "workorders:delete",
    async (
      _event,
      { id }: { id: string },
    ): Promise<{ success: boolean; message?: string }> => {
      const index = workOrders.findIndex((order) => order.id === id);
      if (index === -1) {
        return { success: false, message: "Radni nalog nije pronađen." };
      }
      workOrders.splice(index, 1);
      return { success: true };
    },
  );
}
