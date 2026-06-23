import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MapPin, Pencil, Plus, Save, Trash2, X } from "lucide-react";
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
  blankToNull,
  emptyCustomer,
  emptyLocation,
  formatActionError,
  getMissingLocationFields,
  removeLocation,
  slugId,
  validateCustomerIdentifiers,
} from "@/lib/customers";
import type { Customer, Location } from "@/types/work-order";

type DeleteTarget =
  | { kind: "customer" }
  | { kind: "location"; id: string; name: string };

function CustomerDetailPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const isNew = routeId === undefined || routeId === "new";
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";

  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationDraft, setLocationDraft] = useState<Location | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const load = useCallback(async () => {
    if (isNew || !routeId) return;
    setLoading(true);
    try {
      const [found, allLocations] = await Promise.all([
        window.api.getCustomerById(routeId),
        window.api.getLocations(),
      ]);
      if (!found) {
        setNotFound(true);
        return;
      }
      setCustomer(found);
      setLocations(allLocations.filter((location) => location.customerId === routeId));
    } catch {
      toast.error(t("customerDetail.loadError"));
    } finally {
      setLoading(false);
    }
  }, [isNew, routeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCustomer = useCallback(async () => {
    if (!customer.name.trim()) {
      toast.error(t("customerDetail.nameRequired"));
      return;
    }
    const identifierError = validateCustomerIdentifiers(customer, isNew);
    if (identifierError) {
      toast.error(identifierError);
      return;
    }
    setSaving(true);
    try {
      const payload: Customer = {
        ...customer,
        id: customer.id.trim() || slugId("cust", customer.name),
        contactName: blankToNull(customer.contactName),
        email: blankToNull(customer.email),
        phone: blankToNull(customer.phone),
        pib: blankToNull(customer.pib),
        mb: blankToNull(customer.mb),
      };
      const saved = await window.api.upsertCustomer(payload);
      toast.success(t("customerDetail.saved"));
      if (isNew) {
        navigate(`/customers/${encodeURIComponent(saved.id)}`, { replace: true });
      } else {
        setCustomer(saved);
      }
    } catch (error) {
      toast.error(formatActionError(t("customerDetail.saveError"), error));
    } finally {
      setSaving(false);
    }
  }, [customer, isNew, navigate, t]);

  const saveLocation = useCallback(async () => {
    if (!locationDraft) return;
    const missing = getMissingLocationFields(locationDraft);
    if (missing.length > 0) {
      toast.error(t("customerDetail.locMissing", { fields: missing.join(", ") }));
      return;
    }
    try {
      const payload: Location = {
        ...locationDraft,
        id: locationDraft.id || slugId("loc", locationDraft.name),
        customerId: customer.id,
        address: blankToNull(locationDraft.address),
      };
      const saved = await window.api.upsertLocation(payload);
      setLocations((current) => {
        const exists = current.some((location) => location.id === saved.id);
        return exists
          ? current.map((location) => (location.id === saved.id ? saved : location))
          : [...current, saved];
      });
      setLocationDraft(null);
      toast.success(t("customerDetail.locSaved"));
    } catch (error) {
      toast.error(formatActionError(t("customerDetail.locSaveError"), error));
    }
  }, [locationDraft, customer.id, t]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "customer") {
        await window.api.deleteCustomer(customer.id);
        toast.success(t("customerDetail.clientDeleted"));
        navigate("/customers");
        return;
      }
      await window.api.deleteLocation(deleteTarget.id);
      setLocations((current) => removeLocation(current, deleteTarget.id));
      toast.success(t("customerDetail.locDeleted"));
    } catch {
      toast.error(t("customerDetail.deleteError"));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, customer.id, navigate, t]);

  const title = isNew
    ? t("customers.newClient")
    : customer.name || t("customerDetail.clientFallback");

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("customerDetail.loading")}
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell>
        <div className="px-8 py-20 text-center text-sm text-muted-foreground">
          <p>{t("customerDetail.notFound")}</p>
          <button
            type="button"
            onClick={() => navigate("/customers")}
            className="iris-focusable iris-press mt-4 inline-flex items-center gap-2 border border-border px-3 py-2 text-[12px]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("customerDetail.backToClients")}
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
            onClick={() => navigate("/customers")}
            className="iris-focusable iris-press mb-2 inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("customers.title")}
          </button>
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("customerDetail.eyebrow")}
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            {title}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8 px-5 pb-10 sm:px-8">
            <DetailsForm value={customer} onChange={setCustomer} />

            {isNew ? (
              <p className="border border-dashed border-border bg-background px-4 py-3 text-[12px] text-[color:var(--iris-ink-soft)]">
                {t("customerDetail.locationsAfterSave")}
              </p>
            ) : (
              <LocationsSection
                locations={locations}
                draft={locationDraft}
                isAdmin={isAdmin}
                onAdd={() => setLocationDraft(emptyLocation(customer.id))}
                onEdit={(location) => setLocationDraft(location)}
                onCancel={() => setLocationDraft(null)}
                onChangeDraft={setLocationDraft}
                onSave={saveLocation}
                onDelete={(location) =>
                  setDeleteTarget({ kind: "location", id: location.id, name: location.name })
                }
              />
            )}
          </div>

          <aside className="border-t border-border bg-card p-6 lg:sticky lg:top-0 lg:self-start lg:border-l lg:border-t-0 lg:p-8">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {t("customerDetail.overview")}
            </div>
            <dl className="mt-4 space-y-3 text-[12px]">
              <SummaryRow label={t("customerDetail.pib")} value={customer.pib} />
              <SummaryRow label={t("customerDetail.mb")} value={customer.mb} />
              <SummaryRow label={t("customerDetail.contact")} value={customer.contactName} />
              {!isNew && (
                <div className="flex items-center justify-between">
                  <dt className="text-[color:var(--iris-ink-soft)]">{t("customerDetail.locations")}</dt>
                  <dd className="tnum text-foreground">{locations.length}</dd>
                </div>
              )}
            </dl>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void saveCustomer()}
                disabled={saving}
                className="iris-focusable iris-press flex items-center justify-center gap-2 bg-foreground px-4 py-[11px] text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <Save className="h-3.5 w-3.5" />
                {isNew ? t("customerDetail.saveClient") : t("customerDetail.saveChanges")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/customers")}
                className="iris-focusable iris-press bg-transparent py-2 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
              >
                {t("workOrders.form.cancel")}
              </button>
              {!isNew && isAdmin && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ kind: "customer" })}
                  className="iris-focusable iris-press mt-2 flex items-center justify-center gap-2 border border-[color:var(--iris-status-cancelled)] py-2 text-[11px] text-[color:var(--iris-status-cancelled)] hover:opacity-80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("customerDetail.deleteClient")}
                </button>
              )}
            </div>
          </aside>
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
            <AlertDialogTitle>
              {deleteTarget?.kind === "customer"
                ? t("customerDetail.deleteClientTitle")
                : t("customerDetail.deleteLocationTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "customer"
                ? t("customerDetail.deleteClientConfirm", { name: customer.name })
                : deleteTarget?.kind === "location"
                  ? t("customerDetail.deleteLocationConfirm", { name: deleteTarget.name })
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDeleteConfirm()}>
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
  onChange,
}: {
  value: Customer;
  onChange: (value: Customer) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <section>
      <div className="mb-3 border-b border-border pb-2 text-[13px] font-medium">{t("customerDetail.companyData")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("customerDetail.nameField")} value={value.name} onChange={(name) => onChange({ ...value, name })} />
        <Field
          label={t("workOrders.form.contactPerson")}
          value={value.contactName ?? ""}
          onChange={(contactName) => onChange({ ...value, contactName })}
        />
        <Field
          label={t("customerDetail.email")}
          value={value.email ?? ""}
          onChange={(email) => onChange({ ...value, email })}
        />
        <Field
          label={t("customerDetail.phone")}
          value={value.phone ?? ""}
          onChange={(phone) => onChange({ ...value, phone })}
        />
        <Field
          label={t("customerDetail.pibField")}
          value={value.pib ?? ""}
          placeholder={t("customerDetail.pibPlaceholder")}
          onChange={(pib) => onChange({ ...value, pib })}
        />
        <Field
          label={t("customerDetail.mbField")}
          value={value.mb ?? ""}
          placeholder={t("customerDetail.mbPlaceholder")}
          onChange={(mb) => onChange({ ...value, mb })}
        />
      </div>
    </section>
  );
}

function LocationsSection({
  locations,
  draft,
  isAdmin,
  onAdd,
  onEdit,
  onCancel,
  onChangeDraft,
  onSave,
  onDelete,
}: {
  locations: Location[];
  draft: Location | null;
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (location: Location) => void;
  onCancel: () => void;
  onChangeDraft: (location: Location) => void;
  onSave: () => void;
  onDelete: (location: Location) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
        <span className="text-[13px] font-medium">{t("customerDetail.locations")}</span>
        {draft === null && (
          <button
            type="button"
            onClick={onAdd}
            className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("customerDetail.newLocation")}
          </button>
        )}
      </div>

      {draft !== null && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
          noValidate
          className="mb-4 grid gap-4 border border-border bg-card p-4 sm:grid-cols-2"
        >
          <div className="flex items-center justify-between sm:col-span-2">
            <span className="text-[12px] text-[color:var(--iris-ink-soft)]">
              {draft.id ? t("customerDetail.editLocationHeader") : t("customerDetail.newLocation")}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
            >
              <X className="h-3 w-3" />
              {t("common.cancel")}
            </button>
          </div>
          <Field
            label={t("customerDetail.locName")}
            value={draft.name}
            onChange={(name) => onChangeDraft({ ...draft, name })}
          />
          <Field
            label={t("customerDetail.locAddress")}
            value={draft.address ?? ""}
            onChange={(address) => onChangeDraft({ ...draft, address })}
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="iris-focusable iris-press inline-flex items-center gap-2 bg-foreground px-3 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
            >
              <Save className="h-3.5 w-3.5" />
              {t("customerDetail.saveLocation")}
            </button>
          </div>
        </form>
      )}

      {locations.length === 0 ? (
        <div className="border border-dashed border-border bg-background px-4 py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
          {t("customerDetail.noLocations")}
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--iris-border-soft)] border border-border bg-card">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-foreground">{location.name}</span>
                  <span className="block truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                    {location.address || "—"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(location)}
                  className="iris-focusable iris-press text-[color:var(--iris-ink-soft)] hover:text-foreground"
                  aria-label={t("customerDetail.editLocationAria")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onDelete(location)}
                    className="iris-focusable iris-press text-[color:var(--iris-status-cancelled)] hover:opacity-80"
                    aria-label={t("customerDetail.deleteLocationAria")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
      />
    </label>
  );
}

export default CustomerDetailPage;
