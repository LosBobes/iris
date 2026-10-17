// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ImpersonationLog } from "./ImpersonationLog";
import { actionLabelKey, actionTarget } from "./impersonation-actions";
import { sr } from "@/i18n/locales/sr";
import type { PlatformImpersonation } from "@/types/platform";
import "@/i18n";

const strings = sr.platform.impersonations;

const entry = (overrides: Partial<PlatformImpersonation>): PlatformImpersonation => ({
  id: 1,
  adminUsername: "ops",
  tenantSlug: "demo",
  tenantName: "Demo Štamparija",
  userId: "user-1",
  username: "operater",
  ip: "10.0.0.1",
  startedAt: "2026-10-17T06:00:00Z",
  expiresAt: "2026-10-17T07:00:00Z",
  endedAt: "2026-10-17T06:20:00Z",
  actionCount: 2,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImpersonationLog", () => {
  it("lists impersonations and shows the changes made in one", async () => {
    const getPlatformImpersonationActions = vi.fn(async () => [
      { at: "2026-10-17T06:05:00Z", method: "PATCH" as const, route: "/work-orders/{id}", path: "/work-orders/wo-7", status: 200 },
      { at: "2026-10-17T06:06:00Z", method: "DELETE" as const, route: "/customers/{id}", path: "/customers/c-1", status: 403 },
    ]);
    vi.stubGlobal("api", {
      getPlatformImpersonations: vi.fn(async () => ({
        items: [entry({ id: 2, username: "admin", endedAt: null, expiresAt: "2999-01-01T00:00:00Z", actionCount: 0 }), entry({})],
        total: 2,
      })),
      getPlatformImpersonationActions,
    });

    render(<ImpersonationLog />);

    const rows = await screen.findAllByRole("row");
    // Header + two impersonations.
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText(strings.active)).toBeInTheDocument();
    expect(within(rows[2]).getByText("operater")).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Završena/)).toBeInTheDocument();

    await userEvent.click(within(rows[2]).getByRole("button", { name: strings.showTrail }));

    expect(getPlatformImpersonationActions).toHaveBeenCalledWith(1);
    expect(await screen.findByText(strings.actions.workOrderUpdate)).toBeInTheDocument();
    expect(screen.getByText("Zapis: wo-7")).toBeInTheDocument();
    expect(screen.getByText(strings.actions.customerDelete)).toBeInTheDocument();
    expect(screen.getByText("Odbijeno (403)")).toBeInTheDocument();
  });

  it("pages through a long log", async () => {
    const getPlatformImpersonations = vi
      .fn()
      .mockResolvedValueOnce({ items: [entry({ id: 3 })], total: 2 })
      .mockResolvedValueOnce({ items: [entry({ id: 1, username: "drugi" })], total: 2 });
    vi.stubGlobal("api", { getPlatformImpersonations });

    render(<ImpersonationLog />);
    await userEvent.click(await screen.findByRole("button", { name: strings.loadMore }));

    expect(await screen.findByText("drugi")).toBeInTheDocument();
    expect(getPlatformImpersonations).toHaveBeenLastCalledWith({ limit: 50, offset: 1 });
    expect(screen.queryByRole("button", { name: strings.loadMore })).not.toBeInTheDocument();
  });

  it("says so when there is nothing yet", async () => {
    vi.stubGlobal("api", { getPlatformImpersonations: vi.fn(async () => ({ items: [], total: 0 })) });
    render(<ImpersonationLog />);
    expect(await screen.findByText(strings.empty)).toBeInTheDocument();
  });
});

describe("impersonation action labels", () => {
  it("names known routes and falls back for the rest", () => {
    expect(actionLabelKey({ method: "PUT", route: "/users/{id}" })).toBe("platform.impersonations.actions.userUpdate");
    expect(actionLabelKey({ method: "POST", route: "/something-new" })).toBeNull();
  });

  it("extracts the record id from the path", () => {
    expect(actionTarget({ route: "/work-orders/{id}", path: "/work-orders/wo%201" })).toBe("wo 1");
    expect(actionTarget({ route: "/settings", path: "/settings" })).toBeNull();
  });
});
