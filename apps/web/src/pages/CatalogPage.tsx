import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Pager } from "@/components/Pager";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { formatCatalogPrice, kindLabel } from "@/lib/catalog";
import type { CatalogItemKind } from "@/types/catalog";

type KindFilter = "all" | CatalogItemKind;

const CATALOG_PAGE_SIZE = 25;

function CatalogPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";

  const kindTabs: TabItem<KindFilter>[] = [
    { value: "service", label: t("catalog.tabService") },
    { value: "article", label: t("catalog.tabArticle") },
    { value: "all", label: t("catalog.tabAll") },
  ];

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useMemo(
    () => ({
      kind: kindFilter === "all" ? undefined : kindFilter,
      q: search.trim() || undefined,
      limit: CATALOG_PAGE_SIZE,
      offset: page * CATALOG_PAGE_SIZE,
    }),
    [kindFilter, search, page],
  );
  const { items, total, loading } = useCatalogItems(query);
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

  // Any filter/search change resets to the first page.
  const changeKind = useCallback((next: KindFilter) => {
    setKindFilter(next);
    setPage(0);
  }, []);
  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(0);
  }, []);

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {t("catalog.eyebrow")}
            </div>
            <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
              {t("catalog.title")}
            </h1>
            <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
              {isAdmin
                ? t("catalog.adminSubtitle")
                : t("catalog.operatorSubtitle")}
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate("/catalog/new")}
              className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
            >
              <Plus className="h-4 w-4" />
              {t("catalog.newItem")}
            </button>
          )}
        </div>

        <div className="space-y-4 px-5 pb-8 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              tabs={kindTabs}
              value={kindFilter}
              onValueChange={changeKind}
              aria-label={t("catalog.filterAria")}
            />
            <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--iris-ink-mute)]" />
              <input
                value={search}
                onChange={(event) => changeSearch(event.target.value)}
                placeholder={t("catalog.searchPlaceholder")}
                className="block w-full border border-border bg-background py-2 pl-8 pr-2 text-[13px] text-foreground"
              />
            </div>
          </div>

          <section className="min-w-0 border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-medium">
              <span>{t("catalog.items")}</span>
              <span className="text-[11px] font-normal text-[color:var(--iris-ink-soft)]">
                {loading ? "" : t("catalog.totalCount", { count: total })}
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t("catalog.loading")}
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
                {search || kindFilter !== "all"
                  ? t("catalog.emptyFilters")
                  : isAdmin
                    ? t("catalog.emptyAdmin")
                    : t("catalog.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--iris-border-soft)]">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/catalog/${encodeURIComponent(item.id)}`)}
                      className="iris-focusable flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[color:var(--iris-accent)]/10"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] text-foreground">
                            {item.name}
                          </span>
                          <span className="shrink-0 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--iris-ink-soft)]">
                            {kindLabel(item.kind)}
                          </span>
                          {!item.isActive && (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-[color:var(--iris-status-cancelled)]">
                              {t("catalog.inactive")}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                          {[item.code, item.unit, formatCatalogPrice(item.salePrice)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loading && total > 0 && (
              <Pager
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={CATALOG_PAGE_SIZE}
                onPrev={() => setPage((p) => Math.max(0, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              />
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default CatalogPage;
