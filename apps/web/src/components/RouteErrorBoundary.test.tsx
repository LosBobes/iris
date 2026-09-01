// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const strings = sr.app;

// The stale-chunk path recovers by reloading, which jsdom does not implement.
const reload = vi.fn();

function Boom({ error }: { error: Error }): React.JSX.Element {
  throw error;
}

function staleChunkError(): Error {
  return new Error(
    "Failed to fetch dynamically imported module: https://iris-application.com/assets/DashboardPage-a1b2c3d4.js",
  );
}

beforeEach(() => {
  reload.mockClear();
  window.sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  // React logs caught render errors; keep the test output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(
      <RouteErrorBoundary>
        <p>Radni nalozi</p>
      </RouteErrorBoundary>,
    );

    expect(screen.getByText("Radni nalozi")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows a recoverable screen instead of a blank page on a render error", () => {
    render(
      <RouteErrorBoundary>
        <Boom error={new Error("boom")} />
      </RouteErrorBoundary>,
    );

    expect(screen.getByText(strings.errorTitle)).toBeInTheDocument();
    expect(screen.getByText(strings.errorMessage)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.reload }),
    ).toBeInTheDocument();
    // A genuine crash must not reload — that would loop on every render.
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once when a route chunk is missing after a deploy", () => {
    render(
      <RouteErrorBoundary>
        <Boom error={staleChunkError()} />
      </RouteErrorBoundary>,
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload again within the cooldown, so a broken deploy cannot loop", () => {
    render(
      <RouteErrorBoundary>
        <Boom error={staleChunkError()} />
      </RouteErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();

    // Second failure right after the reload: the chunk is still missing, so the
    // operator gets the fallback rather than an endless refresh.
    render(
      <RouteErrorBoundary>
        <Boom error={staleChunkError()} />
      </RouteErrorBoundary>,
    );

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(strings.errorStaleVersionMessage)).toBeInTheDocument();
  });
});
