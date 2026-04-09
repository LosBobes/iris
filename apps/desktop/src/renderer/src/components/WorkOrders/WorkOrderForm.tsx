import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  formatWorkOrderDateTime,
  getLocalIsoDate,
} from "@/shared/utils/work-orders";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkOrderFormProps {
  initialData?: WorkOrder | null;
  initialValues?: WorkOrderFormValues;
  onSubmit: (values: WorkOrderFormValues) => Promise<void>;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  // Track whether job details section is expanded
  const [showJobDetails, setShowJobDetails] = useState(
    !!defaultValues.jobDetails,
  );

  const handleFormSubmit = async (
    values: WorkOrderFormValues,
  ): Promise<void> => {
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Enter key for submit
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="max-w-3xl space-y-8"
    >
      {/* Read-only info for edit mode */}
      {isEdit && initialData && (
        <section className="space-y-3 rounded-none border border-border bg-muted/30 p-4">
          <h2 className="text-sm font-semibold">Informacije o nalogu</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Broj naloga:</span>{" "}
              <span className="font-medium">{initialData.orderNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              <span className="font-medium">
                {WORK_ORDER_STATUS_LABELS[initialData.status]}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Kreiran:</span>{" "}
              <span className="font-medium">
                {formatWorkOrderDateTime(initialData.createdAt)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Izdao:</span>{" "}
              <span className="font-medium">{initialData.issuedBy}</span>
            </div>
          </div>
        </section>
      )}

      {/* Client info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Podaci o klijentu</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">Naziv klijenta *</Label>
            <Input id="clientName" {...register("clientName")} />
            {errors.clientName && (
              <p className="text-xs text-destructive">
                {errors.clientName.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPerson">Kontakt osoba</Label>
            <Input
              id="contactPerson"
              {...register("contactPerson", {
                setValueAs: (v: string) => (v === "" ? null : v),
              })}
            />
          </div>
        </div>
      </section>

      {/* Job info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Opis posla</h2>
        <div className="space-y-1.5">
          <Label htmlFor="jobDescription">Opis *</Label>
          <Textarea
            id="jobDescription"
            rows={3}
            {...register("jobDescription")}
          />
          {errors.jobDescription && (
            <p className="text-xs text-destructive">
              {errors.jobDescription.message}
            </p>
          )}
        </div>

        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowJobDetails(!showJobDetails)}
          >
            {showJobDetails ? "Sakrij detalje posla" : "Prikaži detalje posla"}
          </Button>
        </div>

        {showJobDetails && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="jobDetails.productCode">Šifra proizvoda</Label>
              <Input
                id="jobDetails.productCode"
                {...register("jobDetails.productCode", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jobDetails.paperWeightGsm">
                Gramatura papira (gsm)
              </Label>
              <Input
                id="jobDetails.paperWeightGsm"
                type="number"
                {...register("jobDetails.paperWeightGsm", {
                  setValueAs: (v: string) => (v === "" ? null : Number(v)),
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jobDetails.dimensions">Dimenzije</Label>
              <Input
                id="jobDetails.dimensions"
                {...register("jobDetails.dimensions", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jobDetails.quantity">Količina</Label>
              <Input
                id="jobDetails.quantity"
                type="number"
                {...register("jobDetails.quantity", {
                  setValueAs: (v: string) => (v === "" ? null : Number(v)),
                })}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="jobDetails.finishingNote">
                Napomena o doradi
              </Label>
              <Input
                id="jobDetails.finishingNote"
                {...register("jobDetails.finishingNote", {
                  setValueAs: (v: string) => (v === "" ? null : v),
                })}
              />
            </div>
          </div>
        )}
      </section>

      {/* Billing document */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Dokument</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Tip dokumenta</Label>
            <Controller
              name="billingDocumentType"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ?? WORK_ORDER_SELECT_NONE_VALUE}
                  onValueChange={(v) =>
                    field.onChange(
                      v === WORK_ORDER_SELECT_NONE_VALUE ? null : v,
                    )
                  }
                >
                  <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billingDocumentNumber">Broj dokumenta</Label>
            <Input
              id="billingDocumentNumber"
              {...register("billingDocumentNumber", {
                setValueAs: (v: string) => (v === "" ? null : v),
              })}
            />
          </div>
        </div>
      </section>

      {/* Shipping */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Dostava</h2>
        <div className="space-y-1.5">
          <Label>Način dostave</Label>
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
                <SelectTrigger className="max-w-xs">
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
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Controller
            name="shipping.hasPackaging"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasPackaging"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="hasPackaging">Pakovanje</Label>
              </div>
            )}
          />
          <Controller
            name="shipping.hasLabeling"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasLabeling"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="hasLabeling">Označavanje</Label>
              </div>
            )}
          />
          <Controller
            name="shipping.isFragile"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isFragile"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="isFragile">Lomljivo</Label>
              </div>
            )}
          />
          <Controller
            name="shipping.requiresSignature"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresSignature"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="requiresSignature">Potpis</Label>
              </div>
            )}
          />
          <Controller
            name="shipping.hasInsurance"
            control={control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasInsurance"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="hasInsurance">Osiguranje</Label>
              </div>
            )}
          />
        </div>

        {showShippingAddress && (
          <div className="space-y-1.5">
            <Label htmlFor="shippingAddress">Adresa za dostavu *</Label>
            <Input
              id="shippingAddress"
              {...register("shipping.shippingAddress", {
                setValueAs: (v: string) => (v === "" ? null : v),
              })}
            />
            {errors.shipping?.shippingAddress && (
              <p className="text-xs text-destructive">
                {errors.shipping.shippingAddress.message}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Financial */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Finansije</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="price">Cena (RSD)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              {...register("price", {
                setValueAs: (v: string) => (v === "" ? null : Number(v)),
              })}
            />
            {errors.price && (
              <p className="text-xs text-destructive">{errors.price.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Napomena</Label>
            <Textarea
              id="note"
              rows={2}
              {...register("note", {
                setValueAs: (v: string) => (v === "" ? null : v),
              })}
            />
          </div>
        </div>
      </section>

      {/* Dates */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Datumi</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="issueDate">Datum izdavanja *</Label>
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
            {errors.issueDate && (
              <p className="text-xs text-destructive">
                {errors.issueDate.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">Rok završetka</Label>
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
          </div>
        </div>
      </section>

      {/* Edit-only: executedBy */}
      {isEdit && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Izvršilac</h2>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="executedBy">Izvršio</Label>
            <Input
              id="executedBy"
              {...register("executedBy", {
                setValueAs: (v: string) => (v === "" ? null : v),
              })}
            />
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Sačuvaj
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Otkaži
        </Button>
      </div>
    </form>
  );
}
