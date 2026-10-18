// Shared PlatformTenant pieces for the Backoffice component tests.
import type { PlatformTenantHealth, PlatformTenantNotes } from "@/types/platform";

export const emptyHealth: PlatformTenantHealth = {
  lastLoginAt: null,
  activeUsers7d: 0,
  activeUsers30d: 0,
  workOrdersCreated30d: 0,
  openWorkOrders: 0,
  dormant: false,
};

export const emptyNotes: PlatformTenantNotes = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  plan: "",
  notes: "",
  updatedAt: null,
  updatedBy: null,
};
