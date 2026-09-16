// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const strings = sr.auth;

const user = { id: "u-1", username: "admin", role: "admin" as const };

const settings = {
  firmName: "Štamparija Čobanović",
  pdfSections: {
    delivery: true,
    billing: true,
    shippingAddress: true,
    completion: true,
    signatures: true,
  },
  billingDefaults: { documentType: "invoice" as const },
  priorityDefaults: { priority: "normal" as const, allowOverride: true },
  printItemColumns: ["quantity", "unitPrice", "total"] as const,
  showShippingOptions: true,
};

/** A signed-out boot: no session cookie, so the app lands on the login form. */
function stubSignedOutApi(overrides: Record<string, unknown> = {}) {
  const getSettings = vi.fn(async () => settings);
  vi.stubGlobal("api", {
    getBackendStatus: vi.fn(async () => ({ ready: true })),
    getCurrentSession: vi.fn(async () => ({ success: false })),
    getAppVersion: vi.fn(async () => "1.0.0"),
    login: vi.fn(async () => ({ success: true, user })),
    getSettings,
    getWorkOrders: vi.fn(async () => ({ items: [], total: 0 })),
    getWorkOrderOperators: vi.fn(async () => []),
    ...overrides,
  });
  return getSettings;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App organization settings", () => {
  it("loads the shop settings for an operator who signs in on a signed-out page", async () => {
    // The regression: settings were only fetched during bootstrap, which skips
    // the fetch when there is no session yet. An operator who then logged in ran
    // the rest of the session on the defaults — the work-order form's shipping
    // options hidden, the document type back to proforma — until a page reload.
    const getSettings = stubSignedOutApi();

    render(<App />);

    await screen.findByLabelText(strings.organization);
    expect(getSettings).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(strings.organization), "demo");
    await userEvent.type(screen.getByLabelText(strings.username), "admin");
    await userEvent.type(screen.getByLabelText(strings.password), "admin123");
    await userEvent.click(screen.getByRole("button", { name: strings.submit }));

    await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(1));
  });

  it("keeps the app usable when the settings request fails", async () => {
    const getSettings = vi.fn(async () => {
      throw new Error("network");
    });
    stubSignedOutApi({ getSettings });

    render(<App />);

    await screen.findByLabelText(strings.organization);
    await userEvent.type(screen.getByLabelText(strings.organization), "demo");
    await userEvent.type(screen.getByLabelText(strings.username), "admin");
    await userEvent.type(screen.getByLabelText(strings.password), "admin123");
    await userEvent.click(screen.getByRole("button", { name: strings.submit }));

    await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(1));
    // The login still went through — a settings failure is not a sign-in failure.
    await waitFor(() =>
      expect(screen.queryByLabelText(strings.organization)).not.toBeInTheDocument(),
    );
  });
});
