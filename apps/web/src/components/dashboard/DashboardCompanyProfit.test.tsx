// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import "@/i18n";
import { DashboardCompanyProfit } from "./DashboardCompanyProfit";

type Props = Parameters<typeof DashboardCompanyProfit>[0];

function company(name: string, profit: number): Props["companies"][number] {
  return {
    groupKey: name,
    customerId: null,
    name,
    profit,
    serviceProfit: profit,
    articleProfit: 0,
    revenue: profit * 2,
    orderCount: 1,
  } as Props["companies"][number];
}

afterEach(cleanup);

describe("DashboardCompanyProfit", () => {
  it("lists companies by name in the picker, Serbian letters in place", () => {
    // Passed in profit order, as the dashboard does.
    const companies = [company("Žika", 900), company("ABC", 500), company("Čačak doo", 300), company("Cvet", 100)];
    render(<DashboardCompanyProfit companies={companies} selectedKey={null} onSelectKey={vi.fn()} />);

    const options = within(screen.getByRole("combobox"))
      .getAllByRole("option")
      .slice(1)
      .map((option) => option.textContent);
    expect(options).toEqual(["ABC", "Cvet", "Čačak doo", "Žika"]);
  });
});
