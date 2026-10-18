// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { OrganizationStep } from "./OrganizationStep";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const strings = sr.auth;

function Landing(): React.JSX.Element {
  const location = useLocation();
  return <div>landed {location.pathname}</div>;
}

function renderStep(): void {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<OrganizationStep />} />
        <Route path="/login/:slug" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrganizationStep", () => {
  it("refuses an empty or malformed slug without asking the server", async () => {
    const getPublicOrganization = vi.fn();
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0"), getPublicOrganization });
    renderStep();

    await userEvent.click(screen.getByRole("button", { name: strings.continue }));
    expect(await screen.findByText(strings.orgRequired)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(strings.organization), "grafika cobanovic");
    await userEvent.click(screen.getByRole("button", { name: strings.continue }));
    expect(await screen.findByText(strings.orgInvalid)).toBeInTheDocument();

    expect(getPublicOrganization).not.toHaveBeenCalled();
  });

  it("stays on step one when the organization does not exist", async () => {
    const getPublicOrganization = vi.fn(async () => null);
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0"), getPublicOrganization });
    renderStep();

    await userEvent.type(screen.getByLabelText(strings.organization), "nepostojeca");
    await userEvent.click(screen.getByRole("button", { name: strings.continue }));

    expect(await screen.findByText(strings.orgNotFound)).toBeInTheDocument();
    expect(getPublicOrganization).toHaveBeenCalledWith("nepostojeca");
    expect(window.localStorage.getItem("iris.rememberedOrg")).toBeNull();
  });

  it("moves a known organization on to its own page and remembers it", async () => {
    const getPublicOrganization = vi.fn(async () => ({
      slug: "grafika-cobanovic",
      name: "Grafika Čobanović",
      logoVersion: "abc",
    }));
    vi.stubGlobal("api", { getAppVersion: vi.fn(async () => "1.0.0"), getPublicOrganization });
    renderStep();

    await userEvent.type(screen.getByLabelText(strings.organization), "  Grafika-Cobanovic ");
    await userEvent.click(screen.getByRole("button", { name: strings.continue }));

    await waitFor(() =>
      expect(screen.getByText("landed /login/grafika-cobanovic")).toBeInTheDocument(),
    );
    // Normalized before it reaches the API.
    expect(getPublicOrganization).toHaveBeenCalledWith("grafika-cobanovic");
    expect(window.localStorage.getItem("iris.rememberedOrg")).toBe("grafika-cobanovic");
  });
});
