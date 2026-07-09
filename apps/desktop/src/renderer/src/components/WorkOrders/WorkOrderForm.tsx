import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm, Controller, type UseFormWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkOrder } from "@/types/work-order";
import {
  workOrderFormSchema,
  type WorkOrderFormValues,
} from "@/lib/work-orders/validation";
import {
  BILLING_DOCUMENT_TYPES,
  DELIVERY_METHODS,
  WORK_ORDER_SELECT_NONE_VALUE,
  getWorkOrderBillingDocumentLabel,
  getWorkOrderDeliveryLabel,
  getWorkOrderStatusLabel,
  formatWorkOrderDate,
  formatWorkOrderDateTime,
  formatWorkOrderPrice,
  getLocalIsoDate,
} from "@/shared/utils/work-orders";

interface WorkOrderFormProps {
  initialData?: WorkOrder | null;
  initialValues?: WorkOrderFormValues;
  onSubmit: (values: WorkOrderFormValues) => Promise<void>;
  onCancel: () => void;
  /**
   * When true every field and button is disabled (via a disabled fieldset), for
   * showing a work order another operator is currently editing. Defaults to false.
   */
  readOnly?: boolean;
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

  return (
    <div className={full ? "col-span-full" : undefined}>
      <label
        id={labelId}
        htmlFor={id}
        className="mb-1.5 block text-[11px] text-[color:var(--iris-ink-soft)]"
      >
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
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

export function WorkOrderForm({
  initialData,
  initialValues,
  onSubmit,
  onCancel,
  readOnly = false,
}: WorkOrderFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!initialData;

  const defaultValues: WorkOrderFormValues =
    initialValues ??
    (initialData
      ? {
          clientName: initialData.clientName,
          contactPerson: initialData.contactPerson,
          jobDescription: initialData.jobDescription,
          jobDetails: initialData.jobDetails,
          billingDocumentType: initialData.billingDocumentType,
          billingDocumentNumber: initialData.billingDocumentNumber,
          shipping: initialData.shipping,
          price: initialData.price,
          note: initialData.note,
          issueDate: initialData.issueDate,
          dueDate: initialData.dueDate,
          executedBy: initialData.executedBy,
        }
      : {
          clientName: "",
          contactPerson: null,
          jobDescription: "",
          jobDetails: null,
          // New orders default to a proforma (predračun); see the document-type
          // policy the web settings expose shop-wide.
          billingDocumentType: "proforma",
          billingDocumentNumber: null,
          shipping: {
            deliveryMethod: null,
            hasPackaging: false,
            hasLabeling: false,
            isFragile: false,
            requiresSignature: false,
            hasInsurance: false,
            shippingAddress: null,
          },
          price: null,
          note: null,
          // Issue date is implied from the creation date: the order is created
          // right after this form is submitted, so today is the issue date.
          // Not shown as an editable field.
          issueDate: getLocalIsoDate(),
          dueDate: null,
          executedBy: null,
        });

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderFormSchema),
    defaultValues,
  });

  const deliveryMethod = watch("shipping.deliveryMethod");
  const showShippingAddress =
    deliveryMethod !== null && deliveryMethod !== "pickup";

  const handleFormSubmit = async (values: WorkOrderFormValues): Promise<void> => {
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
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
      onSubmit={handleSubmit(handleFormSubmit)}
      className="grid grid-cols-[minmax(0,1fr)_320px] gap-0"
    >
      {/* A disabled fieldset natively disables every nested control, giving a
          read-only view when another operator holds the edit lock. */}
      <fieldset disabled={readOnly} className="contents">
      <div className="pr-10">
        {isEdit && initialData && (
          <div className="mb-8 flex flex-wrap gap-x-10 gap-y-4 border border-[color:var(--iris-border-soft)] bg-card px-6 py-4 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.form.orderNumber")}
              </div>
              <div className="tnum mt-1 text-foreground">
                {initialData.orderNumber}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.form.status")}
              </div>
              <div className="mt-1 text-foreground">
                {getWorkOrderStatusLabel(initialData.status)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.form.created")}
              </div>
              <div className="tnum mt-1 text-foreground">
                {formatWorkOrderDateTime(initialData.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.form.issuedBy")}
              </div>
              <div className="mt-1 text-foreground">{initialData.issuedBy}</div>
            </div>
          </div>
        )}

        <FormSection title={t("workOrders.form.sectionClient")}>
          <div className="grid grid-cols-2 gap-6">
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
          </div>
        </FormSection>

        <FormSection title={t("workOrders.form.sectionJob")}>
          <div className="space-y-6">
            <FieldShell
              id="jobDescription"
              label={t("workOrders.form.jobDescriptionRequired")}
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
          </div>
        </FormSection>

        <FormSection title={t("workOrders.form.sectionDocument")}>
          <div className="grid grid-cols-2 gap-6">
            <FieldShell id="billingDocumentType" label={t("workOrders.form.documentType")}>
              <Controller
                name="billingDocumentType"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? WORK_ORDER_SELECT_NONE_VALUE}
                    onValueChange={(v) =>
                      field.onChange(v === WORK_ORDER_SELECT_NONE_VALUE ? null : v)
                    }
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
                        {t("workOrders.form.notSelected")}
                      </SelectItem>
                      {BILLING_DOCUMENT_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {getWorkOrderBillingDocumentLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
                        {t("workOrders.form.notSelected")}
                      </SelectItem>
                      {DELIVERY_METHODS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {getWorkOrderDeliveryLabel(value)}
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
        </FormSection>

        <FormSection title={t("workOrders.form.sectionFinanceNotes")}>
          <div className="grid grid-cols-2 gap-6">
            <FieldShell
              id="price"
              label={t("workOrders.form.price")}
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
              <FieldShell id="executedBy" label={t("workOrders.form.executedBy")}>
                <input
                  id="executedBy"
                  className={underlineInput}
                  {...register("executedBy", {
                    setValueAs: (v: string) => (v === "" ? null : v),
                  })}
                />
              </FieldShell>
            )}

            <FieldShell id="note" label={t("workOrders.form.note")} full>
              <textarea
                id="note"
                rows={3}
                className={`w-full border border-border bg-card p-3 text-[12px] text-foreground outline-none focus:border-foreground`}
                placeholder={t("workOrders.form.notePlaceholder")}
                {...register("note", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
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
}

function SummaryPanel({ watch, isEdit }: SummaryPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const clientName = watch("clientName");
  const jobDescription = watch("jobDescription");
  const billingDocumentType = watch("billingDocumentType");
  const deliveryMethod = watch("shipping.deliveryMethod");
  const price = watch("price");
  const issueDate = watch("issueDate");
  const dueDate = watch("dueDate");

  const rows: Array<[string, string]> = [
    [t("workOrders.summary.client"), clientName || "-"],
    [t("workOrders.summary.description"), jobDescription || "-"],
    [
      t("workOrders.summary.documentType"),
      billingDocumentType
        ? getWorkOrderBillingDocumentLabel(billingDocumentType)
        : "-",
    ],
    [
      t("workOrders.summary.delivery"),
      deliveryMethod ? getWorkOrderDeliveryLabel(deliveryMethod) : "-",
    ],
    [t("workOrders.summary.issueDate"), issueDate ? formatWorkOrderDate(issueDate) : "-"],
    [t("workOrders.summary.dueDate"), dueDate ? formatWorkOrderDate(dueDate) : "-"],
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
    </>
  );
}
