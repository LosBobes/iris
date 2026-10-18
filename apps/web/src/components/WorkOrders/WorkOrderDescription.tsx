import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  isDescriptionHeading,
  splitDescriptionEntries,
} from "@/shared/utils/description-items";

// Plain descriptions longer than this get a "show full description" toggle.
const LONG_DESCRIPTION_CHARS = 140;
// A product list shows this many entries until expanded.
const COLLAPSED_ENTRY_COUNT = 6;

/**
 * The opis posla in the work-order detail header. A description typed as a
 * product list ("Mango 20 kom. - Kokos 10 kom. - ...") is shown as a bulleted
 * list, in columns on wider screens, with "Nalepnice za proizvode:"-style
 * labels as subheadings; long lists collapse to the first few entries. Any
 * other description stays prose, clamped to two lines when long.
 */
export function WorkOrderDescription({
  description,
}: {
  description: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const entries = splitDescriptionEntries(description);
  if (entries.length === 0) return null;

  const toggleClass =
    "iris-focusable mt-1.5 bg-transparent p-0 text-[12px] text-[color:var(--iris-ink-mute)] underline underline-offset-2 hover:text-foreground";

  if (entries.length === 1) {
    const isLong = description.trim().length > LONG_DESCRIPTION_CHARS;
    return (
      <div>
        <p
          className={cn(
            "text-[14px] whitespace-pre-line text-[color:var(--iris-ink-soft)]",
            isLong && !expanded && "line-clamp-2",
          )}
        >
          {description.trim()}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className={toggleClass}
          >
            {t(
              expanded
                ? "workOrders.detail.showLessDescription"
                : "workOrders.detail.showFullDescription",
            )}
          </button>
        )}
      </div>
    );
  }

  const collapsible = entries.length > COLLAPSED_ENTRY_COUNT;
  const visible = collapsible && !expanded ? entries.slice(0, COLLAPSED_ENTRY_COUNT) : entries;

  return (
    <div>
      <ul className="columns-1 gap-x-8 text-[13px] text-[color:var(--iris-ink-soft)] sm:columns-2 xl:columns-3">
        {visible.map((entry, index) =>
          isDescriptionHeading(entry) ? (
            <li
              key={index}
              className="pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-[1px] text-[color:var(--iris-ink-mute)] [column-span:all] first:pt-0"
            >
              {entry.replace(/:\s*$/, "")}
            </li>
          ) : (
            <li
              key={index}
              className="flex break-inside-avoid gap-2 py-0.5 before:shrink-0 before:text-[color:var(--iris-ink-faint)] before:content-['•']"
            >
              <span className="min-w-0">{entry}</span>
            </li>
          ),
        )}
      </ul>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className={toggleClass}
        >
          {expanded
            ? t("workOrders.detail.showLessDescription")
            : t("workOrders.detail.showAllEntries", { count: entries.length })}
        </button>
      )}
    </div>
  );
}
