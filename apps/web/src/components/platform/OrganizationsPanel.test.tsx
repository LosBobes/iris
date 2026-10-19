// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { OrganizationsPanel } from "./OrganizationsPanel";
import { suggestSlug } from "./OrganizationFormDialog";
import { ApiError } from "@/lib/errors";
import { sr } from "@/i18n/locales/sr";
import type { PlatformTenant } from "@/types/platform";
import "@/i18n";
import { emptyHealth, emptyNotes } from "./test-tenants";

const strings = sr.platform.orgs;

/** Opens the row's "⋯" menu and returns the entry with the given name. */
async function menuItem(name: string | RegExp): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: strings.moreActions }));
  return screen.findByRole("menuitem", { name });
}

const demo: PlatformTenant = {
  id: "tenant-demo",
  slug: "demo",
  name: "Demo Firma",
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

describe("OrganizationsPanel", () => {
  it("creates an organization, suggesting the slug from the name", async () => {
    const created = { ...demo, id: "tenant-novi", slug: "stampa-djuric", name: "Štampa Đurić", users: 1 };
    const createPlatformTenant = vi.fn(async () => created);
    const getPlatformTenants = vi.fn().mockResolvedValueOnce([demo]).mockResolvedValueOnce([demo, created]);
    vi.stubGlobal("api", { getPlatformTenants, createPlatformTenant });

    render(<OrganizationsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: strings.create }));
    const dialog = screen.getByRole("dialog");

    // Validation runs before anything is sent.
    await userEvent.click(within(dialog).getByRole("button", { name: strings.createSubmit }));
    expect(within(dialog).getByText(strings.errors.nameRequired)).toBeInTheDocument();
    expect(createPlatformTenant).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(strings.name), "Štampa Đurić");
    expect(within(dialog).getByLabelText(strings.slug)).toHaveValue("stampa-djuric");
    await userEvent.type(within(dialog).getByLabelText(strings.adminUsername), "sef");
    await userEvent.type(within(dialog).getByLabelText(strings.adminPassword), "lozinka123");
    await userEvent.click(within(dialog).getByRole("button", { name: strings.createSubmit }));

    expect(createPlatformTenant).toHaveBeenCalledWith({
      name: "Štampa Đurić",
      slug: "stampa-djuric",
      adminUsername: "sef",
      adminPassword: "lozinka123",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Štampa Đurić");
    expect(await screen.findByText("/login/stampa-djuric")).toBeInTheDocument();
  });

  it("shows the API's reason when the slug is taken", async () => {
    vi.stubGlobal("api", {
      getPlatformTenants: vi.fn(async () => [demo]),
      createPlatformTenant: vi.fn(async () => {
        throw new ApiError("Organizacija sa tom oznakom već postoji.", { status: 422, url: "/platform/tenants", method: "POST" });
      }),
    });
    render(<OrganizationsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: strings.create }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(strings.name), "Demo");
    await userEvent.type(within(dialog).getByLabelText(strings.adminUsername), "sef");
    await userEvent.type(within(dialog).getByLabelText(strings.adminPassword), "lozinka123");
    await userEvent.click(within(dialog).getByRole("button", { name: strings.createSubmit }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Organizacija sa tom oznakom već postoji.");
  });

  it("warns before a slug change and saves the edit", async () => {
    const updatePlatformTenant = vi.fn(async () => ({ ...demo, slug: "demo-2" }));
    vi.stubGlobal("api", { getPlatformTenants: vi.fn(async () => [demo]), updatePlatformTenant });
    render(<OrganizationsPanel />);
    await userEvent.click(await menuItem(strings.edit));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByText(strings.slugChangeWarning)).not.toBeInTheDocument();
    const slug = within(dialog).getByLabelText(strings.slug);
    await userEvent.clear(slug);
    await userEvent.type(slug, "demo-2");
    expect(within(dialog).getByText(strings.slugChangeWarning)).toBeInTheDocument();
    // No admin fields when editing.
    expect(within(dialog).queryByLabelText(strings.adminPassword)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: strings.save }));
    expect(updatePlatformTenant).toHaveBeenCalledWith("demo", { name: "Demo Firma", slug: "demo-2" });
  });

  it("suspends only after confirming, and offers reactivation after", async () => {
    const suspended = { ...demo, suspendedAt: "2026-10-17T08:00:00Z" };
    const setPlatformTenantSuspended = vi.fn(async () => suspended);
    const getPlatformTenants = vi.fn().mockResolvedValueOnce([demo]).mockResolvedValueOnce([suspended]);
    vi.stubGlobal("api", { getPlatformTenants, setPlatformTenantSuspended });

    render(<OrganizationsPanel />);
    await userEvent.click(await menuItem(strings.suspend));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(strings.suspendBody);
    expect(setPlatformTenantSuspended).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: strings.suspend }));
    expect(setPlatformTenantSuspended).toHaveBeenCalledWith("demo", true);
    expect(await screen.findByText(/Suspendovana/)).toBeInTheDocument();
    expect(await menuItem(strings.reactivate)).toBeInTheDocument();
  });

  it("does not offer deleting an organization that is not suspended", async () => {
    vi.stubGlobal("api", { getPlatformTenants: vi.fn(async () => [demo]) });
    render(<OrganizationsPanel />);
    const item = await menuItem(new RegExp(strings.deleteOrg));
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveTextContent(strings.deleteHint);
  });

  it("exports an organization's data", async () => {
    const platformExportTenant = vi.fn(async () => ({ blob: new Blob(["{}"]), filename: "iris-demo.json" }));
    vi.stubGlobal("api", { getPlatformTenants: vi.fn(async () => [demo]), platformExportTenant });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<OrganizationsPanel />);
    await userEvent.click(await menuItem(strings.exportData));
    expect(platformExportTenant).toHaveBeenCalledWith("demo");
    expect(await screen.findByRole("status")).toHaveTextContent("Demo Firma");
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("deletes a suspended organization only after the exact slug is typed", async () => {
    const suspended = { ...demo, suspendedAt: "2026-10-17T08:00:00Z" };
    const platformDeleteTenant = vi.fn(async () => ({
      slug: "demo",
      name: demo.name,
      deletedAt: "2026-10-18T08:00:00Z",
      totalRows: 42,
      rows: { users: 2 },
    }));
    const getPlatformTenants = vi.fn().mockResolvedValueOnce([suspended]).mockResolvedValueOnce([]);
    vi.stubGlobal("api", { getPlatformTenants, platformDeleteTenant });

    render(<OrganizationsPanel />);
    await userEvent.click(await menuItem(strings.deleteOrg));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(strings.deleteIrreversible);
    const confirm = within(dialog).getByRole("button", { name: strings.deleteConfirm });
    expect(confirm).toBeDisabled();

    const input = within(dialog).getByRole("textbox");
    await userEvent.type(input, "dem");
    expect(confirm).toBeDisabled();
    await userEvent.type(input, "o ");
    expect(confirm).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "demo");
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(platformDeleteTenant).toHaveBeenCalledWith("demo", "demo");
    expect(await screen.findByRole("status")).toHaveTextContent("42");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getPlatformTenants).toHaveBeenCalledTimes(2);
  });

  it("shows the server's reason when deletion is refused", async () => {
    const suspended = { ...demo, suspendedAt: "2026-10-17T08:00:00Z" };
    vi.stubGlobal("api", {
      getPlatformTenants: vi.fn(async () => [suspended]),
      platformDeleteTenant: vi.fn(async () => {
        throw new ApiError("Potvrda se ne poklapa.", { status: 422, url: "/platform/tenants/demo", method: "DELETE" });
      }),
    });
    render(<OrganizationsPanel />);
    await userEvent.click(await menuItem(strings.deleteOrg));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "demo");
    await userEvent.click(within(dialog).getByRole("button", { name: strings.deleteConfirm }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Potvrda se ne poklapa.");
  });
});

describe("suggestSlug", () => {
  it("turns a Serbian name into a sign-in slug", () => {
    expect(suggestSlug("Štamparija Čobanović & sinovi")).toBe("stamparija-cobanovic-sinovi");
    expect(suggestSlug("  --Đak--  ")).toBe("djak");
  });
});
