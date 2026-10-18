// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ActivityLog } from "./ActivityLog";
import { actionLabelKey, actionTarget } from "./impersonation-actions";
import { sr } from "@/i18n/locales/sr";
import type { PlatformAuditEvent } from "@/types/platform";
import "@/i18n";

const strings = sr.platform.activity;

const base = { adminUsername: "ops", tenantSlug: "demo", tenantName: "Demo Štamparija", ip: "10.0.0.1", at: "2026-10-17T06:00:00Z" };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivityLog", () => {
  it("shows every kind of operation with its details", async () => {
    const items: PlatformAuditEvent[] = [
      { ...base, id: 5, action: "user.password_reset", targetUsername: "operater" },
      { ...base, id: 4, action: "tenant.update", detail: { fromName: "Demo", toName: "Demo Štamparija", fromSlug: "d", toSlug: "demo" } },
      { ...base, id: 3, action: "tenant.suspend" },
      { ...base, id: 2, action: "tenant.create", targetUsername: "sef" },
    ];
    vi.stubGlobal("api", { getPlatformAudit: vi.fn(async () => ({ items, total: 4 })) });

    render(<ActivityLog />);
    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(within(rows[1]).getByText(strings.kinds.passwordReset)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Korisnik: operater")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Naziv: Demo → Demo Štamparija")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Oznaka: d → demo")).toBeInTheDocument();
    expect(within(rows[3]).getByText(strings.kinds.tenantSuspend)).toBeInTheDocument();
    expect(within(rows[4]).getByText("Prvi administrator: sef")).toBeInTheDocument();
    // Only impersonations open into a trail.
    expect(screen.queryByRole("button", { name: strings.showTrail })).not.toBeInTheDocument();
  });

  it("shows which modules were switched on or off", async () => {
    const items: PlatformAuditEvent[] = [
      { ...base, id: 7, action: "tenant.modules", detail: { processes: "off", stock: "on", changed: "processes" } },
    ];
    vi.stubGlobal("api", { getPlatformAudit: vi.fn(async () => ({ items, total: 1 })) });

    render(<ActivityLog />);
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText(strings.kinds.tenantModules)).toBeInTheDocument();
    expect(
      within(rows[1]).getByText(`Magacin: ${strings.moduleOn} · Procesi rada: ${strings.moduleOff}`),
    ).toBeInTheDocument();
  });

  it("labels organization exports and deletions with their row counts", async () => {
    const items: PlatformAuditEvent[] = [
      { ...base, id: 9, action: "tenant.delete", detail: { totalRows: "120", users: "3", customers: "10", workOrders: "40" } },
      { ...base, id: 8, action: "tenant.export", detail: { totalRows: "120" } },
    ];
    vi.stubGlobal("api", { getPlatformAudit: vi.fn(async () => ({ items, total: 2 })) });

    render(<ActivityLog />);
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText(strings.kinds.tenantDelete)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Obrisano redova: 120")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Korisnika: 3 · Klijenata: 10 · Radnih naloga: 40")).toBeInTheDocument();
    expect(within(rows[2]).getByText(strings.kinds.tenantExport)).toBeInTheDocument();
    expect(within(rows[2]).getByText("Izvezeno redova: 120")).toBeInTheDocument();
  });

  it("opens an impersonation into the changes made during it", async () => {
    const getPlatformImpersonationActions = vi.fn(async () => [
      { at: "2026-10-17T06:05:00Z", method: "PATCH" as const, route: "/work-orders/{id}", path: "/work-orders/wo-7", status: 200 },
      { at: "2026-10-17T06:06:00Z", method: "DELETE" as const, route: "/customers/{id}", path: "/customers/c-1", status: 403 },
    ]);
    vi.stubGlobal("api", {
      getPlatformAudit: vi.fn(async () => ({
        items: [
          {
            ...base,
            id: 1,
            action: "impersonate",
            targetUsername: "operater",
            impersonation: { id: 9, expiresAt: "2026-10-17T07:00:00Z", endedAt: "2026-10-17T06:20:00Z", actionCount: 2, reason: "Prijava greške na nalogu 7" },
          },
        ],
        total: 1,
      })),
      getPlatformImpersonationActions,
    });

    render(<ActivityLog />);
    expect(await screen.findByText(/završena/)).toHaveTextContent("Izmena: 2");
    await userEvent.click(screen.getByRole("button", { name: strings.showTrail }));

    expect(getPlatformImpersonationActions).toHaveBeenCalledWith(9);
    expect(await screen.findByText(strings.actions.workOrderUpdate)).toBeInTheDocument();
    expect(screen.getByText("Zapis: wo-7")).toBeInTheDocument();
    expect(screen.getByText("Odbijeno (403)")).toBeInTheDocument();
  });

  it("pages through a long log", async () => {
    const getPlatformAudit = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ ...base, id: 2, action: "tenant.suspend" }], total: 2 })
      .mockResolvedValueOnce({ items: [{ ...base, id: 1, action: "tenant.reactivate" }], total: 2 });
    vi.stubGlobal("api", { getPlatformAudit });
    render(<ActivityLog />);
    await userEvent.click(await screen.findByRole("button", { name: strings.loadMore }));
    expect(await screen.findByText(strings.kinds.tenantReactivate)).toBeInTheDocument();
    expect(getPlatformAudit).toHaveBeenLastCalledWith({ limit: 50, offset: 1 });
  });
});

describe("impersonation action labels", () => {
  it("names known routes and falls back for the rest", () => {
    expect(actionLabelKey({ method: "PUT", route: "/users/{id}" })).toBe("platform.activity.actions.userUpdate");
    expect(actionLabelKey({ method: "POST", route: "/something-new" })).toBeNull();
  });

  it("extracts the record id from the path", () => {
    expect(actionTarget({ route: "/work-orders/{id}", path: "/work-orders/wo%201" })).toBe("wo 1");
    expect(actionTarget({ route: "/settings", path: "/settings" })).toBeNull();
  });
});

describe("ActivityLog superadmin events", () => {
  it("shows superadmin account changes, failed sign-ins and impersonation reasons", async () => {
    const admin = { ...base, tenantSlug: "", tenantName: "" };
    const items: PlatformAuditEvent[] = [
      { ...admin, id: 14, action: "admin.login_failed", adminUsername: "nobody", detail: { stage: "password" } },
      { ...admin, id: 13, action: "admin.login_failed", detail: { stage: "2fa" } },
      { ...admin, id: 12, action: "admin.disable", targetUsername: "ana" },
      { ...admin, id: 11, action: "admin.2fa_enable", targetUsername: "ops" },
      {
        ...base,
        id: 10,
        action: "impersonate",
        targetUsername: "operater",
        impersonation: { id: 3, expiresAt: "2026-10-17T07:00:00Z", endedAt: "2026-10-17T06:10:00Z", actionCount: 0, reason: "Podrška" },
      },
    ];
    vi.stubGlobal("api", { getPlatformAudit: vi.fn(async () => ({ items, total: items.length })) });

    render(<ActivityLog />);
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText(strings.kinds.adminLoginFailed)).toBeInTheDocument();
    expect(within(rows[1]).getByText("nobody")).toBeInTheDocument();
    expect(within(rows[1]).getByText(strings.stagePassword)).toBeInTheDocument();
    expect(within(rows[2]).getByText(strings.stageTwoFactor)).toBeInTheDocument();
    expect(within(rows[3]).getByText(strings.kinds.adminDisable)).toBeInTheDocument();
    expect(within(rows[3]).getByText("Superadmin: ana")).toBeInTheDocument();
    // Enrolling yourself names no separate target.
    expect(within(rows[4]).getByText(strings.kinds.adminTwoFactorOn)).toBeInTheDocument();
    expect(within(rows[4]).queryByText("Superadmin: ops")).not.toBeInTheDocument();
    expect(within(rows[5]).getByText("Razlog: Podrška")).toBeInTheDocument();
  });
});
