import { Fragment, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONSOLE_VARS } from "./console-theme";

export type BackofficeMenuAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Drawn in the danger colour (suspend, delete). */
  danger?: boolean;
  disabled?: boolean;
  /** A short line under the label, e.g. why the action is unavailable. */
  hint?: string;
  /** Draws a separator above this entry. */
  separator?: boolean;
};

/**
 * The "⋯" overflow menu for a Backoffice row: the housekeeping actions that
 * do not deserve a button each. Built on the app's dropdown primitive but
 * drawn with the console's dark-surface variables, which it re-applies on its
 * own root because the menu portals outside the console.
 */
export function BackofficeActionsMenu({
  label,
  actions,
  indicator,
  className = "",
}: {
  /** Accessible name of the trigger, e.g. "Još radnji". */
  label: string;
  actions: BackofficeMenuAction[];
  /** A small dot on the trigger with this accessible name, e.g. "Ima beleške". */
  indicator?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={`iris-focusable relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--pf-border)] text-[color:var(--pf-text-2)] hover:bg-white/5 hover:text-[color:var(--pf-text)] data-[state=open]:bg-white/10 data-[state=open]:text-[color:var(--pf-text)] ${className}`}
        >
          <MoreHorizontal className="h-4 w-4" />
          {indicator ? (
            <span
              role="img"
              aria-label={indicator}
              title={indicator}
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#5fb88a] ring-2 ring-[color:var(--pf-panel)]"
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        style={CONSOLE_VARS}
        className="min-w-56 rounded-lg bg-[color:var(--pf-panel)] text-[color:var(--pf-text)] shadow-2xl ring-[color:var(--pf-border)]"
      >
        {actions.map((action) => (
          <Fragment key={action.key}>
            {action.separator ? <DropdownMenuSeparator className="bg-[color:var(--pf-border)]" /> : null}
            <DropdownMenuItem
              disabled={action.disabled}
              variant={action.danger ? "destructive" : "default"}
              onSelect={action.onSelect}
              className="rounded-md text-[color:var(--pf-text)] data-highlighted:bg-white/5 [&_svg]:text-[color:var(--pf-text-2)] data-[variant=destructive]:text-[#e66767] data-[variant=destructive]:data-highlighted:bg-[#e66767]/10 data-[variant=destructive]:[&_svg]:text-[#e66767]"
            >
              {action.icon}
              <span className="flex min-w-0 flex-col">
                <span>{action.label}</span>
                {action.hint ? <span className="text-[11px] text-[color:var(--pf-muted)]">{action.hint}</span> : null}
              </span>
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
