import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlatformDashboard } from "./PlatformDashboard";
import { PlatformLogin } from "./PlatformLogin";
import { PlatformChangePassword } from "./PlatformChangePassword";
import { PlatformTwoFactorDialog } from "./PlatformTwoFactorDialog";
import { BackofficeScreen } from "./BackofficeScreen";
import type { PlatformAdmin } from "@/types/platform";
import { CONSOLE_VARS } from "./console-theme";

type ConsoleState = { kind: "checking" } | { kind: "signedOut" } | { kind: "signedIn"; admin: PlatformAdmin };

/**
 * The Backoffice at /backoffice, reached from the hidden gesture on the
 * organization picker. Being here grants nothing: the API checks a separate
 * superadmin session on every request.
 */
export function PlatformConsole(): React.JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<ConsoleState>({ kind: "checking" });
  // Set once a required enrollment is confirmed; closing the dialog after
  // that opens the console, closing it before signs out.
  const enrolled = useRef(false);

  const logout = (): void => {
    void window.api
      .platformLogout()
      .catch(() => undefined)
      .finally(() => setState({ kind: "signedOut" }));
  };

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
        <BackofficeScreen>
          <PlatformChangePassword
            required
            onChanged={(admin) => setState({ kind: "signedIn", admin })}
          />
        </BackofficeScreen>
      ) : !state.admin.twoFactorEnabled ? (
        // Two-factor sign-in is mandatory for superadmins: the API answers
        // 403 to everything but enrollment until it is on.
        <BackofficeScreen>
          <PlatformTwoFactorDialog
            enabled={false}
            required
            onEnabled={() => {
              enrolled.current = true;
            }}
            onClose={() => {
              if (enrolled.current) setState({ kind: "signedIn", admin: { ...state.admin, twoFactorEnabled: true } });
              else logout();
            }}
          />
        </BackofficeScreen>
      ) : (
        <PlatformDashboard
          username={state.admin.username}
          role={state.admin.role}
          twoFactorEnabled={state.admin.twoFactorEnabled}
          onLogout={logout}
        />
      )}
    </div>
  );
}

export default PlatformConsole;
