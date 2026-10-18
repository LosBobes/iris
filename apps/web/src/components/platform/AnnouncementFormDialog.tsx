import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { ApiError, formatActionError } from "@/lib/errors";
import {
  ANNOUNCEMENT_SEVERITIES,
  MAX_ANNOUNCEMENT_MESSAGE_LENGTH,
  type PlatformAnnouncement,
  type PlatformAnnouncementInput,
} from "@/types/announcement";
import type { PlatformTenant } from "@/types/platform";
import {
  BackofficeDialog,
  backofficeInputClass,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
} from "./BackofficeDialog";

const pad = (value: number): string => String(value).padStart(2, "0");

/** An ISO timestamp → the local `YYYY-MM-DDTHH:mm` a datetime-local input takes. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value (local time) → an ISO timestamp; empty → null. */
export function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Mirrors the API's checks (store/announcements.go); it re-validates.
const schema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "platform.announcements.errors.messageRequired")
      .refine((value) => [...value].length <= MAX_ANNOUNCEMENT_MESSAGE_LENGTH, "platform.announcements.errors.messageTooLong"),
    severity: z.enum(["info", "warning", "maintenance"]),
    startsAt: z.string(),
    endsAt: z.string(),
    allTenants: z.boolean(),
    tenantSlugs: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    for (const key of ["startsAt", "endsAt"] as const) {
      if (values[key].trim() && fromLocalInput(values[key]) === null) {
        ctx.addIssue({ code: "custom", path: [key], message: "platform.announcements.errors.invalidTime" });
      }
    }
    const start = fromLocalInput(values.startsAt) ?? new Date().toISOString();
    const end = fromLocalInput(values.endsAt);
    if (end !== null && Date.parse(end) <= Date.parse(start)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "platform.announcements.errors.endBeforeStart" });
    }
    if (!values.allTenants && values.tenantSlugs.length === 0) {
      ctx.addIssue({ code: "custom", path: ["tenantSlugs"], message: "platform.announcements.errors.tenantsRequired" });
    }
  });

type FormValues = z.infer<typeof schema>;

/** Creates an announcement or, given one, replaces its content and targets. */
export function AnnouncementFormDialog({
  announcement,
  onClose,
  onSaved,
}: {
  announcement?: PlatformAnnouncement;
  onClose: () => void;
  onSaved: (saved: PlatformAnnouncement) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const editing = Boolean(announcement);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<PlatformTenant[] | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      message: announcement?.message ?? "",
      severity: announcement?.severity ?? "info",
      startsAt: toLocalInput(announcement?.startsAt ?? null),
      endsAt: toLocalInput(announcement?.endsAt ?? null),
      allTenants: announcement?.allTenants ?? true,
      tenantSlugs: announcement?.tenants.map((tenant) => tenant.slug) ?? [],
    },
  });
  const allTenants = watch("allTenants");
  const messageLength = [...watch("message")].length;

  useEffect(() => {
    let active = true;
    window.api
      .getPlatformTenants()
      .then((list) => {
        if (active) setTenants(list);
      })
      .catch(() => {
        if (active) setTenants([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input: PlatformAnnouncementInput = {
      message: values.message,
      severity: values.severity,
      startsAt: fromLocalInput(values.startsAt),
      endsAt: fromLocalInput(values.endsAt),
      allTenants: values.allTenants,
      tenantSlugs: values.allTenants ? [] : values.tenantSlugs,
    };
    try {
      const saved = announcement
        ? await window.api.updatePlatformAnnouncement(announcement.id, input)
        : await window.api.createPlatformAnnouncement(input);
      onSaved(saved);
    } catch (error) {
      setServerError(
        error instanceof ApiError && error.status === 422 && error.message
          ? error.message
          : formatActionError(t("platform.announcements.failed"), error),
      );
    }
  });

  const fieldError = (key: keyof FormValues): React.JSX.Element | null =>
    errors[key]?.message ? <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors[key]!.message!)}</p> : null;
  const labelClass = "mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]";
  const hintClass = "mt-1.5 text-[12px] text-[color:var(--pf-muted)]";

  return (
    <BackofficeDialog
      title={editing ? t("platform.announcements.editTitle") : t("platform.announcements.createTitle")}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4 p-4">
        <div>
          <label htmlFor="announcement-message" className={labelClass}>
            {t("platform.announcements.message")}
          </label>
          <textarea
            id="announcement-message"
            rows={4}
            autoFocus
            {...register("message")}
            aria-invalid={Boolean(errors.message)}
            className={`${backofficeInputClass} h-auto py-2 leading-relaxed`}
          />
          {fieldError("message") ?? (
            <p className={hintClass}>
              {t("platform.announcements.messageHint", { count: messageLength, max: MAX_ANNOUNCEMENT_MESSAGE_LENGTH })}
            </p>
          )}
        </div>

        <fieldset>
          <legend className={labelClass}>{t("platform.announcements.severity")}</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {ANNOUNCEMENT_SEVERITIES.map((severity) => (
              <label
                key={severity}
                className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[color:var(--pf-border)] px-2 text-[13px] has-[:checked]:border-[color:var(--pf-text-2)] has-[:checked]:bg-white/5"
              >
                <input type="radio" value={severity} {...register("severity")} className="accent-current" />
                {t(`platform.announcements.severities.${severity}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="announcement-starts" className={labelClass}>
              {t("platform.announcements.startsAt")}
            </label>
            <input id="announcement-starts" type="datetime-local" {...register("startsAt")} className={backofficeInputClass} />
            {fieldError("startsAt") ?? <p className={hintClass}>{t("platform.announcements.startsAtHint")}</p>}
          </div>
          <div>
            <label htmlFor="announcement-ends" className={labelClass}>
              {t("platform.announcements.endsAt")}
            </label>
            <input id="announcement-ends" type="datetime-local" {...register("endsAt")} className={backofficeInputClass} />
            {fieldError("endsAt") ?? <p className={hintClass}>{t("platform.announcements.endsAtHint")}</p>}
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>{t("platform.announcements.target")}</legend>
          <Controller
            control={control}
            name="allTenants"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-1.5">
                {[true, false].map((value) => (
                  <label
                    key={String(value)}
                    className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[color:var(--pf-border)] px-2 text-[13px] has-[:checked]:border-[color:var(--pf-text-2)] has-[:checked]:bg-white/5"
                  >
                    <input
                      type="radio"
                      name={field.name}
                      checked={field.value === value}
                      onChange={() => field.onChange(value)}
                    />
                    {value ? t("platform.announcements.allTenants") : t("platform.announcements.someTenants")}
                  </label>
                ))}
              </div>
            )}
          />
          {allTenants ? null : (
            <Controller
              control={control}
              name="tenantSlugs"
              render={({ field }) => (
                <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-[color:var(--pf-border)] p-1.5">
                  {tenants === null ? (
                    <p className="px-2 py-1.5 text-[12px] text-[color:var(--pf-muted)]">{t("platform.announcements.tenantsLoading")}</p>
                  ) : (
                    tenants.map((tenant) => (
                      <label key={tenant.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-[13px] hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={field.value.includes(tenant.slug)}
                          onChange={(event) =>
                            field.onChange(
                              event.target.checked
                                ? [...field.value, tenant.slug]
                                : field.value.filter((slug) => slug !== tenant.slug),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{tenant.name}</span>
                        <span className="text-[11px] text-[color:var(--pf-muted)]">{tenant.slug}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            />
          )}
          {fieldError("tenantSlugs")}
        </fieldset>

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
            {isSubmitting
              ? t("common.loading")
              : editing
                ? t("platform.announcements.save")
                : t("platform.announcements.createSubmit")}
          </button>
        </div>
      </form>
    </BackofficeDialog>
  );
}
