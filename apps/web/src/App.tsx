import { lazy, Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  createBrowserRouter,
  RouterProvider,
  Routes,
  Route,
  Outlet,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { LoginFlow } from "@/components/Login/LoginFlow";
import { loginEntryPath } from "@/lib/organization-login";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { InteractiveTourProvider } from "@/components/tour/InteractiveTourProvider";
import { ModuleGate } from "@/components/ModuleGate";
import { AppShell } from "@/components/layout/AppShell";
import { AuthContext } from "@/contexts/AuthContext";
import { OrganizationContext } from "@/contexts/OrganizationContext";
import {
  DEFAULT_BILLING_DEFAULTS,
  DEFAULT_FIRM_NAME,
  DEFAULT_ORGANIZATION_MODULES,
  DEFAULT_PDF_SECTIONS,
  DEFAULT_PRINT_ITEM_COLUMNS,
  DEFAULT_PRIORITY_DEFAULTS,
  DEFAULT_SHOW_SHIPPING_OPTIONS,
  normalizeOrganizationModules,
  normalizePrintItemColumns,
  type BillingDefaults,
  type OrganizationModules,
  type OrganizationSettings,
  type PDFSections,
  type PrintItemColumn,
  type PriorityDefaults,
} from "@/types/settings";
import i18n from "@/i18n";
import { clearSentryUser, setSentryUser } from "@/lib/sentry";
import {
  activeOrganizationSlug,
  clearReturnLocation,
  subscribeSessionExpired,
} from "@/lib/session";
import { reportUnexpectedError } from "@/lib/errors";
import { subscribeAuthChange } from "@/lib/auth-broadcast";
import {
  clearQueryCache,
  queryClient,
  queryKeys,
  REFERENCE_STALE_TIME_MS,
} from "@/lib/query-client";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const CustomerDetailPage = lazy(() => import("@/pages/CustomerDetailPage"));
const CatalogPage = lazy(() => import("@/pages/CatalogPage"));
const CatalogDetailPage = lazy(() => import("@/pages/CatalogDetailPage"));
const StockPage = lazy(() => import("@/pages/StockPage"));
const StockHistoryPage = lazy(() => import("@/pages/StockHistoryPage"));
const PlanningPage = lazy(() => import("@/pages/PlanningPage"));
const PlanningResourcesPage = lazy(() => import("@/pages/PlanningResourcesPage"));
const MyQueuePage = lazy(() => import("@/pages/MyQueuePage"));
const PlanningPrintPage = lazy(() => import("@/pages/PlanningPrintPage"));
const AttendancePage = lazy(() => import("@/pages/AttendancePage"));
const PublicWorkOrderPage = lazy(() => import("@/pages/PublicWorkOrderPage"));
const WorkOrderCreatePage = lazy(() => import("@/pages/WorkOrderCreatePage"));
const WorkOrderDetailPage = lazy(() => import("@/pages/WorkOrderDetailPage"));
const WorkOrderEditPage = lazy(() => import("@/pages/WorkOrderEditPage"));
const WorkOrdersPage = lazy(() => import("@/pages/WorkOrdersPage"));
const CostReviewPage = lazy(() => import("@/pages/CostReviewPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ProcessTemplatePage = lazy(() => import("@/pages/ProcessTemplatePage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));
const DocsPage = lazy(() => import("@/pages/DocsPage"));
const PlatformConsole = lazy(() => import("@/components/platform/PlatformConsole"));

type AppBootstrapState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function StartupLoadingScreen(): React.JSX.Element {
  return (
    <main
      className="iris-screen bg-background text-foreground"
      style={{ animation: "iris-fade-in 280ms var(--iris-ease-out) both 200ms" }}
    >
      <div className="flex min-h-full items-center justify-center px-6 py-8">
        <div className="flex items-center gap-3 text-sm text-[color:var(--iris-ink-soft)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Povezivanje sa backend servisom...</span>
        </div>
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
    <main className="iris-screen bg-background text-foreground">
      <div className="flex min-h-full items-center justify-center px-6 py-8">
        <div className="flex items-center gap-3 text-sm text-[color:var(--iris-ink-soft)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{t("app.loading")}</span>
        </div>
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
    <main className="iris-screen bg-background text-foreground">
      <div className="flex min-h-full items-center justify-center px-6 py-8">
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
      </div>
    </main>
  );
}

function AppContent(): React.JSX.Element {
  const navigate = useNavigate();
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
  const [modules, setModules] = useState<OrganizationModules>(
    DEFAULT_ORGANIZATION_MODULES,
  );

  /**
   * Applies a settings response, falling back to the default for anything the
   * response does not carry. Every field is written on every apply: the values
   * are per-tenant, so leaving a stale one in place would let one shop's
   * branding and toggles survive into the next sign-in in the same tab.
   * Passing null resets the app to the defaults.
   */
  const applyOrganizationSettings = useCallback(
    (settings: OrganizationSettings | null | undefined) => {
      setFirmName(settings?.firmName || DEFAULT_FIRM_NAME);
      setPdfSections(settings?.pdfSections ?? DEFAULT_PDF_SECTIONS);
      setBillingDefaults(settings?.billingDefaults ?? DEFAULT_BILLING_DEFAULTS);
      setPriorityDefaults(
        settings?.priorityDefaults ?? DEFAULT_PRIORITY_DEFAULTS,
      );
      setPrintItemColumns(
        normalizePrintItemColumns(settings?.printItemColumns),
      );
      setShowShippingOptions(
        typeof settings?.showShippingOptions === "boolean"
          ? settings.showShippingOptions
          : DEFAULT_SHOW_SHIPPING_OPTIONS,
      );
      // Optional modules are off unless the server says otherwise.
      setModules(normalizeOrganizationModules(settings?.modules));
    },
    [],
  );

  /**
   * Loads the shop-wide settings for the signed-in session. `GET /settings` is
   * session-scoped, so this runs on every path that starts a session — the
   * bootstrap below when the cookie is already valid, and the login handler
   * when the operator signs in on a page that bootstrapped signed-out.
   */
  const loadOrganizationSettings = useCallback(async () => {
    try {
      applyOrganizationSettings(
        await queryClient.fetchQuery({
          queryKey: queryKeys.settings,
          queryFn: () => window.api.getSettings(),
          staleTime: REFERENCE_STALE_TIME_MS,
        }),
      );
    } catch {
      // Keep whatever the app already has (the defaults on a fresh boot); the
      // next sign-in tries again.
    }
  }, [applyOrganizationSettings]);

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

      // Settings are shop-wide branding and form policy shown across the app;
      // load them before the app renders so nothing flashes the defaults first.
      if (authed) {
        await loadOrganizationSettings();
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
  }, [loadOrganizationSettings]);

  useEffect(() => {
    void checkBackendStatus();
  }, [checkBackendStatus]);

  // Another tab signed in, signed out or started/ended an impersonation: the
  // shared cookie now belongs to a different session, so drop this tab's
  // cache and re-check who is signed in.
  useEffect(() => {
    return subscribeAuthChange(() => {
      clearQueryCache();
      void checkBackendStatus();
    });
  }, [checkBackendStatus]);

  const handleLogout = useCallback(() => {
    const impersonating = Boolean(currentUser?.impersonatedBy);
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
      .finally(() => {
        if (impersonating) {
          // Ending an impersonation goes back to the Backoffice it started
          // from, with a full load so nothing of that organization lingers.
          window.location.assign("/backoffice");
          return;
        }
        setCurrentUser(null);
        // Straight to this organization's sign-in page, so the page being
        // left is not mistaken for a deep link to return to.
        navigate(loginEntryPath(), { replace: true });
        // The settings belong to the organization that just signed out, so they
        // go with it: the next sign-in loads its own.
        applyOrganizationSettings(null);
        clearQueryCache();
      });
  }, [applyOrganizationSettings, currentUser?.impersonatedBy, navigate]);

  const handleLoginSuccess = useCallback(
    (user: AuthenticatedUser, orgSlug: string) => {
      setSessionExpired(false);
      // A new session may be another organization: drop the previous cache.
      clearQueryCache();
      setSentryUser(user, orgSlug);
      setCurrentUser(user);
      // Signing in here is the start of a session the bootstrap never saw: the
      // page loaded signed-out, so it skipped the settings load. Without this
      // the whole session would run on the defaults — shipping options hidden,
      // document type back to proforma, default branding — until a reload.
      void loadOrganizationSettings();
    },
    [loadOrganizationSettings],
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
      // Cached data belongs to the lapsed session's organization.
      clearQueryCache();
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
      modules,
    }),
    [
      firmName,
      pdfSections,
      billingDefaults,
      priorityDefaults,
      printItemColumns,
      showShippingOptions,
      modules,
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
    <RouteErrorBoundary>
        <Suspense fallback={<RouteLoadingScreen />}>
          <Routes>
            <Route path="/public/work-orders/:token" element={<PublicWorkOrderPage />} />
            {/* Backoffice: superadmin session, independent of any organization. */}
            <Route path="/backoffice/*" element={<PlatformConsole />} />
            <Route
              path="*"
              element={
                !currentUser ? (
                  <LoginFlow
                    sessionExpired={sessionExpired}
                    onLoginSuccess={handleLoginSuccess}
                  />
                ) : (
                  <AuthContext.Provider value={authContextValue}>
                    <OrganizationContext.Provider value={organizationContextValue}>
                    <TooltipProvider>
                      <InteractiveTourProvider>
                        <Routes>
                          {/* Already signed in: the sign-in pages have nothing to show. */}
                          <Route path="/login/*" element={<Navigate to="/" replace />} />
                          {/* Printable dispatch list: outside the shell so only the sheets print. */}
                          <Route path="/planning/print" element={<ModuleGate module="planning"><PlanningPrintPage /></ModuleGate>} />
                          <Route element={<AppShellLayout />}>
                            <Route path="/" element={<DashboardPage />} />
                            <Route path="/customers" element={<CustomersPage />} />
                            <Route path="/customers/new" element={<CustomerDetailPage />} />
                            <Route path="/customers/:id" element={<CustomerDetailPage />} />
                            <Route path="/catalog" element={<CatalogPage />} />
                            <Route path="/catalog/new" element={<CatalogDetailPage />} />
                            <Route path="/catalog/:id" element={<CatalogDetailPage />} />
                            <Route path="/stock" element={<ModuleGate module="stock"><StockPage /></ModuleGate>} />
                            <Route path="/stock/:catalogItemId" element={<ModuleGate module="stock"><StockHistoryPage /></ModuleGate>} />
                            <Route path="/planning" element={<ModuleGate module="planning"><PlanningPage /></ModuleGate>} />
                            <Route path="/planning/resources" element={<ModuleGate module="planning"><PlanningResourcesPage /></ModuleGate>} />
                            <Route path="/planning/my-queue" element={<ModuleGate module="planning"><MyQueuePage /></ModuleGate>} />
                            <Route path="/attendance" element={<ModuleGate module="attendance"><AttendancePage /></ModuleGate>} />
                            <Route path="/work-orders" element={<WorkOrdersPage />} />
                            <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
                            <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
                            <Route path="/work-orders/:id/edit" element={<WorkOrderEditPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/help" element={<HelpPage />} />
                            <Route path="/docs" element={<DocsPage />} />
                            <Route path="/docs/:chapterId" element={<DocsPage />} />
                            {currentUser.role === "admin" && (
                              <>
                                <Route path="/cost-review" element={<CostReviewPage />} />
                                <Route path="/users" element={<UsersPage />} />
                                <Route path="/settings/processes/new" element={<ModuleGate module="processes"><ProcessTemplatePage /></ModuleGate>} />
                                <Route path="/settings/processes/:id" element={<ModuleGate module="processes"><ProcessTemplatePage /></ModuleGate>} />
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
  );
}

/**
 * The app runs on a data router (rather than `<BrowserRouter>`) because
 * `useBlocker` — used by the unsaved-changes guard — needs one. A single
 * catch-all route hosts the whole app; the real route tree (with its auth
 * gating, which depends on component state) stays as nested `<Routes>` inside
 * `AppContent`. The router is created once per mounted App.
 */
function App(): React.JSX.Element {
  const [router] = useState(() =>
    createBrowserRouter([{ path: "*", element: <AppContent /> }]),
  );
  return <RouterProvider router={router} />;
}

export default App;
