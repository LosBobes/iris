import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlatformDashboard } from "./PlatformDashboard";
import { PlatformLogin } from "./PlatformLogin";
import { PlatformChangePassword } from "./PlatformChangePassword";
import type { PlatformAdmin } from "@/types/platform";

// Dashboard surfaces. Always dark, like an ops console, whatever the app
// theme; the chart palette in series.ts is validated against --pf-panel.
const CONSOLE_VARS = {
  "--pf-bg": "#111214",
  "--pf-panel": "#1a1b1e",
  "--pf-border": "#2a2c31",
  "--pf-grid": "#24262b",
  "--pf-text": "#e8e9ea",
  "--pf-text-2": "#a1a4ab",
  "--pf-muted": "#6f737b",
  colorScheme: "dark",
} as React.CSSProperties;

type ConsoleState = { kind: "checking" } | { kind: "signedOut" } | { kind: "signedIn"; admin: PlatformAdmin };

/**
 * The Backoffice at /backoffice, reached from the hidden gesture on the
 * organization picker. Being here grants nothing: the API checks a separate
 * superadmin session on every request.
 */
export function PlatformConsole(): React.JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<ConsoleState>({ kind: "checking" });

  useEffect(() => {
    let active = true;
    window.api
      .getPlatformSession()
      .then((session) => {
        if (!active) return;
        setState(
          session.success && session.admin
            ? { kind: "signedIn", admin: session.admin }
            : { kind: "signedOut" },
        );
      })
      .catch(() => {
        if (active) setState({ kind: "signedOut" });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = `Iris · ${t("platform.title")}`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  return (
    <div className="dark" style={CONSOLE_VARS}>
      {state.kind === "checking" ? (
        <div className="min-h-dvh bg-[color:var(--pf-bg)]" />
      ) : state.kind === "signedOut" ? (
        <PlatformLogin onSignedIn={(admin) => setState({ kind: "signedIn", admin })} />
      ) : state.admin.mustChangePassword ? (
        <div className="flex min-h-dvh items-center justify-center bg-[color:var(--pf-bg)] px-4">
          <PlatformChangePassword
            required
            onChanged={(admin) => setState({ kind: "signedIn", admin })}
          />
        </div>
      ) : (
        <PlatformDashboard
          username={state.admin.username}
          role={state.admin.role}
          onLogout={() => {
            void window.api
              .platformLogout()
              .catch(() => undefined)
              .finally(() => setState({ kind: "signedOut" }));
          }}
        />
      )}
    </div>
  );
}

export default PlatformConsole;
