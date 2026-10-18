// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LoginAnnouncements } from "./LoginAnnouncements";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginAnnouncements", () => {
  it("shows the organization's active announcements without a dismiss button", async () => {
    const getPublicAnnouncements = vi.fn(async () => [
      { id: "a", message: "Održavanje od 22h", severity: "maintenance" as const, startsAt: "2026-01-01T00:00:00Z", endsAt: null },
    ]);
    vi.stubGlobal("api", { getPublicAnnouncements });
    render(<LoginAnnouncements orgSlug="demo" />);
    expect(await screen.findByText("Održavanje od 22h")).toBeInTheDocument();
    expect(getPublicAnnouncements).toHaveBeenCalledWith("demo");
    expect(screen.getByText(sr.announcements.severity.maintenance)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when the API is unavailable", async () => {
    vi.stubGlobal("api", {});
    render(<LoginAnnouncements orgSlug="demo" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
