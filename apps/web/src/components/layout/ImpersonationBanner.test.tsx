// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { AuthContext } from "@/contexts/AuthContext";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

afterEach(cleanup);

function renderBanner(user: AuthenticatedUser, onLogout = vi.fn()) {
  render(
    <AuthContext.Provider value={{ currentUser: user, onLogout }}>
      <ImpersonationBanner />
    </AuthContext.Provider>,
  );
  return onLogout;
}

describe("ImpersonationBanner", () => {
  it("is absent on an ordinary session", () => {
    renderBanner({ id: "u1", username: "operater", role: "user" });
    expect(screen.queryByText(sr.impersonation.label)).not.toBeInTheDocument();
  });

  it("names the impersonated user and the superadmin, and stops on click", async () => {
    const onLogout = renderBanner({ id: "u1", username: "operater", role: "user", impersonatedBy: "ops" });

    expect(screen.getByText(sr.impersonation.label)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("operater");
    expect(screen.getByRole("status")).toHaveTextContent("Backoffice: ops");

    await userEvent.click(screen.getByRole("button", { name: sr.impersonation.stop }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
