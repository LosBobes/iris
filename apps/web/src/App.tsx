import { lazy, Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { BrowserRouter, Routes, Route, Outlet, useNavigate } from "react-router-dom";
import { Login } from "@/components/Login/Login";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { InteractiveTourProvider } from "@/components/tour/InteractiveTourProvider";
import { AppShell } from "@/components/layout/AppShell";
import { AuthContext } from "@/contexts/AuthContext";
import { OrganizationContext } from "@/contexts/OrganizationContext";
import {
  DEFAULT_BILLING_DEFAULTS,
  DEFAULT_FIRM_NAME,
  DEFAULT_PDF_SECTIONS,
  DEFAULT_PRINT_ITEM_COLUMNS,
  DEFAULT_PRIORITY_DEFAULTS,
  DEFAULT_SHOW_SHIPPING_OPTIONS,
  normalizePrintItemColumns,
  type BillingDefaults,
  type PDFSections,
  type PrintItemColumn,
  type PriorityDefaults,
} from "@/types/settings";
import i18n from "@/i18n";
import { clearSentryUser, setSentryUser } from "@/lib/sentry";
import {
  activeOrganizationSlug,
  clearReturnLocation,
  currentLocation,
  isRestorableLocation,
  subscribeSessionExpired,
  takeReturnLocation,
} from "@/lib/session";
import { reportUnexpectedError } from "@/lib/errors";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const CustomerDetailPage = lazy(() => import("@/pages/CustomerDetailPage"));
const CatalogPage = lazy(() => import("@/pages/CatalogPage"));
const CatalogDetailPage = lazy(() => import("@/pages/CatalogDetailPage"));
const PublicWorkOrderPage = lazy(() => import("@/pages/PublicWorkOrderPage"));
const WorkOrderCreatePage = lazy(() => import("@/pages/WorkOrderCreatePage"));
const WorkOrderDetailPage = lazy(() => import("@/pages/WorkOrderDetailPage"));
const WorkOrderEditPage = lazy(() => import("@/pages/WorkOrderEditPage"));
const WorkOrdersPage = lazy(() => import("@/pages/WorkOrdersPage"));
const CostReviewPage = lazy(() => import("@/pages/CostReviewPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));

type AppBootstrapState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function StartupLoadingScreen(): React.JSX.Element {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground"
      style={{ animation: "iris-fade-in 280ms var(--iris-ease-out) both 200ms" }}
    >
      <div className="flex items-center gap-3 text-sm text-[color:var(--iris-ink-soft)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Povezivanje sa backend servisom...</span>
      </div>
    </main>
  );
}

/**
 * Pathless layout route: renders the sidebar/shell once and keeps it mounted
 * across page navigations (the pages render into `<Outlet />`), instead of
 * every page remounting its own `<AppShell>` and refiring shell-level effects
 * (e.g. the cost-review badge count) on every route change.
 */
function AppShellLayout(): React.JSX.Element {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function RouteLoadingScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex items-center gap-3 text-sm text-[color:var(--iris-ink-soft)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{t("app.loading")}</span>
      </div>
    </main>
  );
}

function BackendUnavailableScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="animate-iris-enter w-full max-w-xl border border-border bg-card px-8 py-7">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t("app.backendEyebrow")}
        </div>
        <h1 className="mt-2 text-[26px] font-normal tracking-[-0.6px] text-foreground">
          {t("app.backendUnavailable")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--iris-ink-soft)]">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="iris-focusable iris-press mt-6 bg-foreground px-4 py-2.5 text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
        >
          {t("app.retry")}
        </button>
      </div>
    </main>
  );
}

/**
 * The login screen, plus the return trip afterwards.
 *
 * The login form replaces the whole app at whatever URL the operator was on, so
 * signing back in normally puts them exactly where they were with no navigation
 * at all. The remembered location is the fallback for the cases where the URL
 * did not survive — a reload that landed on the root, or a tab opened fresh.
 */
function LoginRoute({
  sessionExpired,
  onLoginSuccess,
}: {
  sessionExpired: boolean;
  onLoginSuccess: (user: AuthenticatedUser, orgSlug: string) => void;
}): React.JSX.Element {
  const navigate = useNavigate();

  const handleSuccess = useCallback(
    (user: AuthenticatedUser, orgSlug: string) => {
      const returnTo = takeReturnLocation();
      onLoginSuccess(user, orgSlug);
      // Staying put is the common case and the correct one: the address bar
      // still points at the page the session expired on.
      if (returnTo && !isRestorableLocation(currentLocation())) {
        navigate(returnTo, { replace: true });
      }
    },
    [navigate, onLoginSuccess],
  );

  return (
    <Login onLoginSuccess={handleSuccess} sessionExpired={sessionExpired} />
  );
}

function App(): React.JSX.Element {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [bootstrapState, setBootstrapState] = useState<AppBootstrapState>({
    kind: "loading",
  });
  const [sessionExpired, setSessionExpired] = useState(false);
  const [firmName, setFirmName] = useState(DEFAULT_FIRM_NAME);
  const [pdfSections, setPdfSections] =
    useState<PDFSections>(DEFAULT_PDF_SECTIONS);
  const [billingDefaults, setBillingDefaults] = useState<BillingDefaults>(
    DEFAULT_BILLING_DEFAULTS,
  );
  const [priorityDefaults, setPriorityDefaults] = useState<PriorityDefaults>(
    DEFAULT_PRIORITY_DEFAULTS,
  );
  const [printItemColumns, setPrintItemColumns] = useState<PrintItemColumn[]>(
    DEFAULT_PRINT_ITEM_COLUMNS,
  );
  const [showShippingOptions, setShowShippingOptions] = useState(
    DEFAULT_SHOW_SHIPPING_OPTIONS,
  );

  const checkBackendStatus = useCallback(async () => {
    startTransition(() => {
      setBootstrapState({ kind: "loading" });
    });

    try {
      const status = await window.api.getBackendStatus();
      if (!status.ready) {
        startTransition(() => {
          setBootstrapState({
            kind: "error",
            message:
              status.message ?? i18n.t("app.backendUnavailableMessage"),
          });
        });
        return;
      }

      const session = await window.api.getCurrentSession();
      const authed = session.success && session.user ? session.user : null;
      if (authed) {
        setSentryUser(authed, activeOrganizationSlug());
      } else {
        clearSentryUser();
      }

      // The firm name is shop branding shown across the app; load it once the
      // session is known. A failure just keeps the default name.
      if (authed) {
        try {
          const settings = await window.api.getSettings();
          if (settings?.firmName) setFirmName(settings.firmName);
          if (settings?.pdfSections) setPdfSections(settings.pdfSections);
          if (settings?.billingDefaults)
            setBillingDefaults(settings.billingDefaults);
          if (settings?.priorityDefaults)
            setPriorityDefaults(settings.priorityDefaults);
          if (settings?.printItemColumns)
            setPrintItemColumns(
              normalizePrintItemColumns(settings.printItemColumns),
            );
          if (typeof settings?.showShippingOptions === "boolean")
            setShowShippingOptions(settings.showShippingOptions);
        } catch {
          // Keep the default firm name.
        }
      }

      startTransition(() => {
        setCurrentUser(authed);
        setBootstrapState({ kind: "ready" });
      });
    } catch {
      startTransition(() => {
        setBootstrapState({
          kind: "error",
          message: i18n.t("app.backendCheckError"),
        });
      });
    }
  }, []);

  useEffect(() => {
    void checkBackendStatus();
  }, [checkBackendStatus]);

  const handleLogout = useCallback(() => {
    // A deliberate sign-out is not a session to resume, so the remembered page
    // goes with it — otherwise the next login would silently reopen it.
    clearReturnLocation();
    setSessionExpired(false);
    clearSentryUser();
    void window.api
      .logout()
      .catch((error: unknown) => {
        // The cookie is cleared server-side or it is not; either way the
        // operator asked to be signed out, so the UI honours it regardless.
        reportUnexpectedError("App.logout", error);
      })
      .finally(() => setCurrentUser(null));
  }, []);

  const handleLoginSuccess = useCallback(
    (user: AuthenticatedUser, orgSlug: string) => {
      setSessionExpired(false);
      setSentryUser(user, orgSlug);
      setCurrentUser(user);
    },
    [],
  );

  /**
   * Forces a re-login the moment the API says the session is gone.
   *
   * Several requests are usually in flight when a session lapses, so this fires
   * once per failed request; the ref keeps that to a single transition. The page
   * the operator was on is captured by `notifySessionExpired` before this runs.
   */
  const sessionExpiryHandled = useRef(false);
  useEffect(() => {
    return subscribeSessionExpired(() => {
      if (sessionExpiryHandled.current) return;
      sessionExpiryHandled.current = true;
      clearSentryUser();
      startTransition(() => {
        setSessionExpired(true);
        setCurrentUser(null);
      });
    });
  }, []);

  // Arms the guard again once the operator is back in, so a second expiry in
  // the same tab is handled like the first.
  useEffect(() => {
    if (currentUser) sessionExpiryHandled.current = false;
  }, [currentUser]);

  const authContextValue = useMemo(
    () =>
      currentUser
        ? { currentUser, onLogout: handleLogout }
        : null,
    [currentUser, handleLogout],
  );

  const organizationContextValue = useMemo(
    () => ({
      firmName,
      setFirmName,
      pdfSections,
      setPdfSections,
      billingDefaults,
      setBillingDefaults,
      priorityDefaults,
      setPriorityDefaults,
      printItemColumns,
      setPrintItemColumns,
      showShippingOptions,
      setShowShippingOptions,
    }),
    [
      firmName,
      pdfSections,
      billingDefaults,
      priorityDefaults,
      printItemColumns,
      showShippingOptions,
    ],
  );

  if (bootstrapState.kind === "loading") {
    return <StartupLoadingScreen />;
  }

  if (bootstrapState.kind === "error") {
    return (
      <BackendUnavailableScreen
        message={bootstrapState.message}
        onRetry={() => {
          void checkBackendStatus();
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <RouteErrorBoundary>
        <Suspense fallback={<RouteLoadingScreen />}>
          <Routes>
            <Route path="/public/work-orders/:token" element={<PublicWorkOrderPage />} />
            <Route
              path="*"
              element={
                !currentUser ? (
                  <LoginRoute
                    sessionExpired={sessionExpired}
                    onLoginSuccess={handleLoginSuccess}
                  />
                ) : (
                  <AuthContext.Provider value={authContextValue}>
                    <OrganizationContext.Provider value={organizationContextValue}>
                    <TooltipProvider>
                      <InteractiveTourProvider>
                        <Routes>
                          <Route element={<AppShellLayout />}>
                            <Route path="/" element={<DashboardPage />} />
                            <Route path="/customers" element={<CustomersPage />} />
                            <Route path="/customers/new" element={<CustomerDetailPage />} />
                            <Route path="/customers/:id" element={<CustomerDetailPage />} />
                            <Route path="/catalog" element={<CatalogPage />} />
                            <Route path="/catalog/new" element={<CatalogDetailPage />} />
                            <Route path="/catalog/:id" element={<CatalogDetailPage />} />
                            <Route path="/work-orders" element={<WorkOrdersPage />} />
                            <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
                            <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
                            <Route path="/work-orders/:id/edit" element={<WorkOrderEditPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/help" element={<HelpPage />} />
                            {currentUser.role === "admin" && (
                              <>
                                <Route path="/cost-review" element={<CostReviewPage />} />
                                <Route path="/users" element={<UsersPage />} />
                              </>
                            )}
                          </Route>
                        </Routes>
                        <CommandPalette />
                      </InteractiveTourProvider>
                      <Toaster />
                    </TooltipProvider>
                    </OrganizationContext.Provider>
                  </AuthContext.Provider>
                )
              }
            />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
