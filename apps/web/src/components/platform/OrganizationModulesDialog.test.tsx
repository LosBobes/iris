// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { OrganizationModulesDialog } from "./OrganizationModulesDialog";
import { OrganizationsPanel } from "./OrganizationsPanel";
import { ApiError } from "@/lib/errors";
import { sr } from "@/i18n/locales/sr";
import type { PlatformTenant } from "@/types/platform";
import "@/i18n";
import { emptyHealth, emptyNotes } from "./test-tenants";

const strings = sr.platform.orgs.modules;

const demo: PlatformTenant = {
  id: "t1",
  slug: "demo",
  name: "Demo Štamparija",
  createdAt: "2026-02-01 00:00:00",
  suspendedAt: null,
  users: 2,
  admins: 1,
  modules: { processes: false, stock: false },
  health: emptyHealth,
  notes: emptyNotes,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(tenant: PlatformTenant = demo, onSaved = vi.fn()) {
  render(<OrganizationModulesDialog tenant={tenant} onClose={vi.fn()} onSaved={onSaved} />);
  return {
    stock: screen.getByRole("switch", { name: strings.stock }),
    processes: screen.getByRole("switch", { name: strings.processes }),
    onSaved,
  };
}

describe("OrganizationModulesDialog", () => {
  it("starts off, says so, and disables processes until stock is on", async () => {
    const { stock, processes } = open();
    expect(stock).not.toBeChecked();
    expect(processes).not.toBeChecked();
    expect(processes).toBeDisabled();
    expect(screen.getByText(strings.requiresStock)).toBeInTheDocument();
    expect(screen.getByText(strings.defaultOff)).toBeInTheDocument();

    await userEvent.click(stock);
    expect(processes).toBeEnabled();
  });

  it("turns processes off together with stock and saves both values", async () => {
    const saved = { ...demo, modules: { processes: false, stock: false } };
    const setPlatformTenantModules = vi.fn().mockResolvedValue(saved);
    vi.stubGlobal("api", { setPlatformTenantModules });
    const { stock, processes, onSaved } = open({ ...demo, modules: { processes: true, stock: true } });
    expect(processes).toBeChecked();

    await userEvent.click(stock);
    expect(processes).not.toBeChecked();
    expect(processes).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: sr.common.save }));
    expect(setPlatformTenantModules).toHaveBeenCalledWith("demo", { processes: false, stock: false });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it("sends the chosen combination and shows the API's reason on failure", async () => {
    const setPlatformTenantModules = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Nešto nije u redu.", { status: 422, url: "x", method: "PUT" }));
    vi.stubGlobal("api", { setPlatformTenantModules });
    const { stock, processes, onSaved } = open();
    await userEvent.click(stock);
    await userEvent.click(processes);
    await userEvent.click(screen.getByRole("button", { name: sr.common.save }));
    expect(setPlatformTenantModules).toHaveBeenCalledWith("demo", { processes: true, stock: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("Nešto nije u redu.");
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("OrganizationsPanel modules", () => {
  it("shows module badges and the Moduli button, and refreshes after saving", async () => {
    const enabled = { ...demo, modules: { processes: true, stock: true } };
    vi.stubGlobal("api", {
      getPlatformTenants: vi.fn().mockResolvedValueOnce([demo]).mockResolvedValueOnce([enabled]),
      setPlatformTenantModules: vi.fn().mockResolvedValue(enabled),
    });
    render(<OrganizationsPanel />);
    expect(await screen.findByTestId("module-badges")).toHaveTextContent(strings.none);

    await userEvent.click(screen.getByRole("button", { name: strings.button }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("switch", { name: strings.stock }));
    await userEvent.click(within(dialog).getByRole("switch", { name: strings.processes }));
    await userEvent.click(within(dialog).getByRole("button", { name: sr.common.save }));

    expect(await screen.findByRole("status")).toHaveTextContent("Demo Štamparija");
    const badges = await screen.findByTestId("module-badges");
    expect(badges).toHaveTextContent(strings.stock);
    expect(badges).toHaveTextContent(strings.processes);
  });

  it("keeps the Procesi button and notes that templates are prepared in advance while off", async () => {
    vi.stubGlobal("api", {
      getPlatformTenants: vi.fn().mockResolvedValue([demo]),
      getPlatformProcessTemplates: vi.fn().mockResolvedValue([]),
    });
    render(<OrganizationsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: sr.platform.orgs.processes }));
    expect(await screen.findByTestId("processes-module-off")).toHaveTextContent(strings.templatesPrepNote);
  });
});
