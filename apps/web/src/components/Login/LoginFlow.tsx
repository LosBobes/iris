import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Login } from "./Login";
import { OrganizationStep } from "./OrganizationStep";
import {
  LOGIN_PATH,
  forgetOrganization,
  loginEntryPath,
  rememberOrganization,
} from "@/lib/organization-login";
import { rememberReturnLocation, takeReturnLocation } from "@/lib/session";
import type { PublicOrganization } from "@/types/settings";

interface LoginFlowProps {
  sessionExpired: boolean;
  onLoginSuccess: (user: AuthenticatedUser, orgSlug: string) => void;
}

/**
 * Everything a signed-out visitor sees:
 *
 *   /login          step one, pick the organization (validated by the API)
 *   /login/:slug    step two, that organization's own sign-in page
 *   anything else   remembered as the page to return to, then sent to step two
 *                   for the organization this device last used (or step one)
 */
export function LoginFlow({ sessionExpired, onLoginSuccess }: LoginFlowProps): React.JSX.Element {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<OrganizationStep />} />
      <Route
        path={`${LOGIN_PATH}/:orgSlug`}
        element={
          <OrganizationSignIn sessionExpired={sessionExpired} onLoginSuccess={onLoginSuccess} />
        }
      />
      <Route path="*" element={<RedirectToLogin />} />
    </Routes>
  );
}

function RedirectToLogin(): React.JSX.Element {
  // A deep link opened while signed out (or the page a session expired on) is
  // where the operator wants to end up once they are in.
  rememberReturnLocation();
  return <Navigate to={loginEntryPath()} replace />;
}

type OrganizationState =
  | { kind: "loading" }
  | { kind: "ready"; organization: PublicOrganization }
  | { kind: "error"; message: string };

function OrganizationSignIn({ sessionExpired, onLoginSuccess }: LoginFlowProps): React.JSX.Element {
  const { t } = useTranslation();
  const { orgSlug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Step one already resolved the organization; reuse it instead of asking twice.
  const handedOver = (location.state as { organization?: PublicOrganization } | null)
    ?.organization;
  const [state, setState] = useState<OrganizationState>(() =>
    handedOver && handedOver.slug.toLowerCase() === orgSlug.toLowerCase()
      ? { kind: "ready", organization: handedOver }
      : { kind: "loading" },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state.kind === "ready" && state.organization.slug.toLowerCase() === orgSlug.toLowerCase()) {
      return;
    }
    let active = true;
    window.api
      .getPublicOrganization(orgSlug)
      .then((organization) => {
        if (!active) return;
        if (!organization) {
          // A bookmarked or remembered slug that no longer exists: start over,
          // with the field prefilled so the typo is easy to fix.
          forgetOrganization();
          navigate(LOGIN_PATH, { replace: true, state: { unknownOrg: orgSlug } });
          return;
        }
        rememberOrganization(organization.slug);
        setState({ kind: "ready", organization });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const details = error instanceof Error && error.message ? ` (${error.message})` : "";
        setState({ kind: "error", message: t("auth.backendError", { details }) });
      });
    return () => {
      active = false;
    };
    // `state` is deliberately not a dependency: this runs per slug (and retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, attempt, navigate, t]);

  const handleSuccess = useCallback(
    (user: AuthenticatedUser, slug: string) => {
      const returnTo = takeReturnLocation();
      onLoginSuccess(user, slug);
      navigate(returnTo ?? "/", { replace: true });
    },
    [navigate, onLoginSuccess],
  );

  const handleChangeOrganization = useCallback(() => {
    forgetOrganization();
    navigate(LOGIN_PATH);
  }, [navigate]);

  if (state.kind === "loading") {
    return (
      <div className="iris-screen bg-background">
        <div className="flex min-h-full items-center justify-center">
          <span
            role="status"
            aria-label={t("common.loading")}
            className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--iris-ink-faint)] border-t-foreground"
          />
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="iris-screen bg-background">
        <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-8 text-center">
          <p role="alert" className="max-w-sm text-[13px] text-[color:var(--iris-status-cancelled)]">
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              setAttempt((n) => n + 1);
            }}
            className="iris-focusable iris-press bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
          >
            {t("auth.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Login
      organization={state.organization}
      onLoginSuccess={handleSuccess}
      onChangeOrganization={handleChangeOrganization}
      sessionExpired={sessionExpired}
    />
  );
}
