import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Landmark, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";
import { checkSellerIdentity, EMPTY_SELLER_IDENTITY } from "@/lib/seller-identity";
import type { SellerIdentity } from "@/types/settings";

const sellerIdentitySchema = z
  .object({
    legalName: z.string(),
    pib: z.string(),
    mb: z.string(),
    street: z.string(),
    city: z.string(),
    postalCode: z.string(),
    countryCode: z.string(),
    bankAccount: z.string(),
    vatPayer: z.boolean(),
    email: z.string(),
  })
  .superRefine((values, ctx) => {
    const { problem } = checkSellerIdentity(toIdentity(values));
    if (problem) ctx.addIssue({ code: "custom", path: [problem.field], message: problem.message });
  });

type SellerIdentityFormValues = z.infer<typeof sellerIdentitySchema>;

function toIdentity(values: SellerIdentityFormValues): SellerIdentity {
  return { ...values, email: values.email.trim() === "" ? null : values.email };
}

function toFormValues(identity: SellerIdentity | null): SellerIdentityFormValues {
  const source = identity ?? EMPTY_SELLER_IDENTITY;
  return { ...source, email: source.email ?? "" };
}

type TextField = Exclude<keyof SellerIdentityFormValues, "vatPayer">;

const FIELDS: { name: TextField; wide?: boolean; inputMode?: "numeric" | "email" }[] = [
  { name: "legalName", wide: true },
  { name: "pib", inputMode: "numeric" },
  { name: "mb", inputMode: "numeric" },
  { name: "street", wide: true },
  { name: "postalCode" },
  { name: "city" },
  { name: "countryCode" },
  { name: "bankAccount" },
  { name: "email", wide: true, inputMode: "email" },
];

/**
 * Admin-only editor for the organization's legal identity on government
 * e-invoices and e-dispatch notes (D-030). Shown only while "e-Fakture" or
 * "e-Otpremnice" is on; saved whole through the organization settings.
 */
export function SellerIdentitySettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { sellerIdentity, setSellerIdentity } = useOrganization();
  const formId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SellerIdentityFormValues>({
    resolver: zodResolver(sellerIdentitySchema),
    defaultValues: toFormValues(sellerIdentity),
  });

  useEffect(() => {
    reset(toFormValues(sellerIdentity));
  }, [sellerIdentity, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      const saved = await window.api.updateSettings({ sellerIdentity: toIdentity(values) });
      setSellerIdentity(saved.sellerIdentity);
      toast.success(t("settings.seller.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.seller.saveErrorPrefix")}: ${error.message}`
          : t("settings.seller.saveError"),
      );
    }
  });

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Landmark size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">{t("settings.seller.title")}</div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">{t("settings.seller.hint")}</div>
        </div>
      </div>

      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(({ name, wide, inputMode }) => {
            const error = errors[name]?.message;
            const id = `${formId}-${name}`;
            return (
              <div key={name} className={wide ? "sm:col-span-2" : undefined}>
                <label htmlFor={id} className="block text-[11px] text-[color:var(--iris-ink-soft)]">
                  {t(`settings.seller.fields.${name}`)}
                </label>
                <input
                  {...register(name)}
                  id={id}
                  inputMode={inputMode}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  placeholder={t(`settings.seller.placeholders.${name}`)}
                  className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground aria-[invalid=true]:border-destructive"
                />
                {error ? (
                  <span id={`${id}-error`} role="alert" className="mt-1 block text-[11px] text-destructive">
                    {error}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <label className="flex items-start gap-2 text-[12px] text-foreground">
          <input type="checkbox" {...register("vatPayer")} className="iris-focusable mt-0.5 h-4 w-4" />
          <span>
            {t("settings.seller.fields.vatPayer")}
            <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">{t("settings.seller.vatPayerHint")}</span>
          </span>
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || (!isDirty && sellerIdentity !== null)}
            className="iris-focusable iris-press inline-flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t("common.save")}
          </button>
        </div>
      </form>
    </section>
  );
}
