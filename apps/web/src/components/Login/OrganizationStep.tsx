import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { LoginShell } from "./LoginShell";
import {
  organizationLoginPath,
  organizationSlugSchema,
  rememberOrganization,
  type OrganizationSlugForm,
} from "@/lib/organization-login";

/**
 * Sign-in step one: the organization. The slug is shape-checked locally, then
 * confirmed against the API, and only an organization that exists moves on to
 * its own sign-in page. The choice is remembered on this device, so this step
 * is normally seen once.
 */
export function OrganizationStep(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Set when step two bounced back here because its slug no longer resolves.
  const bouncedSlug = (location.state as { unknownOrg?: string } | null)?.unknownOrg;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationSlugForm, unknown, { orgSlug: string }>({
    resolver: zodResolver(organizationSlugSchema),
    defaultValues: { orgSlug: bouncedSlug ?? "" },
  });

  const onSubmit = handleSubmit(async ({ orgSlug }) => {
    setServerError(null);
    try {
      const organization = await window.api.getPublicOrganization(orgSlug);
      if (!organization) {
        setError("orgSlug", { message: "auth.orgNotFound" });
        return;
      }
      rememberOrganization(organization.slug);
      navigate(organizationLoginPath(organization.slug), { state: { organization } });
    } catch (error) {
      const details = error instanceof Error && error.message ? ` (${error.message})` : "";
      setServerError(t("auth.backendError", { details }));
    }
  });

  const fieldError = errors.orgSlug?.message
    ? t(errors.orgSlug.message)
    : bouncedSlug && !serverError
      ? t("auth.orgNotFound")
      : null;

  return (
    <LoginShell>
      <div className="mb-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
        {t("auth.eyebrow")}
      </div>
      <h1 className="mb-2 text-[22px] font-medium tracking-[-0.3px] text-foreground">
        {t("auth.welcome")}
      </h1>
      <p className="mb-6 text-[12px] leading-5 text-[color:var(--iris-ink-soft)]">
        {t("auth.orgIntro")}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col" noValidate>
        <div className="mb-7">
          <label
            htmlFor="org-slug"
            className="mb-1.5 block text-[11px] text-[color:var(--iris-ink-soft)]"
          >
            {t("auth.organization")}
          </label>
          <input
            id="org-slug"
            type="text"
            autoComplete="organization"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            placeholder={t("auth.orgPlaceholder")}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "org-slug-error" : undefined}
            disabled={isSubmitting}
            {...register("orgSlug")}
            className="w-full border-0 border-b border-border bg-transparent py-2 text-[14px] text-foreground outline-none transition-colors duration-150 placeholder:text-[color:var(--iris-ink-faint)] focus:border-foreground aria-invalid:border-[color:var(--iris-status-cancelled)]"
          />
          {fieldError ? (
            <p
              id="org-slug-error"
              role="alert"
              className="mt-1.5 text-[11px] text-[color:var(--iris-status-cancelled)]"
            >
              {fieldError}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <div
            role="alert"
            className="animate-iris-shake mb-4 border-l-2 border-[color:var(--iris-status-cancelled)] bg-[color:var(--iris-status-cancelled)]/10 px-3 py-2 text-[12px] text-[color:var(--iris-status-cancelled)]"
          >
            {serverError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="iris-focusable iris-press group relative w-full bg-foreground px-0 py-[11px] text-[13px] font-medium tracking-[0.3px] text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-background/40 border-t-background"
              />
              {t("common.loading")}
            </span>
          ) : (
            <>
              {t("auth.continue")}
              <span
                aria-hidden
                className="ml-1.5 inline-block transition-transform duration-200 ease-out group-hover:translate-x-[3px]"
              >
                →
              </span>
            </>
          )}
        </button>
      </form>
    </LoginShell>
  );
}
