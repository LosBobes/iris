// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { BackupWarning, SystemPanel } from "./SystemPanel";
import { sr } from "@/i18n/locales/sr";
import type { PlatformBackups, PlatformMetrics } from "@/types/platform";
import "@/i18n";

const strings = sr.platform.backups;

const status = { supported: true, lastBackupAt: "2026-10-18T06:00:00Z", stale: false, staleAfterHours: 24, intervalSeconds: 86400 };

function metrics(engine: "sqlite" | "postgres"): PlatformMetrics {
  return {
    generatedAt: "2026-10-18T08:00:00Z",
    rangeDays: 7,
    rangeStart: "2026-10-12",
    totals: {
      tenants: 1,
      users: 2,
      customers: 0,
      catalogItems: 0,
      workOrders: 0,
      workOrdersInRange: 0,
      openWorkOrders: 0,
      loginsInRange: 0,
      activeUsersInRange: 0,
      activeSessions: 0,
      databaseBytes: 2 * 1024 * 1024,
    },
    system: {
      version: "2.4.0",
      commit: "",
      databaseEngine: engine,
      release: "abc123",
      goVersion: "go1.26.3",
      startedAt: "2026-10-18T07:00:00Z",
      uptimeSeconds: 3600,
      goroutines: 8,
      heapBytes: 1024,
      schemaVersion: 25,
      backup: engine === "sqlite" ? status : { ...status, supported: false, lastBackupAt: null, intervalSeconds: 0 },
    },
    tenants: [],
    daily: [],
  };
}

function backupList(overrides: Partial<PlatformBackups> = {}): PlatformBackups {
  return {
    ...status,
    engine: "sqlite",
    directory: "/data/backups",
    keep: 14,
    total: 1,
    items: [{ name: "iris-20261018-060000.db", sizeBytes: 4096, createdAt: "2026-10-18T06:00:00Z" }],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SystemPanel", () => {
  it("shows what is running and lists the backups", async () => {
    vi.stubGlobal("api", {
      getPlatformMetrics: vi.fn(async () => metrics("sqlite")),
      getPlatformBackups: vi.fn(async () => backupList()),
    });
    render(<SystemPanel />);

    expect(await screen.findByText("iris-20261018-060000.db")).toBeInTheDocument();
    expect(screen.getByText("SQLite")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("/data/backups")).toBeInTheDocument();
    expect(screen.getByText("svakih 24 h")).toBeInTheDocument();
    expect(screen.getByText("poslednjih 14")).toBeInTheDocument();
    // Copies are listed, never offered for download.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("takes a backup on demand and reloads the list", async () => {
    const getPlatformBackups = vi
      .fn()
      .mockResolvedValueOnce(backupList({ items: [], total: 0, lastBackupAt: null, stale: true }))
      .mockResolvedValue(backupList());
    const createPlatformBackup = vi.fn(async () => ({
      name: "iris-20261018-060000.db",
      sizeBytes: 4096,
      createdAt: "2026-10-18T06:00:00Z",
    }));
    vi.stubGlobal("api", {
      getPlatformMetrics: vi.fn(async () => metrics("sqlite")),
      getPlatformBackups,
      createPlatformBackup,
    });
    render(<SystemPanel />);

    expect(await screen.findByText(strings.empty)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(strings.none);

    await userEvent.click(screen.getByRole("button", { name: strings.create }));
    expect(createPlatformBackup).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Kopija iris-20261018-060000.db je sačuvana.");
    const table = await screen.findByRole("table");
    expect(within(table).getByText("iris-20261018-060000.db")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains that PostgreSQL backups are made outside the app", async () => {
    vi.stubGlobal("api", {
      getPlatformMetrics: vi.fn(async () => metrics("postgres")),
      getPlatformBackups: vi.fn(async () =>
        backupList({ supported: false, engine: "postgres", directory: "", keep: 0, total: 0, items: [], stale: false }),
      ),
      createPlatformBackup: vi.fn(),
    });
    render(<SystemPanel />);

    expect(await screen.findByText(strings.unsupportedTitle)).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: strings.create })).not.toBeInTheDocument();
  });
});

describe("BackupWarning", () => {
  it("warns only when backups are supported and overdue", () => {
    const { rerender } = render(<BackupWarning status={{ ...status, stale: true }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("starija od 24 h");

    rerender(<BackupWarning status={status} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<BackupWarning status={{ ...status, supported: false, stale: true }} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
