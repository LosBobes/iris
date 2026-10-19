// @vitest-environment jsdom
// The landing page is public: it must render at /home without a session (no
// redirect to the sign-in) and with one (no app shell around it).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import "@/i18n";

const user = { id: "u-1", username: "admin", role: "admin" as const };

function stubApi(session: { success: boolean; user?: typeof user }) {
  vi.stubGlobal("api", {
    getBackendStatus: vi.fn(async () => ({ ready: true })),
    getCurrentSession: vi.fn(async () => session),
    getAppVersion: vi.fn(async () => "1.0.0"),
    getSettings: vi.fn(async () => ({})),
    getPublicOrganization: vi.fn(async () => null),
    getPublicOrganizationLogoUrl: vi.fn(() => ""),
    getWorkOrders: vi.fn(async () => ({ items: [], total: 0 })),
    getWorkOrderOperators: vi.fn(async () => []),
    getAnnouncements: vi.fn(async () => []),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/home");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App /home", () => {
  it("shows the landing page to a signed-out visitor instead of the sign-in", async () => {
    stubApi({ success: false });
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Svaki posao vaše firme, na jednom mestu.",
    );
    expect(window.location.pathname).toBe("/home");
    expect(screen.getAllByRole("link", { name: /Prijavite se/ })[0]).toHaveAttribute("href", "/login");
  });

  it("shows the landing page to a signed-in user with a link into the app", async () => {
    stubApi({ success: true, user });
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Svaki posao vaše firme, na jednom mestu.",
    );
    expect(window.location.pathname).toBe("/home");
    expect(screen.getAllByRole("link", { name: /Otvori aplikaciju/ })[0]).toHaveAttribute("href", "/");
  });
});
