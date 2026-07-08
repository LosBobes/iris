import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import {
  useForm,
  Controller,
  useFieldArray,
  type FieldErrors,
  type UseFormWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  Loader2,
  Lock,
  MapPin,
  Package,
  Plus,
  Star,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Customer,
  BillingDocumentType,
  DeliveryMethod,
  BuiltinInvoiceUnit,
  InvoiceLineItemKind,
  Location,
  PostagePaymentType,
  WorkOrder,
  WorkOrderNoteVisibility,
} from "@/types/work-order";
import {
  workOrderFormSchema,
  type WorkOrderFormValues,
} from "@/lib/work-orders/validation";
import type { CatalogItem } from "@/types/catalog";
import { formatActionError, slugId } from "@/lib/customers";
import { AsyncCombobox } from "@/components/WorkOrders/AsyncCombobox";
import type { ComboboxItem } from "@/components/WorkOrders/SearchableCombobox";
import {
  WORK_ORDER_SELECT_NONE_VALUE,
  getWorkOrderStatusLabel,
  formatWorkOrderDate,
  formatWorkOrderDateTime,
  formatWorkOrderPrice,
  getLocalIsoDate,
} from "@/shared/utils/work-orders";
import { useEnumValues } from "@/hooks/useEnumValues";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { WorkOrderPdfPreview } from "@/components/WorkOrders/WorkOrderPdfPreview";

interface WorkOrderFormProps {
  initialData?: WorkOrder | null;
  initialValues?: WorkOrderFormValues;
  // Clients are searched server-side via the picker, so the full list is no
  // longer passed in. Locations stay a prop (small, per-customer set).
  locations?: Location[];
  onSubmit: (values: WorkOrderFormValues) => Promise<void>;
  onCancel: () => void;
}

/**
 * Tracks whether the viewport is at least Tailwind's `xl` breakpoint (1280px).
 * The heavy live PDF preview (an A4 iframe re-fetched on every keystroke) is
 * gated on this so it never mounts — and never hits the API — on phones or
 * narrow tablets. Uses matchMedia via useSyncExternalStore so SSR/first paint
 * stay consistent.
 */
function useIsLargeScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia("(min-width: 1280px)");
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" && !!window.matchMedia
        ? window.matchMedia("(min-width: 1280px)").matches
        : false,
    () => false,
  );
}

interface FormSectionProps {
  step?: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/** A numbered, self-contained segment of the form. The step chip makes the
 * three-part flow (order/client → goods/services → description) legible. */
function FormSection({
  step,
  title,
  description,
  children,
}: FormSectionProps): React.JSX.Element {
  return (
    <section className="mb-6 border border-[color:var(--iris-border-soft)] bg-card">
      <div className="flex items-center gap-3 border-b border-[color:var(--iris-border-soft)] px-6 py-4">
        {step != null && (
          <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">{title}</div>
          {description && (
            <div className="mt-0.5 text-[11px] text-[color:var(--iris-ink-mute)]">
              {description}
            </div>
          )}
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}

interface DisplayFieldProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Renders muted when there is no real value to show. */
  muted?: boolean;
}

/**
 * A read-only, clearly-not-editable field. It reuses the label rhythm of the
 * editable {@link FieldShell} but swaps the input for static text and stamps a
 * small "display only" chip, so operators never mistake it for something they
 * can type into.
 */
function DisplayField({
  label,
  value,
  hint,
  muted,
}: DisplayFieldProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div data-work-order-display-field>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label className="block text-[11px] text-[color:var(--iris-ink-soft)]">
          {label}
        </label>
        <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--iris-border-soft)] px-1.5 py-px text-[9px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
          <Lock className="h-2.5 w-2.5" />
          {t("workOrders.form.displayOnly")}
        </span>
      </div>
      <div
        className={`border-b border-dashed border-border py-2 text-[13px] ${
          muted ? "text-[color:var(--iris-ink-mute)]" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {hint && (
        <p className="mt-1 text-[10px] text-[color:var(--iris-ink-faint)]">{hint}</p>
      )}
    </div>
  );
}

interface FieldShellProps {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  full,
  children,
}: FieldShellProps): React.JSX.Element {
  const labelId = id ? `${id}-label` : undefined;
  const errorId = error && id ? `${id}-error` : undefined;
  const hasError = Boolean(error);

  return (
    <div
      className={full ? "col-span-full" : undefined}
      data-work-order-field
      data-invalid={hasError ? "true" : undefined}
    >
      <label
        id={labelId}
        htmlFor={id}
        className={`mb-1.5 block text-[11px] ${
          hasError ? "text-destructive" : "text-[color:var(--iris-ink-soft)]"
        }`}
      >
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="mt-1 text-[10px] text-[color:var(--iris-ink-faint)]">{hint}</p>
      )}
    </div>
  );
}

const underlineInput =
  "w-full border-0 border-b border-border bg-transparent py-2 text-[13px] text-foreground outline-none focus:border-foreground disabled:opacity-60";

const underlineTrigger =
  "w-full justify-between border-0 border-b border-border bg-transparent py-2 !h-auto text-[13px] text-foreground rounded-none shadow-none focus-visible:border-foreground focus-visible:ring-0";

// Sentinel for the contact picker's read-only "this was typed in, not one of the
// firm's contacts" option (e.g. a contact saved before the firm had a contact list).
const WORK_ORDER_CONTACT_CUSTOM_VALUE = "__custom_contact__";

const INVOICE_UNITS_BY_KIND: Record<InvoiceLineItemKind, BuiltinInvoiceUnit[]> = {
  service: ["kom", "m2", "set"],
  goods: ["kom", "m2"],
};

type InvoiceLineItemFormValue =
  WorkOrderFormValues["invoiceDraft"]["lineItems"][number];

/** Built-in units selectable for a line kind. Custom (admin-added) units are
 * appended at render time and are allowed for any kind. */
export function getInvoiceUnitOptions(
  kind: InvoiceLineItemKind,
): BuiltinInvoiceUnit[] {
  return INVOICE_UNITS_BY_KIND[kind];
}

/**
 * Sums qty × unit price across invoice line items. This is the order's headline
 * Cena, so it stays derived from the breakdown rather than hand-typed.
 */
export function computeLineItemsTotal(
  lineItems: Array<{ quantity?: number | null; unitPrice?: number | null }> | null | undefined,
): number {
  return (lineItems ?? []).reduce(
    (sum, line) =>
      sum + (Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0),
    0,
  );
}

function isInvoiceLineItemKind(value: unknown): value is InvoiceLineItemKind {
  return value === "service" || value === "goods";
}

// Only the built-in `set` carries a kind restriction (service-only); any other
// non-empty unit — built-in or admin-added — is preserved as entered.
function normalizeInvoiceUnit(kind: InvoiceLineItemKind, unit: unknown): string {
  if (typeof unit !== "string" || unit.trim() === "") return "kom";
  if (unit === "set" && kind !== "service") return "kom";
  return unit;
}

function createInvoiceLineItem(
  kind: InvoiceLineItemKind,
): InvoiceLineItemFormValue {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    description: "",
    quantity: 1,
    unit: "kom",
    unitPrice: 0,
    // Ad-hoc line: cost unknown until an admin enters it (flags cost review).
    unitCost: null,
    catalogItemId: null,
  };
}

/** Builds a work-order line item from a catalog selection, prefilling the
 * description, unit and price and remembering the catalog link. */
function createInvoiceLineItemFromCatalog(
  item: CatalogItem,
): InvoiceLineItemFormValue {
  const kind: InvoiceLineItemKind = item.kind === "article" ? "goods" : "service";
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    description: item.name,
    quantity: 1,
    unit: normalizeInvoiceUnit(kind, item.unit),
    unitPrice: item.salePrice ?? 0,
    // Catalog cost is captured server-side at save time from the item's history.
    unitCost: null,
    catalogItemId: item.id,
  };
}

function normalizeInvoiceLineItem(
  line: Partial<InvoiceLineItemFormValue>,
  index: number,
): InvoiceLineItemFormValue {
  const kind = isInvoiceLineItemKind(line.kind) ? line.kind : "service";
  const unit = normalizeInvoiceUnit(kind, line.unit);

  return {
    id: line.id || `line-${index + 1}`,
    kind,
    description: line.description ?? "",
    quantity: line.quantity ?? 1,
    unit,
    unitPrice: line.unitPrice ?? 0,
    unitCost: line.unitCost ?? null,
    catalogItemId: line.catalogItemId ?? null,
  };
}

const ERROR_FIELD_IDS: Partial<Record<string, string>> = {
  "internalNotes.0.id": "internalNotes.0.body",
  "internalNotes.0.visibility": "internalNotes.0.body",
  "internalNotes.0.author": "internalNotes.0.body",
  "internalNotes.0.createdAt": "internalNotes.0.body",
  "customerNotes.0.id": "customerNotes.0.body",
  "customerNotes.0.visibility": "customerNotes.0.body",
  "customerNotes.0.author": "customerNotes.0.body",
  "customerNotes.0.createdAt": "customerNotes.0.body",
  "shipping.shippingAddress": "shippingAddress",
};

function hasValidationMessage(value: unknown): value is { message: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

function getFirstErrorPath(
  errors: Record<string, unknown>,
  prefix = "",
): string | null {
  for (const [key, value] of Object.entries(errors)) {
    if (!value) continue;

    const path = prefix ? `${prefix}.${key}` : key;
    if (hasValidationMessage(value)) return path;

    if (typeof value === "object" && value !== null) {
      const nestedPath = getFirstErrorPath(value as Record<string, unknown>, path);
      if (nestedPath) return nestedPath;
    }
  }

  return null;
}

function getFirstValidationMessage(value: unknown): string | undefined {
  if (!value) return undefined;
  if (hasValidationMessage(value)) return value.message as string;

  if (typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const nestedMessage = getFirstValidationMessage(nestedValue);
      if (nestedMessage) return nestedMessage;
    }
  }

  return undefined;
}

export function getFirstWorkOrderFormErrorTarget(
  errors: FieldErrors<WorkOrderFormValues>,
): string | null {
  const path = getFirstErrorPath(errors as Record<string, unknown>);
  return path ? ERROR_FIELD_IDS[path] ?? path : null;
}

export function isEmptyJobDetails(
  details: WorkOrderFormValues["jobDetails"],
): boolean {
  if (!details) return true;
  return !(
    details.productCode?.trim() ||
    details.paperWeightGsm != null ||
    details.dimensions?.trim() ||
    details.quantity != null ||
    details.finishingNote?.trim()
  );
}

export function resolveShippingAddress(
  currentAddress: string | null,
  deliveryMethod: DeliveryMethod | null,
  locationId: string | null,
  locations: Location[],
): string | null {
  if (deliveryMethod === null || deliveryMethod === "pickup") return null;
  if (currentAddress && currentAddress.trim() !== "") return currentAddress;

  return locations.find((location) => location.id === locationId)?.address ?? null;
}

function createDraftNote(visibility: WorkOrderNoteVisibility): WorkOrderFormValues["internalNotes"][number] {
  return {
    id: `${visibility}-draft`,
    visibility,
    author: "admin",
    body: "",
    createdAt: new Date().toISOString(),
  };
}

const EMPTY_SHIPPING: WorkOrderFormValues["shipping"] = {
  deliveryMethod: null,
  drivesOut: false,
  postagePaymentType: null,
  waitForPayment: false,
  hasPackaging: false,
  hasLabeling: false,
  isFragile: false,
  requiresSignature: false,
  hasInsurance: false,
  shippingAddress: null,
};

export function normalizeWorkOrderFormDefaultValues(
  values: WorkOrderFormValues,
): WorkOrderFormValues {
  const invoiceLineItems = Array.isArray(values.invoiceDraft.lineItems)
    ? values.invoiceDraft.lineItems.map((line, index) =>
        normalizeInvoiceLineItem(line, index),
      )
    : [];

  return {
    ...values,
    invoiceDraft: {
      ...values.invoiceDraft,
      lineItems: invoiceLineItems,
    },
    internalNotes:
      values.internalNotes.length > 0
        ? values.internalNotes
        : [createDraftNote("internal")],
    customerNotes:
      values.customerNotes.length > 0
        ? values.customerNotes
        : [createDraftNote("customer")],
  };
}

export function WorkOrderForm({
  initialData,
  initialValues,
  locations = [],
  onSubmit,
  onCancel,
}: WorkOrderFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!initialData;
  // Regular operators get a severely reduced form: no money/pricing fields and
  // none of the back-office billing/shipping/assignment detail. Admins keep the
  // full form. Hidden fields keep their default/initial values (react-hook-form
  // does not unregister them), so an operator's edit never wipes admin data.
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";
  // This shop may issue only proformas (never invoices); when so, new orders
  // default to a proforma and the document-type select hides invoice.
  const { proformaOnly } = useOrganization();

  const rawDefaultValues: WorkOrderFormValues =
    initialValues ??
    (initialData
      ? {
          customerId: initialData.customerId,
          locationId: initialData.locationId,
          clientName: initialData.clientName,
          contactPerson: initialData.contactPerson,
          jobDescription: initialData.jobDescription,
          jobDetails: initialData.jobDetails,
          billingDocumentType: initialData.billingDocumentType,
          billingDocumentNumber: initialData.billingDocumentNumber,
          shipping: { ...EMPTY_SHIPPING, ...initialData.shipping },
          assignment: initialData.assignment,
          price: initialData.price,
          note: initialData.note,
          issueDate: initialData.issueDate,
          dueDate: initialData.dueDate,
          executedBy: initialData.executedBy,
          internalNotes:
            initialData.internalNotes.length > 0
              ? initialData.internalNotes
              : [createDraftNote("internal")],
          customerNotes:
            initialData.customerNotes.length > 0
              ? initialData.customerNotes
              : [createDraftNote("customer")],
          attachments: initialData.attachments,
          materialUsage: initialData.materialUsage,
          timeEntries: initialData.timeEntries,
          invoiceDraft: initialData.invoiceDraft,
          communication: initialData.communication,
        }
      : {
          customerId: null,
          locationId: null,
          clientName: "",
          contactPerson: null,
          jobDescription: "",
          jobDetails: null,
          billingDocumentType: proformaOnly ? "proforma" : null,
          billingDocumentNumber: null,
          shipping: { ...EMPTY_SHIPPING },
          assignment: {
            assignedTo: null,
            priority: "normal",
            scheduledDate: null,
          },
          price: null,
          note: null,
          issueDate: getLocalIsoDate(),
          dueDate: null,
          executedBy: null,
          internalNotes: [createDraftNote("internal")],
          customerNotes: [createDraftNote("customer")],
          attachments: [],
          materialUsage: [],
          timeEntries: [],
          invoiceDraft: {
            status: "none",
            invoiceNumber: null,
            lineItems: [],
            paidAt: null,
          },
          communication: {
            publicToken: "",
            notificationEmail: null,
            emailNotificationsEnabled: false,
            signedBy: null,
            signedAt: null,
          },
        });
  const defaultValues = normalizeWorkOrderFormDefaultValues(rawDefaultValues);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderFormSchema),
    defaultValues,
  });
  const {
    fields: invoiceLineItemFields,
    append: appendInvoiceLineItem,
    remove: removeInvoiceLineItem,
  } = useFieldArray({
    control,
    name: "invoiceDraft.lineItems",
  });

  const { optionsFor } = useEnumValues();
  // Admin-added units of measure, selectable on any line kind.
  const customInvoiceUnitOptions = optionsFor("invoiceUnit")
    .filter((option) => !option.isBuiltin)
    .map((option) => ({ value: option.value, label: option.label }));
  const customUnitLabelFor = (value: string): string =>
    customInvoiceUnitOptions.find((option) => option.value === value)?.label ??
    value;
  const deliveryMethod = watch("shipping.deliveryMethod");
  const selectedCustomerId = watch("customerId");
  const selectedLocationId = watch("locationId");
  const shippingAddress = watch("shipping.shippingAddress");
  const invoiceLineItems = watch("invoiceDraft.lineItems");
  // Cena is the order total: always the sum of qty × unit price across line
  // items, never hand-typed. Keeping it derived stops the headline price from
  // drifting away from the invoice breakdown. Computed inline (not memoized):
  // react-hook-form's watch mutates the line-items array in place, so its
  // reference is stable across edits and a useMemo keyed on it would never
  // recompute — leaving the total stuck at its mount value.
  const lineItemsTotal = computeLineItemsTotal(invoiceLineItems);
  useEffect(() => {
    setValue("price", lineItemsTotal, { shouldValidate: true, shouldDirty: true });
  }, [lineItemsTotal, setValue]);
  // Locations created inline from this form are merged with the prop list so a
  // freshly added location is immediately selectable without a page reload.
  const [createdLocations, setCreatedLocations] = useState<Location[]>([]);
  const [locationDraft, setLocationDraft] = useState<{ name: string; address: string } | null>(
    null,
  );
  const [savingLocation, setSavingLocation] = useState(false);
  // Inline "Nov klijent" quick-create, mirroring the add-location flow: a new
  // registry firm is persisted and selected without leaving the order form.
  const [customerDraft, setCustomerDraft] = useState<{
    name: string;
    pib: string;
    contact: string;
  } | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Registered operator users backing the operator selects.
  const [operators, setOperators] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    window.api
      .getWorkOrderOperators()
      .then((list) => {
        if (active) setOperators(list);
      })
      .catch(() => {
        /* non-fatal: the select falls back to the current value only */
      });
    return () => {
      active = false;
    };
  }, []);
  const allLocations = useMemo(
    () => [...locations, ...createdLocations],
    [locations, createdLocations],
  );
  const filteredLocations = useMemo(
    () =>
      selectedCustomerId
        ? allLocations.filter((location) => location.customerId === selectedCustomerId)
        : allLocations,
    [allLocations, selectedCustomerId],
  );

  // The client and catalog lists are large, so both pickers search the server
  // (paginated) rather than loading every row. The picked customer is held in
  // state so its PIB/MB can be shown even though it is not in any page.
  const selectedClientName = watch("clientName");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    initialData?.customerId
      ? {
          id: initialData.customerId,
          name: initialData.clientName,
          contactName: initialData.contactPerson ?? null,
          email: null,
          phone: null,
          pib: null,
          mb: null,
          emails: [],
          contacts: [],
        }
      : null,
  );

  const searchCustomers = useCallback(async (term: string): Promise<ComboboxItem[]> => {
    const { items } = await window.api.getCustomers({ q: term, limit: 20 });
    return items.map((customer) => ({
      id: customer.id,
      label: customer.name,
      sublabel: [customer.pib ? `PIB ${customer.pib}` : null, customer.contactName]
        .filter(Boolean)
        .join(" · "),
      data: customer,
    }));
  }, []);

  const searchCatalog = useCallback(async (term: string): Promise<ComboboxItem[]> => {
    const { items } = await window.api.getCatalogItems({ q: term, active: true, limit: 20 });
    return items.map((item) => ({
      id: item.id,
      label: item.name,
      sublabel: [
        item.kind === "article" ? "Artikal" : "Usluga",
        item.code,
        isAdmin && item.salePrice !== null ? `${item.salePrice} RSD` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      data: item,
    }));
  }, [isAdmin]);

  const applyCustomerSelection = (item: ComboboxItem | null): void => {
    if (!item) {
      // "Novi klijent" — detach from the registry, keep any typed client name.
      setSelectedCustomer(null);
      setValue("customerId", null);
      return;
    }
    const customer = item.data as Customer;
    setSelectedCustomer(customer);
    setValue("customerId", customer.id);
    setValue("clientName", customer.name);
    // Default the contact to the firm's first contact person (falling back to
    // the legacy single field), and the notification email to its first email.
    const firstContact = customer.contacts[0];
    setValue("contactPerson", firstContact?.name ?? customer.contactName);
    setValue(
      "communication.notificationEmail",
      firstContact?.email ?? customer.emails[0]?.email ?? customer.email,
    );
    const firstLocation = allLocations.find((location) => location.customerId === customer.id);
    setValue("locationId", firstLocation?.id ?? null);
  };

  const handleSaveLocation = async (): Promise<void> => {
    if (!locationDraft || !selectedCustomerId) return;
    const name = locationDraft.name.trim();
    if (!name) return;
    setSavingLocation(true);
    try {
      const saved = await window.api.upsertLocation({
        id: slugId("loc", name),
        customerId: selectedCustomerId,
        name,
        address: locationDraft.address.trim() || null,
      });
      setCreatedLocations((current) => [...current, saved]);
      setValue("locationId", saved.id);
      setLocationDraft(null);
    } catch (error) {
      toast.error(formatActionError(t("workOrders.form.locationAddError"), error));
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSaveCustomer = async (): Promise<void> => {
    if (!customerDraft) return;
    const name = customerDraft.name.trim();
    if (!name) return;
    setSavingCustomer(true);
    try {
      const contact = customerDraft.contact.trim();
      const saved = await window.api.upsertCustomer({
        id: slugId("cust", name),
        name,
        contactName: contact || null,
        email: null,
        phone: null,
        pib: customerDraft.pib.trim() || null,
        mb: null,
        emails: [],
        contacts: [],
      });
      // Select the freshly created firm exactly as picking it from the registry.
      setSelectedCustomer(saved);
      setValue("customerId", saved.id);
      setValue("clientName", saved.name);
      setValue("contactPerson", saved.contactName);
      setValue("locationId", null);
      setCustomerDraft(null);
    } catch (error) {
      toast.error(formatActionError(t("workOrders.form.customerAddError"), error));
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleAddCatalogLineItem = (item: ComboboxItem | null): void => {
    if (!item) return;
    appendInvoiceLineItem(createInvoiceLineItemFromCatalog(item.data as CatalogItem));
  };
  const showShippingAddress =
    deliveryMethod !== null && deliveryMethod !== "pickup";
  const showPostageOptions =
    deliveryMethod === "postExpress" || deliveryMethod === "cityExpress";

  const [showJobDetails, setShowJobDetails] = useState(!!defaultValues.jobDetails);
  // Back-office fields (document, delivery, assignment, invoice, notes) live in
  // a collapsed segment so the three primary segments stay uncluttered. The
  // fields keep their form registration/values whether or not the panel is open.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isLargeScreen = useIsLargeScreen();
  const paperWeightError = errors.jobDetails?.paperWeightGsm?.message;
  const quantityError = errors.jobDetails?.quantity?.message;
  const internalNoteError = getFirstValidationMessage(errors.internalNotes?.[0]);
  const customerNoteError = getFirstValidationMessage(errors.customerNotes?.[0]);
  // The client's address is the first location's address (auto-picked when the
  // firm is selected). Shown read-only in segment 1 alongside PIB/MB.
  const selectedLocation = useMemo(
    () => allLocations.find((location) => location.id === selectedLocationId) ?? null,
    [allLocations, selectedLocationId],
  );
  // "Issued by" is display-only: existing orders keep their creator, new ones
  // are stamped server-side with the current operator on save.
  const issuedByDisplay = initialData?.issuedBy ?? currentUser.username;

  useEffect(() => {
    const nextAddress = resolveShippingAddress(
      shippingAddress,
      deliveryMethod,
      selectedLocationId,
      allLocations,
    );

    if (nextAddress !== shippingAddress) {
      setValue("shipping.shippingAddress", nextAddress);
    }
  }, [deliveryMethod, allLocations, selectedLocationId, setValue, shippingAddress]);

  const handleFormSubmit = async (values: WorkOrderFormValues): Promise<void> => {
    setSubmitting(true);
    try {
      await onSubmit({
        ...values,
        jobDetails: isEmptyJobDetails(values.jobDetails) ? null : values.jobDetails,
        shipping: {
          ...values.shipping,
          shippingAddress: resolveShippingAddress(
            values.shipping.shippingAddress,
            values.shipping.deliveryMethod,
            values.locationId,
            allLocations,
          ),
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvalidSubmit = (
    submitErrors: FieldErrors<WorkOrderFormValues>,
  ): void => {
    toast.error(t("workOrders.form.validationError"));

    // A required field may sit in the collapsed advanced panel (e.g. a shipping
    // address once a delivery method is set); open it so the field can be
    // scrolled to and focused.
    setShowAdvanced(true);

    const targetId = getFirstWorkOrderFormErrorTarget(submitErrors);
    if (!targetId) return;

    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
      }
    });
  };

  const handleAddInvoiceLineItem = (kind: InvoiceLineItemKind): void => {
    appendInvoiceLineItem(createInvoiceLineItem(kind));
  };

  // Operator selects share this renderer. They pick from registered operators
  // but keep showing an off-registry value already stored on the order (e.g. a
  // legacy free-typed name) via a read-only "custom" fallback option.
  const renderOperatorSelect = (
    name: "assignment.assignedTo" | "executedBy",
    triggerId: string,
  ): React.JSX.Element => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const known = field.value ? operators.includes(field.value) : false;
        return (
          <Select
            value={
              field.value && known
                ? field.value
                : field.value
                  ? WORK_ORDER_CONTACT_CUSTOM_VALUE
                  : WORK_ORDER_SELECT_NONE_VALUE
            }
            onValueChange={(v) => {
              if (v === WORK_ORDER_SELECT_NONE_VALUE) {
                field.onChange(null);
                return;
              }
              if (v === WORK_ORDER_CONTACT_CUSTOM_VALUE) return;
              field.onChange(v);
            }}
          >
            <SelectTrigger
              id={triggerId}
              aria-labelledby={`${triggerId}-label`}
              className={underlineTrigger}
            >
              <SelectValue placeholder={t("workOrders.form.selectOperator")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                {t("workOrders.detail.unassigned")}
              </SelectItem>
              {operators.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {operator}
                </SelectItem>
              ))}
              {field.value && !known && (
                <SelectItem value={WORK_ORDER_CONTACT_CUSTOM_VALUE}>
                  {field.value} ({t("workOrders.form.customContact")})
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        );
      }}
    />
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit, handleInvalidSubmit)}
      className="grid grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_400px]"
    >
      <div className="min-w-0 pb-4 xl:pr-10">
        {/* ── Segment 1: Order & client ──────────────────────────────── */}
        <FormSection step={1} title={t("workOrders.form.sectionOrderClient")}>
          {/* Order meta: the number is shown up-front, next to the client, as
              the shop requested. New orders get their number on save. */}
          <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4 border border-[color:var(--iris-border-soft)] bg-background px-5 py-4 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.form.orderNumberLabel")}
              </div>
              {isEdit && initialData ? (
                <div className="tnum mt-1 text-[15px] text-foreground">
                  {initialData.orderNumber}
                </div>
              ) : (
                <div className="mt-1 text-[13px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.form.orderNumberNew")}
                </div>
              )}
            </div>
            {isEdit && initialData && (
              <>
                <div>
                  <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.form.statusLabel")}
                  </div>
                  <div className="mt-1 text-foreground">
                    {getWorkOrderStatusLabel(initialData.status)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.form.createdLabel")}
                  </div>
                  <div className="tnum mt-1 text-foreground">
                    {formatWorkOrderDateTime(initialData.createdAt)}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FieldShell
              id="customerId"
              label={t("workOrders.form.clientRegistry")}
              hint={t("workOrders.form.clientSearchHint")}
            >
              <AsyncCombobox
                triggerId="customerId"
                selectedLabel={selectedCustomer ? selectedCustomer.name : (selectedClientName || null)}
                onSearch={searchCustomers}
                onSelect={applyCustomerSelection}
                placeholder={t("workOrders.form.selectClient")}
                searchPlaceholder={t("workOrders.form.searchClients")}
                emptyText={t("workOrders.form.noClients")}
                clearLabel={t("workOrders.form.newClient")}
              />
              {/* Inline add-client, mirroring the add-location flow below: persists
                  a new registry firm and selects it without leaving the form. */}
              {customerDraft === null ? (
                <button
                  type="button"
                  onClick={() =>
                    setCustomerDraft({ name: "", pib: "", contact: "" })
                  }
                  className="iris-focusable iris-press mt-2 inline-flex items-center gap-1 bg-transparent p-0 text-[11px] text-[color:var(--iris-accent)] hover:opacity-80"
                >
                  <Plus className="h-3 w-3" />
                  {t("workOrders.form.addCustomer")}
                </button>
              ) : (
                <div className="mt-2 space-y-2 border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--iris-ink-soft)]">
                      <UserPlus className="h-3.5 w-3.5" />
                      {t("workOrders.form.addCustomer")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomerDraft(null)}
                      className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                      {t("workOrders.form.cancel")}
                    </button>
                  </div>
                  <input
                    value={customerDraft.name}
                    placeholder={t("workOrders.form.newCustomerName")}
                    onChange={(event) =>
                      setCustomerDraft((draft) =>
                        draft ? { ...draft, name: event.target.value } : draft,
                      )
                    }
                    className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                  />
                  <input
                    value={customerDraft.pib}
                    placeholder={t("workOrders.form.newCustomerPib")}
                    onChange={(event) =>
                      setCustomerDraft((draft) =>
                        draft ? { ...draft, pib: event.target.value } : draft,
                      )
                    }
                    className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                  />
                  <input
                    value={customerDraft.contact}
                    placeholder={t("workOrders.form.newCustomerContact")}
                    onChange={(event) =>
                      setCustomerDraft((draft) =>
                        draft ? { ...draft, contact: event.target.value } : draft,
                      )
                    }
                    className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveCustomer()}
                    disabled={savingCustomer || customerDraft.name.trim() === ""}
                    className="iris-focusable iris-press inline-flex items-center gap-1.5 bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                  >
                    {savingCustomer && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("workOrders.form.saveCustomer")}
                  </button>
                </div>
              )}
            </FieldShell>

            <FieldShell id="locationId" label={t("workOrders.form.location")}>
              <Controller
                name="locationId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? WORK_ORDER_SELECT_NONE_VALUE}
                    onValueChange={(v) => {
                      const nextValue = v === WORK_ORDER_SELECT_NONE_VALUE ? null : v;
                      field.onChange(nextValue);
                    }}
                  >
                    <SelectTrigger
                      id="locationId"
                      aria-labelledby="locationId-label"
                      className={underlineTrigger}
                    >
                      <SelectValue placeholder={t("workOrders.form.selectLocation")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                        Nije izabrano
                      </SelectItem>
                      {filteredLocations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {/* Inline add-location, available once a registry firm is picked
                  (an off-registry client has nothing to attach a location to). */}
              {selectedCustomerId &&
                (locationDraft === null ? (
                  <button
                    type="button"
                    onClick={() => setLocationDraft({ name: "", address: "" })}
                    className="iris-focusable iris-press mt-2 inline-flex items-center gap-1 bg-transparent p-0 text-[11px] text-[color:var(--iris-accent)] hover:opacity-80"
                  >
                    <Plus className="h-3 w-3" />
                    {t("workOrders.form.addLocation")}
                  </button>
                ) : (
                  <div className="mt-2 space-y-2 border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--iris-ink-soft)]">
                        <MapPin className="h-3.5 w-3.5" />
                        {t("workOrders.form.addLocation")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLocationDraft(null)}
                        className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                        {t("workOrders.form.cancel")}
                      </button>
                    </div>
                    <input
                      value={locationDraft.name}
                      placeholder={t("workOrders.form.newLocationName")}
                      onChange={(event) =>
                        setLocationDraft((draft) =>
                          draft ? { ...draft, name: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <input
                      value={locationDraft.address}
                      placeholder={t("workOrders.form.newLocationAddress")}
                      onChange={(event) =>
                        setLocationDraft((draft) =>
                          draft ? { ...draft, address: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveLocation()}
                      disabled={savingLocation || locationDraft.name.trim() === ""}
                      className="iris-focusable iris-press inline-flex items-center gap-1.5 bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                    >
                      {savingLocation && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("workOrders.form.saveLocation")}
                    </button>
                  </div>
                ))}
            </FieldShell>

            {/* A registry client supplies its own name/contact, so the
                free-text fields would just duplicate it. Show them read-only
                when bound; only expose editable inputs for an off-registry
                ("Novi klijent") entry. The values stay in form state either
                way, so submission is unaffected. */}
            {selectedCustomer ? (
              <>
                <DisplayField
                  label={t("workOrders.form.clientName")}
                  value={selectedCustomer.name}
                />
                <FieldShell id="contactPerson" label={t("workOrders.form.contactPerson")}>
                  {selectedCustomer.contacts.length > 0 ? (
                    <Controller
                      name="contactPerson"
                      control={control}
                      render={({ field }) => {
                        const known = selectedCustomer.contacts.some(
                          (contact) => contact.name === field.value,
                        );
                        return (
                          <Select
                            value={
                              field.value && known
                                ? field.value
                                : field.value
                                  ? WORK_ORDER_CONTACT_CUSTOM_VALUE
                                  : WORK_ORDER_SELECT_NONE_VALUE
                            }
                            onValueChange={(v) => {
                              if (v === WORK_ORDER_SELECT_NONE_VALUE) {
                                field.onChange(null);
                                return;
                              }
                              if (v === WORK_ORDER_CONTACT_CUSTOM_VALUE) return;
                              field.onChange(v);
                              const picked = selectedCustomer.contacts.find(
                                (contact) => contact.name === v,
                              );
                              if (picked?.email) {
                                setValue("communication.notificationEmail", picked.email);
                              }
                            }}
                          >
                            <SelectTrigger
                              id="contactPerson"
                              aria-labelledby="contactPerson-label"
                              className={underlineTrigger}
                            >
                              <SelectValue placeholder={t("workOrders.form.selectContact")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                                Nije izabrano
                              </SelectItem>
                              {selectedCustomer.contacts.map((contact) => (
                                <SelectItem key={contact.id} value={contact.name}>
                                  {contact.name}
                                  {contact.role ? ` · ${contact.role}` : ""}
                                </SelectItem>
                              ))}
                              {field.value && !known && (
                                <SelectItem value={WORK_ORDER_CONTACT_CUSTOM_VALUE}>
                                  {field.value} ({t("workOrders.form.customContact")})
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        );
                      }}
                    />
                  ) : (
                    <input
                      id="contactPerson"
                      className={underlineInput}
                      {...register("contactPerson", {
                        setValueAs: (v: string) => (v === "" ? null : v),
                      })}
                    />
                  )}
                </FieldShell>

                {/* PIB / MB come from the registry record and are shown
                    read-only so the operator can confirm the firm at a glance. */}
                <DisplayField
                  label={t("workOrders.form.pibLabel")}
                  value={selectedCustomer.pib ?? "—"}
                  muted={!selectedCustomer.pib}
                />
                <DisplayField
                  label={t("workOrders.form.mbLabel")}
                  value={selectedCustomer.mb ?? "—"}
                  muted={!selectedCustomer.mb}
                />

                {/* Address auto-fills from the firm's first location and is
                    read-only — edit it on the location record, not here. */}
                <div className="sm:col-span-2">
                  <DisplayField
                    label={t("workOrders.form.clientAddress")}
                    value={
                      selectedLocation?.address ||
                      t("workOrders.form.clientAddressNone")
                    }
                    muted={!selectedLocation?.address}
                  />
                </div>
              </>
            ) : (
              <>
                <FieldShell
                  id="clientName"
                  label={t("workOrders.form.clientNameRequired")}
                  hint={t("workOrders.form.clientNameHint")}
                  error={errors.clientName?.message}
                >
                  <input
                    id="clientName"
                    className={underlineInput}
                    {...register("clientName")}
                  />
                </FieldShell>
                <FieldShell id="contactPerson" label={t("workOrders.form.contactPerson")}>
                  <input
                    id="contactPerson"
                    className={underlineInput}
                    {...register("contactPerson", {
                      setValueAs: (v: string) => (v === "" ? null : v),
                    })}
                  />
                </FieldShell>
              </>
            )}
          </div>
        </FormSection>

        {/* ── Segment 2: Goods & services ────────────────────────────── */}
        <FormSection step={2} title={t("workOrders.form.sectionGoodsServices")}>
          {/* Deadlines: issue/proforma date (admin) and completion date. */}
          <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {isAdmin && (
              <FieldShell
                id="issueDate"
                label={t("workOrders.form.issueDate")}
                hint={t("workOrders.form.issueDateHint")}
                error={errors.issueDate?.message}
              >
                <Controller
                  name="issueDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      id="issueDate"
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? "")}
                      placeholder={t("workOrders.detail.issueDate")}
                      disabled={submitting}
                    />
                  )}
                />
              </FieldShell>
            )}

            <FieldShell
              id="dueDate"
              label={t("workOrders.form.dueDate")}
              hint={t("workOrders.form.dueDateHint")}
            >
              <Controller
                name="dueDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="dueDate"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    placeholder={t("workOrders.form.dueDate")}
                    disabled={submitting}
                  />
                )}
              />
            </FieldShell>
          </div>

          {/* Catalog picker prefills description, unit and price; the two
              "special" buttons add off-catalog lines (marked with a ★). */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
              {t("workOrders.form.items")}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleAddInvoiceLineItem("service")}
                className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
              >
                <Star className="h-3.5 w-3.5" />
                {t("workOrders.form.specialService")}
              </button>
              <button
                type="button"
                onClick={() => handleAddInvoiceLineItem("goods")}
                className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
              >
                <Star className="h-3.5 w-3.5" />
                {t("workOrders.form.specialGoods")}
              </button>
            </div>
          </div>

          <div className="mb-5">
            <div className="mb-1 text-[11px] text-[color:var(--iris-ink-soft)]">
              {t("workOrders.form.addFromCatalog")}
            </div>
            <AsyncCombobox
              selectedLabel={null}
              resetAfterSelect
              onSearch={searchCatalog}
              onSelect={handleAddCatalogLineItem}
              placeholder={t("workOrders.form.searchCatalogPlaceholder")}
              searchPlaceholder={t("workOrders.form.searchCatalog")}
              emptyText={t("workOrders.form.noCatalog")}
            />
            <p className="mt-1 text-[11px] text-[color:var(--iris-ink-mute)]">
              {t("workOrders.form.catalogHint")}
            </p>
          </div>

          {invoiceLineItemFields.length === 0 ? (
            <div className="border border-dashed border-border bg-background px-4 py-6 text-center text-[12px] text-[color:var(--iris-ink-soft)]">
              {t("workOrders.form.noItems")}
            </div>
          ) : (
            // Container (not viewport) query: each card only spreads into
            // columns when this list is actually wide enough. With the live
            // preview open the form column is narrow even on a wide screen.
            <div className="@container space-y-3">
              {invoiceLineItemFields.map((lineItem, index) => {
                const line = invoiceLineItems[index];
                const selectedKind = line?.kind === "goods" ? "goods" : "service";
                const builtinUnitOptions = getInvoiceUnitOptions(selectedKind).map(
                  (unit) => ({ value: unit, label: t(`workOrders.unit.${unit}`) }),
                );
                // Append admin-added units (any kind); keep the current value
                // selectable even if it is an unknown/custom unit.
                const currentUnit = line?.unit;
                const unitOptions = [
                  ...builtinUnitOptions,
                  ...customInvoiceUnitOptions,
                ];
                if (
                  currentUnit &&
                  !unitOptions.some((option) => option.value === currentUnit)
                ) {
                  unitOptions.push({
                    value: currentUnit,
                    label: customUnitLabelFor(currentUnit),
                  });
                }
                const lineItemError = errors.invoiceDraft?.lineItems?.[index];
                const isOffCatalog = !line?.catalogItemId;
                const lineAmount =
                  (Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0);

                return (
                  <div
                    key={lineItem.id}
                    className="border border-[color:var(--iris-border-soft)] bg-background p-4 transition-colors hover:border-border"
                  >
                    {/* Card header: kind badge + description + line amount. */}
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 text-[10px] font-medium uppercase tracking-[0.5px] ${
                          selectedKind === "goods"
                            ? "bg-[color:var(--iris-accent)]/12 text-[color:var(--iris-accent)]"
                            : "bg-[color:var(--iris-border-soft)] text-[color:var(--iris-ink-soft)]"
                        }`}
                      >
                        {selectedKind === "goods" ? (
                          <Package className="h-3 w-3" />
                        ) : (
                          <Wrench className="h-3 w-3" />
                        )}
                        {t(`workOrders.lineKind.${selectedKind}`)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <FieldShell
                          id={`invoiceDraft.lineItems.${index}.description`}
                          label={t("workOrders.form.colDescription")}
                          error={lineItemError?.description?.message}
                        >
                          <input
                            id={`invoiceDraft.lineItems.${index}.description`}
                            className={underlineInput}
                            {...register(
                              `invoiceDraft.lineItems.${index}.description` as const,
                            )}
                          />
                        </FieldShell>
                        {isOffCatalog && (
                          <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[color:var(--iris-ink-mute)]">
                            <Star className="h-2.5 w-2.5" />
                            {t("workOrders.form.offCatalog")}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        aria-label={t("workOrders.form.removeItem", { n: index + 1 })}
                        onClick={() => removeInvoiceLineItem(index)}
                        className="iris-focusable iris-press mt-1 flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-background text-[color:var(--iris-ink-soft)] hover:border-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Card body: quantity, unit, and (admin) price/cost. */}
                    <div
                      className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[color:var(--iris-border-soft)] pt-3 ${
                        isAdmin ? "@md:grid-cols-4" : "@md:grid-cols-3"
                      }`}
                    >
                      <FieldShell
                        id={`invoiceDraft.lineItems.${index}.kind`}
                        label={t("workOrders.form.colType")}
                      >
                        <Controller
                          name={`invoiceDraft.lineItems.${index}.kind` as const}
                          control={control}
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                const nextKind = isInvoiceLineItemKind(value)
                                  ? value
                                  : "service";
                                field.onChange(nextKind);

                                const activeUnit = invoiceLineItems[index]?.unit;
                                const normalizedUnit = normalizeInvoiceUnit(
                                  nextKind,
                                  activeUnit,
                                );
                                if (normalizedUnit !== activeUnit) {
                                  setValue(
                                    `invoiceDraft.lineItems.${index}.unit`,
                                    normalizedUnit,
                                  );
                                }
                              }}
                            >
                              <SelectTrigger
                                id={`invoiceDraft.lineItems.${index}.kind`}
                                aria-labelledby={`invoiceDraft.lineItems.${index}.kind-label`}
                                className={underlineTrigger}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(["service", "goods"] as const).map((value) => (
                                  <SelectItem key={value} value={value}>
                                    {t(`workOrders.lineKind.${value}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </FieldShell>

                      <FieldShell
                        id={`invoiceDraft.lineItems.${index}.quantity`}
                        label={t("workOrders.form.colQuantity")}
                        error={lineItemError?.quantity?.message}
                      >
                        <input
                          id={`invoiceDraft.lineItems.${index}.quantity`}
                          type="number"
                          className={`${underlineInput} tnum`}
                          {...register(
                            `invoiceDraft.lineItems.${index}.quantity` as const,
                            {
                              setValueAs: (v: string) => (v === "" ? 1 : Number(v)),
                            },
                          )}
                        />
                      </FieldShell>

                      <FieldShell
                        id={`invoiceDraft.lineItems.${index}.unit`}
                        label={t("workOrders.form.colUnit")}
                        error={lineItemError?.unit?.message}
                      >
                        <Controller
                          name={`invoiceDraft.lineItems.${index}.unit` as const}
                          control={control}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger
                                id={`invoiceDraft.lineItems.${index}.unit`}
                                aria-labelledby={`invoiceDraft.lineItems.${index}.unit-label`}
                                className={underlineTrigger}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {unitOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </FieldShell>

                      {isAdmin && (
                        <FieldShell
                          id={`invoiceDraft.lineItems.${index}.unitPrice`}
                          label={t("workOrders.form.colPrice")}
                          error={lineItemError?.unitPrice?.message}
                        >
                          <input
                            id={`invoiceDraft.lineItems.${index}.unitPrice`}
                            type="number"
                            step="0.01"
                            className={`${underlineInput} tnum`}
                            {...register(
                              `invoiceDraft.lineItems.${index}.unitPrice` as const,
                              {
                                setValueAs: (v: string) => (v === "" ? 0 : Number(v)),
                              },
                            )}
                          />
                        </FieldShell>
                      )}

                      {isAdmin &&
                        (line?.catalogItemId ? (
                          // Catalog-line cost is captured server-side from the
                          // item's price history; show it read-only.
                          <FieldShell
                            id={`invoiceDraft.lineItems.${index}.unitCost`}
                            label={t("workOrders.form.colCost")}
                            hint={t("workOrders.form.costFromCatalog")}
                          >
                            <div className="tnum py-1 text-[13px] text-[color:var(--iris-ink-mute)]">
                              {line?.unitCost != null ? line.unitCost : "—"}
                            </div>
                          </FieldShell>
                        ) : (
                          // Ad-hoc line: admin enters the cost; empty flags review.
                          <FieldShell
                            id={`invoiceDraft.lineItems.${index}.unitCost`}
                            label={t("workOrders.form.colCost")}
                            error={lineItemError?.unitCost?.message}
                          >
                            <input
                              id={`invoiceDraft.lineItems.${index}.unitCost`}
                              type="number"
                              step="0.01"
                              placeholder="—"
                              className={`${underlineInput} tnum`}
                              {...register(
                                `invoiceDraft.lineItems.${index}.unitCost` as const,
                                {
                                  setValueAs: (v: string) => (v === "" ? null : Number(v)),
                                },
                              )}
                            />
                          </FieldShell>
                        ))}
                    </div>

                    {isAdmin && (
                      <div className="mt-3 flex items-baseline justify-end gap-2 border-t border-[color:var(--iris-border-soft)] pt-3">
                        <span className="text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                          {t("workOrders.form.lineAmount")}
                        </span>
                        <span className="tnum text-[14px] text-foreground">
                          {formatWorkOrderPrice(lineAmount)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div className="mt-5 flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-soft)]">
                {t("workOrders.form.priceTotalLabel")}
              </span>
              <span className="tnum text-[22px] font-normal tracking-[-0.3px] text-foreground">
                {formatWorkOrderPrice(lineItemsTotal)}
              </span>
            </div>
          )}
          {errors.price?.message && (
            <p role="alert" className="mt-1 text-right text-[11px] text-destructive">
              {errors.price.message}
            </p>
          )}
        </FormSection>

        {/* ── Segment 3: Description & signature ─────────────────────── */}
        <FormSection
          step={3}
          title={t("workOrders.form.sectionDescriptionSignature")}
        >
          <div className="space-y-6">
            <FieldShell
              id="jobDescription"
              label={t("workOrders.form.jobDescription")}
              error={errors.jobDescription?.message}
              full
            >
              <textarea
                id="jobDescription"
                rows={2}
                className={`${underlineInput} resize-none`}
                {...register("jobDescription")}
              />
            </FieldShell>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FieldShell
                id="communication.signedBy"
                label={t("workOrders.form.pickupBy")}
              >
                <input
                  id="communication.signedBy"
                  className={underlineInput}
                  placeholder={t("workOrders.form.pickupByPlaceholder")}
                  {...register("communication.signedBy")}
                />
              </FieldShell>

              <DisplayField
                label={t("workOrders.form.issuedByLabel")}
                value={issuedByDisplay}
              />
            </div>

            <FieldShell id="note" label={t("workOrders.form.note")} full>
              <textarea
                id="note"
                rows={3}
                className="w-full border border-border bg-card p-3 text-[12px] text-foreground outline-none focus:border-foreground"
                placeholder={t("workOrders.form.notePlaceholder")}
                {...register("note", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
              />
            </FieldShell>
          </div>
        </FormSection>

        {/* ── Advanced (admin only): back-office detail, collapsed ────── */}
        {isAdmin && (
          <section className="mb-6 border border-[color:var(--iris-border-soft)] bg-card">
            <button
              type="button"
              onClick={() => setShowAdvanced((open) => !open)}
              aria-expanded={showAdvanced}
              className="iris-focusable flex w-full items-center justify-between gap-3 bg-transparent px-6 py-4 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-foreground">
                  {t("workOrders.form.sectionAdvanced")}
                </span>
                <span className="mt-0.5 block text-[11px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.form.advancedHint")}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[color:var(--iris-ink-soft)] transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
            </button>

            {showAdvanced && (
              <div
                className="space-y-8 border-t border-[color:var(--iris-border-soft)] px-6 py-6"
                style={{ animation: "iris-fade-up 320ms var(--iris-ease-out) both" }}
              >
                {/* Job details */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowJobDetails(!showJobDetails)}
                    aria-expanded={showJobDetails}
                    className="iris-focusable iris-press bg-transparent p-0 text-[11px] text-[color:var(--iris-accent)] hover:opacity-80"
                  >
                    {showJobDetails
                      ? t("workOrders.form.jobDetailsHide")
                      : t("workOrders.form.jobDetailsShow")}
                  </button>
                  {showJobDetails && (
                    <div
                      className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2"
                      style={{
                        animation: "iris-fade-up 320ms var(--iris-ease-out) both",
                      }}
                    >
                      <FieldShell id="jobDetails.productCode" label={t("workOrders.form.productCode")}>
                        <input
                          id="jobDetails.productCode"
                          className={underlineInput}
                          {...register("jobDetails.productCode", {
                            setValueAs: (v: string) => (v === "" ? null : v),
                          })}
                        />
                      </FieldShell>
                      <FieldShell
                        id="jobDetails.paperWeightGsm"
                        label={t("workOrders.form.paperWeight")}
                        error={paperWeightError}
                      >
                        <input
                          id="jobDetails.paperWeightGsm"
                          type="number"
                          className={`${underlineInput} tnum`}
                          {...register("jobDetails.paperWeightGsm", {
                            setValueAs: (v: string) => (v === "" ? null : Number(v)),
                          })}
                        />
                      </FieldShell>
                      <FieldShell id="jobDetails.dimensions" label={t("workOrders.form.dimensions")}>
                        <input
                          id="jobDetails.dimensions"
                          className={underlineInput}
                          {...register("jobDetails.dimensions", {
                            setValueAs: (v: string) => (v === "" ? null : v),
                          })}
                        />
                      </FieldShell>
                      <FieldShell
                        id="jobDetails.quantity"
                        label={t("workOrders.form.quantity")}
                        error={quantityError}
                      >
                        <input
                          id="jobDetails.quantity"
                          type="number"
                          className={`${underlineInput} tnum`}
                          {...register("jobDetails.quantity", {
                            setValueAs: (v: string) => (v === "" ? null : Number(v)),
                          })}
                        />
                      </FieldShell>
                      <FieldShell
                        id="jobDetails.finishingNote"
                        label={t("workOrders.form.finishingNote")}
                        full
                      >
                        <input
                          id="jobDetails.finishingNote"
                          className={underlineInput}
                          {...register("jobDetails.finishingNote", {
                            setValueAs: (v: string) => (v === "" ? null : v),
                          })}
                        />
                      </FieldShell>
                    </div>
                  )}
                </div>

                {/* Assignment & schedule */}
                <div>
                  <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.form.sectionAssignment")}
                  </div>
                  <div className="grid gap-x-6 gap-y-5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                    <FieldShell id="assignment.assignedTo" label={t("workOrders.form.operator")}>
                      {renderOperatorSelect("assignment.assignedTo", "assignment.assignedTo")}
                    </FieldShell>

                    <FieldShell id="assignment.priority" label={t("workOrders.form.priority")}>
                      <Controller
                        name="assignment.priority"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              id="assignment.priority"
                              aria-labelledby="assignment.priority-label"
                              className={underlineTrigger}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {optionsFor("priority").map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FieldShell>

                    <FieldShell id="assignment.scheduledDate" label={t("workOrders.form.scheduled")}>
                      <Controller
                        name="assignment.scheduledDate"
                        control={control}
                        render={({ field }) => (
                          <DatePicker
                            id="assignment.scheduledDate"
                            value={field.value}
                            onChange={(v) => field.onChange(v)}
                            placeholder={t("workOrders.form.scheduled")}
                            disabled={submitting}
                          />
                        )}
                      />
                    </FieldShell>

                    {isEdit && (
                      <FieldShell id="executedBy" label={t("workOrders.form.executedBy")}>
                        {renderOperatorSelect("executedBy", "executedBy")}
                      </FieldShell>
                    )}
                  </div>
                </div>

                {/* Document & delivery */}
                <div>
                  <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.form.sectionDocument")}
                  </div>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <FieldShell
                      id="billingDocumentType"
                      label={t("workOrders.form.documentType")}
                      hint={
                        proformaOnly
                          ? t("workOrders.form.proformaOnlyHint")
                          : undefined
                      }
                    >
                      <Controller
                        name="billingDocumentType"
                        control={control}
                        render={({ field }) => {
                          // This shop may issue only proformas: hide "invoice" from
                          // the picklist, but never drop it if it's already the
                          // value stored on an existing order.
                          const documentTypeOptions = optionsFor(
                            "billingDocumentType",
                          ).filter(
                            (option) =>
                              !proformaOnly ||
                              option.value !== "invoice" ||
                              field.value === "invoice",
                          );
                          return (
                            <Select
                              value={field.value ?? WORK_ORDER_SELECT_NONE_VALUE}
                              onValueChange={(v) => {
                                const nextValue =
                                  v === WORK_ORDER_SELECT_NONE_VALUE
                                    ? null
                                    : (v as BillingDocumentType);
                                field.onChange(nextValue);
                              }}
                            >
                              <SelectTrigger
                                id="billingDocumentType"
                                aria-labelledby="billingDocumentType-label"
                                className={underlineTrigger}
                              >
                                <SelectValue placeholder={t("workOrders.form.selectType")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                                  Nije izabrano
                                </SelectItem>
                                {documentTypeOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }}
                      />
                    </FieldShell>

                    <FieldShell id="shipping.deliveryMethod" label={t("workOrders.form.deliveryMethod")}>
                      <Controller
                        name="shipping.deliveryMethod"
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value ?? WORK_ORDER_SELECT_NONE_VALUE}
                            onValueChange={(v) =>
                              field.onChange(v === WORK_ORDER_SELECT_NONE_VALUE ? null : v)
                            }
                          >
                            <SelectTrigger
                              id="shipping.deliveryMethod"
                              aria-labelledby="shipping.deliveryMethod-label"
                              className={underlineTrigger}
                            >
                              <SelectValue placeholder={t("workOrders.form.selectMethod")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                                Nije izabrano
                              </SelectItem>
                              {optionsFor("deliveryMethod").map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FieldShell>

                    <FieldShell
                      id="billingDocumentNumber"
                      label={t("workOrders.form.documentNumber")}
                    >
                      <input
                        id="billingDocumentNumber"
                        className={`${underlineInput} tnum`}
                        {...register("billingDocumentNumber", {
                          setValueAs: (v: string) => (v === "" ? null : v),
                        })}
                      />
                    </FieldShell>

                    <FieldShell id="shipping.drivesOut" label={t("workOrders.form.drivesOut")}>
                      <Controller
                        name="shipping.drivesOut"
                        control={control}
                        render={({ field }) => (
                          <div className="flex items-center gap-2 py-2">
                            <Checkbox
                              id="shipping.drivesOut"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                            <label
                              htmlFor="shipping.drivesOut"
                              className="text-[12px] text-[color:var(--iris-ink-soft)]"
                            >
                              Vozi se
                            </label>
                          </div>
                        )}
                      />
                    </FieldShell>

                    {showShippingAddress && (
                      <FieldShell
                        id="shippingAddress"
                        label={t("workOrders.form.shippingAddress")}
                        error={errors.shipping?.shippingAddress?.message}
                        full
                      >
                        <input
                          id="shippingAddress"
                          className={underlineInput}
                          style={{
                            animation: "iris-fade-up 280ms var(--iris-ease-out) both",
                          }}
                          {...register("shipping.shippingAddress", {
                            setValueAs: (v: string) => (v === "" ? null : v),
                          })}
                        />
                      </FieldShell>
                    )}

                    {showPostageOptions && (
                      <FieldShell id="shipping.postagePaymentType" label={t("workOrders.form.postage")}>
                        <Controller
                          name="shipping.postagePaymentType"
                          control={control}
                          render={({ field }) => (
                            <Select
                              value={field.value ?? WORK_ORDER_SELECT_NONE_VALUE}
                              onValueChange={(v) =>
                                field.onChange(
                                  v === WORK_ORDER_SELECT_NONE_VALUE
                                    ? null
                                    : (v as PostagePaymentType),
                                )
                              }
                            >
                              <SelectTrigger
                                id="shipping.postagePaymentType"
                                aria-labelledby="shipping.postagePaymentType-label"
                                className={underlineTrigger}
                              >
                                <SelectValue placeholder={t("workOrders.form.postagePayment")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                                  Nije izabrano
                                </SelectItem>
                                {optionsFor("postagePaymentType").map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </FieldShell>
                    )}

                    <FieldShell id="shipping.waitForPayment" label={t("workOrders.form.payment")}>
                      <Controller
                        name="shipping.waitForPayment"
                        control={control}
                        render={({ field }) => (
                          <div className="flex items-center gap-2 py-2">
                            <Checkbox
                              id="shipping.waitForPayment"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                            <label
                              htmlFor="shipping.waitForPayment"
                              className="text-[12px] text-[color:var(--iris-ink-soft)]"
                            >
                              {t("workOrders.form.waitForPayment")}
                            </label>
                          </div>
                        )}
                      />
                    </FieldShell>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                    {[
                      { name: "shipping.hasPackaging" as const, label: t("workOrders.form.packaging"), id: "hasPackaging" },
                      { name: "shipping.hasLabeling" as const, label: t("workOrders.form.labeling"), id: "hasLabeling" },
                      { name: "shipping.isFragile" as const, label: t("workOrders.form.fragile"), id: "isFragile" },
                      {
                        name: "shipping.requiresSignature" as const,
                        label: t("workOrders.form.requiresSignature"),
                        id: "requiresSignature",
                      },
                      { name: "shipping.hasInsurance" as const, label: t("workOrders.form.insurance"), id: "hasInsurance" },
                    ].map((opt) => (
                      <Controller
                        key={opt.id}
                        name={opt.name}
                        control={control}
                        render={({ field }) => (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={opt.id}
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                            <label
                              htmlFor={opt.id}
                              className="text-[12px] text-[color:var(--iris-ink-soft)]"
                            >
                              {opt.label}
                            </label>
                          </div>
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Invoice & notifications */}
                <div>
                  <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.form.sectionFinanceNotes")}
                  </div>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <FieldShell id="invoiceDraft.status" label={t("workOrders.form.invoiceStatus")}>
                      <Controller
                        name="invoiceDraft.status"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              id="invoiceDraft.status"
                              aria-labelledby="invoiceDraft.status-label"
                              className={underlineTrigger}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t("workOrders.form.invoiceStatusNone")}</SelectItem>
                              <SelectItem value="draft">{t("workOrders.form.invoiceStatusDraft")}</SelectItem>
                              <SelectItem value="issued">{t("workOrders.form.invoiceStatusIssued")}</SelectItem>
                              <SelectItem value="paid">{t("workOrders.form.invoiceStatusPaid")}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FieldShell>

                    <FieldShell id="invoiceDraft.invoiceNumber" label={t("workOrders.form.invoiceNumber")}>
                      <input
                        id="invoiceDraft.invoiceNumber"
                        className={`${underlineInput} tnum`}
                        {...register("invoiceDraft.invoiceNumber")}
                      />
                    </FieldShell>

                    <FieldShell id="communication.notificationEmail" label={t("workOrders.form.email")}>
                      <input
                        id="communication.notificationEmail"
                        type="email"
                        className={underlineInput}
                        {...register("communication.notificationEmail")}
                      />
                    </FieldShell>

                    <Controller
                      name="communication.emailNotificationsEnabled"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center gap-2 self-end pb-2">
                          <Checkbox
                            id="communication.emailNotificationsEnabled"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <label
                            htmlFor="communication.emailNotificationsEnabled"
                            className="text-[12px] text-[color:var(--iris-ink-soft)]"
                          >
                            {t("workOrders.form.emailNotifications")}
                          </label>
                        </div>
                      )}
                    />

                    <FieldShell
                      id="internalNotes.0.body"
                      label={t("workOrders.form.internalNote")}
                      error={internalNoteError}
                      full
                    >
                      <textarea
                        id="internalNotes.0.body"
                        rows={3}
                        className="w-full border border-border bg-card p-3 text-[12px] text-foreground outline-none focus:border-foreground"
                        placeholder={t("workOrders.form.internalPlaceholder")}
                        {...register("internalNotes.0.body")}
                      />
                    </FieldShell>

                    <FieldShell
                      id="customerNotes.0.body"
                      label={t("workOrders.form.customerNote")}
                      error={customerNoteError}
                      full
                    >
                      <textarea
                        id="customerNotes.0.body"
                        rows={3}
                        className="w-full border border-border bg-card p-3 text-[12px] text-foreground outline-none focus:border-foreground"
                        placeholder={t("workOrders.form.customerPlaceholder")}
                        {...register("customerNotes.0.body")}
                      />
                    </FieldShell>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="border-t border-border bg-card p-6 xl:sticky xl:top-0 xl:self-start xl:border-l xl:border-t-0 xl:p-8">
        {/* The live PDF preview is heavy (an A4 iframe re-rendered from the API
            on every edit); it is only mounted for admins on large screens. On
            phones/tablets a lightweight text summary takes its place. */}
        {isAdmin && isLargeScreen ? (
          <WorkOrderPdfPreview watch={watch} initialData={initialData} />
        ) : (
          <SummaryPanel watch={watch} isEdit={isEdit} isAdmin={isAdmin} />
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="iris-focusable iris-press flex items-center justify-center gap-2 bg-foreground px-4 py-[11px] text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("workOrders.form.submit")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="iris-focusable iris-press bg-transparent py-2 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
          >
            {t("workOrders.form.cancel")}
          </button>
        </div>
      </aside>
    </form>
  );
}

interface SummaryPanelProps {
  watch: UseFormWatch<WorkOrderFormValues>;
  isEdit: boolean;
  isAdmin: boolean;
}

function SummaryPanel({ watch, isEdit, isAdmin }: SummaryPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const { labelFor } = useEnumValues();
  const clientName = watch("clientName");
  const jobDescription = watch("jobDescription");
  const billingDocumentType = watch("billingDocumentType");
  const deliveryMethod = watch("shipping.deliveryMethod");
  const assignedTo = watch("assignment.assignedTo");
  const priority = watch("assignment.priority");
  const scheduledDate = watch("assignment.scheduledDate");
  const price = watch("price");
  const issueDate = watch("issueDate");
  const dueDate = watch("dueDate");
  const invoiceStatus = watch("invoiceDraft.status");

  // Operators see only the essentials; admins get the full back-office summary.
  const rows: Array<[string, string]> = isAdmin
    ? [
        [t("workOrders.summary.client"), clientName || "-"],
        [t("workOrders.summary.description"), jobDescription || "-"],
        [
          t("workOrders.detail.documentType"),
          billingDocumentType
            ? labelFor("billingDocumentType", billingDocumentType)
            : "-",
        ],
        [
          t("workOrders.detail.delivery"),
          deliveryMethod ? labelFor("deliveryMethod", deliveryMethod) : "-",
        ],
        [t("workOrders.detail.operator"), assignedTo || t("workOrders.detail.unassigned")],
        [t("workOrders.form.priority"), labelFor("priority", priority)],
        [t("workOrders.detail.planned"), scheduledDate ? formatWorkOrderDate(scheduledDate) : "-"],
        [t("workOrders.detail.issueDate"), issueDate ? formatWorkOrderDate(issueDate) : "-"],
        [t("workOrders.notice.dueDate"), dueDate ? formatWorkOrderDate(dueDate) : "-"],
        [t("workOrders.detail.invoice"), invoiceStatus],
      ]
    : [
        [t("workOrders.summary.client"), clientName || "-"],
        [t("workOrders.summary.description"), jobDescription || "-"],
        [t("workOrders.notice.dueDate"), dueDate ? formatWorkOrderDate(dueDate) : "-"],
      ];

  return (
    <>
      <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        {t("workOrders.summary.title")}
      </div>
      <div className="flex flex-col gap-3 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
              {k}
            </div>
            <div className="mt-0.5 text-foreground">{v}</div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.summary.estimate")}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-[color:var(--iris-ink-soft)]">
              {isEdit ? t("workOrders.summary.price") : t("workOrders.summary.total")}
            </span>
            <span className="tnum text-[22px] font-normal tracking-[-0.3px] text-foreground">
              {formatWorkOrderPrice(price ?? null)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
