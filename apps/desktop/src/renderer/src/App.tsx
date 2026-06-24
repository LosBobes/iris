import { startTransition, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import i18n from "@/i18n";
import { Login } from "@/components/Login/Login";
import DashboardPage from "@/pages/DashboardPage";
import WorkOrderCreatePage from "@/pages/WorkOrderCreatePage";
import WorkOrderDetailPage from "@/pages/WorkOrderDetailPage";
import WorkOrderEditPage from "@/pages/WorkOrderEditPage";
import WorkOrdersPage from "@/pages/WorkOrdersPage";
import CatalogPage from "@/pages/CatalogPage";
import { Toaster } from "@/components/ui/sonner";
import { AuthContext } from "@/contexts/AuthContext";

function AccessDenied(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="animate-iris-fade text-muted-foreground">
        {t("app.accessDenied")}
      </p>
    </main>
  );
}

type AppBootstrapState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function StartupLoadingScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground"
      style={{ animation: "iris-fade-in 280ms var(--iris-ease-out) both 200ms" }}
    >
      <div className="flex items-center gap-3 text-sm text-[color:var(--iris-ink-soft)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{t("app.backendConnecting")}</span>
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

  const checkBackendStatus = useCallback(async () => {
    startTransition(() => {
      setBootstrapState({ kind: "loading" });
    });

    try {
      const status = await window.api.getBackendStatus();

      startTransition(() => {
        setBootstrapState(
          status.ready
            ? { kind: "ready" }
            : {
                kind: "error",
                message:
                  status.message ?? i18n.t("app.backendUnavailableMessage"),
              },
        );
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

  const handleLogout = useCallback(() => setCurrentUser(null), []);

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

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentUser.role !== "admin") {
    return <AccessDenied />;
  }

  return (
    <AuthContext.Provider value={{ currentUser, onLogout: handleLogout }}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/work-orders" element={<WorkOrdersPage />} />
          <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
          <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
          <Route path="/work-orders/:id/edit" element={<WorkOrderEditPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </AuthContext.Provider>
  );
}

export default App;
