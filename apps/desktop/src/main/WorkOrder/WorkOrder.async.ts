import { ipcMain } from "electron";
import type {
  WorkOrder,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../../../model/work-order";
import {
  createConfiguredIrisApiClient,
  mapIrisApiErrorToUserMessage,
} from "../shared/iris-api-client";

function toRendererError(error: unknown, fallbackMessage: string): Error {
  return new Error(mapIrisApiErrorToUserMessage(error, fallbackMessage));
}

export function registerWorkOrderHandlers(): void {
  ipcMain.handle("workorders:getAll", async (): Promise<WorkOrder[]> => {
    try {
      return await createConfiguredIrisApiClient().getWorkOrders();
    } catch (error) {
      throw toRendererError(error, "Greška pri učitavanju radnih naloga.");
    }
  });

  ipcMain.handle("workorders:getOperators", async (): Promise<string[]> => {
    try {
      return await createConfiguredIrisApiClient().getWorkOrderOperators();
    } catch (error) {
      throw toRendererError(error, "Greška pri učitavanju operatora.");
    }
  });

  ipcMain.handle(
    "workorders:getById",
    async (_event, { id }: { id: string }): Promise<WorkOrder | null> => {
      try {
        return await createConfiguredIrisApiClient().getWorkOrderById(id);
      } catch (error) {
        throw toRendererError(error, "Greška pri učitavanju radnog naloga.");
      }
    },
  );

  ipcMain.handle(
    "workorders:create",
    async (_event, input: CreateWorkOrderInput): Promise<WorkOrder> => {
      try {
        return await createConfiguredIrisApiClient().createWorkOrder(input);
      } catch (error) {
        throw toRendererError(error, "Greška pri kreiranju radnog naloga.");
      }
    },
  );

  ipcMain.handle(
    "workorders:update",
    async (
      _event,
      { id, ...changes }: { id: string } & UpdateWorkOrderInput,
    ): Promise<WorkOrder | null> => {
      try {
        return await createConfiguredIrisApiClient().updateWorkOrder(id, changes);
      } catch (error) {
        throw toRendererError(error, "Greška pri ažuriranju radnog naloga.");
      }
    },
  );

  ipcMain.handle(
    "workorders:delete",
    async (
      _event,
      { id }: { id: string },
    ): Promise<{ success: boolean; message?: string }> => {
      try {
        return await createConfiguredIrisApiClient().deleteWorkOrder(id);
      } catch (error) {
        throw toRendererError(error, "Greška pri brisanju radnog naloga.");
      }
    },
  );
}
