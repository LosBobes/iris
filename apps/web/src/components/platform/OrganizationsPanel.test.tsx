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

const demo: PlatformTenant = {
  id: "tenant-demo",
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
    await userEvent.click(await screen.findByRole("button", { name: strings.edit }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByText(strings.slugChangeWarning)).not.toBeInTheDocument();
    const slug = within(dialog).getByLabelText(strings.slug);
    await userEvent.clear(slug);
    await userEvent.type(slug, "demo-2");
    expect(within(dialog).getByText(strings.slugChangeWarning)).toBeInTheDocument();
    // No admin fields when editing.
    expect(within(dialog).queryByLabelText(strings.adminPassword)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: strings.save }));
    expect(updatePlatformTenant).toHaveBeenCalledWith("demo", { name: "Demo Štamparija", slug: "demo-2" });
  });

  it("suspends only after confirming, and offers reactivation after", async () => {
    const suspended = { ...demo, suspendedAt: "2026-10-17T08:00:00Z" };
    const setPlatformTenantSuspended = vi.fn(async () => suspended);
    const getPlatformTenants = vi.fn().mockResolvedValueOnce([demo]).mockResolvedValueOnce([suspended]);
    vi.stubGlobal("api", { getPlatformTenants, setPlatformTenantSuspended });

    render(<OrganizationsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: strings.suspend }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(strings.suspendBody);
    expect(setPlatformTenantSuspended).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: strings.suspend }));
    expect(setPlatformTenantSuspended).toHaveBeenCalledWith("demo", true);
    expect(await screen.findByRole("button", { name: strings.reactivate })).toBeInTheDocument();
    expect(screen.getByText(/Suspendovana/)).toBeInTheDocument();
  });
});

describe("suggestSlug", () => {
  it("turns a Serbian name into a sign-in slug", () => {
    expect(suggestSlug("Štamparija Čobanović & sinovi")).toBe("stamparija-cobanovic-sinovi");
    expect(suggestSlug("  --Đak--  ")).toBe("djak");
  });
});
