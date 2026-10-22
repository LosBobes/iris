// The module playground on the landing page follows the real rules of the
// Backoffice switch: "Procesi rada" requires "Magacin", "Planiranje" requires
// "Procesi rada" and "Prisustvo", and turning a requirement off turns its
// dependents off. Pure, mirrored by `normalizeOrganizationModules`.

import {
  DEFAULT_ORGANIZATION_MODULES,
  normalizeOrganizationModules,
  type OrganizationModules,
} from "@/types/settings";

// e-Fakture and e-Otpremnice (D-030) join the playground once they can send
// documents; until then the landing page does not advertise them.
export type ModuleKey = Exclude<keyof OrganizationModules, "einvoicing" | "edispatch">;

export const MODULE_ORDER: ModuleKey[] = ["stock", "processes", "attendance", "planning"];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  stock: "Magacin",
  processes: "Procesi rada",
  attendance: "Prisustvo",
  planning: "Planiranje",
};

/** The modules a module needs switched on before it can be. */
export const MODULE_REQUIREMENTS: Record<ModuleKey, ModuleKey[]> = {
  stock: [],
  processes: ["stock"],
  attendance: [],
  planning: ["processes", "attendance"],
};

export const NO_MODULES: OrganizationModules = DEFAULT_ORGANIZATION_MODULES;

/** True when every requirement of the module is on, so its switch is usable. */
export function moduleAvailable(modules: OrganizationModules, key: ModuleKey): boolean {
  return MODULE_REQUIREMENTS[key].every((requirement) => modules[requirement]);
}

/**
 * Switches one module and cascades: a module cannot come on while a requirement
 * is off (the request is ignored), and switching a requirement off takes its
 * dependents with it.
 */
export function setModule(
  modules: OrganizationModules,
  key: ModuleKey,
  on: boolean,
): OrganizationModules {
  if (on && !moduleAvailable(modules, key)) return modules;
  return normalizeOrganizationModules({ ...modules, [key]: on });
}

export function countEnabled(modules: OrganizationModules): number {
  return MODULE_ORDER.filter((key) => modules[key]).length;
}

export type PreviewRole = "admin" | "operator";

export interface NavPreviewItem {
  label: string;
  /** Shown only while this module is on. */
  module?: ModuleKey;
  adminOnly?: boolean;
}

/** The app's side menu, in its order, with what gates each entry. */
export const NAV_PREVIEW: NavPreviewItem[] = [
  { label: "Kontrolna tabla" },
  { label: "Radni nalozi" },
  { label: "Čeka unos troška", adminOnly: true },
  { label: "Klijenti" },
  { label: "Katalog" },
  { label: "Magacin", module: "stock" },
  { label: "Planiranje", module: "planning", adminOnly: true },
  { label: "Moj red", module: "planning" },
  { label: "Prisustvo", module: "attendance" },
  { label: "Korisnici", adminOnly: true },
  { label: "Dokumentacija" },
  { label: "Pomoć" },
  { label: "Podešavanja" },
];

export function visibleNav(modules: OrganizationModules, role: PreviewRole): NavPreviewItem[] {
  return NAV_PREVIEW.filter(
    (item) => (!item.module || modules[item.module]) && (!item.adminOnly || role === "admin"),
  );
}

/** What each module adds beyond its own menu entry, for the playground's summary. */
export const MODULE_EFFECTS: Record<ModuleKey, string> = {
  stock: "Katalog dobija stanje, rezervisano i raspoloživo, a kontrolna tabla upozorenje o niskim zalihama.",
  processes: "Nalog dobija karticu „Proces“, a završen korak automatski knjiži utrošak u magacinu.",
  attendance: "Dnevna evidencija prisustva, koju koristi i planiranje.",
  planning: "Dnevni plan po mašinama i ljudima, „Moj red“ za operatere, prognoza rokova.",
};
