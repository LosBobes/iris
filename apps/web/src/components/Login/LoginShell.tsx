import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PublicOrganization } from "@/types/settings";

/**
 * Shared frame of both sign-in steps: the masthead (Iris, or the
 * organization's own logo once one is chosen) beside the form card.
 */
export function LoginShell({
  organization,
  children,
}: {
  /** The organization being signed in to; omitted on the first step. */
  organization?: PublicOrganization;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const appVersion = useAppVersion();

  return (
    <div className="iris-screen flex items-center justify-center bg-background px-5 py-6 text-foreground sm:px-8 sm:py-8 lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(120,100,70,0.04) 0%, transparent 60%)",
        }}
      />

      <div className="relative flex max-h-full min-h-0 w-full max-w-5xl flex-col items-stretch gap-6 overflow-hidden sm:gap-8 lg:flex-row lg:items-center lg:justify-center lg:gap-20">
        {/* Masthead */}
        <div
          className="w-full max-w-[340px] self-center text-center sm:max-w-[420px] lg:w-80 lg:self-auto lg:text-left"
          style={{
            animation:
              "iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both",
          }}
        >
          {organization ? (
            <OrganizationMasthead organization={organization} />
          ) : (
            <IrisWordmark />
          )}
          <div
            className="mx-auto my-4 h-0.5 w-8 origin-left bg-[color:var(--iris-accent)] sm:my-5 lg:mx-0"
            style={{
              animation:
                "iris-rule-grow 520ms var(--iris-ease-out-decisive) both 180ms",
            }}
          />
          <p className="mx-auto max-w-[300px] text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)] lg:mx-0 lg:max-w-[260px]">
            {organization ? t("auth.poweredBy") : t("app.tagline")}
          </p>
          <div className="mt-6 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-faint)] sm:mt-10">
            {appVersion ? `${t("app.version")} ${appVersion}` : t("app.version")}
          </div>
        </div>

        {/* Form */}
        <div
          className="w-full max-w-[380px] self-center border border-border bg-card px-6 py-7 shadow-[0_24px_70px_rgba(52,43,31,0.08)] sm:px-9 sm:pt-9 sm:pb-7 lg:w-[340px] lg:self-auto"
          style={{
            animation:
              "iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both 120ms",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Five taps on the wordmark within this window open the Backoffice.
const CONSOLE_TAPS = 5;
const CONSOLE_TAP_WINDOW_MS = 3000;

/**
 * The "Iris" wordmark on the organization picker. It doubles as the hidden
 * way into the Backoffice (/backoffice) — a convenience only: that page
 * asks for a separate platform-admin login the API checks on every request.
 */
function IrisWordmark(): React.JSX.Element {
  const navigate = useNavigate();
  const taps = useRef<number[]>([]);
  return (
    <div
      onClick={() => {
        const now = Date.now();
        taps.current = [...taps.current.filter((at) => now - at < CONSOLE_TAP_WINDOW_MS), now];
        if (taps.current.length >= CONSOLE_TAPS) {
          taps.current = [];
          navigate("/backoffice");
        }
      }}
      className="select-none text-[44px] font-normal leading-none tracking-[-1.5px] text-foreground sm:text-[56px] sm:tracking-[-2px]"
    >
      Iris
    </div>
  );
}

function OrganizationMasthead({
  organization,
}: {
  organization: PublicOrganization;
}): React.JSX.Element {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl =
    organization.logoVersion && !logoFailed
      ? window.api.getPublicOrganizationLogoUrl(
          organization.slug,
          organization.logoVersion,
        )
      : "";

  if (!logoUrl) {
    return (
      <div className="text-[34px] font-normal leading-tight tracking-[-1px] text-foreground sm:text-[42px]">
        {organization.name}
      </div>
    );
  }

  // Logos are usually artwork on white; a white plate keeps them looking
  // intended in the dark theme as well as on the ivory one.
  return (
    <div className="mx-auto inline-flex rounded-sm bg-white p-3 shadow-[0_8px_30px_rgba(52,43,31,0.08)] lg:mx-0">
      <img
        src={logoUrl}
        alt={organization.name}
        onError={() => setLogoFailed(true)}
        className="block max-h-36 w-auto max-w-[260px] object-contain"
      />
    </div>
  );
}

function useAppVersion(): string | null {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  useEffect(() => {
    let isActive = true;
    void window.api
      .getAppVersion()
      .then((version) => {
        if (isActive) setAppVersion(version);
      })
      .catch(() => {
        if (isActive) setAppVersion(null);
      });
    return () => {
      isActive = false;
    };
  }, []);
  return appVersion;
}
