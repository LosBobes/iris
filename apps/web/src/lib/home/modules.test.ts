import { describe, expect, it } from "vitest";
import { countEnabled, moduleAvailable, NO_MODULES, setModule, visibleNav } from "./modules";

describe("setModule", () => {
  it("refuses a dependent module while its requirement is off", () => {
    expect(setModule(NO_MODULES, "processes", true)).toBe(NO_MODULES);
    expect(moduleAvailable(NO_MODULES, "processes")).toBe(false);
    expect(moduleAvailable(NO_MODULES, "attendance")).toBe(true);
  });

  it("lets a module on once its requirements are, and planning needs both of its own", () => {
    let modules = setModule(NO_MODULES, "stock", true);
    modules = setModule(modules, "processes", true);
    expect(modules.processes).toBe(true);
    expect(moduleAvailable(modules, "planning")).toBe(false);
    modules = setModule(modules, "attendance", true);
    expect(moduleAvailable(modules, "planning")).toBe(true);
    modules = setModule(modules, "planning", true);
    expect(countEnabled(modules)).toBe(4);
  });

  it("switching a requirement off takes the dependents with it", () => {
    const all = { stock: true, processes: true, attendance: true, planning: true, einvoicing: false, edispatch: false };
    expect(setModule(all, "stock", false)).toEqual({ stock: false, processes: false, attendance: true, planning: false, einvoicing: false, edispatch: false });
    expect(setModule(all, "attendance", false)).toEqual({ stock: true, processes: true, attendance: false, planning: false, einvoicing: false, edispatch: false });
  });
});

describe("visibleNav", () => {
  it("shows module entries only while the module is on and admin entries only to admins", () => {
    const labels = (items: { label: string }[]) => items.map((item) => item.label);
    expect(labels(visibleNav(NO_MODULES, "operator"))).toEqual([
      "Kontrolna tabla", "Radni nalozi", "Klijenti", "Katalog", "Dokumentacija", "Pomoć", "Podešavanja",
    ]);
    const all = { stock: true, processes: true, attendance: true, planning: true };
    expect(labels(visibleNav(all, "admin"))).toContain("Planiranje");
    expect(labels(visibleNav(all, "operator"))).not.toContain("Planiranje");
    expect(labels(visibleNav(all, "operator"))).toContain("Moj red");
  });
});
