// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { OrganizationUsersDialog } from "./OrganizationUsersDialog";
import { activeOrganizationSlug } from "@/lib/session";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const strings = sr.platform.impersonate;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrganizationUsersDialog", () => {
  it("lists the organization's accounts and opens a session as the chosen one", async () => {
    const platformImpersonate = vi.fn(async () => ({
      success: true,
      orgSlug: "demo",
      user: { id: "user-1", username: "operater", role: "user" as const, impersonatedBy: "ops" },
    }));
    vi.stubGlobal("api", {
      getPlatformTenantUsers: vi.fn(async () => ({
        tenant: { id: "tenant-demo", slug: "demo", name: "Demo" },
        users: [
          { id: "admin-1", username: "admin", role: "admin" },
          { id: "user-1", username: "operater", role: "user" },
        ],
      })),
      platformImpersonate,
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(<OrganizationUsersDialog tenant={{ slug: "demo", name: "Demo" }} onClose={() => undefined} />);

    expect(await screen.findByText("operater")).toBeInTheDocument();
    expect(screen.getByText(strings.admin)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: new RegExp(strings.start + "$") });
    await userEvent.click(buttons[1]);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(platformImpersonate).toHaveBeenCalledWith("demo", "user-1");
    expect(activeOrganizationSlug()).toBe("demo");
  });

  it("shows the API error and stays open when the session cannot be opened", async () => {
    vi.stubGlobal("api", {
      getPlatformTenantUsers: vi.fn(async () => ({
        tenant: { id: "tenant-demo", slug: "demo", name: "Demo" },
        users: [{ id: "user-1", username: "operater", role: "user" }],
      })),
      platformImpersonate: vi.fn(async () => {
        throw new Error("Korisnik ne postoji u ovoj organizaciji.");
      }),
    });

    render(<OrganizationUsersDialog tenant={{ slug: "demo", name: "Demo" }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(strings.start + "$") }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Korisnik ne postoji u ovoj organizaciji.");
    expect(screen.getByRole("button", { name: new RegExp(strings.start + "$") })).toBeEnabled();
  });

  it("sets a new password for a user, checking its length first", async () => {
    const resetPlatformUserPassword = vi.fn(async () => ({ id: "user-1", username: "operater", role: "user" as const }));
    vi.stubGlobal("api", {
      getPlatformTenantUsers: vi.fn(async () => ({
        tenant: { id: "tenant-demo", slug: "demo", name: "Demo" },
        users: [{ id: "user-1", username: "operater", role: "user" }],
      })),
      resetPlatformUserPassword,
    });

    render(<OrganizationUsersDialog tenant={{ slug: "demo", name: "Demo" }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: strings.resetPassword }));
    const input = screen.getByLabelText("Nova lozinka za operater");

    await userEvent.type(input, "123");
    await userEvent.click(screen.getByRole("button", { name: strings.resetSubmit }));
    expect(screen.getByText(sr.platform.orgs.errors.passwordShort)).toBeInTheDocument();
    expect(resetPlatformUserPassword).not.toHaveBeenCalled();

    await userEvent.type(input, "45678");
    await userEvent.click(screen.getByRole("button", { name: strings.resetSubmit }));
    expect(await screen.findByRole("status")).toHaveTextContent("operater");
    expect(resetPlatformUserPassword).toHaveBeenCalledWith("demo", "user-1", "12345678");
  });
});
