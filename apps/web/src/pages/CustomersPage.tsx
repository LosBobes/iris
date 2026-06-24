import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Pager } from "@/components/Pager";
import type { Customer } from "@/types/work-order";

const PAGE_SIZE = 25;

function CustomersPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const query = useMemo(
    () => ({ q: search.trim() || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [search, page],
  );
  const queryKey = JSON.stringify(query);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.getCustomers(JSON.parse(queryKey));
      setCustomers(result.items);
      setTotal(result.total);
    } catch {
      toast.error(t("customers.loadError"));
    } finally {
      setLoading(false);
    }
  }, [queryKey, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {t("customers.eyebrow")}
            </div>
            <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
              {t("customers.title")}
            </h1>
            <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
              {t("customers.subtitle")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/customers/new")}
            className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4" />
            {t("customers.newClient")}
          </button>
        </div>

        <div className="space-y-4 px-5 pb-8 sm:px-8">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--iris-ink-mute)]" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder={t("customers.searchPlaceholder")}
              className="block w-full border border-border bg-background py-2 pl-8 pr-2 text-[13px] text-foreground"
            />
          </div>

          <section className="min-w-0 border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-medium">
              <span>{t("customers.title")}</span>
              <span className="text-[11px] font-normal text-[color:var(--iris-ink-soft)]">
                {loading ? "" : t("customers.totalCount", { count: total })}
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t("customers.loading")}
              </div>
            ) : customers.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
                {search ? t("customers.emptySearch") : t("customers.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--iris-border-soft)]">
                {customers.map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/customers/${encodeURIComponent(customer.id)}`)}
                      className="iris-focusable flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[color:var(--iris-accent)]/10"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-foreground">
                          {customer.name}
                        </span>
                        <span className="block truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                          {[
                            customer.pib ? `PIB ${customer.pib}` : null,
                            customer.mb ? `MB ${customer.mb}` : null,
                            customer.contactName,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
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
                pageSize={PAGE_SIZE}
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

export default CustomersPage;
