import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface LoginProps {
  onLoginSuccess: (user: AuthenticatedUser) => void;
}

export function Login({ onLoginSuccess }: LoginProps): React.JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState(0);

  useEffect(() => {
    let isActive = true;

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
    setIsLoading(true);

    try {
      const result = await window.api.login({ username, password });

      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setError(result.error ?? "Greška pri prijavljivanju.");
        setErrorKey((k) => k + 1);
      }
    } catch (err) {
      const details =
        err instanceof Error && err.message ? ` (${err.message})` : "";
      setError(
        `Greška u komunikaciji sa glavnim procesom aplikacije.${details}`,
      );
      setErrorKey((k) => k + 1);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(120,100,70,0.04) 0%, transparent 60%)",
        }}
      />

      <div className="relative flex items-center gap-20">
        {/* Masthead */}
        <div
          className="w-80"
          style={{
            animation:
              "iris-fade-up var(--iris-dur-page) var(--iris-ease-out-decisive) both",
          }}
        >
          <div className="text-[56px] font-normal leading-none tracking-[-2px] text-foreground">
            Iris
          </div>
          <div
            className="my-5 h-0.5 w-8 bg-[color:var(--iris-accent)] origin-left"
            style={{
              animation:
                "iris-rule-grow 520ms var(--iris-ease-out-decisive) both 180ms",
            }}
          />
          <p className="max-w-[260px] text-[13px] leading-[1.6] text-[color:var(--iris-ink-soft)]">
            Sistem za vođenje radnih naloga u štampariji. Svaki posao je
            evidentiran.
          </p>
          <div className="mt-10 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-faint)]">
            {appVersion ? `Verzija ${appVersion}` : "Verzija"}
          </div>
        </div>

        {/* Form */}
        <div
          className="w-[340px] border border-border bg-card px-9 pt-9 pb-7"
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
                <span className="text-[11px] text-[color:var(--iris-accent)]">
                  zaboravljena?
                </span>
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

          <div className="mt-5 flex justify-between border-t border-[color:var(--iris-border-soft)] pt-4 text-[11px] text-[color:var(--iris-ink-mute)]">
            <span>Zapamti uređaj</span>
            <span>{appVersion ? `v${appVersion}` : null}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
