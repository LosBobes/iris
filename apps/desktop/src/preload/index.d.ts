import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  // Represents an authenticated application user, mirroring model/user.ts
  interface AuthenticatedUser {
    id: string;
    username: string;
    role: "admin" | "user";
  }

  // Response shape returned by the 'auth:login' IPC channel
  interface LoginResponse {
    success: boolean;
    error?: string;
    user?: AuthenticatedUser;
  }

  interface DeleteWorkOrderResponse {
    success: boolean;
    message?: string;
  }

  interface BackendStatus {
    ready: boolean;
    message?: string;
  }

  interface Window {
    electron: ElectronAPI;
    api: {
      getAppVersion: () => Promise<string>;

      getBackendStatus: () => Promise<BackendStatus>;

      login: (credentials: {
        orgSlug: string;
        username: string;
        password: string;
      }) => Promise<LoginResponse>;

      getWorkOrders: () => Promise<
        import("../renderer/src/types/work-order").WorkOrder[]
      >;

      getWorkOrderOperators: () => Promise<string[]>;

      getWorkOrderById: (
        id: string,
      ) => Promise<import("../renderer/src/types/work-order").WorkOrder | null>;

      reserveWorkOrderNumber: () => Promise<
        import("../renderer/src/types/work-order").ReservedOrderNumber
      >;

      releaseWorkOrderNumber: (orderNumber: string) => Promise<void>;

      acquireWorkOrderEditLock: (
        id: string,
      ) => Promise<import("../renderer/src/types/work-order").EditLockResult>;

      releaseWorkOrderEditLock: (id: string) => Promise<void>;

      createWorkOrder: (
        input: import("../renderer/src/types/work-order").CreateWorkOrderInput,
      ) => Promise<import("../renderer/src/types/work-order").WorkOrder>;

      updateWorkOrder: (
        id: string,
        changes: import("../renderer/src/types/work-order").UpdateWorkOrderInput,
      ) => Promise<import("../renderer/src/types/work-order").WorkOrder | null>;

      deleteWorkOrder: (id: string) => Promise<DeleteWorkOrderResponse>;

      getCatalogItems: (
        query?: import("../renderer/src/types/catalog").CatalogItemQuery,
      ) => Promise<import("../renderer/src/types/catalog").CatalogItemListResult>;

      createCatalogItem: (
        input: import("../renderer/src/types/catalog").CatalogItemInput,
      ) => Promise<import("../renderer/src/types/catalog").CatalogItem>;

      updateCatalogItem: (
        id: string,
        input: import("../renderer/src/types/catalog").CatalogItemInput,
      ) => Promise<import("../renderer/src/types/catalog").CatalogItem>;

      deleteCatalogItem: (id: string) => Promise<{ success: boolean }>;

      getSettings: () => Promise<
        import("../renderer/src/types/settings").OrganizationSettings
      >;
    };
  }
}
