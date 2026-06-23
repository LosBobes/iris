// Shop-wide organization settings (renderer view). Mirrors model/settings.ts and
// the OrganizationSettings schema in iris-api/openapi.yaml.

export interface OrganizationSettings {
  /** The shop's display name shown in the app branding. */
  firmName: string;
}

/** Fallback firm name used before settings load or when the request fails. */
export const DEFAULT_FIRM_NAME = "Grafika Čobanović";
