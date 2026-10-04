// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import i18n, { ensureLanguageBundle } from "@/i18n";
import { SearchableCombobox } from "./SearchableCombobox";
import { AsyncCombobox } from "./AsyncCombobox";
import { IrisBadge } from "./IrisBadge";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("sr");
});

async function useLanguage(lng: "sr" | "en"): Promise<void> {
  await ensureLanguageBundle(lng);
  await i18n.changeLanguage(lng);
}

const items = [
  { id: "a", label: "Alfa" },
  { id: "b", label: "Beta", sublabel: "Sub" },
];

describe("SearchableCombobox", () => {
  it("uses Serbian defaults and exposes combobox/listbox semantics", async () => {
    await useLanguage("sr");
    const user = userEvent.setup();
    render(<SearchableCombobox items={items} value={null} onSelect={() => {}} />);

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Izaberite stavku");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText("Pretraga...")).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("uses English defaults and supports keyboard selection", async () => {
    await useLanguage("en");
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SearchableCombobox items={items} value={null} onSelect={onSelect} />);

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Select an item");
    await user.click(trigger);

    const search = screen.getByPlaceholderText("Search...");
    expect(search).toHaveAttribute("aria-label", "Search");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("shows the translated empty text", async () => {
    await useLanguage("en");
    const user = userEvent.setup();
    render(<SearchableCombobox items={items} value={null} onSelect={() => {}} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search..."), "zzz");
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });
});

describe("AsyncCombobox", () => {
  it("renders translated placeholder and empty text", async () => {
    await useLanguage("en");
    const user = userEvent.setup();
    render(
      <AsyncCombobox
        selectedLabel={null}
        onSearch={() => Promise.resolve([])}
        onSelect={() => {}}
      />,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Select an item");
    await user.click(trigger);
    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });
});

describe("IrisBadge", () => {
  it("renders the status label in the active language", async () => {
    await useLanguage("en");
    render(<IrisBadge status="completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});
