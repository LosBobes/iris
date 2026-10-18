import type { PlatformTenantExportFile } from "@/types/platform";

/** Triggers a browser download of an organization export. */
export function saveTenantExport({ blob, filename }: PlatformTenantExportFile): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

/** Fetches the organization's export and offers it as a download. */
export async function downloadTenantExport(slug: string): Promise<void> {
  saveTenantExport(await window.api.platformExportTenant(slug));
}
