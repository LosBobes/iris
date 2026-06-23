import { ipcMain } from "electron";
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemListResult,
  CatalogItemQuery,
} from "../../../model/catalog";
import {
  createConfiguredIrisApiClient,
  mapIrisApiErrorToUserMessage,
} from "../shared/iris-api-client";

function toRendererError(error: unknown, fallbackMessage: string): Error {
  return new Error(mapIrisApiErrorToUserMessage(error, fallbackMessage));
}

export function registerCatalogHandlers(): void {
  ipcMain.handle(
    "catalog:list",
    async (_event, query?: CatalogItemQuery): Promise<CatalogItemListResult> => {
      try {
        return await createConfiguredIrisApiClient().getCatalogItems(query);
      } catch (error) {
        throw toRendererError(error, "Greška pri učitavanju kataloga.");
      }
    },
  );

  ipcMain.handle(
    "catalog:create",
    async (_event, input: CatalogItemInput): Promise<CatalogItem> => {
      try {
        return await createConfiguredIrisApiClient().createCatalogItem(input);
      } catch (error) {
        throw toRendererError(error, "Greška pri čuvanju stavke kataloga.");
      }
    },
  );

  ipcMain.handle(
    "catalog:update",
    async (
      _event,
      { id, ...input }: { id: string } & CatalogItemInput,
    ): Promise<CatalogItem> => {
      try {
        return await createConfiguredIrisApiClient().updateCatalogItem(
          id,
          input,
        );
      } catch (error) {
        throw toRendererError(error, "Greška pri čuvanju stavke kataloga.");
      }
    },
  );

  ipcMain.handle(
    "catalog:delete",
    async (_event, { id }: { id: string }): Promise<{ success: boolean }> => {
      try {
        return await createConfiguredIrisApiClient().deleteCatalogItem(id);
      } catch (error) {
        throw toRendererError(error, "Greška pri brisanju stavke kataloga.");
      }
    },
  );
}
