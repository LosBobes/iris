// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PlatformAdminsPanel } from "./PlatformAdminsPanel";
import { sr } from "@/i18n/locales/sr";
import type { PlatformAdminSummary } from "@/types/platform";
import "@/i18n";

const strings = sr.platform.admins;

const ops: PlatformAdminSummary = {
  id: "platform-ops",
  username: "ops",
  createdAt: "2026-01-01 00:00:00",
  lastLoginAt: "2026-10-17T06:00:00Z",
  twoFactorEnabled: true,
  mustChangePassword: false,
  disabledAt: null,
};
const ana: PlatformAdminSummary = {
  id: "platform-ana",
  username: "ana",
  createdAt: "2026-10-01 00:00:00",
  lastLoginAt: null,
  twoFactorEnabled: false,
  mustChangePassword: true,
  disabledAt: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlatformAdminsPanel", () => {
  it("lists superadmins and disables another one after confirmation, never yourself", async () => {
    const setPlatformAdminDisabled = vi.fn(async () => ({ ...ana, disabledAt: "2026-10-18T10:00:00Z" }));
    const getPlatformAdmins = vi
      .fn()
      .mockResolvedValueOnce([ana, ops])
      .mockResolvedValueOnce([{ ...ana, disabledAt: "2026-10-18T10:00:00Z" }, ops]);
    vi.stubGlobal("api", { getPlatformAdmins, setPlatformAdminDisabled });

    render(<PlatformAdminsPanel currentUsername="ops" />);
    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText(strings.mustChange)).toBeInTheDocument();
    expect(within(rows[1]).getByText(strings.never)).toBeInTheDocument();
    expect(within(rows[1]).getByText(strings.twoFactorOff)).toBeInTheDocument();
    expect(within(rows[2]).getByText(strings.twoFactorOn)).toBeInTheDocument();
    expect(within(rows[2]).getByText(`(${strings.you})`)).toBeInTheDocument();
    // No disable button on your own row.
    expect(within(rows[2]).queryByRole("button")).not.toBeInTheDocument();

    await userEvent.click(within(rows[1]).getByRole("button", { name: `${strings.disable} ana` }));
    expect(screen.getByRole("dialog", { name: "Onemogućiti ana?" })).toBeInTheDocument();
    expect(setPlatformAdminDisabled).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: strings.disable }));

    expect(setPlatformAdminDisabled).toHaveBeenCalledWith("platform-ana", true);
    expect(await screen.findByRole("status")).toHaveTextContent("Superadmin ana je onemogućen.");
    expect(await screen.findByRole("button", { name: `${strings.enable} ana` })).toBeInTheDocument();
  });

  it("adds a superadmin with a temporary password, checking its length first", async () => {
    const createPlatformAdmin = vi.fn(async () => ana);
    vi.stubGlobal("api", { getPlatformAdmins: vi.fn(async () => [ops]), createPlatformAdmin });

    render(<PlatformAdminsPanel currentUsername="ops" />);
    await userEvent.click(await screen.findByRole("button", { name: strings.create }));
    await userEvent.type(screen.getByLabelText(strings.username), "ana");
    await userEvent.type(screen.getByLabelText(strings.password), "kratka");
    await userEvent.click(screen.getByRole("button", { name: strings.createSubmit }));
    expect(screen.getByText("Lozinka mora imati najmanje 12 znakova.")).toBeInTheDocument();
    expect(createPlatformAdmin).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(strings.password), "-ali-sada-duza");
    await userEvent.click(screen.getByRole("button", { name: strings.createSubmit }));
    expect(createPlatformAdmin).toHaveBeenCalledWith({ username: "ana", password: "kratka-ali-sada-duza" });
    expect(await screen.findByRole("status")).toHaveTextContent("Superadmin ana je dodat.");
  });
});
