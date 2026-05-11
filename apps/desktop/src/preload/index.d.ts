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

      createWorkOrder: (
        input: import("../renderer/src/types/work-order").CreateWorkOrderInput,
      ) => Promise<import("../renderer/src/types/work-order").WorkOrder>;

      updateWorkOrder: (
        id: string,
        changes: import("../renderer/src/types/work-order").UpdateWorkOrderInput,
      ) => Promise<import("../renderer/src/types/work-order").WorkOrder | null>;

      deleteWorkOrder: (id: string) => Promise<DeleteWorkOrderResponse>;
    };
  }
}
