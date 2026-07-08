import { lazy, Suspense, startTransition, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Login } from "@/components/Login/Login";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { AuthContext } from "@/contexts/AuthContext";
import { OrganizationContext } from "@/contexts/OrganizationContext";
import {
  DEFAULT_FIRM_NAME,
  DEFAULT_PDF_SECTIONS,
  DEFAULT_PROFORMA_ONLY,
  type PDFSections,
} from "@/types/settings";
import i18n from "@/i18n";

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

function App(): React.JSX.Element {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [bootstrapState, setBootstrapState] = useState<AppBootstrapState>({
    kind: "loading",
  });
  const [firmName, setFirmName] = useState(DEFAULT_FIRM_NAME);
  const [pdfSections, setPdfSections] =
    useState<PDFSections>(DEFAULT_PDF_SECTIONS);
  const [proformaOnly, setProformaOnly] = useState(DEFAULT_PROFORMA_ONLY);

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

      // The firm name is shop branding shown across the app; load it once the
      // session is known. A failure just keeps the default name.
      if (authed) {
        try {
          const settings = await window.api.getSettings();
          if (settings?.firmName) setFirmName(settings.firmName);
          if (settings?.pdfSections) setPdfSections(settings.pdfSections);
          if (typeof settings?.proformaOnly === "boolean")
            setProformaOnly(settings.proformaOnly);
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
    void window.api.logout().finally(() => setCurrentUser(null));
  }, []);

  const handleLoginSuccess = useCallback(
    (user: AuthenticatedUser) => setCurrentUser(user),
    [],
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
      <Suspense fallback={<RouteLoadingScreen />}>
        <Routes>
          <Route path="/public/work-orders/:token" element={<PublicWorkOrderPage />} />
          <Route
            path="*"
            element={
              !currentUser ? (
                <Login onLoginSuccess={handleLoginSuccess} />
              ) : (
                <AuthContext.Provider value={{ currentUser, onLogout: handleLogout }}>
                  <OrganizationContext.Provider
                    value={{
                      firmName,
                      setFirmName,
                      pdfSections,
                      setPdfSections,
                      proformaOnly,
                      setProformaOnly,
                    }}
                  >
                  <TooltipProvider>
                    <Routes>
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
                        <Route path="/users" element={<UsersPage />} />
                      )}
                    </Routes>
                    <CommandPalette />
                    <Toaster />
                  </TooltipProvider>
                  </OrganizationContext.Provider>
                </AuthContext.Provider>
              )
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
