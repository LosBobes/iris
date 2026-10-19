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
      "Svaki posao u štampariji, na jednom mestu.",
    );
    for (const name of [
      "Sve što štamparija radi svaki dan",
      "Nalog uvek ide u jednom smeru",
      "Dodaci koje uključite kad zatrebaju",
      "Administrator vidi sve, operater ono što mu treba",
      "Vaši podaci su vaši",
      "Od prvog razgovora do prvog naloga",
      "Ono što nas prvo pitaju",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    // Every optional module is described, with its requirements.
    for (const module of ["Magacin", "Procesi rada", "Prisustvo", "Planiranje"]) {
      expect(screen.getByRole("heading", { level: 3, name: module })).toBeInTheDocument();
    }
    expect(screen.getByText("zahteva: Magacin")).toBeInTheDocument();
    expect(screen.getByText("zahteva: Procesi rada i Prisustvo")).toBeInTheDocument();
    // The status flow lists the lifecycle in order, with the side exit.
    const flow = screen.getByRole("list", { name: "Statusi naloga" });
    expect(within(flow).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Nov",
      "Dodeljen",
      "U toku",
      "Završen",
      "Fakturisan",
      "Otkazan",
    ]);
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
    expect(document.title).toBe("Iris · radni nalozi za štampariju");
    unmount();
    expect(document.title).toBe("Iris");
  });
});
