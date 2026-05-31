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

function CustomersPage(): React.JSX.Element {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [customerDraft, setCustomerDraft] = useState<Customer>(emptyCustomer);
  const [locationDraft, setLocationDraft] = useState<Location>(emptyLocation);
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

  const saveCustomer = useCallback(async () => {
    if (!customerDraft.name.trim()) {
      toast.error("Naziv klijenta je obavezan.");
      return;
    }
    const customer = {
      ...customerDraft,
      id: customerDraft.id || slugId("cust", customerDraft.name),
      contactName: blankToNull(customerDraft.contactName),
      email: blankToNull(customerDraft.email),
      phone: blankToNull(customerDraft.phone),
    };
    try {
      await window.api.upsertCustomer(customer);
      setCustomerDraft(emptyCustomer);
      await load();
      toast.success("Klijent je sačuvan.");
    } catch {
      toast.error("Greška pri čuvanju klijenta.");
    }
  }, [customerDraft, load]);

  const saveLocation = useCallback(async () => {
    if (!locationDraft.customerId || !locationDraft.name.trim()) {
      toast.error("Klijent i naziv lokacije su obavezni.");
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
      await load();
      toast.success("Lokacija je sačuvana.");
    } catch {
      toast.error("Greška pri čuvanju lokacije.");
    }
  }, [locationDraft, load]);

  const deleteCustomer = useCallback(
    async (id: string) => {
      try {
        await window.api.deleteCustomer(id);
        await load();
        toast.success("Klijent je obrisan.");
      } catch {
        toast.error("Greška pri brisanju klijenta.");
      }
    },
    [load],
  );

  const deleteLocation = useCallback(
    async (id: string) => {
      try {
        await window.api.deleteLocation(id);
        await load();
        toast.success("Lokacija je obrisana.");
      } catch {
        toast.error("Greška pri brisanju lokacije.");
      }
    },
    [load],
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
            <section className="border border-border bg-card">
              <Header title="Klijenti" />
              <CustomerForm
                value={customerDraft}
                onChange={setCustomerDraft}
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
                    onEdit={() => setCustomerDraft(customer)}
                    onDelete={() => void deleteCustomer(customer.id)}
                  />
                ))}
              </div>
            </section>

            <section className="border border-border bg-card">
              <Header title="Lokacije" />
              <LocationForm
                value={locationDraft}
                customers={customerOptions}
                onChange={setLocationDraft}
                onSave={saveLocation}
              />
              <div className="divide-y divide-[color:var(--iris-border-soft)]">
                {locations.map((location) => (
                  <Row
                    key={location.id}
                    title={location.name}
                    detail={`${customerName(customers, location.customerId)} · ${location.address ?? "-"}`}
                    onEdit={() => setLocationDraft(location)}
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
  onChange,
  onSave,
}: {
  value: Customer;
  onChange: (value: Customer) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
      <TextInput label="ID" value={value.id} onChange={(id) => onChange({ ...value, id })} />
      <TextInput label="Naziv" value={value.name} onChange={(name) => onChange({ ...value, name })} />
      <TextInput label="Kontakt" value={value.contactName ?? ""} onChange={(contactName) => onChange({ ...value, contactName })} />
      <TextInput label="Email" value={value.email ?? ""} onChange={(email) => onChange({ ...value, email })} />
      <TextInput label="Telefon" value={value.phone ?? ""} onChange={(phone) => onChange({ ...value, phone })} />
      <SaveButton onClick={onSave} />
    </div>
  );
}

function LocationForm({
  value,
  customers,
  onChange,
  onSave,
}: {
  value: Location;
  customers: Array<{ id: string; name: string }>;
  onChange: (value: Location) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
      <TextInput label="ID" value={value.id} onChange={(id) => onChange({ ...value, id })} />
      <label className="text-[11px] text-[color:var(--iris-ink-soft)]">
        Klijent
        <select
          value={value.customerId}
          onChange={(event) => onChange({ ...value, customerId: event.target.value })}
          className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
        >
          <option value="">Izaberite klijenta</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <TextInput label="Naziv" value={value.name} onChange={(name) => onChange({ ...value, name })} />
      <TextInput label="Adresa" value={value.address ?? ""} onChange={(address) => onChange({ ...value, address })} />
      <SaveButton onClick={onSave} />
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="text-[11px] text-[color:var(--iris-ink-soft)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
      />
    </label>
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

function slugId(prefix: string, value: string): string {
  return `${prefix}-${value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function customerName(customers: Customer[], id: string): string {
  return customers.find((customer) => customer.id === id)?.name ?? id;
}

export default CustomersPage;
