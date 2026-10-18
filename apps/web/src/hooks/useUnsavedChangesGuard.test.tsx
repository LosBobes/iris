// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useNavigate,
} from "react-router-dom";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const strings = sr.unsavedChanges;

function FormPage() {
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChangesGuard(dirty);
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => setDirty(true)}>edit</button>
      <button onClick={() => setDirty(false)}>revert</button>
      <button
        onClick={() => {
          guard.allowNavigation();
          navigate("/done");
        }}
      >
        save
      </button>
      <button onClick={() => navigate("/other")}>go-other</button>
      <button onClick={() => navigate("/form?tab=2")}>same-route</button>
      <UnsavedChangesDialog {...guard} />
    </div>
  );
}

function renderApp() {
  const router = createMemoryRouter(
    [
      { path: "/form", element: <FormPage /> },
      { path: "/other", element: <p>other page</p> },
      { path: "/done", element: <p>done page</p> },
    ],
    { initialEntries: ["/form"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useUnsavedChangesGuard", () => {
  it("does not block navigation while the form is clean", async () => {
    const router = renderApp();
    await userEvent.click(screen.getByText("go-other"));
    expect(await screen.findByText("other page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/other");
  });

  it("blocks navigation when dirty and shows the confirm dialog", async () => {
    const router = renderApp();
    await userEvent.click(screen.getByText("edit"));
    await userEvent.click(screen.getByText("go-other"));

    expect(await screen.findByText(strings.title)).toBeInTheDocument();
    expect(screen.getByText(strings.description)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/form");
  });

  it("proceeds when the operator confirms leaving, without prompting twice", async () => {
    const router = renderApp();
    await userEvent.click(screen.getByText("edit"));
    await userEvent.click(screen.getByText("go-other"));
    await userEvent.click(await screen.findByRole("button", { name: strings.leave }));

    expect(await screen.findByText("other page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/other");
    expect(screen.queryByText(strings.title)).not.toBeInTheDocument();
  });

  it("stays on the page when the operator cancels", async () => {
    const router = renderApp();
    await userEvent.click(screen.getByText("edit"));
    await userEvent.click(screen.getByText("go-other"));
    await userEvent.click(await screen.findByRole("button", { name: strings.stay }));

    await waitFor(() =>
      expect(screen.queryByText(strings.title)).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/form");
    expect(screen.getByText("edit")).toBeInTheDocument();
  });

  it("does not block a navigation that follows a successful save", async () => {
    renderApp();
    await userEvent.click(screen.getByText("edit"));
    await userEvent.click(screen.getByText("save"));

    expect(await screen.findByText("done page")).toBeInTheDocument();
    expect(screen.queryByText(strings.title)).not.toBeInTheDocument();
  });

  it("does not block same-path search param changes", async () => {
    const router = renderApp();
    await userEvent.click(screen.getByText("edit"));
    await userEvent.click(screen.getByText("same-route"));

    await waitFor(() => expect(router.state.location.search).toBe("?tab=2"));
    expect(screen.queryByText(strings.title)).not.toBeInTheDocument();
  });

  it("stops blocking once the form is clean again", async () => {
    renderApp();
    await userEvent.click(screen.getByText("edit"));
    await userEvent.click(screen.getByText("revert"));
    await userEvent.click(screen.getByText("go-other"));
    expect(await screen.findByText("other page")).toBeInTheDocument();
  });

  it("registers beforeunload only while dirty", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const calls = (spy: typeof add) =>
      spy.mock.calls.filter(([type]) => type === "beforeunload");

    renderApp();
    expect(calls(add)).toHaveLength(0);

    await userEvent.click(screen.getByText("edit"));
    expect(calls(add)).toHaveLength(1);

    const event = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);

    await userEvent.click(screen.getByText("revert"));
    expect(calls(remove)).toHaveLength(1);
  });

  it("degrades gracefully outside a data router", async () => {
    render(
      <MemoryRouter initialEntries={["/form"]}>
        <FormPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByText("edit"));
    await userEvent.click(screen.getByText("go-other"));
    expect(screen.queryByText(strings.title)).not.toBeInTheDocument();
  });
});
