// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Login } from "./Login";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const strings = sr.auth;

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Login", () => {
  it("explains why the form appeared when the session lapsed", () => {
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0") });

    render(<Login onLoginSuccess={vi.fn()} sessionExpired />);

    // Without this the app looks like it simply forgot the operator: the one
    // screen that could name the real cause never mentioned it.
    expect(screen.getByText(strings.sessionExpiredTitle)).toBeInTheDocument();
    expect(screen.getByText(strings.sessionExpiredNotice)).toBeInTheDocument();
  });

  it("says nothing about an expired session on an ordinary sign-in", () => {
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0") });

    render(<Login onLoginSuccess={vi.fn()} />);

    expect(
      screen.queryByText(strings.sessionExpiredTitle),
    ).not.toBeInTheDocument();
  });

  it("reports the organization alongside the user so events can be traced to a shop", async () => {
    const user = { id: "u-1", username: "admin", role: "admin" as const };
    const login = vi.fn(async () => ({ success: true, user }));
    vi.stubGlobal("api", {
      getAppVersion: vi.fn(async () => "1.0.0"),
      login,
    });
    const onLoginSuccess = vi.fn();

    render(<Login onLoginSuccess={onLoginSuccess} />);

    await userEvent.type(screen.getByLabelText(strings.organization), "demo");
    await userEvent.type(screen.getByLabelText(strings.username), "admin");
    await userEvent.type(screen.getByLabelText(strings.password), "admin123");
    await userEvent.click(screen.getByRole("button", { name: strings.submit }));

    await waitFor(() => {
      // Iris is multi-tenant and the session endpoint does not return a tenant,
      // so the slug typed here is the only thing that can tag later events.
      expect(onLoginSuccess).toHaveBeenCalledWith(user, "demo");
    });
  });
});
