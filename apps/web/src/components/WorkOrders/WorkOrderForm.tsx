import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useForm,
  Controller,
  useFieldArray,
  useWatch,
  type FieldErrors,
  type UseFormWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Eye, EyeOff, Loader2, MapPin, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
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
import type { CatalogItem, CatalogItemKind } from "@/types/catalog";
import { formatActionError, slugId } from "@/lib/customers";
import { AsyncCombobox } from "@/components/WorkOrders/AsyncCombobox";
import { CatalogPickerDialog } from "@/components/WorkOrders/CatalogPickerDialog";
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
  onSubmit: (values: WorkOrderFormValues) => Promise<void>;
  onCancel: () => void;
  /**
   * Called with the current form values on mount and on every subsequent change.
   * The create page uses this to cache an in-progress draft so a browser refresh
   * doesn't lose the work being entered. Omitted for the edit form.
   */
  onValuesChange?: (values: WorkOrderFormValues) => void;
  /**
   * When true every field and button is disabled (via a disabled fieldset), for
   * showing a work order another operator is currently editing. Defaults to false.
   */
  readOnly?: boolean;
  /**
   * Order number reserved for a new order (create page). Surfaced in the PDF
   * preview so it shows the real reserved number instead of a placeholder.
   */
  previewOrderNumber?: string | null;
}

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

function FormSection({ title, children }: FormSectionProps): React.JSX.Element {
  return (
    <section className="mb-6 border border-[color:var(--iris-border-soft)] bg-card">
      <div className="flex items-baseline gap-3 border-b border-[color:var(--iris-border-soft)] px-6 py-3.5">
        <span className="text-[13px] font-medium text-foreground">{title}</span>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
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

// Compact label + control used inside an invoice line-item card, where a full
// FieldShell per column would repeat bulky labels on every row. The label id
// mirrors FieldShell so `aria-labelledby={`${id}-label`}` on Select triggers
// keeps working.
function LineField({
  htmlFor,
  label,
  error,
  className,
  children,
}: {
  htmlFor?: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        id={htmlFor ? `${htmlFor}-label` : undefined}
        className="mb-0.5 block text-[9px] font-medium uppercase tracking-[0.6px] text-[color:var(--iris-ink-mute)]"
      >
        {label}
      </label>
      {children}
      {error && <p className="mt-0.5 text-[10px] text-destructive">{error}</p>}
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

export function resolveLocationAddress(
  locationId: string | null,
  locations: Location[],
): string | null {
  if (!locationId) return null;
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
  onSubmit,
  onCancel,
  onValuesChange,
  readOnly = false,
  previewOrderNumber,
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
  // Shop-wide document-type policy: new orders start on the configured default
  // (proforma out of the box) and the picker only appears when overriding is on.
  // The extra shipping/handling fields are hidden unless the shop enables them.
  const {
    billingDefaults,
    priorityDefaults,
    showShippingOptions,
    allowMultipleLocations,
  } = useOrganization();

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
          proformaDueDate: initialData.proformaDueDate,
          dueDate: initialData.dueDate,
          issuedBy: initialData.issuedBy,
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
          billingDocumentType: billingDefaults.documentType,
          billingDocumentNumber: null,
          shipping: { ...EMPTY_SHIPPING },
          assignment: {
            assignedTo: null,
            priority: priorityDefaults.priority,
          },
          price: null,
          note: null,
          // Issue date is implied from the creation date: the order is created
          // right after this form is submitted, so today is the issue date.
          // Not shown as an editable field.
          issueDate: getLocalIsoDate(),
          proformaDueDate: null,
          dueDate: null,
          issuedBy: currentUser.username,
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
    getValues,
    formState: { errors },
  } = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderFormSchema),
    defaultValues,
  });

  // Mirror the live form values out to the caller so the create page can cache an
  // in-progress draft. Emit once on mount (so a draft exists before any edit) and
  // then on every change. Skipped in read-only mode and when no consumer is wired.
  useEffect(() => {
    if (!onValuesChange || readOnly) return;
    onValuesChange(getValues());
    const subscription = watch((values) => {
      onValuesChange(values as WorkOrderFormValues);
    });
    return () => subscription.unsubscribe();
  }, [onValuesChange, readOnly, watch, getValues]);
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
  // useWatch subscribes to the control store directly (not via a mounted input),
  // so the derived total stays correct even when a line's qty/price inputs are
  // unmounted because the row is collapsed to read-only.
  const watchedLineItems = useWatch({
    control,
    name: "invoiceDraft.lineItems",
  });
  const invoiceLineItems = useMemo(
    () => watchedLineItems ?? [],
    [watchedLineItems],
  );
  // Cena is the order total: always the sum of qty × unit price across line
  // items, never hand-typed. Keeping it derived stops the headline price from
  // drifting away from the invoice breakdown.
  const lineItemsTotal = useMemo(
    () => computeLineItemsTotal(invoiceLineItems),
    [invoiceLineItems],
  );
  // Catalog items already on the order, so the catalog picker can hide them and
  // the same article/service can't be added twice.
  const usedCatalogItemIds = useMemo(
    () =>
      new Set(
        (invoiceLineItems ?? [])
          .map((line) => line.catalogItemId)
          .filter((id): id is string => Boolean(id)),
      ),
    [invoiceLineItems],
  );
  useEffect(() => {
    setValue("price", lineItemsTotal, { shouldValidate: true, shouldDirty: true });
  }, [lineItemsTotal, setValue]);
  // Locations are lazy-loaded for the selected customer only. The tenant can
  // have thousands of locations, so pulling the whole list up front made this
  // form slow to open; instead we fetch just the picked firm's locations.
  const [customerLocations, setCustomerLocations] = useState<Location[]>([]);
  // Locations created inline from this form are merged with the fetched list so
  // a freshly added location is immediately selectable without a page reload.
  const [createdLocations, setCreatedLocations] = useState<Location[]>([]);
  const [locationDraft, setLocationDraft] = useState<{ name: string; address: string } | null>(
    null,
  );
  const [savingLocation, setSavingLocation] = useState(false);
  // Inline edit of the selected location, so a wrong/blank name or address can
  // be fixed without leaving the order form.
  const [locationEdit, setLocationEdit] = useState<{ name: string; address: string } | null>(
    null,
  );
  const [savingLocationEdit, setSavingLocationEdit] = useState(false);
  // Inline "Nov klijent" quick-create, mirroring the add-location flow: a new
  // registry firm is persisted and selected without leaving the order form.
  const [customerDraft, setCustomerDraft] = useState<{
    name: string;
    pib: string;
    contact: string;
  } | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  // Inline edit of the selected registry firm, so a missing PIB/MB (or a
  // changed name/contact) can be filled in without leaving the order form.
  const [customerEdit, setCustomerEdit] = useState<{
    name: string;
    pib: string;
    mb: string;
    contact: string;
  } | null>(null);
  const [savingCustomerEdit, setSavingCustomerEdit] = useState(false);

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
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerLocations([]);
      return;
    }
    let active = true;
    window.api
      .getLocations(selectedCustomerId)
      .then((list) => {
        if (active) setCustomerLocations(list);
      })
      .catch(() => {
      });
    return () => {
      active = false;
    };
  }, [selectedCustomerId]);
  const allLocations = useMemo(
    () => [...customerLocations, ...createdLocations],
    [customerLocations, createdLocations],
  );
  const filteredLocations = useMemo(
    () =>
      selectedCustomerId
        ? allLocations.filter((location) => location.customerId === selectedCustomerId)
        : allLocations,
    [allLocations, selectedCustomerId],
  );
  const selectedLocation = useMemo(
    () =>
      selectedLocationId
        ? allLocations.find((location) => location.id === selectedLocationId) ?? null
        : null,
    [allLocations, selectedLocationId],
  );
  const selectedLocationAddress = resolveLocationAddress(selectedLocationId, allLocations);

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

  useEffect(() => {
    if (!selectedCustomerId) return;
    if (selectedCustomer?.id === selectedCustomerId && selectedCustomer.pib !== null) return;

    let active = true;
    window.api
      .getCustomerById(selectedCustomerId)
      .then((customer) => {
        if (active) setSelectedCustomer(customer);
      })
      .catch(() => {
      });

    return () => {
      active = false;
    };
  }, [selectedCustomerId, selectedCustomer?.id, selectedCustomer?.pib]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    if (selectedLocationId && selectedLocation?.customerId === selectedCustomerId) return;

    const firstLocation = filteredLocations[0];
    if (firstLocation) {
      setValue("locationId", firstLocation.id, { shouldDirty: true });
    }
  }, [
    filteredLocations,
    selectedCustomerId,
    selectedLocation?.customerId,
    selectedLocationId,
    setValue,
  ]);

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

  const openLocationEdit = (): void => {
    if (!selectedLocation) return;
    setLocationEdit({
      name: selectedLocation.name,
      address: selectedLocation.address ?? "",
    });
  };

  const handleUpdateLocation = async (): Promise<void> => {
    if (!locationEdit || !selectedLocation) return;
    const name = locationEdit.name.trim();
    if (!name) return;
    setSavingLocationEdit(true);
    try {
      // Keep the location's id/customer; only name and address are editable here.
      const saved = await window.api.upsertLocation({
        ...selectedLocation,
        name,
        address: locationEdit.address.trim() || null,
      });
      // Reflect the edit in whichever list currently holds this location so the
      // registry address updates without a reload (and never duplicates it).
      if (customerLocations.some((location) => location.id === saved.id)) {
        setCustomerLocations((list) =>
          list.map((location) => (location.id === saved.id ? saved : location)),
        );
      } else {
        setCreatedLocations((list) =>
          list.some((location) => location.id === saved.id)
            ? list.map((location) => (location.id === saved.id ? saved : location))
            : [...list, saved],
        );
      }
      setLocationEdit(null);
    } catch (error) {
      toast.error(formatActionError(t("workOrders.form.locationUpdateError"), error));
    } finally {
      setSavingLocationEdit(false);
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

  const openCustomerEdit = (): void => {
    if (!selectedCustomer) return;
    setCustomerEdit({
      name: selectedCustomer.name,
      pib: selectedCustomer.pib ?? "",
      mb: selectedCustomer.mb ?? "",
      contact: selectedCustomer.contactName ?? "",
    });
  };

  const handleUpdateCustomer = async (): Promise<void> => {
    if (!customerEdit || !selectedCustomer) return;
    const name = customerEdit.name.trim();
    if (!name) return;
    setSavingCustomerEdit(true);
    try {
      const contact = customerEdit.contact.trim();
      // Merge onto the existing firm so filling in PIB/MB never wipes its
      // contacts, emails, or other registry fields.
      const saved = await window.api.upsertCustomer({
        ...selectedCustomer,
        name,
        contactName: contact || null,
        pib: customerEdit.pib.trim() || null,
        mb: customerEdit.mb.trim() || null,
      });
      setSelectedCustomer(saved);
      setValue("clientName", saved.name);
      setValue("contactPerson", saved.contactName);
      setCustomerEdit(null);
    } catch (error) {
      toast.error(formatActionError(t("workOrders.form.customerUpdateError"), error));
    } finally {
      setSavingCustomerEdit(false);
    }
  };

  // Which catalog picker dialog is open (by kind), or null when both closed.
  const [catalogPickerKind, setCatalogPickerKind] = useState<CatalogItemKind | null>(
    null,
  );

  const handleAddCatalogLineItem = (catalogItem: CatalogItem): void => {
    // Guard against double-adding the same catalog item (the picker also hides
    // already-added ones, so this only trips on a stale selection).
    if (usedCatalogItemIds.has(catalogItem.id)) {
      toast.error(t("workOrders.form.catalogAlreadyAdded"));
      return;
    }
    appendInvoiceLineItem(createInvoiceLineItemFromCatalog(catalogItem));
  };
  const showShippingAddress =
    deliveryMethod !== null && deliveryMethod !== "pickup";
  const showPostageOptions =
    deliveryMethod === "postExpress" || deliveryMethod === "cityExpress";

  // The admin-only PDF preview can be hidden to give the form the full width.
  const [showPreview, setShowPreview] = useState(true);
  // Line kind (service/article) is locked to a static pill by default; the pen
  // toggles the line into edit mode where the kind becomes a Select again.
  const [editingLineIds, setEditingLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleLineEditing = (id: string): void => {
    setEditingLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
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
        // The dedicated operator field was removed as redundant; the assignee is
        // whoever takes the order over (executedBy) or, failing that, who issued it.
        assignment: {
          ...values.assignment,
          assignedTo: values.executedBy || values.issuedBy || null,
        },
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
    name: "assignment.assignedTo" | "executedBy" | "issuedBy",
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

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit, handleInvalidSubmit)}
      className={`grid gap-0 ${
        isAdmin
          ? showPreview
            ? "xl:grid-cols-[minmax(0,1fr)_460px]"
            : ""
          : "lg:grid-cols-[minmax(0,1fr)_320px]"
      }`}
    >
      {/* A disabled fieldset natively disables every nested control, giving a
          read-only view when another operator holds the edit lock. */}
      <fieldset disabled={readOnly} className="contents">
      <div className={isAdmin ? (showPreview ? "xl:pr-10" : "") : "lg:pr-10"}>
        {isEdit && initialData && (
          <div className="mb-8 flex flex-wrap gap-x-10 gap-y-4 border border-[color:var(--iris-border-soft)] bg-card px-6 py-4 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                Broj naloga
              </div>
              <div className="tnum mt-1 text-foreground">
                {initialData.orderNumber}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                Status
              </div>
              <div className="mt-1 text-foreground">
                {getWorkOrderStatusLabel(initialData.status)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                Kreiran
              </div>
              <div className="tnum mt-1 text-foreground">
                {formatWorkOrderDateTime(initialData.createdAt)}
              </div>
            </div>
          </div>
        )}

        <FormSection title={t("workOrders.form.sectionClient")}>
          <div className="grid grid-cols-2 gap-6">
            <FieldShell
              id="customerId"
              label={t("workOrders.form.clientRegistry")}
              // PIB/MB live in the registry details panel below, so the picker
              // hint only guides selection while no client is chosen.
              hint={selectedCustomer ? undefined : t("workOrders.form.clientSearchHint")}
            >
              <AsyncCombobox
                triggerId="customerId"
                selectedLabel={selectedCustomer ? selectedCustomer.name : (selectedClientName || null)}
                onSearch={searchCustomers}
                onSelect={applyCustomerSelection}
                // "Novi klijent (van evidencije)" opens the new-client menu,
                // prefilled with whatever was typed in the search.
                onClear={(typedName) =>
                  setCustomerDraft({ name: typedName, pib: "", contact: "" })
                }
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

            {/* The location picker and inline add-location only appear when the
                shop allows multiple locations per firm. When disabled, the
                firm's single location is treated as part of the firm — its
                address still shows in the registry panel below — and the
                selected location stays auto-set behind the scenes. */}
            {allowMultipleLocations && selectedCustomerId && (
            <FieldShell id="locationId" label={t("workOrders.form.location")}>
              {/* A single location (typically the firm's "sedište") is
                  auto-selected and its address already shows in the registry
                  panel, so the picker only appears when there is a real choice. */}
              {filteredLocations.length > 1 && (
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
              )}
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
            )}

            {(selectedCustomer || selectedLocation) && (
              <div className="col-span-full border border-[color:var(--iris-border-soft)] bg-background px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                    {t("workOrders.form.registryDetails")}
                  </span>
                  {selectedCustomer && customerEdit === null && (
                    <button
                      type="button"
                      onClick={openCustomerEdit}
                      aria-label={t("workOrders.form.editCustomer")}
                      title={t("workOrders.form.editCustomer")}
                      className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent p-0 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 text-[12px] sm:grid-cols-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                        {t("workOrders.form.registryAddress")}
                      </div>
                      {allowMultipleLocations && selectedLocation && locationEdit === null && (
                        <button
                          type="button"
                          onClick={openLocationEdit}
                          aria-label={t("workOrders.form.editLocation")}
                          title={t("workOrders.form.editLocation")}
                          className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent p-0 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="mt-0.5 text-foreground">
                      {selectedLocationAddress ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                      {t("workOrders.form.registryPib")}
                    </div>
                    <div className="tnum mt-0.5 text-foreground">
                      {selectedCustomer?.pib ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                      {t("workOrders.form.registryMb")}
                    </div>
                    <div className="tnum mt-0.5 text-foreground">
                      {selectedCustomer?.mb ?? "-"}
                    </div>
                  </div>
                </div>
                {allowMultipleLocations && selectedLocation && locationEdit !== null && (
                  <div className="mt-3 space-y-2 border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--iris-ink-soft)]">
                        <MapPin className="h-3.5 w-3.5" />
                        {t("workOrders.form.editLocation")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLocationEdit(null)}
                        className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                        {t("workOrders.form.cancel")}
                      </button>
                    </div>
                    <input
                      value={locationEdit.name}
                      placeholder={t("workOrders.form.newLocationName")}
                      onChange={(event) =>
                        setLocationEdit((draft) =>
                          draft ? { ...draft, name: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <input
                      value={locationEdit.address}
                      placeholder={t("workOrders.form.newLocationAddress")}
                      onChange={(event) =>
                        setLocationEdit((draft) =>
                          draft ? { ...draft, address: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => void handleUpdateLocation()}
                      disabled={savingLocationEdit || locationEdit.name.trim() === ""}
                      className="iris-focusable iris-press inline-flex items-center gap-1.5 bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                    >
                      {savingLocationEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("workOrders.form.saveLocationChanges")}
                    </button>
                  </div>
                )}
                {selectedCustomer && customerEdit !== null && (
                  <div className="mt-3 space-y-2 border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--iris-ink-soft)]">
                        <Pencil className="h-3.5 w-3.5" />
                        {t("workOrders.form.editCustomer")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomerEdit(null)}
                        className="iris-focusable iris-press inline-flex items-center gap-1 bg-transparent text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                        {t("workOrders.form.cancel")}
                      </button>
                    </div>
                    <input
                      value={customerEdit.name}
                      placeholder={t("workOrders.form.newCustomerName")}
                      onChange={(event) =>
                        setCustomerEdit((draft) =>
                          draft ? { ...draft, name: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <input
                      value={customerEdit.pib}
                      placeholder={t("workOrders.form.newCustomerPib")}
                      onChange={(event) =>
                        setCustomerEdit((draft) =>
                          draft ? { ...draft, pib: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <input
                      value={customerEdit.mb}
                      placeholder={t("workOrders.form.newCustomerMb")}
                      onChange={(event) =>
                        setCustomerEdit((draft) =>
                          draft ? { ...draft, mb: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <input
                      value={customerEdit.contact}
                      placeholder={t("workOrders.form.newCustomerContact")}
                      onChange={(event) =>
                        setCustomerEdit((draft) =>
                          draft ? { ...draft, contact: event.target.value } : draft,
                        )
                      }
                      className="block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => void handleUpdateCustomer()}
                      disabled={savingCustomerEdit || customerEdit.name.trim() === ""}
                      className="iris-focusable iris-press inline-flex items-center gap-1.5 bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                    >
                      {savingCustomerEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("workOrders.form.saveCustomerChanges")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* The contact person comes from the picked registry firm and is set
                automatically on selection; it is not surfaced as an editable
                field here. */}
          </div>
        </FormSection>

        <FormSection title={t("workOrders.form.sectionItems")}>
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.form.items")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Catalog pickers, mirroring the "Posebna" buttons: each opens
                      a search dialog filtered to that kind. */}
                  <button
                    type="button"
                    onClick={() => setCatalogPickerKind("service")}
                    className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("workOrders.form.catalogService")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogPickerKind("article")}
                    className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("workOrders.form.catalogArticle")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddInvoiceLineItem("service")}
                    className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("workOrders.form.specialService")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddInvoiceLineItem("goods")}
                    className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("workOrders.form.specialGoods")}
                  </button>
                </div>
              </div>

              <p className="mb-4 text-[11px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.form.catalogHint")}
              </p>

              <CatalogPickerDialog
                kind={catalogPickerKind ?? "service"}
                open={catalogPickerKind !== null}
                onOpenChange={(next) => {
                  if (!next) setCatalogPickerKind(null);
                }}
                onSelect={handleAddCatalogLineItem}
                excludeIds={usedCatalogItemIds}
                isAdmin={isAdmin}
              />

              {invoiceLineItemFields.length === 0 ? (
                <div className="border border-dashed border-border bg-background px-4 py-3 text-[12px] text-[color:var(--iris-ink-soft)]">
                  {t("workOrders.form.noItems")}
                </div>
              ) : (
                // Each line is a color-keyed card (kind stripe + pill) so the
                // list reads as discrete services/articles rather than a dense
                // grid; labels appear once per field instead of on every row.
                <div className="space-y-2.5">
                  {invoiceLineItemFields.map((lineItem, index) => {
                    const selectedKind =
                      invoiceLineItems[index]?.kind === "goods"
                        ? "goods"
                        : "service";
                    const builtinUnitOptions = getInvoiceUnitOptions(
                      selectedKind,
                    ).map((unit) => ({
                      value: unit,
                      label: t(`workOrders.unit.${unit}`),
                    }));
                    // Append admin-added units (any kind); keep the current
                    // value selectable even if it is an unknown/custom unit.
                    const currentUnit = invoiceLineItems[index]?.unit;
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
                    const isGoods = selectedKind === "goods";
                    // Color-key the two kinds so a long list stays scannable:
                    // accent (orange) edge = article/goods, green edge = service.
                    const kindColor = isGoods
                      ? "var(--iris-accent)"
                      : "var(--iris-status-done)";
                    const lineTotal =
                      (Number(invoiceLineItems[index]?.quantity) || 0) *
                      (Number(invoiceLineItems[index]?.unitPrice) || 0);
                    // Catalog-linked lines carry a definite type, so the kind
                    // is locked to a static pill; the pen unlocks it. Ad-hoc
                    // lines the user types from scratch stay freely editable.
                    const isCatalogLine = Boolean(
                      invoiceLineItems[index]?.catalogItemId,
                    );
                    const isEditingLine =
                      !isCatalogLine || editingLineIds.has(lineItem.id);

                    return (
                      <div
                        key={lineItem.id}
                        className="relative overflow-hidden border border-[color:var(--iris-border-soft)] bg-background"
                      >
                        {/* Kind accent stripe down the card's leading edge. */}
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-[3px]"
                          style={{ backgroundColor: kindColor }}
                        />
                        <div className="flex flex-col gap-3 py-3 pr-3 pl-4">
                          {/* Header row: kind pill/select · description · edit · remove. */}
                          <div className="flex items-center gap-2.5">
                            {isEditingLine ? (
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

                                      const currentUnit =
                                        invoiceLineItems[index]?.unit;
                                      const normalizedUnit = normalizeInvoiceUnit(
                                        nextKind,
                                        currentUnit,
                                      );
                                      if (normalizedUnit !== currentUnit) {
                                        setValue(
                                          `invoiceDraft.lineItems.${index}.unit`,
                                          normalizedUnit,
                                        );
                                      }
                                    }}
                                  >
                                    <SelectTrigger
                                      aria-label={t("workOrders.form.colType")}
                                      className="h-7 w-auto shrink-0 gap-1.5 rounded-full border bg-transparent px-2.5 py-0 text-[11px] font-medium uppercase tracking-[0.4px] shadow-none focus-visible:ring-0"
                                      style={{ borderColor: kindColor, color: kindColor }}
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
                            ) : (
                              // Fixed, read-only kind badge; the pen unlocks it.
                              <span
                                className="inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-medium uppercase tracking-[0.4px]"
                                style={{ borderColor: kindColor, color: kindColor }}
                              >
                                {t(`workOrders.lineKind.${selectedKind}`)}
                              </span>
                            )}
                            {isEditingLine ? (
                              <input
                                id={`invoiceDraft.lineItems.${index}.description`}
                                aria-label={t("workOrders.form.colDescription")}
                                placeholder={t("workOrders.form.colDescription")}
                                className="min-w-0 flex-1 border-0 border-b border-transparent bg-transparent py-1 text-[13px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-[color:var(--iris-ink-faint)] focus:border-border"
                                {...register(
                                  `invoiceDraft.lineItems.${index}.description` as const,
                                )}
                              />
                            ) : (
                              <span className="min-w-0 flex-1 truncate py-1 text-[13px] font-medium text-foreground">
                                {invoiceLineItems[index]?.description || (
                                  <span className="font-normal text-[color:var(--iris-ink-faint)]">
                                    {t("workOrders.form.colDescription")}
                                  </span>
                                )}
                              </span>
                            )}
                            {isCatalogLine && (
                              <button
                                type="button"
                                aria-label={t(
                                  isEditingLine
                                    ? "workOrders.form.doneEditItem"
                                    : "workOrders.form.editItem",
                                  { n: index + 1 },
                                )}
                                aria-pressed={isEditingLine}
                                onClick={() => toggleLineEditing(lineItem.id)}
                                className="iris-focusable iris-press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--iris-ink-mute)] hover:bg-muted hover:text-foreground"
                              >
                                {isEditingLine ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <Pencil className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={t("workOrders.form.removeItem", { n: index + 1 })}
                              onClick={() => removeInvoiceLineItem(index)}
                              className="iris-focusable iris-press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--iris-ink-mute)] hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {lineItemError?.description?.message && (
                            <p className="text-[10px] text-destructive">
                              {lineItemError.description.message}
                            </p>
                          )}

                          {/* Meta row: compact spec line, each label shown once. */}
                          <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                            <LineField
                              htmlFor={`invoiceDraft.lineItems.${index}.quantity`}
                              label={t("workOrders.form.colQuantity")}
                              error={lineItemError?.quantity?.message}
                              className="w-16"
                            >
                              {isEditingLine ? (
                                <input
                                  id={`invoiceDraft.lineItems.${index}.quantity`}
                                  type="number"
                                  className={`${underlineInput} tnum !py-1`}
                                  {...register(
                                    `invoiceDraft.lineItems.${index}.quantity` as const,
                                    {
                                      setValueAs: (v: string) =>
                                        v === "" ? 1 : Number(v),
                                    },
                                  )}
                                />
                              ) : (
                                // Read-only until the pen unlocks the line.
                                <div className="tnum py-1 text-[13px] text-foreground">
                                  {invoiceLineItems[index]?.quantity ?? 1}
                                </div>
                              )}
                            </LineField>

                            <LineField
                              htmlFor={`invoiceDraft.lineItems.${index}.unit`}
                              label={t("workOrders.form.colUnit")}
                              error={lineItemError?.unit?.message}
                              className="w-24"
                            >
                              {isEditingLine ? (
                                <Controller
                                  name={`invoiceDraft.lineItems.${index}.unit` as const}
                                  control={control}
                                  render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                      <SelectTrigger
                                        id={`invoiceDraft.lineItems.${index}.unit`}
                                        aria-labelledby={`invoiceDraft.lineItems.${index}.unit-label`}
                                        className={`${underlineTrigger} !py-1`}
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {unitOptions.map((option) => (
                                          <SelectItem
                                            key={option.value}
                                            value={option.value}
                                          >
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              ) : (
                                // Read-only until the pen unlocks the line.
                                <div className="py-1 text-[13px] text-foreground">
                                  {unitOptions.find(
                                    (option) =>
                                      option.value === invoiceLineItems[index]?.unit,
                                  )?.label ?? invoiceLineItems[index]?.unit}
                                </div>
                              )}
                            </LineField>

                            <LineField
                              htmlFor={`invoiceDraft.lineItems.${index}.unitPrice`}
                              label={t("workOrders.form.colPrice")}
                              error={lineItemError?.unitPrice?.message}
                              className="w-24"
                            >
                              {/* Everyone can see the price; only admins may edit
                                  it, and only once the pen unlocks the line. */}
                              {isAdmin && isEditingLine ? (
                                <input
                                  id={`invoiceDraft.lineItems.${index}.unitPrice`}
                                  type="number"
                                  step="0.01"
                                  className={`${underlineInput} tnum !py-1`}
                                  {...register(
                                    `invoiceDraft.lineItems.${index}.unitPrice` as const,
                                    {
                                      setValueAs: (v: string) =>
                                        v === "" ? 0 : Number(v),
                                    },
                                  )}
                                />
                              ) : (
                                <div className="tnum py-1 text-[13px] text-foreground">
                                  {(
                                    Number(invoiceLineItems[index]?.unitPrice) || 0
                                  ).toLocaleString("sr-RS")}
                                </div>
                              )}
                            </LineField>

                            {isAdmin &&
                              (invoiceLineItems[index]?.catalogItemId ? (
                                // Catalog-line cost is captured server-side from
                                // the item's price history; show it read-only.
                                <LineField
                                  htmlFor={`invoiceDraft.lineItems.${index}.unitCost`}
                                  label={t("workOrders.form.colCost")}
                                  className="w-24"
                                >
                                  <div className="tnum py-1 text-[13px] text-[color:var(--iris-ink-mute)]">
                                    {invoiceLineItems[index]?.unitCost != null
                                      ? invoiceLineItems[index]!.unitCost
                                      : "—"}
                                  </div>
                                </LineField>
                              ) : (
                                // Ad-hoc line: admin enters the cost; empty flags review.
                                <LineField
                                  htmlFor={`invoiceDraft.lineItems.${index}.unitCost`}
                                  label={t("workOrders.form.colCost")}
                                  error={lineItemError?.unitCost?.message}
                                  className="w-24"
                                >
                                  <input
                                    id={`invoiceDraft.lineItems.${index}.unitCost`}
                                    type="number"
                                    step="0.01"
                                    placeholder="—"
                                    className={`${underlineInput} tnum !py-1`}
                                    {...register(
                                      `invoiceDraft.lineItems.${index}.unitCost` as const,
                                      {
                                        setValueAs: (v: string) =>
                                          v === "" ? null : Number(v),
                                      },
                                    )}
                                  />
                                </LineField>
                              ))}

                            {isAdmin && (
                              <div className="ml-auto self-end pb-1 text-right">
                                <div className="text-[9px] font-medium uppercase tracking-[0.6px] text-[color:var(--iris-ink-mute)]">
                                  {t("workOrders.form.colLineTotal")}
                                </div>
                                <div className="tnum mt-0.5 text-[13px] font-medium text-foreground">
                                  {lineTotal.toLocaleString("sr-RS")}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FieldShell id="proformaDueDate" label={t("workOrders.form.proformaDueDate")}>
                <Controller
                  name="proformaDueDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      id="proformaDueDate"
                      value={field.value}
                      onChange={(v) => field.onChange(v)}
                      placeholder={t("workOrders.form.proformaDueDate")}
                      disabled={submitting}
                    />
                  )}
                />
              </FieldShell>
              <FieldShell id="dueDate" label={t("workOrders.form.dueDate")}>
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
          </div>
        </FormSection>

        <FormSection title={t("workOrders.form.sectionJob")}>
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

            <div className="grid grid-cols-2 gap-6">
              <FieldShell id="executedBy" label={t("workOrders.form.takesOver")}>
                {renderOperatorSelect("executedBy", "executedBy")}
              </FieldShell>
              <FieldShell id="issuedBy" label={t("workOrders.form.issuedBy")}>
                {renderOperatorSelect("issuedBy", "issuedBy")}
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
            </div>
          </div>
        </FormSection>

        {isAdmin && priorityDefaults.allowOverride && (
        <FormSection title={t("workOrders.form.sectionAssignment")}>
          <div className="grid gap-x-6 gap-y-5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
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
          </div>
        </FormSection>
        )}

        {isAdmin &&
          (billingDefaults.allowOverride ||
            showShippingAddress ||
            showShippingOptions) && (
        <FormSection title={t("workOrders.form.sectionDocument")}>
          <div className="grid grid-cols-2 gap-6">
            {billingDefaults.allowOverride && (
            <FieldShell id="billingDocumentType" label={t("workOrders.form.documentType")}>
              <Controller
                name="billingDocumentType"
                control={control}
                render={({ field }) => (
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
                      {optionsFor("billingDocumentType").map((option) => (
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
                    animation:
                      "iris-fade-up 280ms var(--iris-ease-out) both",
                  }}
                  {...register("shipping.shippingAddress", {
                    setValueAs: (v: string) => (v === "" ? null : v),
                  })}
                />
              </FieldShell>
            )}

            {showShippingOptions && (
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

            {showShippingOptions && (
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
            )}
          </div>

          {showShippingOptions && (
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
          )}
        </FormSection>
        )}

        {/* Finance summary (admin only). The free-text Napomena and Interna
            beleška fields were removed per client request. The order's note is
            still preserved on edit (unregistered fields keep their initial
            value) and shown on the detail page. */}
        {isAdmin && (
          <FormSection title={t("workOrders.form.sectionFinance")}>
            <div className="grid grid-cols-2 gap-6">
              <FieldShell
                id="price"
                label={t("workOrders.form.price")}
                error={errors.price?.message}
              >
                {/* Derived from the line items, not hand-editable — rendered as
                    static text (no input underline) so it reads as read-only. */}
                <div
                  id="price"
                  className="tnum py-2 text-[13px] text-[color:var(--iris-ink-soft)]"
                >
                  {lineItemsTotal.toLocaleString("sr-RS")}
                </div>
                <p className="mt-1 text-[11px] text-[color:var(--iris-ink-mute)]">
                  {t("workOrders.form.priceAutoHint")}
                </p>
              </FieldShell>
            </div>
          </FormSection>
        )}
      </div>

      <aside className="bg-card p-8 xl:sticky xl:top-0 xl:self-start xl:border-l xl:border-border">
        {/* The PDF preview is a wide document render; it only shows from xl up
            (below that the form uses the full width) and can be hidden entirely
            via the toggle. The submit/cancel actions stay visible. */}
        {isAdmin ? (
          showPreview && (
            <div className="hidden xl:block">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  aria-label={t("workOrders.form.previewHide")}
                  title={t("workOrders.form.previewHide")}
                  className="iris-focusable iris-press flex items-center gap-1.5 bg-transparent p-0 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  {t("workOrders.form.previewHide")}
                </button>
              </div>
              <WorkOrderPdfPreview
                watch={watch}
                initialData={initialData}
                previewOrderNumber={previewOrderNumber}
              />
            </div>
          )
        ) : (
          <div className="hidden lg:block">
            <SummaryPanel watch={watch} isEdit={isEdit} isAdmin={isAdmin} />
          </div>
        )}

        {isAdmin && !showPreview && (
          <div className="mb-4 hidden justify-end xl:flex">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="iris-focusable iris-press flex items-center gap-1.5 bg-transparent p-0 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
              {t("workOrders.form.previewShow")}
            </button>
          </div>
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
      </fieldset>
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
  const executedBy = watch("executedBy");
  const issuedBy = watch("issuedBy");
  const assignedTo = executedBy || issuedBy;
  const priority = watch("assignment.priority");
  const price = watch("price");
  const issueDate = watch("issueDate");
  const dueDate = watch("dueDate");

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
        [t("workOrders.detail.issueDate"), issueDate ? formatWorkOrderDate(issueDate) : "-"],
        [t("workOrders.notice.dueDate"), dueDate ? formatWorkOrderDate(dueDate) : "-"],
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
