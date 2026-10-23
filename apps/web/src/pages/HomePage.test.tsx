// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import HomePage from "./HomePage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderHome(props: { signedIn?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <HomePage {...props} />
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  it("presents the product and every section a prospective organization needs", () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Znajte šta Vam donosi novac.",
    );
    for (const name of [
      "Vidite gde se zarađuje, a gde gubi vreme",
      "Sve što Vaša firma radi svaki dan",
      "Kako Iris računa cenu",
      "Sastavite svoj Iris",
      "Administrator vidi sve, operater ono što mu treba",
      "Vaši podaci su Vaši",
      "Jasna cena, bez iznenađenja",
      "Od prvog razgovora do prvog naloga",
      "Ono što nas najčešće pitaju",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    // The price and role sections are short term lists.
    for (const term of ["Nabavna cena", "Prodajna cena", "PDV i ukupno", "Administrator", "Operater"]) {
      expect(screen.getByText(term, { selector: "dt" })).toBeInTheDocument();
    }
    // Every optional module is a switch, with its requirements spelled out.
    for (const module of ["Magacin", "Procesi rada", "Prisustvo", "Planiranje"]) {
      expect(screen.getByRole("switch", { name: module })).toBeInTheDocument();
    }
    expect(screen.getByText("Prvo uključite: Magacin")).toBeInTheDocument();
    expect(screen.getByText("Prvo uključite: Procesi rada i Prisustvo")).toBeInTheDocument();
    // The value section sits right under the hero, before the feature list.
    const value = screen.getByRole("region", { name: "Vidite gde se zarađuje, a gde gubi vreme" });
    const features = screen.getByRole("region", { name: "Sve što Vaša firma radi svaki dan" });
    expect(value.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(value).getByRole("heading", { level: 3, name: "Ko i šta Vam donosi zaradu" })).toBeInTheDocument();
    expect(within(value).getByRole("heading", { level: 3, name: "Gde radionica gubi vreme" })).toBeInTheDocument();
    // The contact address is the product owner's by default.
    expect(screen.getByRole("link", { name: "vladbatocanin@gmail.com" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:vladbatocanin@gmail\.com/),
    );
  });

  it("sends a signed-out visitor to the organization picker", () => {
    renderHome();
    const links = screen.getAllByRole("link", { name: /Prijavite se/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /Otvori aplikaciju/ })).not.toBeInTheDocument();
  });

  it("sends a device that remembers its organization straight to its sign-in page", () => {
    window.localStorage.setItem("iris.rememberedOrg", "demo");
    renderHome();
    for (const link of screen.getAllByRole("link", { name: /Prijavite se/ })) {
      expect(link).toHaveAttribute("href", "/login/demo");
    }
  });

  it("offers to open the app instead when a session is already open", () => {
    renderHome({ signedIn: true });
    const links = screen.getAllByRole("link", { name: /Otvori aplikaciju/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: /Prijavite se/ })).not.toBeInTheDocument();
  });

  it("sets the document title while mounted and restores it after", () => {
    document.title = "Iris";
    const { unmount } = renderHome();
    expect(document.title).toBe("Iris · radni nalozi za proizvodnju i usluge");
    unmount();
    expect(document.title).toBe("Iris");
  });
});
