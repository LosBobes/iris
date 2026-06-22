import { useEffect, useMemo, useState } from "react";
import {
  useForm,
  Controller,
  useFieldArray,
  type FieldErrors,
  type UseFormWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  WORK_ORDER_SELECT_NONE_VALUE,
  getWorkOrderStatusLabel,
  formatWorkOrderDate,
  formatWorkOrderDateTime,
  formatWorkOrderPrice,
  getLocalIsoDate,
} from "@/shared/utils/work-orders";
import { useEnumValues } from "@/hooks/useEnumValues";

interface WorkOrderFormProps {
  initialData?: WorkOrder | null;
  initialValues?: WorkOrderFormValues;
  customers?: Customer[];
  locations?: Location[];
  onSubmit: (values: WorkOrderFormValues) => Promise<void>;
  onCancel: () => void;
}

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

function FormSection({ title, children }: FormSectionProps): React.JSX.Element {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-baseline gap-3 border-b border-border pb-2.5">
        <span className="text-[13px] font-medium text-foreground">{title}</span>
      </div>
      {children}
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

const underlineInput =
  "w-full border-0 border-b border-border bg-transparent py-2 text-[13px] text-foreground outline-none focus:border-foreground disabled:opacity-60";

const underlineTrigger =
  "w-full justify-between border-0 border-b border-border bg-transparent py-2 !h-auto text-[13px] text-foreground rounded-none shadow-none focus-visible:border-foreground focus-visible:ring-0";

const INVOICE_LINE_ITEM_KIND_LABELS: Record<InvoiceLineItemKind, string> = {
  service: "Usluga",
  goods: "Roba",
};

const INVOICE_UNIT_LABELS: Record<BuiltinInvoiceUnit, string> = {
  kom: "Kom",
  m2: "m2",
  set: "Set",
};

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
  customers = [],
  locations = [],
  onSubmit,
  onCancel,
}: WorkOrderFormProps): React.JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!initialData;

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
          billingDocumentType: null,
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
  const filteredLocations = useMemo(
    () =>
      selectedCustomerId
        ? locations.filter((location) => location.customerId === selectedCustomerId)
        : locations,
    [locations, selectedCustomerId],
  );
  const showShippingAddress =
    deliveryMethod !== null && deliveryMethod !== "pickup";
  const showPostageOptions =
    deliveryMethod === "postExpress" || deliveryMethod === "cityExpress";

  const [showJobDetails, setShowJobDetails] = useState(!!defaultValues.jobDetails);
  const paperWeightError = errors.jobDetails?.paperWeightGsm?.message;
  const quantityError = errors.jobDetails?.quantity?.message;
  const internalNoteError = getFirstValidationMessage(errors.internalNotes?.[0]);
  const customerNoteError = getFirstValidationMessage(errors.customerNotes?.[0]);

  useEffect(() => {
    const nextAddress = resolveShippingAddress(
      shippingAddress,
      deliveryMethod,
      selectedLocationId,
      locations,
    );

    if (nextAddress !== shippingAddress) {
      setValue("shipping.shippingAddress", nextAddress);
    }
  }, [deliveryMethod, locations, selectedLocationId, setValue, shippingAddress]);

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
            locations,
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
    toast.error("Popunite obavezna polja pre čuvanja naloga");

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
      className="grid grid-cols-[minmax(0,1fr)_320px] gap-0"
    >
      <div className="pr-10">
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
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                Izdao
              </div>
              <div className="mt-1 text-foreground">{initialData.issuedBy}</div>
            </div>
          </div>
        )}

        <FormSection title="Klijent">
          <div className="grid grid-cols-2 gap-6">
            <FieldShell id="customerId" label="Klijent iz evidencije">
              <Controller
                name="customerId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? WORK_ORDER_SELECT_NONE_VALUE}
                    onValueChange={(v) => {
                      const nextValue = v === WORK_ORDER_SELECT_NONE_VALUE ? null : v;
                      field.onChange(nextValue);
                      const customer = customers.find((candidate) => candidate.id === nextValue);
                      if (customer) {
                        setValue("clientName", customer.name);
                        setValue("contactPerson", customer.contactName);
                        setValue("communication.notificationEmail", customer.email);
                        const firstLocation = locations.find(
                          (location) => location.customerId === customer.id,
                        );
                        setValue("locationId", firstLocation?.id ?? null);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="customerId"
                      aria-labelledby="customerId-label"
                      className={underlineTrigger}
                    >
                      <SelectValue placeholder="Izaberite klijenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                        Novi klijent
                      </SelectItem>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldShell>

            <FieldShell id="locationId" label="Lokacija">
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
                      <SelectValue placeholder="Izaberite lokaciju" />
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
            </FieldShell>

            <FieldShell
              id="clientName"
              label="Naziv klijenta *"
              hint="Izaberite iz liste ili dodajte novog"
              error={errors.clientName?.message}
            >
              <input
                id="clientName"
                className={underlineInput}
                {...register("clientName")}
              />
            </FieldShell>
            <FieldShell id="contactPerson" label="Kontakt osoba">
              <input
                id="contactPerson"
                className={underlineInput}
                {...register("contactPerson", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
              />
            </FieldShell>
          </div>
        </FormSection>

        <FormSection title="Posao">
          <div className="space-y-6">
            <FieldShell
              id="jobDescription"
              label="Opis *"
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

            <div>
              <button
                type="button"
                onClick={() => setShowJobDetails(!showJobDetails)}
                aria-expanded={showJobDetails}
                className="iris-focusable iris-press bg-transparent p-0 text-[11px] text-[color:var(--iris-accent)] hover:opacity-80"
              >
                {showJobDetails ? "Sakrij detalje posla" : "Prikaži detalje posla"}
              </button>
            </div>

            {showJobDetails && (
              <div
                className="grid grid-cols-2 gap-6"
                style={{
                  animation:
                    "iris-fade-up 320ms var(--iris-ease-out) both",
                }}
              >
                <FieldShell id="jobDetails.productCode" label="Šifra proizvoda">
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
                  label="Gramatura papira (gsm)"
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
                <FieldShell id="jobDetails.dimensions" label="Dimenzije">
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
                  label="Količina"
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
                  label="Napomena o doradi"
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
        </FormSection>

        <FormSection title="Dodela i raspored">
          <div className="grid grid-cols-3 gap-6">
            <FieldShell id="assignment.assignedTo" label="Operater">
              <input
                id="assignment.assignedTo"
                className={underlineInput}
                {...register("assignment.assignedTo")}
              />
            </FieldShell>

            <FieldShell id="assignment.priority" label="Prioritet">
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

            <FieldShell id="assignment.scheduledDate" label="Planirano">
              <Controller
                name="assignment.scheduledDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="assignment.scheduledDate"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    placeholder="Planirano"
                    disabled={submitting}
                  />
                )}
              />
            </FieldShell>
          </div>
        </FormSection>

        <FormSection title="Dokument i isporuka">
          <div className="grid grid-cols-2 gap-6">
            <FieldShell id="billingDocumentType" label="Tip dokumenta">
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
                      <SelectValue placeholder="Izaberite tip" />
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

            <FieldShell id="shipping.deliveryMethod" label="Način dostave">
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
                      <SelectValue placeholder="Izaberite način" />
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
              label="Broj dokumenta"
            >
              <input
                id="billingDocumentNumber"
                className={`${underlineInput} tnum`}
                {...register("billingDocumentNumber", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
              />
            </FieldShell>

            <FieldShell
              id="issueDate"
              label="Datum izdavanja *"
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
                    placeholder="Datum izdavanja"
                    disabled={submitting}
                  />
                )}
              />
            </FieldShell>

            <FieldShell id="dueDate" label="Rok završetka">
              <Controller
                name="dueDate"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="dueDate"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    placeholder="Rok završetka"
                    disabled={submitting}
                  />
                )}
              />
            </FieldShell>

            {showShippingAddress && (
              <FieldShell
                id="shippingAddress"
                label="Adresa za dostavu *"
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

            <FieldShell id="shipping.drivesOut" label="Prevoz">
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

            {showPostageOptions && (
              <FieldShell id="shipping.postagePaymentType" label="Poštarina">
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
                        <SelectValue placeholder="Način plaćanja poštarine" />
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

            <FieldShell id="shipping.waitForPayment" label="Uplata">
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
                      Čeka se uplata
                    </label>
                  </div>
                )}
              />
            </FieldShell>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
            {[
              { name: "shipping.hasPackaging" as const, label: "Pakovanje", id: "hasPackaging" },
              { name: "shipping.hasLabeling" as const, label: "Označavanje", id: "hasLabeling" },
              { name: "shipping.isFragile" as const, label: "Lomljivo", id: "isFragile" },
              {
                name: "shipping.requiresSignature" as const,
                label: "Potpis",
                id: "requiresSignature",
              },
              { name: "shipping.hasInsurance" as const, label: "Osiguranje", id: "hasInsurance" },
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
        </FormSection>

        <FormSection title="Finansije i napomena">
          <div className="grid grid-cols-2 gap-6">
            <FieldShell
              id="price"
              label="Cena (RSD)"
              error={errors.price?.message}
            >
              <input
                id="price"
                type="number"
                step="0.01"
                className={`${underlineInput} tnum`}
                {...register("price", {
                  setValueAs: (v: string) => (v === "" ? null : Number(v)),
                })}
              />
            </FieldShell>

            {isEdit && (
              <FieldShell id="executedBy" label="Izvršilac">
                <input
                  id="executedBy"
                  className={underlineInput}
                  {...register("executedBy", {
                    setValueAs: (v: string) => (v === "" ? null : v),
                  })}
                />
              </FieldShell>
            )}

            <FieldShell id="invoiceDraft.status" label="Status fakture">
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
                      <SelectItem value="none">Nije spremno</SelectItem>
                      <SelectItem value="draft">Nacrt</SelectItem>
                      <SelectItem value="issued">Fakturisano</SelectItem>
                      <SelectItem value="paid">Plaćeno</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldShell>

            <FieldShell id="invoiceDraft.invoiceNumber" label="Broj fakture">
              <input
                id="invoiceDraft.invoiceNumber"
                className={`${underlineInput} tnum`}
                {...register("invoiceDraft.invoiceNumber")}
              />
            </FieldShell>

            <div className="col-span-full border-t border-border pt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                  Stavke
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddInvoiceLineItem("service")}
                    className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Usluga
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddInvoiceLineItem("goods")}
                    className="iris-focusable iris-press inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Roba
                  </button>
                </div>
              </div>

              {invoiceLineItemFields.length === 0 ? (
                <div className="border border-dashed border-border bg-background px-4 py-3 text-[12px] text-[color:var(--iris-ink-soft)]">
                  Nema stavki
                </div>
              ) : (
                <div className="space-y-4">
                  {invoiceLineItemFields.map((lineItem, index) => {
                    const selectedKind =
                      invoiceLineItems[index]?.kind === "goods"
                        ? "goods"
                        : "service";
                    const builtinUnitOptions = getInvoiceUnitOptions(
                      selectedKind,
                    ).map((unit) => ({
                      value: unit,
                      label: INVOICE_UNIT_LABELS[unit],
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

                    return (
                      <div
                        key={lineItem.id}
                        className="grid grid-cols-1 gap-4 border-b border-[color:var(--iris-border-soft)] pb-4 last:border-b-0 last:pb-0 xl:grid-cols-[120px_minmax(0,1fr)_80px_100px_110px_36px]"
                      >
                        <FieldShell
                          id={`invoiceDraft.lineItems.${index}.kind`}
                          label="Tip"
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
                                  id={`invoiceDraft.lineItems.${index}.kind`}
                                  aria-labelledby={`invoiceDraft.lineItems.${index}.kind-label`}
                                  className={underlineTrigger}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(INVOICE_LINE_ITEM_KIND_LABELS).map(
                                    ([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ),
                                  )}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </FieldShell>

                        <FieldShell
                          id={`invoiceDraft.lineItems.${index}.description`}
                          label="Opis"
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

                        <FieldShell
                          id={`invoiceDraft.lineItems.${index}.quantity`}
                          label="Kol."
                          error={lineItemError?.quantity?.message}
                        >
                          <input
                            id={`invoiceDraft.lineItems.${index}.quantity`}
                            type="number"
                            className={`${underlineInput} tnum`}
                            {...register(
                              `invoiceDraft.lineItems.${index}.quantity` as const,
                              {
                                setValueAs: (v: string) =>
                                  v === "" ? 1 : Number(v),
                              },
                            )}
                          />
                        </FieldShell>

                        <FieldShell
                          id={`invoiceDraft.lineItems.${index}.unit`}
                          label="Jedinica"
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
                        </FieldShell>

                        <FieldShell
                          id={`invoiceDraft.lineItems.${index}.unitPrice`}
                          label="Cena"
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
                                setValueAs: (v: string) =>
                                  v === "" ? 0 : Number(v),
                              },
                            )}
                          />
                        </FieldShell>

                        <div className="self-end">
                          <button
                            type="button"
                            aria-label={`Ukloni stavku ${index + 1}`}
                            onClick={() => removeInvoiceLineItem(index)}
                            className="iris-focusable iris-press flex h-9 w-9 items-center justify-center border border-border bg-background text-[color:var(--iris-ink-soft)] hover:border-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <FieldShell id="communication.notificationEmail" label="Email za obaveštenja">
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
                    Email obaveštenja
                  </label>
                </div>
              )}
            />

            <FieldShell id="communication.signedBy" label="Digitalni potpis">
              <input
                id="communication.signedBy"
                className={underlineInput}
                {...register("communication.signedBy")}
              />
            </FieldShell>

            <FieldShell id="note" label="Napomena" full>
              <textarea
                id="note"
                rows={3}
                className={`w-full border border-border bg-card p-3 text-[12px] text-foreground outline-none focus:border-foreground`}
                placeholder="Dodatne napomene za operatera…"
                {...register("note", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
              />
            </FieldShell>

            <FieldShell
              id="internalNotes.0.body"
              label="Interna beleška"
              error={internalNoteError}
              full
            >
              <textarea
                id="internalNotes.0.body"
                rows={3}
                className="w-full border border-border bg-card p-3 text-[12px] text-foreground outline-none focus:border-foreground"
                placeholder="Vidljivo samo timu..."
                {...register("internalNotes.0.body")}
              />
            </FieldShell>

            <FieldShell
              id="customerNotes.0.body"
              label="Beleška za klijenta"
              error={customerNoteError}
              full
            >
              <textarea
                id="customerNotes.0.body"
                rows={3}
                className="w-full border border-border bg-card p-3 text-[12px] text-foreground outline-none focus:border-foreground"
                placeholder="Bez internih informacija..."
                {...register("customerNotes.0.body")}
              />
            </FieldShell>
          </div>
        </FormSection>
      </div>

      <aside className="border-l border-border bg-card p-8">
        <SummaryPanel watch={watch} isEdit={isEdit} />

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="iris-focusable iris-press flex items-center justify-center gap-2 bg-foreground px-4 py-[11px] text-[12px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sačuvaj nalog
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="iris-focusable iris-press bg-transparent py-2 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
          >
            Odustani
          </button>
        </div>
      </aside>
    </form>
  );
}

interface SummaryPanelProps {
  watch: UseFormWatch<WorkOrderFormValues>;
  isEdit: boolean;
}

function SummaryPanel({ watch, isEdit }: SummaryPanelProps): React.JSX.Element {
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

  const rows: Array<[string, string]> = [
    ["Klijent", clientName || "-"],
    ["Opis", jobDescription || "-"],
    [
      "Tip dokumenta",
      billingDocumentType
        ? labelFor("billingDocumentType", billingDocumentType)
        : "-",
    ],
    [
      "Dostava",
      deliveryMethod ? labelFor("deliveryMethod", deliveryMethod) : "-",
    ],
    ["Operater", assignedTo || "Nedodeljeno"],
    ["Prioritet", labelFor("priority", priority)],
    ["Planirano", scheduledDate ? formatWorkOrderDate(scheduledDate) : "-"],
    ["Datum izdavanja", issueDate ? formatWorkOrderDate(issueDate) : "-"],
    ["Rok", dueDate ? formatWorkOrderDate(dueDate) : "-"],
    ["Faktura", invoiceStatus],
  ];

  return (
    <>
      <div className="mb-4 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        Pregled naloga
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

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          Procena
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-[color:var(--iris-ink-soft)]">
            {isEdit ? "Cena" : "Ukupno"}
          </span>
          <span className="tnum text-[22px] font-normal tracking-[-0.3px] text-foreground">
            {formatWorkOrderPrice(price ?? null)}
          </span>
        </div>
      </div>
    </>
  );
}
