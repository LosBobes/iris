// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { QueryWrapper } from "@/test/query";
import { sr } from "@/i18n/locales/sr";
import type { Announcement } from "@/types/announcement";
import "@/i18n";

const past = "2026-01-01T00:00:00Z";
const future = "2099-01-01T00:00:00Z";

const info: Announcement = { id: "ann-info", message: "Novi izveštaji su dostupni.", severity: "info", startsAt: past, endsAt: null };
const maintenance: Announcement = {
  id: "ann-maint",
  message: "Održavanje sistema večeras.",
  severity: "maintenance",
  startsAt: past,
  endsAt: future,
};
const expired: Announcement = { id: "ann-old", message: "Staro", severity: "warning", startsAt: past, endsAt: "2026-01-02T00:00:00Z" };

function renderBanner(items: Announcement[]) {
  const getAnnouncements = vi.fn(async () => items);
  vi.stubGlobal("api", { getAnnouncements });
  render(
    <QueryWrapper>
      <AnnouncementBanner />
    </QueryWrapper>,
  );
  return getAnnouncements;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnnouncementBanner", () => {
  it("renders nothing without active announcements", async () => {
    const getAnnouncements = renderBanner([expired]);
    await vi.waitFor(() => expect(getAnnouncements).toHaveBeenCalled());
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByText("Staro")).not.toBeInTheDocument();
  });

  it("shows each active announcement; only info ones can be dismissed, and that sticks", async () => {
    renderBanner([maintenance, info]);
    expect(await screen.findByText("Održavanje sistema večeras.")).toBeInTheDocument();
    expect(screen.getByText(sr.announcements.severity.maintenance)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAttribute("data-severity", "maintenance");
    expect(screen.getByText(info.message)).toBeInTheDocument();

    // One dismiss button: the info one's.
    const dismiss = screen.getAllByRole("button", { name: sr.announcements.dismiss });
    expect(dismiss).toHaveLength(1);
    await userEvent.click(dismiss[0]!);
    expect(screen.queryByText(info.message)).not.toBeInTheDocument();
    expect(screen.getByText(maintenance.message)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("iris.announcements.dismissed") ?? "[]")).toEqual(["ann-info"]);

    // A fresh mount (another page load) keeps it dismissed.
    cleanup();
    renderBanner([maintenance, info]);
    expect(await screen.findByText(maintenance.message)).toBeInTheDocument();
    expect(screen.queryByText(info.message)).not.toBeInTheDocument();
  });

  it("still shows and dismisses when storage throws", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      renderBanner([info]);
      await userEvent.click(await screen.findByRole("button", { name: sr.announcements.dismiss }));
      expect(screen.queryByText(info.message)).not.toBeInTheDocument();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("shows nothing when the request fails", async () => {
    const getAnnouncements = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("api", { getAnnouncements });
    render(
      <QueryWrapper>
        <AnnouncementBanner />
      </QueryWrapper>,
    );
    await vi.waitFor(() => expect(getAnnouncements).toHaveBeenCalled());
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
