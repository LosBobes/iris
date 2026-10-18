// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PlatformConsole } from "./PlatformConsole";
import { OrganizationStep } from "@/components/Login/OrganizationStep";
import { sr } from "@/i18n/locales/sr";
import type { PlatformMetrics } from "@/types/platform";
import { ApiError } from "@/lib/errors";
import "@/i18n";

const strings = sr.platform;

const metrics: PlatformMetrics = {
  generatedAt: "2026-10-16T12:00:00Z",
  rangeDays: 30,
  rangeStart: "2026-09-17",
  totals: {
    tenants: 2, users: 7, customers: 2657, catalogItems: 3575, workOrders: 120,
    workOrdersInRange: 14, openWorkOrders: 9, loginsInRange: 40, activeUsersInRange: 5,
    activeSessions: 2, databaseBytes: 5 * 1024 * 1024,
  },
  system: {
    release: "git-abc1234", goVersion: "go1.26", startedAt: "2026-10-16T10:00:00Z",
    uptimeSeconds: 7200, goroutines: 12, heapBytes: 8 * 1024 * 1024,
  },
  tenants: [
    {
      id: "tenant-cobanovic", slug: "grafika-cobanovic", name: "Grafika Čobanović", createdAt: "2026-01-01 00:00:00",
      users: 5, admins: 1, customers: 2657, catalogItems: 3575, workOrders: 118, workOrdersInRange: 14,
      openWorkOrders: 9, statusCounts: { new: 9, completed: 109 }, loginsInRange: 38, activeUsersInRange: 4,
      activeSessions: 2, lastWorkOrderAt: "2026-10-16T09:30:00Z", lastLoginAt: "2026-10-16T08:00:00Z", hasLoginLogo: true,
    },
    {
      id: "tenant-demo", slug: "demo", name: "Demo Štamparija", createdAt: "2026-02-01 00:00:00",
      users: 2, admins: 1, customers: 0, catalogItems: 0, workOrders: 2, workOrdersInRange: 0,
      openWorkOrders: 0, statusCounts: {}, loginsInRange: 2, activeUsersInRange: 1,
      activeSessions: 0, lastWorkOrderAt: null, lastLoginAt: null, hasLoginLogo: false,
    },
  ],
  daily: [
    { date: "2026-10-15", workOrders: { demo: 0, "grafika-cobanovic": 3 }, logins: { demo: 1, "grafika-cobanovic": 4 } },
    { date: "2026-10-16", workOrders: { demo: 0, "grafika-cobanovic": 2 }, logins: { demo: 0, "grafika-cobanovic": 5 } },
  ],
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlatformConsole", () => {
  it("asks for an operator login, then shows the aggregate dashboard", async () => {
    const platformLogin = vi.fn(async () => ({ success: true, admin: { username: "ops", twoFactorEnabled: true } }));
    const getPlatformMetrics = vi.fn(async () => metrics);
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => ({ success: false })),
      platformLogin,
      getPlatformMetrics,
    });

    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );

    await userEvent.type(await screen.findByLabelText(strings.login.username), "ops");
    await userEvent.type(screen.getByLabelText(strings.login.password), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: strings.login.submit }));

    expect(platformLogin).toHaveBeenCalledWith({ username: "ops", password: "correct-horse-battery" });
    expect((await screen.findAllByText(strings.tiles.tenants)).length).toBeGreaterThan(0);
    expect(getPlatformMetrics).toHaveBeenCalledWith(30);
    // Tiles and the organization table show the aggregates.
    expect(screen.getAllByText("2.657").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Grafika Čobanović").length).toBeGreaterThan(0);
    expect(screen.getByText("5 MB")).toBeInTheDocument();
  });

  it("refetches for a different range and remembers it", async () => {
    const getPlatformMetrics = vi.fn(async () => metrics);
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => ({ success: true, admin: { username: "ops", role: "superadmin", twoFactorEnabled: true } })),
      getPlatformMetrics,
    });

    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );
    await screen.findAllByText(strings.tiles.tenants);
    await userEvent.click(screen.getByRole("radio", { name: "90 d" }));

    await waitFor(() => expect(getPlatformMetrics).toHaveBeenLastCalledWith(90));
    // The menu names the account and its role.
    await userEvent.click(screen.getByRole("button", { name: strings.menu.open }));
    expect(screen.getByText("superadmin")).toBeInTheDocument();
    expect(screen.getByText("ops")).toBeInTheDocument();
    expect(window.localStorage.getItem("iris.platform.range")).toBe("90");
    // A fresh device auto-refreshes every minute.
    expect(screen.getByRole("combobox")).toHaveValue("60");
  });

  it("shows the server's error on a rejected login", async () => {
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => ({ success: false })),
      platformLogin: vi.fn(async () => ({ success: false, error: "Neispravno korisničko ime ili lozinka." })),
    });
    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );
    await userEvent.type(await screen.findByLabelText(strings.login.username), "x");
    await userEvent.type(screen.getByLabelText(strings.login.password), "y");
    await userEvent.click(screen.getByRole("button", { name: strings.login.submit }));
    expect(await screen.findByText("Neispravno korisničko ime ili lozinka.")).toBeInTheDocument();
  });
});

describe("operator password", () => {
  it("makes the seeded default account choose a password, then enroll 2FA, before any data loads", async () => {
    const getPlatformMetrics = vi.fn(async () => metrics);
    const changePlatformPassword = vi.fn(async () => ({
      success: true,
      admin: { username: "admin", mustChangePassword: false },
    }));
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => ({
        success: true,
        admin: { username: "admin", mustChangePassword: true },
      })),
      changePlatformPassword,
      getPlatformMetrics,
    });

    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );

    expect(await screen.findByText(strings.password.requiredIntro)).toBeInTheDocument();
    // No way around it: no cancel, and nothing fetched yet.
    expect(screen.queryByRole("button", { name: sr.common.cancel })).not.toBeInTheDocument();
    expect(getPlatformMetrics).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(strings.password.current), "admin123321");
    await userEvent.type(screen.getByLabelText(strings.password.new), "short");
    await userEvent.type(screen.getByLabelText(strings.password.confirm), "short");
    await userEvent.click(screen.getByRole("button", { name: strings.password.submit }));
    expect(await screen.findByText(strings.password.tooShort.replace("{{min}}", "12"))).toBeInTheDocument();
    expect(changePlatformPassword).not.toHaveBeenCalled();

    // Too long for bcrypt: caught in the form with a specific message.
    await userEvent.clear(screen.getByLabelText(strings.password.new));
    await userEvent.clear(screen.getByLabelText(strings.password.confirm));
    await userEvent.type(screen.getByLabelText(strings.password.new), "ž".repeat(37));
    await userEvent.type(screen.getByLabelText(strings.password.confirm), "ž".repeat(37));
    await userEvent.click(screen.getByRole("button", { name: strings.password.submit }));
    expect(await screen.findByText(strings.password.tooLong.replace("{{max}}", "72"))).toBeInTheDocument();
    expect(changePlatformPassword).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(strings.password.new));
    await userEvent.clear(screen.getByLabelText(strings.password.confirm));
    await userEvent.type(screen.getByLabelText(strings.password.new), "a-much-better-password");
    await userEvent.type(screen.getByLabelText(strings.password.confirm), "a-much-better-passwor");
    await userEvent.click(screen.getByRole("button", { name: strings.password.submit }));
    expect(await screen.findByText(strings.password.mismatch)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(strings.password.confirm), "d");
    await userEvent.click(screen.getByRole("button", { name: strings.password.submit }));

    await waitFor(() =>
      expect(changePlatformPassword).toHaveBeenCalledWith({
        currentPassword: "admin123321",
        newPassword: "a-much-better-password",
      }),
    );
    // Two-factor sign-in is next, still before any data.
    expect(await screen.findByText(new RegExp(strings.twoFactor.requiredIntro.slice(0, 40)))).toBeInTheDocument();
    expect(getPlatformMetrics).not.toHaveBeenCalled();
  });


  it("lets a signed-in operator change it from the toolbar", async () => {
    const changePlatformPassword = vi.fn(async () => {
      throw new ApiError("Trenutna lozinka nije ispravna.", {
        status: 422,
        url: "/platform/auth/password",
        requestId: "abc123",
      });
    });
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => ({ success: true, admin: { username: "ops", twoFactorEnabled: true } })),
      getPlatformMetrics: vi.fn(async () => metrics),
      changePlatformPassword,
    });

    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: strings.menu.open }));
    await userEvent.click(screen.getByRole("button", { name: strings.password.title }));
    expect(screen.getByRole("dialog", { name: strings.password.title })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(strings.password.current), "wrong-one");
    await userEvent.type(screen.getByLabelText(strings.password.new), "a-much-better-password");
    await userEvent.type(screen.getByLabelText(strings.password.confirm), "a-much-better-password");
    await userEvent.click(screen.getByRole("button", { name: strings.password.submit }));
    // A rejected password shows the server's own words, without a request code.
    expect(await screen.findByText("Trenutna lozinka nije ispravna.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: sr.common.cancel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("mandatory two-factor sign-in", () => {
  const signedInWithout2FA = { success: true, admin: { username: "ops", role: "superadmin", twoFactorEnabled: false } };

  it("opens the console only after enrollment", async () => {
    const getPlatformMetrics = vi.fn(async () => metrics);
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => signedInWithout2FA),
      setupPlatformTwoFactor: vi.fn(async () => ({
        secret: "JBSWY3DPEHPK3PXP",
        otpauthUri: "otpauth://totp/Iris:ops?secret=JBSWY3DPEHPK3PXP",
        qrCode: "data:image/png;base64,AAAA",
      })),
      confirmPlatformTwoFactor: vi.fn(async () => ({ recoveryCodes: ["aaaa-bbbb", "cccc-dddd"] })),
      getPlatformMetrics,
    });
    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );

    expect(await screen.findByText(new RegExp(strings.twoFactor.requiredIntro.slice(0, 40)))).toBeInTheDocument();
    expect(getPlatformMetrics).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: strings.twoFactor.start }));
    await userEvent.type(await screen.findByLabelText(strings.twoFactor.code), "123456");
    await userEvent.click(screen.getByRole("button", { name: strings.twoFactor.confirm }));
    await userEvent.click(await screen.findByRole("button", { name: strings.twoFactor.done }));

    expect((await screen.findAllByText(strings.tiles.tenants)).length).toBeGreaterThan(0);
    expect(getPlatformMetrics).toHaveBeenCalled();
  });

  it("signs out when the enrollment is closed unfinished", async () => {
    const platformLogout = vi.fn(async () => undefined);
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => signedInWithout2FA),
      platformLogout,
    });
    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );
    await screen.findByText(new RegExp(strings.twoFactor.requiredIntro.slice(0, 40)));
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(platformLogout).toHaveBeenCalled());
    expect(await screen.findByLabelText(strings.login.username)).toBeInTheDocument();
  });
});

describe("Backoffice language", () => {
  afterEach(async () => {
    const { default: i18n } = await import("@/i18n");
    await i18n.changeLanguage("sr");
  });

  it("switches the sign-in screen to English and back", async () => {
    vi.stubGlobal("api", { getPlatformSession: vi.fn(async () => ({ success: false })) });
    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText(strings.login.username)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(await screen.findByLabelText("Username")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Srpski" }));
    expect(await screen.findByLabelText(strings.login.username)).toBeInTheDocument();
  });

  it("offers the switch in the dashboard menu too", async () => {
    vi.stubGlobal("api", {
      getPlatformSession: vi.fn(async () => ({ success: true, admin: { username: "ops", role: "superadmin", twoFactorEnabled: true } })),
      getPlatformMetrics: vi.fn(async () => metrics),
    });
    render(
      <MemoryRouter>
        <PlatformConsole />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: strings.menu.open }));
    await userEvent.click(screen.getByRole("radio", { name: "English" }));
    expect((await screen.findAllByText("Organizations")).length).toBeGreaterThan(0);
  });
});

describe("hidden console gesture", () => {
  function renderPicker(): void {
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0") });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<OrganizationStep />} />
          <Route path="/backoffice" element={<div>console reached</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("opens the console after five quick taps on the wordmark", async () => {
    renderPicker();
    const wordmark = screen.getByText("Iris");
    for (let i = 0; i < 4; i++) await userEvent.click(wordmark);
    expect(screen.queryByText("console reached")).not.toBeInTheDocument();
    await userEvent.click(wordmark);
    expect(await screen.findByText("console reached")).toBeInTheDocument();
  });

  it("ignores slow taps", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPicker();
      const wordmark = screen.getByText("Iris");
      for (let i = 0; i < 5; i++) {
        await userEvent.click(wordmark);
        vi.advanceTimersByTime(1000);
      }
      expect(screen.queryByText("console reached")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
