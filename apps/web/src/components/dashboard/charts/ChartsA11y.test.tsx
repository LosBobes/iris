// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import i18n, { ensureLanguageBundle } from "@/i18n";
import { DeliveryMethodChart } from "./DeliveryMethodChart";
import { TopClientsPanel } from "./TopClientsPanel";
import { WorkOrdersPerMonthChart } from "./WorkOrdersPerMonthChart";
import { formatMonthLabel } from "./utils";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("sr");
});

async function useLanguage(lng: "sr" | "en"): Promise<void> {
  await ensureLanguageBundle(lng);
  await i18n.changeLanguage(lng);
}

describe("dashboard charts accessibility and translation", () => {
  it("labels the top clients chart in Serbian", async () => {
    await useLanguage("sr");
    render(<TopClientsPanel topClients={[{ clientName: "Acme", count: 3 }]} />);
    expect(
      screen.getByRole("img", { name: "Top klijenti (po broju naloga). Acme: 3" }),
    ).toBeInTheDocument();
  });

  it("labels the top clients chart in English", async () => {
    await useLanguage("en");
    render(<TopClientsPanel topClients={[{ clientName: "Acme", count: 3 }]} />);
    expect(
      screen.getByRole("img", { name: "Top clients (by order count). Acme: 3" }),
    ).toBeInTheDocument();
  });

  it("translates the empty state", async () => {
    await useLanguage("en");
    render(<DeliveryMethodChart deliveryDistribution={[]} />);
    expect(screen.getByText("No data to display.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("summarizes monthly orders with an accessible name", async () => {
    await useLanguage("en");
    render(<WorkOrdersPerMonthChart monthlyOrders={[]} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Work orders per month\. /);
    expect(label).toMatch(/: 0/);
  });

  it("localizes month labels", async () => {
    await useLanguage("en");
    expect(formatMonthLabel("2024-05")).toBe("May '24");
    await useLanguage("sr");
    expect(formatMonthLabel("2024-05")).toBe("maj '24");
    expect(formatMonthLabel("2024-08")).toBe("avg '24");
  });
});
