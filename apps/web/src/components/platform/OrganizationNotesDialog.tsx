import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { ApiError, formatActionError } from "@/lib/errors";
import type { PlatformTenant, PlatformTenantNotesInput } from "@/types/platform";
import { formatDateTime } from "./format";
import {
  BackofficeDialog,
  backofficeInputClass,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
} from "./BackofficeDialog";

// Mirrors the API's checks (store/platform_tenant_health.go); it re-validates.
const shortField = z.string().trim().max(200, "platform.orgs.notes.errors.tooLong");
const notesSchema = z.object({
  contactName: shortField,
  contactEmail: shortField.refine(
    (value) => value === "" || /^[^\s@]+@[^\s@]+$/.test(value),
    "platform.orgs.notes.errors.email",
  ),
  contactPhone: shortField,
  plan: shortField,
  notes: z.string().trim().max(10000, "platform.orgs.notes.errors.notesTooLong"),
});

type NotesForm = z.infer<typeof notesSchema>;

// The shared input look without its fixed single-line height.
const textareaClass = backofficeInputClass.replace("h-11 ", "");

/**
 * Edits the superadmins' internal notes about an organization: contact
 * person, contact e-mail and phone, plan and free-form notes. The
 * organization itself never sees them; saving is recorded in the activity log
 * (which fields changed, not their contents).
 */
export function OrganizationNotesDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onSaved: (tenant: PlatformTenant) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NotesForm>({
    resolver: zodResolver(notesSchema),
    defaultValues: {
      contactName: tenant.notes.contactName,
      contactEmail: tenant.notes.contactEmail,
      contactPhone: tenant.notes.contactPhone,
      plan: tenant.notes.plan,
      notes: tenant.notes.notes,
    },
  });

  const onSubmit = handleSubmit(async (values: PlatformTenantNotesInput) => {
    setServerError(null);
    try {
      onSaved(await window.api.setPlatformTenantNotes(tenant.slug, values));
    } catch (error) {
      setServerError(
        error instanceof ApiError && error.status === 422 && error.message
          ? error.message
          : formatActionError(t("platform.orgs.notes.saveError"), error),
      );
    }
  });

  const message = (name: keyof NotesForm, hint?: string): React.JSX.Element | null =>
    errors[name]?.message ? (
      <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors[name]!.message!)}</p>
    ) : hint ? (
      <p className="mt-1.5 text-[12px] text-[color:var(--pf-muted)]">{hint}</p>
    ) : null;

  const field = (
    name: Exclude<keyof NotesForm, "notes">,
    input: React.InputHTMLAttributes<HTMLInputElement> = {},
    hint?: string,
  ): React.JSX.Element => (
    <div>
      <label htmlFor={`org-notes-${name}`} className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
        {t(`platform.orgs.notes.${name}`)}
      </label>
      <input
        id={`org-notes-${name}`}
        {...register(name)}
        {...input}
        autoComplete="off"
        aria-invalid={Boolean(errors[name])}
        className={backofficeInputClass}
      />
      {message(name, hint)}
    </div>
  );

  const updated = tenant.notes.updatedAt;

  return (
    <BackofficeDialog
      title={t("platform.orgs.notes.title", { name: tenant.name })}
      description={t("platform.orgs.notes.description")}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("contactName", { autoFocus: true })}
          {field("contactPhone", { type: "tel" })}
        </div>
        {field("contactEmail", { type: "email", spellCheck: false })}
        {field("plan", {}, t("platform.orgs.notes.planHint"))}
        <div>
          <label htmlFor="org-notes-notes" className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
            {t("platform.orgs.notes.notes")}
          </label>
          <textarea
            id="org-notes-notes"
            rows={6}
            {...register("notes")}
            aria-invalid={Boolean(errors.notes)}
            className={`${textareaClass} min-h-32 resize-y py-2 leading-5`}
          />
          {message("notes")}
        </div>
        {updated ? (
          <p className="text-[12px] text-[color:var(--pf-muted)]">
            {t("platform.orgs.notes.lastUpdated", { date: formatDateTime(updated) ?? "", user: tenant.notes.updatedBy ?? "" })}
          </p>
        ) : null}
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
            {isSubmitting ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </BackofficeDialog>
  );
}
