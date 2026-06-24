import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings,
  Plus,
  Sun,
  Moon,
  Monitor,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import type { ThemePreference } from "@/lib/theme";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

/** Normalizes Serbian diacritics so "na: lozi" matches "nalozi", etc. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "dj");
}

export function CommandPalette(): React.JSX.Element | null {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      close();
    };
    const theme = (value: ThemePreference) => () => {
      setTheme(value);
      close();
    };
    return [
      { id: "nav-dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, keywords: "dashboard pocetna kontrolna tabla", run: go("/") },
      { id: "nav-orders", label: t("nav.workOrders"), icon: ClipboardList, keywords: "work orders lista radni nalozi", run: go("/work-orders") },
      { id: "nav-new-order", label: t("workOrders.list.newOrder"), hint: t("command.create"), icon: Plus, keywords: "create new order dodaj novi nalog", run: go("/work-orders/new") },
      { id: "nav-customers", label: t("nav.customers"), icon: Users, keywords: "customers musterije klijenti", run: go("/customers") },
      { id: "nav-settings", label: t("nav.settings"), icon: Settings, keywords: "settings opcije podesavanja", run: go("/settings") },
      { id: "theme-light", label: `${t("command.themePrefix")} ${t("settings.theme.light")}`, icon: Sun, keywords: "theme light svetla", run: theme("light") },
      { id: "theme-dark", label: `${t("command.themePrefix")} ${t("settings.theme.dark")}`, icon: Moon, keywords: "theme dark mracna tamna", run: theme("dark") },
      { id: "theme-system", label: `${t("command.themePrefix")} ${t("settings.theme.system")}`, icon: Monitor, keywords: "theme system sistemska", run: theme("system") },
    ];
  }, [navigate, setTheme, close, t]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (q === "") return commands;
    return commands.filter((command) =>
      normalize(`${command.label} ${command.keywords ?? ""}`).includes(q),
    );
  }, [commands, query]);

  // Global Cmd/Ctrl+K toggles the palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      // Focus after the element mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the active item clamped as the list shrinks while typing.
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      filtered[activeIndex]?.run();
    }
  };

  return (
    <div
      className="animate-iris-fade fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[15vh]"
      role="presentation"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Komandna paleta"
        className="w-full max-w-lg overflow-hidden border border-border bg-popover shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-[color:var(--iris-ink-mute)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("command.searchPlaceholder")}
            className="w-full border-none bg-transparent text-[13px] text-foreground placeholder:text-[color:var(--iris-ink-mute)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 border border-[color:var(--iris-border-soft)] px-1.5 py-px font-sans text-[10px] text-[color:var(--iris-ink-faint)] sm:inline-block">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-[color:var(--iris-ink-faint)]">
              {t("command.noResults")}
            </div>
          ) : (
            filtered.map((command, index) => {
              const Icon = command.icon;
              const active = index === activeIndex;
              return (
                <button
                  key={command.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => command.run()}
                  className={`flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-[13px] ${
                    active
                      ? "bg-black/[0.05] text-foreground"
                      : "text-[color:var(--iris-ink-soft)]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
                  <span className="flex-1">{command.label}</span>
                  {command.hint && (
                    <span className="text-[11px] text-[color:var(--iris-ink-faint)]">
                      {command.hint}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
