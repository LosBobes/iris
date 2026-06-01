import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import type { Customer, Location } from "@/types/work-order";

const emptyCustomer: Customer = {
  id: "",
  name: "",
  contactName: null,
  email: null,
  phone: null,
};

const emptyLocation: Location = {
  id: "",
  customerId: "",
  name: "",
  address: null,
};

type RequiredField<T> = {
  label: string;
  value: (draft: T) => string | null;
};

const customerRequiredFields = [
  { label: "Naziv", value: (customer: Customer) => customer.name },
  { label: "Kontakt", value: (customer: Customer) => customer.contactName },
  { label: "Email", value: (customer: Customer) => customer.email },
  { label: "Telefon", value: (customer: Customer) => customer.phone },
] satisfies Array<RequiredField<Customer>>;

const locationRequiredFields = [
  { label: "ID", value: (location: Location) => location.id },
  { label: "Klijent", value: (location: Location) => location.customerId },
  { label: "Naziv", value: (location: Location) => location.name },
  { label: "Adresa", value: (location: Location) => location.address },
] satisfies Array<RequiredField<Location>>;

export function getMissingCustomerFields(customer: Customer): string[] {
  return getMissingRequiredFields(customer, customerRequiredFields);
}

export function getMissingLocationFields(location: Location): string[] {
  return getMissingRequiredFields(location, locationRequiredFields);
}

export function formatMandatoryFieldsMessage(
  formName: string,
  missingFields: string[],
): string {
  return `Popunite sva obavezna polja za ${formName}: ${missingFields.join(", ")}.`;
}

export function removeDeletedLocation(
  currentLocations: Location[],
  locationId: string,
): Location[] {
  return currentLocations.filter((location) => location.id !== locationId);
}

function removeCustomerById(
  currentCustomers: Customer[],
  customerId: string,
): Customer[] {
  return currentCustomers.filter((customer) => customer.id !== customerId);
}

function removeLocationsForCustomer(
  currentLocations: Location[],
  customerId: string,
): Location[] {
  return currentLocations.filter((location) => location.customerId !== customerId);
}

export function removeDeletedCustomer(
  currentCustomers: Customer[],
  currentLocations: Location[],
  customerId: string,
): { customers: Customer[]; locations: Location[] } {
  return {
    customers: removeCustomerById(currentCustomers, customerId),
    locations: removeLocationsForCustomer(currentLocations, customerId),
  };
}

function CustomersPage(): React.JSX.Element {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [customerDraft, setCustomerDraft] = useState<Customer>(emptyCustomer);
  const [locationDraft, setLocationDraft] = useState<Location>(emptyLocation);
  const [customerMissingFields, setCustomerMissingFields] = useState<string[]>([]);
  const [locationMissingFields, setLocationMissingFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCustomers, nextLocations] = await Promise.all([
        window.api.getCustomers(),
        window.api.getLocations(),
      ]);
      setCustomers(nextCustomers);
      setLocations(nextLocations);
    } catch {
      toast.error("Greška pri učitavanju klijenata.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customerOptions = useMemo(
    () => customers.map((customer) => ({ id: customer.id, name: customer.name })),
    [customers],
  );

  const updateCustomerDraft = useCallback((nextCustomer: Customer) => {
    setCustomerDraft(nextCustomer);
    setCustomerMissingFields((currentMissingFields) =>
      currentMissingFields.length > 0
        ? getMissingCustomerFields(nextCustomer)
        : currentMissingFields,
    );
  }, []);

  const updateLocationDraft = useCallback((nextLocation: Location) => {
    setLocationDraft(nextLocation);
    setLocationMissingFields((currentMissingFields) =>
      currentMissingFields.length > 0
        ? getMissingLocationFields(nextLocation)
        : currentMissingFields,
    );
  }, []);

  const saveCustomer = useCallback(async () => {
    const missingFields = getMissingCustomerFields(customerDraft);
    setCustomerMissingFields(missingFields);

    if (missingFields.length > 0) {
      toast.error(formatMandatoryFieldsMessage("klijenta", missingFields));
      return;
    }

    const customer = {
      ...customerDraft,
      id: customerDraft.id.trim() || slugId("cust", customerDraft.name),
      contactName: blankToNull(customerDraft.contactName),
      email: blankToNull(customerDraft.email),
      phone: blankToNull(customerDraft.phone),
    };
    try {
      await window.api.upsertCustomer(customer);
      setCustomerDraft(emptyCustomer);
      setCustomerMissingFields([]);
      await load();
      toast.success("Klijent je sačuvan.");
    } catch (error) {
      toast.error(formatActionError("Greška pri čuvanju klijenta", error));
    }
  }, [customerDraft, load]);

  const saveLocation = useCallback(async () => {
    const missingFields = getMissingLocationFields(locationDraft);
    setLocationMissingFields(missingFields);

    if (missingFields.length > 0) {
      toast.error(formatMandatoryFieldsMessage("lokaciju", missingFields));
      return;
    }

    const location = {
      ...locationDraft,
      id: locationDraft.id || slugId("loc", locationDraft.name),
      address: blankToNull(locationDraft.address),
    };
    try {
      await window.api.upsertLocation(location);
      setLocationDraft(emptyLocation);
      setLocationMissingFields([]);
      await load();
      toast.success("Lokacija je sačuvana.");
    } catch (error) {
      toast.error(formatActionError("Greška pri čuvanju lokacije", error));
    }
  }, [locationDraft, load]);

  const deleteCustomer = useCallback(
    async (id: string) => {
      try {
        await window.api.deleteCustomer(id);
        setCustomers((currentCustomers) => removeCustomerById(currentCustomers, id));
        setLocations((currentLocations) =>
          removeLocationsForCustomer(currentLocations, id),
        );
        setCustomerDraft((currentDraft) =>
          currentDraft.id === id ? emptyCustomer : currentDraft,
        );
        setLocationDraft((currentDraft) =>
          currentDraft.customerId === id ? emptyLocation : currentDraft,
        );
        setCustomerMissingFields([]);
        setLocationMissingFields([]);
        toast.success("Klijent je obrisan.");
      } catch {
        toast.error("Greška pri brisanju klijenta.");
      }
    },
    [],
  );

  const deleteLocation = useCallback(
    async (id: string) => {
      try {
        await window.api.deleteLocation(id);
        setLocations((currentLocations) => removeDeletedLocation(currentLocations, id));
        setLocationDraft((currentDraft) =>
          currentDraft.id === id ? emptyLocation : currentDraft,
        );
        setLocationMissingFields([]);
        toast.success("Lokacija je obrisana.");
      } catch {
        toast.error("Greška pri brisanju lokacije.");
      }
    },
    [],
  );

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="animate-iris-enter border-b border-border px-5 pt-7 pb-5 sm:px-8 lg:px-10">
          <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Iris · klijenti
          </div>
          <h1 className="mt-1 text-[30px] font-normal tracking-[-0.8px] text-foreground">
            Klijenti i lokacije
          </h1>
          <div className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
            Evidencija za uvoz, naloge i dostavu
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Učitavanje klijenata...
          </div>
        ) : (
          <div className="grid gap-6 px-5 pb-8 sm:px-8 xl:grid-cols-2">
            <section className="min-w-0 border border-border bg-card">
              <Header title="Klijenti" />
              <CustomerForm
                value={customerDraft}
                missingFields={customerMissingFields}
                onChange={updateCustomerDraft}
                onSave={saveCustomer}
              />
              <div className="divide-y divide-[color:var(--iris-border-soft)]">
                {customers.map((customer) => (
                  <Row
                    key={customer.id}
                    title={customer.name}
                    detail={[customer.contactName, customer.email, customer.phone]
                      .filter(Boolean)
                      .join(" · ")}
                    onEdit={() => {
                      setCustomerDraft(customer);
                      setCustomerMissingFields([]);
                    }}
                    onDelete={() => void deleteCustomer(customer.id)}
                  />
                ))}
              </div>
            </section>

            <section className="min-w-0 border border-border bg-card">
              <Header title="Lokacije" />
              <LocationForm
                value={locationDraft}
                customers={customerOptions}
                missingFields={locationMissingFields}
                onChange={updateLocationDraft}
                onSave={saveLocation}
              />
              <div className="divide-y divide-[color:var(--iris-border-soft)]">
                {locations.map((location) => (
                  <Row
                    key={location.id}
                    title={location.name}
                    detail={`${customerName(customers, location.customerId)} · ${location.address ?? "-"}`}
                    onEdit={() => {
                      setLocationDraft(location);
                      setLocationMissingFields([]);
                    }}
                    onDelete={() => void deleteLocation(location.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Header({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="border-b border-border px-4 py-3 text-[13px] font-medium">
      {title}
    </div>
  );
}

function CustomerForm({
  value,
  missingFields,
  onChange,
  onSave,
}: {
  value: Customer;
  missingFields: string[];
  onChange: (value: Customer) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
      <MandatoryFieldsAlert missingFields={missingFields} />
      <TextInput
        label="ID"
        value={value.id}
        placeholder="Automatski ako ostane prazno"
        onChange={(id) => onChange({ ...value, id })}
      />
      <TextInput
        label="Naziv"
        value={value.name}
        required
        isInvalid={isFieldMissing(missingFields, "Naziv")}
        onChange={(name) => onChange({ ...value, name })}
      />
      <TextInput
        label="Kontakt"
        value={value.contactName ?? ""}
        required
        isInvalid={isFieldMissing(missingFields, "Kontakt")}
        onChange={(contactName) => onChange({ ...value, contactName })}
      />
      <TextInput
        label="Email"
        value={value.email ?? ""}
        required
        isInvalid={isFieldMissing(missingFields, "Email")}
        onChange={(email) => onChange({ ...value, email })}
      />
      <TextInput
        label="Telefon"
        value={value.phone ?? ""}
        required
        isInvalid={isFieldMissing(missingFields, "Telefon")}
        onChange={(phone) => onChange({ ...value, phone })}
      />
      <SaveButton onClick={onSave} />
    </div>
  );
}

function LocationForm({
  value,
  customers,
  missingFields,
  onChange,
  onSave,
}: {
  value: Location;
  customers: Array<{ id: string; name: string }>;
  missingFields: string[];
  onChange: (value: Location) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
      <MandatoryFieldsAlert missingFields={missingFields} />
      <TextInput
        label="ID"
        value={value.id}
        required
        isInvalid={isFieldMissing(missingFields, "ID")}
        onChange={(id) => onChange({ ...value, id })}
      />
      <label className="text-[11px] text-[color:var(--iris-ink-soft)]">
        Klijent
        <select
          value={value.customerId}
          onChange={(event) => onChange({ ...value, customerId: event.target.value })}
          required
          aria-invalid={isFieldMissing(missingFields, "Klijent") || undefined}
          className={fieldControlClassName(isFieldMissing(missingFields, "Klijent"))}
        >
          <option value="">Izaberite klijenta</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <TextInput
        label="Naziv"
        value={value.name}
        required
        isInvalid={isFieldMissing(missingFields, "Naziv")}
        onChange={(name) => onChange({ ...value, name })}
      />
      <TextInput
        label="Adresa"
        value={value.address ?? ""}
        required
        isInvalid={isFieldMissing(missingFields, "Adresa")}
        onChange={(address) => onChange({ ...value, address })}
      />
      <SaveButton onClick={onSave} />
    </div>
  );
}

function TextInput({
  label,
  value,
  required = false,
  isInvalid = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  isInvalid?: boolean;
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
        aria-invalid={isInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={fieldControlClassName(isInvalid)}
      />
    </label>
  );
}

function MandatoryFieldsAlert({
  missingFields,
}: {
  missingFields: string[];
}): React.JSX.Element | null {
  if (missingFields.length === 0) return null;

  return (
    <div
      role="alert"
      className="animate-iris-fade border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-[12px] text-destructive sm:col-span-2"
    >
      <div className="font-medium">Popunite sva obavezna polja pre čuvanja.</div>
      <div className="mt-1">Nedostaje: {missingFields.join(", ")}</div>
    </div>
  );
}

function SaveButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="iris-focusable iris-press flex items-center justify-center gap-2 bg-foreground px-3 py-2 text-[12px] font-medium text-background"
    >
      <Save className="h-3.5 w-3.5" />
      Sačuvaj
    </button>
  );
}

function Row({
  title,
  detail,
  onEdit,
  onDelete,
}: {
  title: string;
  detail: string;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <button type="button" onClick={onEdit} className="min-w-0 text-left">
        <div className="truncate text-[13px] text-foreground">{title}</div>
        <div className="truncate text-[11px] text-[color:var(--iris-ink-soft)]">
          {detail || "-"}
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="iris-focusable iris-press text-[color:var(--iris-status-cancelled)]"
        aria-label="Obriši"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function blankToNull(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  return value;
}

function getMissingRequiredFields<T>(
  draft: T,
  requiredFields: Array<RequiredField<T>>,
): string[] {
  return requiredFields
    .filter((field) => !isPopulated(field.value(draft)))
    .map((field) => field.label);
}

function isPopulated(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim().length > 0;
}

function isFieldMissing(missingFields: string[], field: string): boolean {
  return missingFields.includes(field);
}

function fieldControlClassName(isInvalid: boolean): string {
  return [
    "mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground",
    isInvalid ? "border-destructive ring-1 ring-destructive/20" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatActionError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}.`;
}

function slugId(prefix: string, value: string): string {
  return `${prefix}-${value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function customerName(customers: Customer[], id: string): string {
  return customers.find((customer) => customer.id === id)?.name ?? id;
}

export default CustomersPage;
