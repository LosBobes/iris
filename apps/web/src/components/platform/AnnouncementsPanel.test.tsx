// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { fromLocalInput, toLocalInput } from "./AnnouncementFormDialog";
import { sr } from "@/i18n/locales/sr";
import type { PlatformAnnouncement } from "@/types/announcement";
import type { PlatformTenant } from "@/types/platform";
import "@/i18n";

const strings = sr.platform.announcements;

const tenant: PlatformTenant = {
  id: "tenant-demo",
  slug: "demo",
  name: "Demo Štamparija",
  createdAt: "2026-02-01 00:00:00",
  suspendedAt: null,
  users: 2,
  admins: 1,
  modules: { processes: false, stock: false },
};

const base: PlatformAnnouncement = {
  id: "ann-1",
  message: "Održavanje u 22h",
  severity: "maintenance",
  startsAt: "2026-10-18T10:00:00Z",
  endsAt: null,
  status: "active",
  allTenants: true,
  tenants: [],
  createdAt: "2026-10-18T10:00:00Z",
  createdBy: "ops",
  updatedAt: "2026-10-18T10:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnnouncementsPanel", () => {
  it("groups announcements by status and only offers End on live ones", async () => {
    vi.stubGlobal("api", {
      getPlatformAnnouncements: vi.fn(async () => [
        base,
        { ...base, id: "ann-2", message: "Sutra", severity: "warning", status: "scheduled" },
        { ...base, id: "ann-3", message: "Juče", severity: "info", status: "ended", endsAt: "2026-10-17T10:00:00Z" },
      ]),
    });
    render(<AnnouncementsPanel />);
    expect(await screen.findByText(`${strings.groups.active} · 1`)).toBeInTheDocument();
    expect(screen.getByText(`${strings.groups.scheduled} · 1`)).toBeInTheDocument();
    expect(screen.getByText(`${strings.groups.ended} · 1`)).toBeInTheDocument();
    const items = screen.getAllByTestId("announcement-item");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByRole("button", { name: strings.end })).toBeInTheDocument();
    expect(within(items[2]!).queryByRole("button", { name: strings.end })).not.toBeInTheDocument();
  });

  it("creates an announcement for chosen organizations, validating first", async () => {
    const created = { ...base, id: "ann-new", allTenants: false, tenants: [{ slug: "demo", name: tenant.name }] };
    const createPlatformAnnouncement = vi.fn(async () => created);
    const getPlatformAnnouncements = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([created]);
    vi.stubGlobal("api", {
      getPlatformAnnouncements,
      createPlatformAnnouncement,
      getPlatformTenants: vi.fn(async () => [tenant]),
    });

    render(<AnnouncementsPanel />);
    expect(await screen.findByText(strings.empty)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: strings.create }));
    const dialog = screen.getByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: strings.createSubmit }));
    expect(within(dialog).getByText(strings.errors.messageRequired)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(strings.message), "Održavanje u 22h");
    await userEvent.click(within(dialog).getByLabelText(strings.severities.maintenance));
    await userEvent.click(within(dialog).getByLabelText(strings.someTenants));
    await userEvent.click(within(dialog).getByRole("button", { name: strings.createSubmit }));
    expect(within(dialog).getByText(strings.errors.tenantsRequired)).toBeInTheDocument();
    expect(createPlatformAnnouncement).not.toHaveBeenCalled();

    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Demo Štamparija/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: strings.createSubmit }));

    expect(createPlatformAnnouncement).toHaveBeenCalledWith({
      message: "Održavanje u 22h",
      severity: "maintenance",
      startsAt: null,
      endsAt: null,
      allTenants: false,
      tenantSlugs: ["demo"],
    });
    expect(await screen.findByText(strings.createdNotice)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ends and deletes after confirming", async () => {
    const endPlatformAnnouncement = vi.fn(async () => ({ ...base, status: "ended" as const }));
    const deletePlatformAnnouncement = vi.fn(async () => undefined);
    vi.stubGlobal("api", {
      getPlatformAnnouncements: vi.fn(async () => [base]),
      endPlatformAnnouncement,
      deletePlatformAnnouncement,
    });
    render(<AnnouncementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: strings.end }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: strings.end }));
    expect(endPlatformAnnouncement).toHaveBeenCalledWith("ann-1");
    expect(await screen.findByText(strings.endedNotice)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: strings.delete }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: strings.delete }));
    expect(deletePlatformAnnouncement).toHaveBeenCalledWith("ann-1");
  });
});

describe("datetime-local conversion", () => {
  it("round-trips through local time", () => {
    const local = toLocalInput("2026-10-18T10:30:00Z");
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInput(local)).toBe("2026-10-18T10:30:00.000Z");
    expect(fromLocalInput("")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });
});
