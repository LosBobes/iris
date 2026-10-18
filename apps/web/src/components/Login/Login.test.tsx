// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Login } from "./Login";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const strings = sr.auth;
const organization = { slug: "demo", name: "Demo Štamparija", logoVersion: null };

function renderLogin(props: Partial<React.ComponentProps<typeof Login>> = {}) {
  return render(
    <Login
      organization={organization}
      onLoginSuccess={vi.fn()}
      onChangeOrganization={vi.fn()}
      {...props}
    />,
  );
}

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

    renderLogin({ sessionExpired: true });

    // Without this the app looks like it simply forgot the operator: the one
    // screen that could name the real cause never mentioned it.
    expect(screen.getByText(strings.sessionExpiredTitle)).toBeInTheDocument();
    expect(screen.getByText(strings.sessionExpiredNotice)).toBeInTheDocument();
  });

  it("says nothing about an expired session on an ordinary sign-in", () => {
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0") });

    renderLogin();

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

    renderLogin({ onLoginSuccess });

    // The organization was settled in step one; this form never asks for it.
    expect(screen.queryByLabelText(strings.organization)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(strings.username), "admin");
    await userEvent.type(screen.getByLabelText(strings.password), "admin123");
    await userEvent.click(screen.getByRole("button", { name: strings.submit }));

    await waitFor(() => {
      // Iris is multi-tenant and the session endpoint does not return a tenant,
      // so the slug typed here is the only thing that can tag later events.
      expect(onLoginSuccess).toHaveBeenCalledWith(user, "demo");
    });
    expect(login).toHaveBeenCalledWith({
      orgSlug: "demo",
      username: "admin",
      password: "admin123",
      remember: false,
    });
  });

  it("asks for a remembered session only when the operator ticks the checkbox", async () => {
    const user = { id: "u-1", username: "admin", role: "admin" as const };
    const login = vi.fn(async () => ({ success: true, user }));
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0"), login });

    renderLogin();

    const checkbox = screen.getByRole("checkbox", { name: strings.rememberDevice });
    // Off by default, and honest about what it does.
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAccessibleDescription(strings.rememberDeviceHint);

    await userEvent.click(checkbox);
    await userEvent.type(screen.getByLabelText(strings.username), "admin");
    await userEvent.type(screen.getByLabelText(strings.password), "admin123");
    await userEvent.click(screen.getByRole("button", { name: strings.submit }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        orgSlug: "demo",
        username: "admin",
        password: "admin123",
        remember: true,
      });
    });
    // The username is remembered for next time too.
    expect(window.localStorage.getItem("iris.rememberedUsername")).toBe("admin");
  });

  it("shows the organization's logo when it has one, and its name otherwise", () => {
    const getPublicOrganizationLogoUrl = vi.fn(() => "/api/public/organizations/demo/logo?v=abc");
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0"), getPublicOrganizationLogoUrl });

    renderLogin({ organization: { ...organization, logoVersion: "abc" } });

    expect(getPublicOrganizationLogoUrl).toHaveBeenCalledWith("demo", "abc");
    expect(screen.getByRole("img", { name: "Demo Štamparija" })).toHaveAttribute(
      "src",
      "/api/public/organizations/demo/logo?v=abc",
    );
  });

  it("offers a way back to choose another organization", async () => {
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0") });
    const onChangeOrganization = vi.fn();

    renderLogin({ onChangeOrganization });
    await userEvent.click(screen.getByRole("button", { name: strings.changeOrganization }));

    expect(onChangeOrganization).toHaveBeenCalled();
  });
});
