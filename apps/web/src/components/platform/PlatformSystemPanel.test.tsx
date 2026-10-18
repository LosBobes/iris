// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlatformSystemPanel } from "./PlatformSystemPanel";
import { sr } from "@/i18n/locales/sr";
import type { PlatformMetrics, PlatformSystem } from "@/types/platform";
import "@/i18n";

const strings = sr.platform.system;

function metricsWith(system: Partial<PlatformSystem>): PlatformMetrics {
  return {
    generatedAt: "2026-10-16T12:00:00Z",
    rangeDays: 30,
    rangeStart: "2026-09-17",
    totals: {
      tenants: 1, users: 1, customers: 0, catalogItems: 0, workOrders: 0, workOrdersInRange: 0,
      openWorkOrders: 0, loginsInRange: 0, activeUsersInRange: 0, activeSessions: 0, databaseBytes: 0,
    },
    system: {
      version: "2.3.0", commit: "de3a5691c0ffee", databaseEngine: "postgres", release: "",
      goVersion: "go1.26", startedAt: "2026-10-16T10:00:00Z", uptimeSeconds: 7200,
      goroutines: 12, heapBytes: 1024,
      ...system,
    },
    tenants: [],
    daily: [],
  };
}

function value(key: string): string {
  return within(screen.getByTestId(`platform-system-${key}`)).getByRole("definition").textContent ?? "";
}

afterEach(cleanup);

describe("PlatformSystemPanel", () => {
  it("shows the web and API versions, the API commit and the database engine", () => {
    render(<PlatformSystemPanel metrics={metricsWith({})} webVersion="2.3.0" />);

    expect(screen.getByRole("heading", { name: strings.title })).toBeInTheDocument();
    expect(screen.getByText(strings.webVersion)).toBeInTheDocument();
    expect(value("web")).toBe("v2.3.0");
    expect(value("api")).toBe("v2.3.0 · de3a569");
    expect(value("database")).toBe(strings.databasePostgres);
    // Same release on both sides: no warning.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("names SQLite and a source build without a commit", () => {
    render(
      <PlatformSystemPanel
        metrics={metricsWith({ version: "dev", commit: "", databaseEngine: "sqlite" })}
        webVersion="2.3.0"
      />,
    );

    expect(value("api")).toBe("dev");
    expect(value("database")).toBe(strings.databaseSqlite);
    // A dev API is not a release, so it is not flagged as a mismatch.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warns when the cached web app is a different release than the API", () => {
    render(<PlatformSystemPanel metrics={metricsWith({ version: "2.4.0" })} webVersion="2.3.0" />);

    const warning = screen.getByRole("status");
    expect(warning).toHaveTextContent("v2.3.0");
    expect(warning).toHaveTextContent("v2.4.0");
    expect(warning).toHaveTextContent("Osvežite stranicu");
  });

  it("copes with an older API that reports no version or engine", () => {
    render(
      <PlatformSystemPanel
        metrics={metricsWith({ version: "", commit: "", databaseEngine: "" })}
        webVersion="2.3.0"
      />,
    );

    expect(value("api")).toBe("—");
    expect(value("database")).toBe("—");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
