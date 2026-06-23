import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useEnumValues } from "@/hooks/useEnumValues";
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
  const { t } = useTranslation();
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
      toast.error(t("catalog.detail.loadError"));
    } finally {
      setLoading(false);
    }
  }, [isNew, routeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveItem = useCallback(async () => {
    if (!item.name.trim()) {
      toast.error(t("catalog.detail.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const input = toCatalogInput(item);
      const saved = isNew
        ? await window.api.createCatalogItem(input)
        : await window.api.updateCatalogItem(item.id, input);
      toast.success(t("catalog.detail.saved"));
      if (isNew) {
        navigate(`/catalog/${encodeURIComponent(saved.id)}`, { replace: true });
      } else {
        setItem(saved);
      }
    } catch (error) {
      toast.error(formatActionError(t("catalog.detail.saveError"), error));
    } finally {
      setSaving(false);
    }
  }, [item, isNew, navigate, t]);

  const handleDelete = useCallback(async () => {
    try {
      await window.api.deleteCatalogItem(item.id);
      toast.success(t("catalog.detail.deleted"));
      navigate("/catalog");
    } catch {
      toast.error(t("catalog.detail.deleteError"));
    } finally {
      setConfirmDelete(false);
    }
  }, [item.id, navigate, t]);

  const title = isNew ? t("catalog.newItem") : item.name || t("catalog.detail.itemFallback");

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("catalog.detail.loading")}
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell>
        <div className="px-8 py-20 text-center text-sm text-muted-foreground">
          <p>{t("catalog.detail.notFound")}</p>
          <button
            type="button"
            onClick={() => navigate("/catalog")}
            className="iris-focusable iris-press mt-4 inline-flex items-center gap-2 border border-border px-3 py-2 text-[12px]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("catalog.detail.backToCatalog")}
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
            {t("catalog.breadcrumb")}
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
              {t("catalog.detail.overview")}
            </div>
            <dl className="mt-4 space-y-3 text-[12px]">
              <SummaryRow label={t("catalog.detail.kind")} value={kindLabel(item.kind)} />
              <SummaryRow label={t("catalog.detail.unit")} value={item.unit} />
              {isAdmin && (
                <SummaryRow
                  label={item.kind === "service" ? t("catalog.detail.costShortService") : t("catalog.detail.costShortArticle")}
                  value={formatCatalogPrice(item.purchasePrice)}
                />
              )}
              <SummaryRow label={t("catalog.detail.sale")} value={formatCatalogPrice(item.salePrice)} />
              {isAdmin && item.purchasePrice !== null && item.salePrice !== null && (
                <SummaryRow
                  label={t("catalog.detail.margin")}
                  value={formatCatalogPrice(item.salePrice - item.purchasePrice)}
                />
              )}
              <SummaryRow label={t("catalog.detail.code")} value={item.code || null} />
              <div className="flex items-center justify-between">
                <dt className="text-[color:var(--iris-ink-soft)]">{t("catalog.detail.status")}</dt>
                <dd className="text-foreground">{item.isActive ? t("catalog.detail.active") : t("catalog.detail.inactive")}</dd>
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
                  {isNew ? t("catalog.detail.saveItem") : t("catalog.detail.saveChanges")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/catalog")}
                  className="iris-focusable iris-press bg-transparent py-2 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
                >
                  {t("workOrders.form.cancel")}
                </button>
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="iris-focusable iris-press mt-2 flex items-center justify-center gap-2 border border-[color:var(--iris-status-cancelled)] py-2 text-[11px] text-[color:var(--iris-status-cancelled)] hover:opacity-80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("catalog.detail.deleteItem")}
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
            <AlertDialogTitle>{t("catalog.detail.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("catalog.detail.deleteConfirm", { name: item.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDelete()}>
              {t("common.delete")}
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
  const { t } = useTranslation();
  return (
    <section>
      <div className="mb-3 border-b border-border pb-2 text-[13px] font-medium">{t("catalog.detail.sectionData")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("catalog.detail.nameField")}
          value={value.name}
          readOnly={readOnly}
          onChange={(name) => onChange({ ...value, name })}
        />
        <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
          {t("catalog.detail.kindField")}
          <select
            value={value.kind}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ ...value, kind: event.target.value as CatalogItemKind })
            }
            className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground disabled:opacity-60"
          >
            <option value="service">{t("catalog.kindService")}</option>
            <option value="article">{t("catalog.kindArticle")}</option>
          </select>
        </label>
        <UnitField
          value={value.unit}
          readOnly={readOnly}
          onChange={(unit) => onChange({ ...value, unit })}
        />
        <Field
          label={t("catalog.detail.codeField")}
          value={value.code}
          placeholder={t("catalog.detail.codePlaceholder")}
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
          label={t("catalog.detail.salePriceField")}
          value={value.salePrice}
          readOnly={readOnly}
          onChange={(salePrice) => onChange({ ...value, salePrice })}
        />
        <Field
          label={t("catalog.detail.barcode")}
          value={value.barcode ?? ""}
          readOnly={readOnly}
          onChange={(barcode) => onChange({ ...value, barcode })}
        />
        <Field
          label={t("catalog.detail.taxGroup")}
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
          {t("catalog.detail.activeField")}
        </label>
        <label className="block text-[11px] text-[color:var(--iris-ink-soft)] sm:col-span-2">
          {t("catalog.detail.descriptionField")}
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

const BUILTIN_UNITS = ["kom", "m2", "set"] as const;

/**
 * Unit of measure picker. Offers the built-in units plus any admin-added
 * `invoiceUnit` values from the shared enum settings, and preserves an existing
 * (possibly legacy/custom) value even if it is no longer in the list.
 */
function UnitField({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { optionsFor } = useEnumValues();

  const options: { value: string; label: string }[] = [
    ...BUILTIN_UNITS.map((unit) => ({
      value: unit,
      label: t(`workOrders.unit.${unit}`),
    })),
    ...optionsFor("invoiceUnit")
      .filter((option) => !option.isBuiltin)
      .map((option) => ({ value: option.value, label: option.label })),
  ];

  if (value && !options.some((option) => option.value === value)) {
    options.push({ value, label: value });
  }

  return (
    <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
      {t("catalog.detail.unitField")}
      <select
        value={value}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default CatalogDetailPage;
