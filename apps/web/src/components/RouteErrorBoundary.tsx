import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { withTranslation, type WithTranslation } from "react-i18next";

/**
 * Recognises the browser's "the chunk I asked for is not there" errors.
 *
 * Every route in this app is a lazily imported chunk whose filename carries a
 * content hash. After a deploy those hashes change, so a browser still holding
 * the previous index.html — or a tab that was left open across the deploy —
 * requests a chunk the server no longer has. The dynamic import rejects, and
 * with nothing catching it the whole tree unmounts to a blank page.
 *
 * The wording differs per engine, so this matches on all of them rather than on
 * one browser's phrasing.
 */
function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i.test(
    `${error.name}: ${error.message}`,
  );
}

// Reloading is the correct recovery for a stale chunk: it re-fetches
// index.html and picks up the current hashes. It is also the one recovery that
// can loop, so a reload is only ever attempted once per short window — if the
// chunk is still missing afterwards the cause is not a stale document, and the
// operator gets the fallback screen instead of an endless refresh.
const RELOAD_MARKER_KEY = "iris:stale-chunk-reload";
const RELOAD_COOLDOWN_MS = 30_000;

function shouldAutoReload(): boolean {
  try {
    const previous = Number(window.sessionStorage.getItem(RELOAD_MARKER_KEY));
    if (Number.isFinite(previous) && Date.now() - previous < RELOAD_COOLDOWN_MS) {
      return false;
    }
    window.sessionStorage.setItem(RELOAD_MARKER_KEY, String(Date.now()));
    return true;
  } catch {
    // Private mode or blocked storage: no marker means no loop protection, so
    // do not reload on our own — the operator can still use the button.
    return false;
  }
}

interface RouteErrorBoundaryProps extends WithTranslation {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
  reloading: boolean;
}

/**
 * Catches render-time errors below it so a single failing route shows a
 * recoverable screen instead of a blank page.
 */
class RouteErrorBoundaryBase extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    if (isStaleChunkError(error) && shouldAutoReload()) {
      window.location.reload();
      // Keep the loading screen up while the reload is in flight rather than
      // flashing the error screen for the moment before the page goes away.
      return { error, reloading: true };
    }
    return { error, reloading: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // A stale chunk is a deploy artefact, not a code defect, and it resolves
    // itself on the reload — reporting it would bury real crashes under a
    // spike of noise on every release.
    if (isStaleChunkError(error)) return;
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error, reloading } = this.state;
    const { t, children } = this.props;

    if (!error) return children;

    if (reloading) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
          <div className="text-sm text-[color:var(--iris-ink-soft)]">
            {t("app.loading")}
          </div>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="animate-iris-enter w-full max-w-xl border border-border bg-card px-8 py-7">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("app.errorEyebrow")}
          </div>
          <h1 className="mt-2 text-[26px] font-normal tracking-[-0.6px] text-foreground">
            {t("app.errorTitle")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--iris-ink-soft)]">
            {isStaleChunkError(error)
              ? t("app.errorStaleVersionMessage")
              : t("app.errorMessage")}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="iris-focusable iris-press mt-6 bg-foreground px-4 py-2.5 text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
          >
            {t("app.reload")}
          </button>
        </div>
      </main>
    );
  }
}

export const RouteErrorBoundary = withTranslation()(RouteErrorBoundaryBase);
