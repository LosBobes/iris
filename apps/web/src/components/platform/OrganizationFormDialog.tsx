import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { isPasswordTooLong } from "@/lib/password";
import { ApiError, formatActionError } from "@/lib/errors";
import type { PlatformTenant } from "@/types/platform";
import {
  BackofficeDialog,
  backofficeInputClass,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
} from "./BackofficeDialog";

// Mirrors the API's checks (store/platform_tenants.go); it re-validates.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const nameField = z
  .string()
  .trim()
  .min(1, "platform.orgs.errors.nameRequired")
  .max(120, "platform.orgs.errors.nameTooLong");
const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "platform.orgs.errors.slugInvalid")
  .max(64, "platform.orgs.errors.slugInvalid")
  .regex(SLUG_PATTERN, "platform.orgs.errors.slugInvalid");

const createSchema = z.object({
  name: nameField,
  slug: slugField,
  adminUsername: z.string().trim().min(1, "platform.orgs.errors.usernameRequired"),
  adminPassword: z
    .string()
    .refine((value) => value.trim().length >= 6, "platform.orgs.errors.passwordShort")
    .refine((value) => !isPasswordTooLong(value), "platform.orgs.errors.passwordLong"),
});
const editSchema = z.object({ name: nameField, slug: slugField });

type CreateForm = z.infer<typeof createSchema>;
type FormValues = CreateForm;

/** A slug suggestion from the organization name: "Štampa Đurić" → "stampa-djuric". */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/**
 * Creates an organization (with its first admin) or, given `tenant`, renames
 * it and/or changes its slug.
 */
export function OrganizationFormDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant?: PlatformTenant;
  onClose: () => void;
  onSaved: (tenant: PlatformTenant) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const editing = Boolean(tenant);
  const [serverError, setServerError] = useState<string | null>(null);
  // While creating, the slug follows the name until it is edited by hand.
  const [slugTouched, setSlugTouched] = useState(editing);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // The edit form simply has no admin fields; its schema ignores them.
    resolver: zodResolver(editing ? (editSchema as unknown as typeof createSchema) : createSchema),
    defaultValues: { name: tenant?.name ?? "", slug: tenant?.slug ?? "", adminUsername: "", adminPassword: "" },
  });
  const slug = watch("slug");
  const slugChanged = editing && slug.trim().toLowerCase() !== tenant?.slug;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const saved = tenant
        ? await window.api.updatePlatformTenant(tenant.slug, { name: values.name, slug: values.slug })
        : await window.api.createPlatformTenant(values);
      onSaved(saved);
    } catch (error) {
      setServerError(
        error instanceof ApiError && error.status === 422 && error.message
          ? error.message
          : formatActionError(t("platform.orgs.failed"), error),
      );
    }
  });

  const nameRegistration = register("name");
  const field = (
    name: keyof FormValues,
    label: string,
    input: React.InputHTMLAttributes<HTMLInputElement>,
    hint?: React.ReactNode,
  ): React.JSX.Element => {
    const registration = name === "name" ? nameRegistration : register(name);
    return (
      <div>
        <label htmlFor={`org-${name}`} className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
          {label}
        </label>
        <input
          id={`org-${name}`}
          {...registration}
          {...input}
          onChange={(event) => {
            void registration.onChange(event);
            input.onChange?.(event);
          }}
          aria-invalid={Boolean(errors[name])}
          className={backofficeInputClass}
        />
        {errors[name]?.message ? (
          <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors[name]!.message!)}</p>
        ) : hint ? (
          <p className="mt-1.5 text-[12px] text-[color:var(--pf-muted)]">{hint}</p>
        ) : null}
      </div>
    );
  };

  return (
    <BackofficeDialog
      title={editing ? t("platform.orgs.editTitle") : t("platform.orgs.createTitle")}
      description={editing ? undefined : t("platform.orgs.createIntro")}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4 p-4">
        {field("name", t("platform.orgs.name"), {
          autoComplete: "off",
          autoFocus: true,
          onChange: (event) => {
            if (!slugTouched) setValue("slug", suggestSlug(event.target.value));
          },
        })}
        {field(
          "slug",
          t("platform.orgs.slug"),
          { autoComplete: "off", spellCheck: false, onChange: () => setSlugTouched(true) },
          t("platform.orgs.slugHint", { slug: slug.trim().toLowerCase() || "…" }),
        )}
        {slugChanged ? (
          <p className="flex gap-2 rounded-md border border-[#f2b544]/40 bg-[#f2b544]/10 px-3 py-2.5 text-[12px] leading-5">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#f2b544]" />
            {t("platform.orgs.slugChangeWarning")}
          </p>
        ) : null}
        {editing ? null : (
          <>
            {field("adminUsername", t("platform.orgs.adminUsername"), { autoComplete: "off" })}
            {field("adminPassword", t("platform.orgs.adminPassword"), { type: "password", autoComplete: "new-password" })}
          </>
        )}
        {serverError ? (
          <p role="alert" className="rounded-md border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2.5 text-[13px] leading-5">
            {serverError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${backofficeSecondaryButtonClass} flex-1`}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={isSubmitting} className={`${backofficePrimaryButtonClass} flex-1`}>
            {isSubmitting ? t("common.loading") : editing ? t("platform.orgs.save") : t("platform.orgs.createSubmit")}
          </button>
        </div>
      </form>
    </BackofficeDialog>
  );
}
