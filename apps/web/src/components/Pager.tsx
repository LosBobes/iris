import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PagerProps {
  /** Zero-based current page. */
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Compact prev/next pager with an "X–Y od Z" range label, for server-driven
 * pagination. Shared by list pages (catalog, clients).
 */
export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPrev,
  onNext,
}: PagerProps): React.JSX.Element {
  const { t } = useTranslation();
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-[12px] text-[color:var(--iris-ink-soft)]">
      <span className="tnum">
        {t("pager.range", { from, to, total })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 0}
          className="iris-focusable iris-press inline-flex items-center gap-1 border border-border px-2 py-1 disabled:opacity-40"
          aria-label={t("pager.prevAria")}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("pager.prev")}
        </button>
        <span className="tnum">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages - 1}
          className="iris-focusable iris-press inline-flex items-center gap-1 border border-border px-2 py-1 disabled:opacity-40"
          aria-label={t("pager.nextAria")}
        >
          {t("pager.next")}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
