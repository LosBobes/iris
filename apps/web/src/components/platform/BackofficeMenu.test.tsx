// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { BackofficeMenu } from "./BackofficeMenu";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

afterEach(cleanup);

describe("BackofficeMenu", () => {
  it("lists the sections on a phone and closes after picking one", async () => {
    render(
      <MemoryRouter>
        <BackofficeMenu
          username="ops"
          sections={[
            { to: "/backoffice", label: "Pregled", current: false },
            { to: "/backoffice/activity", label: "Aktivnost", current: true },
          ]}
          onChangePassword={vi.fn()}
          onLogout={vi.fn()}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: sr.platform.menu.open }));
    const nav = screen.getByRole("navigation", { name: sr.platform.nav.label });
    expect(within(nav).getByRole("link", { name: "Aktivnost" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("link", { name: "Pregled" }));
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
