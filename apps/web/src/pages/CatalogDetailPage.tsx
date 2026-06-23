import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import {
  costPriceLabel,
  emptyCatalogItem,
  formatActionError,
  formatCatalogPrice,
  kindLabel,
  toCatalogInput,
} from "@/lib/catalog";
import type { CatalogItem, CatalogItemKind } from "@/types/catalog";

function CatalogDetailPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const isNew = routeId === undefined || routeId === "new";
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";
  const readOnly = !isAdmin;

  const [item, setItem] = useState<CatalogItem>(emptyCatalogItem);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (isNew || !routeId) return;
    setLoading(true);
    try {
      const found = await window.api.getCatalogItemById(routeId);
      if (!found) {
        setNotFound(true);
        return;
      }
      setItem(found);
    } catch {
      toast.error("Greška pri učitavanju stavke.");
    } finally {
      setLoading(false);
    }
  }, [isNew, routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveItem = useCallback(async () => {
    if (!item.name.trim()) {
      toast.error("Naziv je obavezan.");
      return;
    }
    setSaving(true);
    try {
      const input = toCatalogInput(item);
      const saved = isNew
        ? await window.api.createCatalogItem(input)
        : await window.api.updateCatalogItem(item.id, input);
      toast.success("Stavka kataloga je sačuvana.");
      if (isNew) {
        navigate(`/catalog/${encodeURIComponent(saved.id)}`, { replace: true });
      } else {
        setItem(saved);
      }
    } catch (error) {
      toast.error(formatActionError("Greška pri čuvanju stavke", error));
    } finally {
      setSaving(false);
    }
  }, [item, isNew, navigate]);

  const handleDelete = useCallback(async () => {
    try {
      await window.api.deleteCatalogItem(item.id);
      toast.success("Stavka je obrisana.");
      navigate("/catalog");
    } catch {
      toast.error("Greška pri brisanju stavke.");
    } finally {
      setConfirmDelete(false);
    }
  }, [item.id, navigate]);

  const title = isNew ? "Nova stavka" : item.name || "Stavka kataloga";

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Učitavanje stavke...
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell>
        <div className="px-8 py-20 text-center text-sm text-muted-foreground">
          <p>Stavka kataloga nije pronađena.</p>
          <button
            type="button"
            onClick={() => navigate("/catalog")}
            className="iris-focusable iris-press mt-4 inline-flex items-center gap-2 border border-border px-3 py-2 text-[12px]"
          >
            <ArrowLeft className="h-4 w-4" />
            Nazad na katalog
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <button
            type="button"
            onClick={() => navigate("/catalog")}
            className="iris-focusable iris-press mb-2 inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Katalog
          </button>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · {kindLabel(item.kind).toLowerCase()}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            {title}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8 px-5 pb-10 sm:px-8">
            <DetailsForm value={item} readOnly={readOnly} onChange={setItem} />
          </div>

          <aside className="border-t border-border bg-card p-6 lg:sticky lg:top-0 lg:self-start lg:border-l lg:border-t-0 lg:p-8">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              Pregled
            </div>
            <dl className="mt-4 space-y-3 text-[12px]">
              <SummaryRow label="Vrsta" value={kindLabel(item.kind)} />
              <SummaryRow label="Jedinica mere" value={item.unit} />
              {isAdmin && (
                <SummaryRow
                  label={item.kind === "service" ? "Cena rada" : "Nabavna"}
                  value={formatCatalogPrice(item.purchasePrice)}
                />
              )}
              <SummaryRow label="Prodajna" value={formatCatalogPrice(item.salePrice)} />
              {isAdmin && item.purchasePrice !== null && item.salePrice !== null && (
                <SummaryRow
                  label="Marža"
                  value={formatCatalogPrice(item.salePrice - item.purchasePrice)}
                />
              )}
              <SummaryRow label="Šifra" value={item.code || null} />
              <div className="flex items-center justify-between">
                <dt className="text-[color:var(--iris-ink-soft)]">Status</dt>
                <dd className="text-foreground">{item.isActive ? "Aktivno" : "Neaktivno"}</dd>
              </div>
            </dl>

            {isAdmin && (
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void saveItem()}
                  disabled={saving}
                  className="iris-focusable iris-press flex items-center justify-center gap-2 bg-foreground px-4 py-[11px] text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <Save className="h-3.5 w-3.5" />
                  {isNew ? "Sačuvaj stavku" : "Sačuvaj izmene"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/catalog")}
                  className="iris-focusable iris-press bg-transparent py-2 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
                >
                  Odustani
                </button>
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="iris-focusable iris-press mt-2 flex items-center justify-center gap-2 border border-[color:var(--iris-status-cancelled)] py-2 text-[11px] text-[color:var(--iris-status-cancelled)] hover:opacity-80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Obriši stavku
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Brisanje stavke</AlertDialogTitle>
            <AlertDialogDescription>
              Da li ste sigurni da želite da obrišete {item.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[color:var(--iris-ink-soft)]">{label}</dt>
      <dd className="tnum min-w-0 truncate text-foreground">{value || "—"}</dd>
    </div>
  );
}

function DetailsForm({
  value,
  readOnly,
  onChange,
}: {
  value: CatalogItem;
  readOnly: boolean;
  onChange: (value: CatalogItem) => void;
}): React.JSX.Element {
  return (
    <section>
      <div className="mb-3 border-b border-border pb-2 text-[13px] font-medium">Podaci o stavci</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Naziv *"
          value={value.name}
          readOnly={readOnly}
          onChange={(name) => onChange({ ...value, name })}
        />
        <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
          Vrsta
          <select
            value={value.kind}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ ...value, kind: event.target.value as CatalogItemKind })
            }
            className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground disabled:opacity-60"
          >
            <option value="service">Usluga</option>
            <option value="article">Artikal</option>
          </select>
        </label>
        <Field
          label="Jedinica mere"
          value={value.unit}
          placeholder="kom, set, m2..."
          readOnly={readOnly}
          onChange={(unit) => onChange({ ...value, unit })}
        />
        <Field
          label="Šifra"
          value={value.code}
          placeholder="Automatski ako ostane prazno"
          readOnly={readOnly}
          onChange={(code) => onChange({ ...value, code })}
        />
        {/* Cost is admin-only; non-admins (readOnly) never see nabavna/cena rada. */}
        {!readOnly && (
          <PriceInput
            label={costPriceLabel(value.kind)}
            value={value.purchasePrice}
            readOnly={readOnly}
            onChange={(purchasePrice) => onChange({ ...value, purchasePrice })}
          />
        )}
        <PriceInput
          label="Prodajna cena (RSD)"
          value={value.salePrice}
          readOnly={readOnly}
          onChange={(salePrice) => onChange({ ...value, salePrice })}
        />
        <Field
          label="Barkod"
          value={value.barcode ?? ""}
          readOnly={readOnly}
          onChange={(barcode) => onChange({ ...value, barcode })}
        />
        <Field
          label="Poreska grupa"
          value={value.taxGroup ?? ""}
          readOnly={readOnly}
          onChange={(taxGroup) => onChange({ ...value, taxGroup })}
        />
        <label className="flex items-end gap-2 pb-2 text-[11px] text-[color:var(--iris-ink-soft)]">
          <input
            type="checkbox"
            checked={value.isActive}
            disabled={readOnly}
            onChange={(event) => onChange({ ...value, isActive: event.target.checked })}
            className="h-4 w-4"
          />
          Aktivno
        </label>
        <label className="block text-[11px] text-[color:var(--iris-ink-soft)] sm:col-span-2">
          Opis
          <textarea
            value={value.description ?? ""}
            readOnly={readOnly}
            rows={3}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
            className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground read-only:opacity-60"
          />
        </label>
      </div>
    </section>
  );
}

function PriceInput({
  label,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  value: number | null;
  readOnly?: boolean;
  onChange: (value: number | null) => void;
}): React.JSX.Element {
  return (
    <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
      {label}
      <input
        type="number"
        step="0.01"
        min="0"
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground read-only:opacity-60"
      />
    </label>
  );
}

function Field({
  label,
  value,
  placeholder,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground read-only:opacity-60"
      />
    </label>
  );
}

export default CatalogDetailPage;
