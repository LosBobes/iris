import { useEffect, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";

interface LoginProps {
  onLoginSuccess: (user: AuthenticatedUser) => void;
}

const REMEMBER_DEVICE_KEY = "iris.rememberDevice";
const REMEMBERED_USERNAME_KEY = "iris.rememberedUsername";

function readRememberedLogin(): { rememberDevice: boolean; username: string } {
  try {
    return {
      rememberDevice: localStorage.getItem(REMEMBER_DEVICE_KEY) === "true",
      username: localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? "",
    };
  } catch {
    return { rememberDevice: false, username: "" };
  }
}

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

export function Login({ onLoginSuccess }: LoginProps): React.JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState(0);

  useEffect(() => {
    let isActive = true;
    const rememberedLogin = readRememberedLogin();

    setRememberDevice(rememberedLogin.rememberDevice);
    setUsername(rememberedLogin.username);

    void window.api
      .getAppVersion()
      .then((version) => {
        if (isActive) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        if (isActive) {
          setAppVersion(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const result = await window.api.login({ username, password });

      if (result.success && result.user) {
        storeRememberedLogin(username, rememberDevice);
        onLoginSuccess(result.user);
      } else {
        setError(result.error ?? "Greška pri prijavljivanju.");
        setErrorKey((k) => k + 1);
      }
    } catch (err) {
      const details =
        err instanceof Error && err.message ? ` (${err.message})` : "";
      setError(
        `Greška u komunikaciji sa backend servisom.${details}`,
      );
      setErrorKey((k) => k + 1);
    } finally {
      setIsLoading(false);
    }
  }

  function handleForgottenPassword(): void {
    setError(null);
    setNotice(
      "Za reset lozinke obratite se administratoru sistema.",
    );
  }

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
          <div className="text-[44px] font-normal leading-none tracking-[-1.5px] text-foreground sm:text-[56px] sm:tracking-[-2px]">
            Iris
          </div>
          <div
            className="mx-auto my-4 h-0.5 w-8 origin-left bg-[color:var(--iris-accent)] sm:my-5 lg:mx-0"
            style={{
              animation:
                "iris-rule-grow 520ms var(--iris-ease-out-decisive) both 180ms",
            }}
          />
          <p className="mx-auto max-w-[300px] text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)] lg:mx-0 lg:max-w-[260px]">
            Sistem za vođenje radnih naloga u štampariji. Svaki posao je
            evidentiran.
          </p>
          <div className="mt-6 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-faint)] sm:mt-10">
            {appVersion ? `Verzija ${appVersion}` : "Verzija"}
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
          {/* Use ref so the shake animation can be re-triggered on subsequent errors. */}
          <div className="mb-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Prijava
          </div>
          <h1 className="mb-6 text-[22px] font-medium tracking-[-0.3px] text-foreground">
            Dobrodošli
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col" noValidate>
            <div className="mb-[18px]">
              <label
                htmlFor="username"
                className="mb-1.5 block text-[11px] text-[color:var(--iris-ink-soft)]"
              >
                Korisničko ime
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
                <label htmlFor="password">Lozinka</label>
                <button
                  type="button"
                  onClick={handleForgottenPassword}
                  className="iris-focusable iris-press -mr-1 px-1 text-[11px] text-[color:var(--iris-accent)] underline-offset-4 hover:underline"
                >
                  zaboravljena?
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
                    showPassword ? "Sakrij lozinku" : "Prikaži lozinku"
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
                  Učitavanje...
                </span>
              ) : (
                <>
                  Prijavite se
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
              <span className="group-hover:text-foreground">Zapamti uređaj</span>
            </label>
            <span>{appVersion ? `v${appVersion}` : null}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
