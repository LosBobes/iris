import { useCallback, useMemo, useState } from "react";
import { Loader2, Pencil, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pager } from "@/components/Pager";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { formatCatalogPrice, kindLabel } from "@/lib/catalog-format";
import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemKind,
} from "@/types/catalog";

type KindFilter = "all" | CatalogItemKind;

const CATALOG_PAGE_SIZE = 25;

const emptyDraft: CatalogItem = {
  id: "",
  code: "",
  name: "",
  kind: "service",
  unit: "kom",
  purchasePrice: null,
  salePrice: null,
  barcode: null,
  taxGroup: null,
  description: null,
  isActive: true,
};

function toInput(draft: CatalogItem): CatalogItemInput {
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    kind: draft.kind,
    unit: draft.unit.trim() || "kom",
    purchasePrice: draft.purchasePrice,
    salePrice: draft.salePrice,
    barcode: blankToNull(draft.barcode),
    taxGroup: blankToNull(draft.taxGroup),
    description: blankToNull(draft.description),
    isActive: draft.isActive,
  };
}

function CatalogPage(): React.JSX.Element {
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";

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
  const { items, total, loading, reload } = useCatalogItems(query);
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

  const changeKind = useCallback((next: KindFilter) => {
    setKindFilter(next);
    setPage(0);
  }, []);
  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(0);
  }, []);

  const [draft, setDraft] = useState<CatalogItem>(emptyDraft);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);

  const editingName = draft.id ? draft.name : null;
  const isEditing = items.some((item) => item.id === draft.id);

  const cancelEdit = useCallback(() => setDraft(emptyDraft), []);

  const saveItem = useCallback(async () => {
    if (!draft.name.trim()) {
      toast.error("Naziv je obavezan.");
      return;
    }
    try {
      const input = toInput(draft);
      if (isEditing) {
        await window.api.updateCatalogItem(draft.id, input);
      } else {
        await window.api.createCatalogItem(input);
      }
      setDraft(emptyDraft);
      await reload();
      toast.success("Stavka kataloga je sačuvana.");
    } catch (error) {
      toast.error(formatActionError("Greška pri čuvanju stavke", error));
    }
  }, [draft, isEditing, reload]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await window.api.deleteCatalogItem(deleteTarget.id);
      setDraft((current) =>
        current.id === deleteTarget.id ? emptyDraft : current,
      );
      setDeleteTarget(null);
      await reload();
      toast.success("Stavka je obrisana.");
    } catch {
      toast.error("Greška pri brisanju stavke.");
    }
  }, [deleteTarget, reload]);

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · katalog
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            Usluge i artikli
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            {isAdmin
              ? "Definišite stavke koje radnici biraju u radnim nalozima"
              : "Pregled usluga i artikala za radne naloge"}
          </div>
        </div>

        <div className="space-y-6 px-5 pb-8 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <KindTabs value={kindFilter} onChange={changeKind} />
            <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--iris-ink-mute)]" />
              <input
                value={search}
                onChange={(event) => changeSearch(event.target.value)}
                placeholder="Pretraga po nazivu ili šifri"
                className="block w-full border border-border bg-background py-2 pl-8 pr-2 text-[13px] text-foreground"
              />
            </div>
          </div>

          {isAdmin && (
            <CatalogForm
              value={draft}
              editingName={editingName}
              isEditing={isEditing}
              onChange={setDraft}
              onSave={saveItem}
              onCancel={cancelEdit}
            />
          )}

          <section className="min-w-0 border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-medium">
              <span>Stavke</span>
              <span className="text-[11px] font-normal text-[color:var(--iris-ink-soft)]">
                {loading ? "" : `${total} ukupno`}
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Učitavanje kataloga...
              </div>
            ) : items.length === 0 ? (
              <EmptyListNote text="Nema stavki za izabrane filtere." />
            ) : (
              <div className="divide-y divide-[color:var(--iris-border-soft)]">
                {items.map((item) => (
                  <CatalogRow
                    key={item.id}
                    item={item}
                    canManage={isAdmin}
                    onEdit={() => setDraft(item)}
                    onDelete={() => setDeleteTarget(item)}
                  />
                ))}
              </div>
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Brisanje stavke</AlertDialogTitle>
            <AlertDialogDescription>
              Da li ste sigurni da želite da obrišete {deleteTarget?.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function KindTabs({
  value,
  onChange,
}: {
  value: KindFilter;
  onChange: (value: KindFilter) => void;
}): React.JSX.Element {
  const tabs: Array<{ id: KindFilter; label: string }> = [
    { id: "service", label: "Usluge" },
    { id: "article", label: "Artikli" },
    { id: "all", label: "Sve" },
  ];
  return (
    <div className="inline-flex border border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-pressed={value === tab.id}
          className={[
            "iris-focusable px-3 py-1.5 text-[12px]",
            value === tab.id
              ? "bg-foreground text-background"
              : "bg-background text-[color:var(--iris-ink-soft)] hover:text-foreground",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function CatalogForm({
  value,
  editingName,
  isEditing,
  onChange,
  onSave,
  onCancel,
}: {
  value: CatalogItem;
  editingName: string | null;
  isEditing: boolean;
  onChange: (value: CatalogItem) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      noValidate
      className="grid gap-3 border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {editingName !== null && (
        <div className="animate-iris-fade flex items-center justify-between gap-3 border-l-2 border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)]/10 px-3 py-2 text-[12px] text-[color:var(--iris-ink-soft)] sm:col-span-2 lg:col-span-3">
          <span className="min-w-0 truncate">
            Izmena:{" "}
            <span className="font-medium text-foreground">{editingName}</span>
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="iris-focusable iris-press flex shrink-0 items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Otkaži
          </button>
        </div>
      )}
      <TextInput
        label="Naziv"
        value={value.name}
        required
        onChange={(name) => onChange({ ...value, name })}
      />
      <label className="text-[11px] text-[color:var(--iris-ink-soft)]">
        Vrsta
        <select
          value={value.kind}
          onChange={(event) =>
            onChange({ ...value, kind: event.target.value as CatalogItemKind })
          }
          className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
        >
          <option value="service">Usluga</option>
          <option value="article">Artikal</option>
        </select>
      </label>
      <TextInput
        label="Jedinica mere"
        value={value.unit}
        placeholder="kom, set, m2..."
        onChange={(unit) => onChange({ ...value, unit })}
      />
      <TextInput
        label="Šifra"
        value={value.code}
        placeholder="Automatski ako ostane prazno"
        onChange={(code) => onChange({ ...value, code })}
      />
      <label className="text-[11px] text-[color:var(--iris-ink-soft)]">
        {value.kind === "service" ? "Cena rada (RSD)" : "Nabavna cena (RSD)"}
        <input
          type="number"
          step="0.01"
          min="0"
          value={value.purchasePrice ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              purchasePrice:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
        />
      </label>
      <label className="text-[11px] text-[color:var(--iris-ink-soft)]">
        Prodajna cena (RSD)
        <input
          type="number"
          step="0.01"
          min="0"
          value={value.salePrice ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              salePrice:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
        />
      </label>
      <label className="flex items-end gap-2 pb-2 text-[11px] text-[color:var(--iris-ink-soft)]">
        <input
          type="checkbox"
          checked={value.isActive}
          onChange={(event) =>
            onChange({ ...value, isActive: event.target.checked })
          }
          className="h-4 w-4"
        />
        Aktivno
      </label>
      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          className="iris-focusable iris-press flex items-center justify-center gap-2 bg-foreground px-3 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
        >
          <Save className="h-3.5 w-3.5" />
          {isEditing ? "Sačuvaj izmene" : "Dodaj stavku"}
        </button>
      </div>
    </form>
  );
}

function CatalogRow({
  item,
  canManage,
  onEdit,
  onDelete,
}: {
  item: CatalogItem;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] text-foreground">
            {item.name}
          </span>
          <span className="shrink-0 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--iris-ink-soft)]">
            {kindLabel(item.kind)}
          </span>
          {!item.isActive && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-[color:var(--iris-status-cancelled)]">
              neaktivno
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-[color:var(--iris-ink-soft)]">
          {[item.code, item.unit, formatCatalogPrice(item.salePrice)]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="iris-focusable iris-press text-[color:var(--iris-ink-soft)] hover:text-foreground"
            aria-label="Izmeni"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="iris-focusable iris-press text-[color:var(--iris-status-cancelled)] hover:opacity-80"
            aria-label="Obriši"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function TextInput({
  label,
  value,
  required = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="text-[11px] text-[color:var(--iris-ink-soft)]">
      {label}
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
      />
    </label>
  );
}

function EmptyListNote({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="px-4 py-8 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
      {text}
    </div>
  );
}

function blankToNull(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  return value;
}

function formatActionError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}.`;
}

export default CatalogPage;
