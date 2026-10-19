// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { WorkOrderDemo } from "./WorkOrderDemo";
import { StatusExplorer } from "./StatusExplorer";
import { ModulePlayground } from "./ModulePlayground";
import { RoleSwitcher } from "./RoleSwitcher";
import { PriceCalculator, parseNumber } from "./PriceCalculator";
import { Faq } from "./Faq";

afterEach(() => {
  cleanup();
});

describe("WorkOrderDemo", () => {
  it("moves the sample order forward one status at a time, then offers a restart", async () => {
    render(<WorkOrderDemo />);
    const status = () => screen.getByRole("status");
    expect(status()).toHaveTextContent("Nov");
    expect(screen.getByText("Izvršilac").nextElementSibling).toHaveTextContent("—");

    await userEvent.click(screen.getByRole("button", { name: /Pomeri u „Dodeljen“/ }));
    expect(status()).toHaveTextContent("Dodeljen");
    expect(screen.getByText("Izvršilac").nextElementSibling).toHaveTextContent("Ana");

    await userEvent.click(screen.getByRole("button", { name: /Pomeri u „U toku“/ }));
    await userEvent.click(screen.getByRole("button", { name: /Pomeri u „Završen“/ }));
    expect(status()).toHaveTextContent("Završen");
    expect(screen.getByText("Završeno")).toBeInTheDocument();
    // A completed order cannot be cancelled any more.
    expect(screen.queryByRole("button", { name: /Otkaži nalog/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Pomeri u „Fakturisan“/ }));
    expect(status()).toHaveTextContent("Fakturisan");
    expect(within(screen.getByRole("list", { name: "Istorija naloga" })).getAllByRole("listitem")).toHaveLength(5);

    await userEvent.click(screen.getByRole("button", { name: /Počni ispočetka/ }));
    expect(status()).toHaveTextContent("Nov");
  });

  it("cancels from an open status and keeps the history", async () => {
    render(<WorkOrderDemo />);
    await userEvent.click(screen.getByRole("button", { name: /Pomeri u „Dodeljen“/ }));
    await userEvent.click(screen.getByRole("button", { name: /Otkaži nalog/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Otkazan");
    expect(screen.queryByRole("button", { name: /Pomeri u/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nalog otkazan, ostaje zapisan")).toBeInTheDocument();
  });

  it("shows the client's public view without prices and flips back", async () => {
    render(<WorkOrderDemo />);
    expect(screen.getByText("Ukupno (neto)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Pogledaj kao klijent/ }));
    expect(screen.queryByText("Ukupno (neto)")).not.toBeInTheDocument();
    expect(screen.getByText("Napomene za klijenta")).toBeInTheDocument();
    expect(screen.getByText("Iris · javni status")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Nazad na nalog/ }));
    expect(screen.getByText("Ukupno (neto)")).toBeInTheDocument();
  });
});

describe("StatusExplorer", () => {
  it("lists the lifecycle in order and explains the selected status", async () => {
    render(<StatusExplorer />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Nov", "Dodeljen", "U toku", "Završen", "Fakturisan", "Otkazan"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("tab", { name: "Otkazan" }));
    expect(screen.getByRole("tab", { name: "Otkazan" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Posao je otpao");

    // Arrow keys move between statuses, wrapping around.
    screen.getByRole("tab", { name: "Otkazan" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Nov" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("ModulePlayground", () => {
  it("obeys the module dependencies and updates the menu preview", async () => {
    render(<ModulePlayground />);
    const sw = (name: string) => screen.getByRole("switch", { name });
    const aside = () => within(screen.getByRole("complementary", { name: "Pregled menija" }));
    const menu = () => within(screen.getByRole("list", { name: "Stavke menija" }));

    expect(sw("Procesi rada")).toBeDisabled();
    expect(sw("Planiranje")).toBeDisabled();
    expect(sw("Prisustvo")).toBeEnabled();
    expect(menu().queryByText("Magacin", { selector: "li" })).not.toBeInTheDocument();
    expect(aside().getByText("Osnovni Iris, bez modula.")).toBeInTheDocument();

    await userEvent.click(sw("Magacin"));
    expect(menu().getByText("Magacin", { selector: "li" })).toBeInTheDocument();
    expect(sw("Procesi rada")).toBeEnabled();

    await userEvent.click(sw("Procesi rada"));
    await userEvent.click(sw("Prisustvo"));
    expect(sw("Planiranje")).toBeEnabled();
    await userEvent.click(sw("Planiranje"));
    expect(menu().getByText("Planiranje", { selector: "li" })).toBeInTheDocument();
    expect(menu().getByText("Moj red", { selector: "li" })).toBeInTheDocument();
    expect(aside().getByText("4 od 4 modula uključeno.")).toBeInTheDocument();

    // Switching the root requirement off cascades.
    await userEvent.click(sw("Magacin"));
    expect(sw("Procesi rada")).not.toBeChecked();
    expect(sw("Planiranje")).not.toBeChecked();
    expect(sw("Prisustvo")).toBeChecked();
    expect(menu().queryByText("Moj red", { selector: "li" })).not.toBeInTheDocument();
    expect(menu().getByText("Prisustvo", { selector: "li" })).toBeInTheDocument();
  });
});

describe("RoleSwitcher", () => {
  it("hides cost, profit and finance from the operator view", async () => {
    render(<RoleSwitcher />);
    const preview = () => within(screen.getByTestId("role-preview"));
    expect(preview().getByText("Nabavna")).toBeInTheDocument();
    expect(preview().getByText("Prihod (mesec)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Operater" }));
    expect(preview().queryByText("Nabavna")).not.toBeInTheDocument();
    expect(preview().queryByText("Zarada")).not.toBeInTheDocument();
    expect(preview().getByText("Moji nalozi")).toBeInTheDocument();
    expect(preview().getByText("Prodajna")).toBeInTheDocument();
  });
});

describe("PriceCalculator", () => {
  it("recomputes from the inputs and the tax group, and narrows the operator view", async () => {
    render(<PriceCalculator />);
    const row = (label: string | RegExp) => screen.getByText(label).nextElementSibling;
    expect(row("Prodajna cena (neto, osnovica)")).toHaveTextContent("6.500,00 RSD");
    expect(row("Klijent plaća (bruto)")).toHaveTextContent("7.800,00 RSD");
    expect(row("Zarada")).toHaveTextContent("3.300,00 RSD");

    await userEvent.click(screen.getByRole("radio", { name: /A · 0%/ }));
    expect(row("Klijent plaća (bruto)")).toHaveTextContent("6.500,00 RSD");

    const price = screen.getByLabelText("Prodajna cena po komadu (neto)");
    await userEvent.clear(price);
    await userEvent.type(price, "2");
    expect(row("Prodajna cena (neto, osnovica)")).toHaveTextContent("2.000,00 RSD");
    expect(row("Zarada")).toHaveTextContent("-1.200,00 RSD");
    expect(screen.getByText(/Prodajna cena je ispod troška/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Operater" }));
    expect(screen.queryByText("Zarada")).not.toBeInTheDocument();
    expect(screen.queryByText("Trošak")).not.toBeInTheDocument();
    expect(row("Prodajna cena (neto, osnovica)")).toHaveTextContent("2.000,00 RSD");
  });

  it("reads Serbian and plain decimal notation", () => {
    expect(parseNumber("6,50")).toBe(6.5);
    expect(parseNumber("6.50")).toBe(6.5);
    expect(parseNumber("1.000,5")).toBe(1000.5);
    expect(parseNumber("")).toBe(0);
    expect(parseNumber("abc")).toBe(0);
  });
});

describe("Faq", () => {
  it("renders native disclosures with the first one open", () => {
    render(<Faq items={[{ q: "Prvo?", a: "Da." }, { q: "Drugo?", a: "Ne." }]} />);
    const details = screen.getByText("Prvo?").closest("details");
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Drugo?").closest("details")).not.toHaveAttribute("open");
  });
});
