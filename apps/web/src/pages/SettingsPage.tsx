import { Check, Palette, Type } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { useFontScale } from "@/hooks/useFontScale";
import { FONT_SCALE_OPTIONS } from "@/lib/font-scale";
import { useTheme } from "@/hooks/useTheme";
import { THEME_OPTIONS } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { EnumValuesSettings } from "@/components/settings/EnumValuesSettings";
import { ListDensitySettings } from "@/components/settings/ListDensitySettings";

export function SettingsPage(): React.JSX.Element {
  const { scale, setScale } = useFontScale();
  const { theme, setTheme } = useTheme();
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · podešavanja
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            Podešavanja
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            Prilagodite izgled aplikacije
          </div>
        </div>

        <div className="space-y-8 px-5 pb-10 sm:px-8 lg:px-10">
          <section className="max-w-2xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
              <Palette size={16} className="text-[color:var(--iris-accent)]" />
              <div>
                <div className="text-[13px] font-medium text-foreground">
                  Tema
                </div>
                <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
                  Svetli ili tamni prikaz aplikacije
                </div>
              </div>
            </div>

            <div
              role="radiogroup"
              aria-label="Tema"
              className="grid gap-2 p-5 sm:grid-cols-3"
            >
              {THEME_OPTIONS.map((option) => {
                const selected = option.value === theme;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "iris-focusable iris-press flex items-center justify-between gap-3 rounded-sm border px-4 py-3 text-left transition-all duration-200",
                      selected
                        ? "border-[color:var(--iris-accent)] bg-black/[0.03]"
                        : "border-border hover:border-[color:var(--iris-ink-faint)] hover:bg-black/[0.02]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">
                        {option.hint}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                        selected
                          ? "border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)] text-white"
                          : "border-[color:var(--iris-ink-faint)] text-transparent",
                      )}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="max-w-2xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
              <Type size={16} className="text-[color:var(--iris-accent)]" />
              <div>
                <div className="text-[13px] font-medium text-foreground">
                  Veličina teksta
                </div>
                <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
                  Uvećava ili smanjuje ceo prikaz aplikacije
                </div>
              </div>
            </div>

            <div
              role="radiogroup"
              aria-label="Veličina teksta"
              className="grid gap-2 p-5 sm:grid-cols-2"
            >
              {FONT_SCALE_OPTIONS.map((option) => {
                const selected = Math.abs(option.value - scale) < 0.001;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setScale(option.value)}
                    className={cn(
                      "iris-focusable iris-press flex items-center justify-between gap-3 rounded-sm border px-4 py-3 text-left transition-all duration-200",
                      selected
                        ? "border-[color:var(--iris-accent)] bg-black/[0.03]"
                        : "border-border hover:border-[color:var(--iris-ink-faint)] hover:bg-black/[0.02]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">
                        {option.hint}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                        selected
                          ? "border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)] text-white"
                          : "border-[color:var(--iris-ink-faint)] text-transparent",
                      )}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border px-5 py-4">
              <div className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                Pregled
              </div>
              <p className="mt-2 text-[14px] leading-6 text-foreground">
                  Klijent: Grafika Čobanović
              </p>
              <p className="text-[12px] text-[color:var(--iris-ink-soft)]">
                Promena se primenjuje odmah i pamti se na ovom uređaju.
              </p>
            </div>
          </section>

          <ListDensitySettings />

          {isAdmin && <EnumValuesSettings />}
        </div>
      </div>
    </AppShell>
  );
}

export default SettingsPage;
