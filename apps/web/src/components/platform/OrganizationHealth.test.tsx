// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { arrangeOrganizations, OrganizationsPanel } from "./OrganizationsPanel";
import { OrganizationNotesDialog } from "./OrganizationNotesDialog";
import { sr } from "@/i18n/locales/sr";
import type { PlatformTenant } from "@/types/platform";
import "@/i18n";
import { emptyHealth, emptyNotes } from "./test-tenants";

const strings = sr.platform.orgs;

function tenant(overrides: Partial<PlatformTenant> & { slug: string }): PlatformTenant {
  return {
    id: `tenant-${overrides.slug}`,
    name: overrides.slug,
    createdAt: "2026-01-01 00:00:00",
    suspendedAt: null,
    users: 1,
    admins: 1,
    modules: { processes: false, stock: false },
    ...overrides,
    health: { ...emptyHealth, ...overrides.health },
    notes: { ...emptyNotes, ...overrides.notes },
  };
}

const busy = tenant({
  slug: "busy",
  name: "Aktivna Štampa",
  createdAt: "2026-03-01 00:00:00",
  health: {
    ...emptyHealth,
    lastLoginAt: "2026-10-17T08:30:00Z",
    activeUsers7d: 3,
    activeUsers30d: 5,
    workOrdersCreated30d: 12,
    openWorkOrders: 4,
  },
});
const quiet = tenant({
  slug: "quiet",
  name: "Zaspala Štampa",
  createdAt: "2025-01-01 00:00:00",
  health: { ...emptyHealth, lastLoginAt: "2026-05-01T10:00:00Z", dormant: true },
});
const stopped = tenant({
  slug: "stopped",
  name: "Blokirana Štampa",
  suspendedAt: "2026-09-01T00:00:00Z",
  health: { ...emptyHealth, dormant: true },
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("arrangeOrganizations", () => {
  const all = [quiet, stopped, busy];
  const slugs = (list: PlatformTenant[]): string[] => list.map((item) => item.slug);

  it("sorts by name, last sign-in, activity and creation date", () => {
    expect(slugs(arrangeOrganizations(all, "name", "all"))).toEqual(["busy", "stopped", "quiet"]);
    // Never signed in goes last.
    expect(slugs(arrangeOrganizations(all, "lastLogin", "all"))).toEqual(["busy", "quiet", "stopped"]);
    expect(slugs(arrangeOrganizations(all, "activity", "all"))[0]).toBe("busy");
    expect(slugs(arrangeOrganizations(all, "created", "all"))).toEqual(["busy", "stopped", "quiet"]);
  });

  it("filters active, dormant (not suspended) and suspended organizations", () => {
    expect(slugs(arrangeOrganizations(all, "name", "active"))).toEqual(["busy"]);
    expect(slugs(arrangeOrganizations(all, "name", "dormant"))).toEqual(["quiet"]);
    expect(slugs(arrangeOrganizations(all, "name", "suspended"))).toEqual(["stopped"]);
  });
});

describe("OrganizationsPanel health", () => {
  it("shows activity, marks dormant organizations and filters them", async () => {
    vi.stubGlobal("api", { getPlatformTenants: vi.fn(async () => [busy, quiet, stopped]) });
    render(<OrganizationsPanel />);

    const items = await screen.findAllByTestId("org-health");
    expect(items).toHaveLength(3);
    expect(screen.getByText("Aktivni: 3 (7 d) · 5 (30 d)")).toBeInTheDocument();
    expect(screen.getByText("Nalozi: 12 novih (30 d) · 4 otvorenih")).toBeInTheDocument();
    expect(screen.getAllByText(strings.health.neverLoggedIn)).toHaveLength(1);
    // Only the dormant, not suspended organization gets the badge.
    const badges = screen.getAllByTestId("dormant-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent(strings.health.dormant);
    expect(badges[0]).toHaveAttribute("title", strings.health.dormantHint);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: strings.view.filterLabel }), "dormant");
    expect(screen.getAllByTestId("org-health")).toHaveLength(1);
    expect(screen.getByText("Zaspala Štampa")).toBeInTheDocument();
    expect(screen.queryByText("Aktivna Štampa")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: strings.view.filterLabel }), "suspended");
    expect(screen.getByText("Blokirana Štampa")).toBeInTheDocument();
    expect(screen.getAllByTestId("org-health")).toHaveLength(1);
  });

  it("opens the notes dialog from the row and reloads after saving", async () => {
    const saved = tenant({ ...busy, notes: { ...emptyNotes, plan: "Godišnji", updatedAt: "2026-10-18T10:00:00Z", updatedBy: "ops" } });
    const setPlatformTenantNotes = vi.fn(async () => saved);
    const getPlatformTenants = vi.fn().mockResolvedValueOnce([busy]).mockResolvedValueOnce([saved]);
    vi.stubGlobal("api", { getPlatformTenants, setPlatformTenantNotes });
    render(<OrganizationsPanel />);

    await userEvent.click(await screen.findByRole("button", { name: strings.notes.button }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(strings.notes.plan), "Godišnji");
    await userEvent.click(within(dialog).getByRole("button", { name: sr.common.save }));

    expect(setPlatformTenantNotes).toHaveBeenCalledWith("busy", {
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      plan: "Godišnji",
      notes: "",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Beleške organizacije „Aktivna Štampa“ su sačuvane.");
    // The row now shows that the organization has notes.
    expect(await screen.findByRole("img", { name: strings.notes.hasNotes })).toBeInTheDocument();
  });
});

describe("OrganizationNotesDialog", () => {
  it("prefills saved notes, keeps multiline text and validates the e-mail", async () => {
    const withNotes = tenant({
      slug: "busy",
      name: "Aktivna Štampa",
      notes: {
        contactName: "Marko Marković",
        contactEmail: "marko@example.com",
        contactPhone: "064 123",
        plan: "Mesečni",
        notes: "Prvi red\nDrugi red",
        updatedAt: "2026-10-18T10:00:00Z",
        updatedBy: "ops",
      },
    });
    const setPlatformTenantNotes = vi.fn(async () => withNotes);
    vi.stubGlobal("api", { setPlatformTenantNotes });
    const onSaved = vi.fn();
    render(<OrganizationNotesDialog tenant={withNotes} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByLabelText(strings.notes.contactName)).toHaveValue("Marko Marković");
    expect(screen.getByLabelText(strings.notes.notes)).toHaveValue("Prvi red\nDrugi red");
    expect(screen.getByText(/Poslednja izmena: .* · ops/)).toBeInTheDocument();

    const email = screen.getByLabelText(strings.notes.contactEmail);
    await userEvent.clear(email);
    await userEvent.type(email, "nije-adresa");
    await userEvent.click(screen.getByRole("button", { name: sr.common.save }));
    expect(await screen.findByText(strings.notes.errors.email)).toBeInTheDocument();
    expect(setPlatformTenantNotes).not.toHaveBeenCalled();

    await userEvent.clear(email);
    await userEvent.type(email, "novi@example.com");
    await userEvent.click(screen.getByRole("button", { name: sr.common.save }));
    expect(setPlatformTenantNotes).toHaveBeenCalledWith(
      "busy",
      expect.objectContaining({ contactEmail: "novi@example.com", notes: "Prvi red\nDrugi red" }),
    );
    expect(onSaved).toHaveBeenCalledWith(withNotes);
  });
});
