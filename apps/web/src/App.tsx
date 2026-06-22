import { lazy, Suspense, startTransition, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Login } from "@/components/Login/Login";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { AuthContext } from "@/contexts/AuthContext";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const PublicWorkOrderPage = lazy(() => import("@/pages/PublicWorkOrderPage"));
const WorkOrderCreatePage = lazy(() => import("@/pages/WorkOrderCreatePage"));
const WorkOrderDetailPage = lazy(() => import("@/pages/WorkOrderDetailPage"));
const WorkOrderEditPage = lazy(() => import("@/pages/WorkOrderEditPage"));
const WorkOrdersPage = lazy(() => import("@/pages/WorkOrdersPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

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
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex items-center gap-3 text-sm text-[color:var(--iris-ink-soft)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Učitavanje...</span>
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
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="animate-iris-enter w-full max-w-xl border border-border bg-card px-8 py-7">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          Iris · backend
        </div>
        <h1 className="mt-2 text-[26px] font-normal tracking-[-0.6px] text-foreground">
          Backend nije dostupan
        </h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--iris-ink-soft)]">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="iris-focusable iris-press mt-6 bg-foreground px-4 py-2.5 text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90"
        >
          Pokušaj ponovo
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
              status.message ??
              "Backend servis trenutno nije dostupan.",
          });
        });
        return;
      }

      const session = await window.api.getCurrentSession();

      startTransition(() => {
        setCurrentUser(session.success && session.user ? session.user : null);
        setBootstrapState({ kind: "ready" });
      });
    } catch {
      startTransition(() => {
        setBootstrapState({
          kind: "error",
          message:
            "Greška pri proveri backend servisa. Proverite konfiguraciju i pokušajte ponovo.",
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
                  <TooltipProvider>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/customers" element={<CustomersPage />} />
                      <Route path="/work-orders" element={<WorkOrdersPage />} />
                      <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
                      <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
                      <Route path="/work-orders/:id/edit" element={<WorkOrderEditPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                    <CommandPalette />
                    <Toaster />
                  </TooltipProvider>
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
