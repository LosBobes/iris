import { ipcMain } from "electron";
import type { OrganizationSettings } from "../../../model/settings";
import {
  createConfiguredIrisApiClient,
  mapIrisApiErrorToUserMessage,
} from "../shared/iris-api-client";

export function registerSettingsHandlers(): void {
  ipcMain.handle(
    "settings:get",
    async (): Promise<OrganizationSettings> => {
      try {
        return await createConfiguredIrisApiClient().getSettings();
      } catch (error) {
        throw new Error(
          mapIrisApiErrorToUserMessage(error, "Greška pri učitavanju podešavanja."),
        );
      }
    },
  );
}
