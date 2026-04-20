import { useEffect, useState } from "react";
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
  WORK_ORDER_BILLING_LABELS,
  WORK_ORDER_DELIVERY_LABELS,
  WORK_ORDER_SELECT_NONE_VALUE,
  WORK_ORDER_STATUS_LABELS,
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
}

interface FormSectionProps {
  num: string;
  title: string;
  children: React.ReactNode;
}

function FormSection({ num, title, children }: FormSectionProps): React.JSX.Element {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-baseline gap-3 border-b border-border pb-2.5">
        <span className="tnum text-[10px] tracking-[1px] text-[color:var(--iris-ink-faint)]">
          {num}
        </span>
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
}: WorkOrderFormProps): React.JSX.Element {
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
          billingDocumentType: null,
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

  const [showJobDetails, setShowJobDetails] = useState(!!defaultValues.jobDetails);

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
                {WORK_ORDER_STATUS_LABELS[initialData.status]}
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

        <FormSection num="01" title="Klijent">
          <div className="grid grid-cols-2 gap-6">
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

        <FormSection num="02" title="Posao">
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
                className="bg-transparent p-0 text-[11px] text-[color:var(--iris-accent)] hover:opacity-80"
              >
                {showJobDetails ? "Sakrij detalje posla" : "Prikaži detalje posla"}
              </button>
            </div>

            {showJobDetails && (
              <div className="grid grid-cols-2 gap-6">
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
                <FieldShell id="jobDetails.quantity" label="Količina">
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

        <FormSection num="03" title="Dokument i isporuka">
          <div className="grid grid-cols-2 gap-6">
            <FieldShell id="billingDocumentType" label="Tip dokumenta">
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
                      <SelectValue placeholder="Izaberite tip" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WORK_ORDER_SELECT_NONE_VALUE}>
                        Nije izabrano
                      </SelectItem>
                      {Object.entries(WORK_ORDER_BILLING_LABELS).map(
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
                      {Object.entries(WORK_ORDER_DELIVERY_LABELS).map(
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
                  {...register("shipping.shippingAddress", {
                    setValueAs: (v: string) => (v === "" ? null : v),
                  })}
                />
              </FieldShell>
            )}
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

        <FormSection num="04" title="Finansije i napomena">
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
          </div>
        </FormSection>
      </div>

      <aside className="border-l border-border bg-card p-8">
        <SummaryPanel watch={watch} isEdit={isEdit} />

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 bg-foreground px-4 py-[11px] text-[12px] font-medium tracking-[0.3px] text-background disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sačuvaj nalog
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="bg-transparent py-2 text-[11px] text-[color:var(--iris-ink-mute)] hover:text-foreground"
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
  const clientName = watch("clientName");
  const jobDescription = watch("jobDescription");
  const billingDocumentType = watch("billingDocumentType");
  const deliveryMethod = watch("shipping.deliveryMethod");
  const price = watch("price");
  const issueDate = watch("issueDate");
  const dueDate = watch("dueDate");

  const rows: Array<[string, string]> = [
    ["Klijent", clientName || "—"],
    ["Opis", jobDescription || "—"],
    [
      "Tip dokumenta",
      billingDocumentType ? WORK_ORDER_BILLING_LABELS[billingDocumentType] : "—",
    ],
    ["Dostava", deliveryMethod ? WORK_ORDER_DELIVERY_LABELS[deliveryMethod] : "—"],
    ["Datum izdavanja", issueDate ? formatWorkOrderDate(issueDate) : "—"],
    ["Rok", dueDate ? formatWorkOrderDate(dueDate) : "—"],
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
