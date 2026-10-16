import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye, EyeOff } from "lucide-react";
import { rememberOrganizationSlug } from "@/lib/session";
import type { PublicOrganization } from "@/types/settings";
import { LoginShell } from "./LoginShell";

interface LoginProps {
  /** The organization chosen (and validated) in step one. */
  organization: PublicOrganization;
  onLoginSuccess: (user: AuthenticatedUser, orgSlug: string) => void;
  /** Back to step one, to sign in to a different organization. */
  onChangeOrganization: () => void;
  /**
   * True when the operator is here because their session lapsed rather than
   * because they signed out. The form then explains why it appeared, instead of
   * looking like the app forgot them for no reason.
   */
  sessionExpired?: boolean;
}

const REMEMBER_DEVICE_KEY = "iris.rememberDevice";
const REMEMBERED_USERNAME_KEY = "iris.rememberedUsername";

function readRememberedLogin(): {
  rememberDevice: boolean;
  username: string;
} {
  try {
    return {
      rememberDevice: localStorage.getItem(REMEMBER_DEVICE_KEY) === "true",
      username: localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? "",
    };
  } catch {
    return { rememberDevice: false, username: "" };
  }
}

// The organization is remembered separately (src/lib/organization-login.ts) and
// always: it is not a secret, and it is what lets a device skip step one.
function storeRememberedLogin(username: string, rememberDevice: boolean): void {
  try {
    if (rememberDevice) {
      localStorage.setItem(REMEMBER_DEVICE_KEY, "true");
      localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
      return;
    }

    localStorage.removeItem(REMEMBER_DEVICE_KEY);
    localStorage.removeItem(REMEMBERED_USERNAME_KEY);
  } catch {
    // Login should not fail if browser storage is unavailable.
  }
}

export function Login({
  organization,
  onLoginSuccess,
  onChangeOrganization,
  sessionExpired = false,
}: LoginProps): React.JSX.Element {
  const { t } = useTranslation();
  const orgSlug = organization.slug;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState(0);

  useEffect(() => {
    const rememberedLogin = readRememberedLogin();
    setRememberDevice(rememberedLogin.rememberDevice);
    setUsername(rememberedLogin.username);
  }, []);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const result = await window.api.login({ orgSlug, username, password });

      if (result.success && result.user) {
        storeRememberedLogin(username, rememberDevice);
        rememberOrganizationSlug(orgSlug);
        onLoginSuccess(result.user, orgSlug);
      } else {
        setError(result.error ?? t("auth.loginError"));
        setErrorKey((k) => k + 1);
      }
    } catch (err) {
      const details =
        err instanceof Error && err.message ? ` (${err.message})` : "";
      setError(t("auth.backendError", { details }));
      setErrorKey((k) => k + 1);
    } finally {
      setIsLoading(false);
    }
  }

  function handleForgottenPassword(): void {
    setError(null);
    setNotice(t("auth.resetNotice"));
  }

  return (
    <LoginShell organization={organization}>
      {/* Use ref so the shake animation can be re-triggered on subsequent errors. */}
      {sessionExpired ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-5 border-l-2 border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)]/10 px-3 py-2.5"
        >
          <div className="text-[12px] font-medium text-foreground">
            {t("auth.sessionExpiredTitle")}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--iris-ink-soft)]">
            {t("auth.sessionExpiredNotice")}
          </p>
        </div>
      ) : null}

      <div className="mb-2 flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        <span className="min-w-0 truncate">{organization.name}</span>
        <button
          type="button"
          onClick={onChangeOrganization}
          disabled={isLoading}
          className="iris-focusable iris-press -mr-1 shrink-0 px-1 text-[11px] normal-case tracking-normal text-[color:var(--iris-accent)] underline-offset-4 hover:underline"
        >
          {t("auth.changeOrganization")}
        </button>
      </div>
      <h1 className="mb-6 text-[22px] font-medium tracking-[-0.3px] text-foreground">
        {t("auth.welcome")}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col" noValidate>
        <div className="mb-[18px]">
          <label
            htmlFor="username"
            className="mb-1.5 block text-[11px] text-[color:var(--iris-ink-soft)]"
          >
            {t("auth.username")}
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            disabled={isLoading}
            className="w-full border-0 border-b border-border bg-transparent py-2 text-[14px] text-foreground outline-none transition-colors duration-150 focus:border-foreground"
          />
        </div>

        <div className="mb-7">
          <div className="mb-1.5 flex justify-between text-[11px] text-[color:var(--iris-ink-soft)]">
            <label htmlFor="password">{t("auth.password")}</label>
            <button
              type="button"
              onClick={handleForgottenPassword}
              className="iris-focusable iris-press -mr-1 px-1 text-[11px] text-[color:var(--iris-accent)] underline-offset-4 hover:underline"
            >
              {t("auth.forgot")}
            </button>
          </div>
          <div className="relative flex items-center">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={isLoading}
              className="w-full border-0 border-b border-border bg-transparent py-2 pr-7 text-[14px] text-foreground outline-none transition-colors duration-150 focus:border-foreground"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={
                showPassword ? t("auth.hidePassword") : t("auth.showPassword")
              }
              className="iris-focusable iris-press absolute right-0 flex items-center justify-center p-1 text-[color:var(--iris-ink-mute)] hover:text-foreground"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 border-l-2 border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)]/10 px-3 py-2 text-[12px] leading-5 text-[color:var(--iris-ink-soft)]"
          >
            {notice}
          </div>
        ) : null}

        {error ? (
          <div
            key={errorKey}
            role="alert"
            aria-live="assertive"
            className="animate-iris-shake mb-4 border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-3 py-2 text-[12px] text-[color:var(--iris-status-cancelled)]"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="iris-focusable iris-press group relative w-full bg-foreground px-0 py-[11px] text-[13px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-background/40 border-t-background"
              />
              {t("common.loading")}
            </span>
          ) : (
            <>
              {t("auth.submit")}
              <span
                aria-hidden
                className="ml-1.5 inline-block transition-transform duration-200 ease-out group-hover:translate-x-[3px]"
              >
                →
              </span>
            </>
          )}
        </button>
      </form>

      <div className="mt-5 flex flex-col gap-3 border-t border-[color:var(--iris-border-soft)] pt-4 text-[11px] text-[color:var(--iris-ink-mute)] sm:flex-row sm:items-center sm:justify-between">
        <label
          htmlFor="remember-device"
          className="iris-focusable group -ml-1 inline-flex w-fit cursor-pointer items-center gap-2 px-1 py-1"
        >
          <span className="relative flex size-3.5 shrink-0 items-center justify-center">
            <input
              id="remember-device"
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              disabled={isLoading}
              className="peer size-3.5 shrink-0 appearance-none border border-input bg-transparent transition-colors checked:border-foreground checked:bg-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--iris-accent)]/35 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Check
              aria-hidden="true"
              size={11}
              strokeWidth={3}
              className="pointer-events-none absolute text-background opacity-0 transition-opacity peer-checked:opacity-100"
            />
          </span>
          <span className="group-hover:text-foreground">{t("auth.rememberDevice")}</span>
        </label>
      </div>
    </LoginShell>
  );
}
