import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import type { PlatformAdmin } from "@/types/platform";
import { MAX_PASSWORD_BYTES, isPasswordTooLong } from "@/lib/password";
import { ApiError, formatActionError } from "@/lib/errors";

// Mirrors store.MinPlatformAdminPasswordLength; the API re-checks it.
export const MIN_PLATFORM_PASSWORD_LENGTH = 12;

const schema = z
  .object({
    currentPassword: z.string().min(1, "platform.password.currentRequired"),
    newPassword: z
      .string()
      .min(MIN_PLATFORM_PASSWORD_LENGTH, "platform.password.tooShort")
      .refine((value) => !isPasswordTooLong(value), "platform.password.tooLong"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "platform.password.mismatch",
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "platform.password.sameAsCurrent",
  });
type ChangePasswordForm = z.infer<typeof schema>;

/**
 * Replaces the operator's password. With `required`, it is the whole console:
 * the seeded default account sees nothing else until it has a password of its
 * own. Otherwise it is a dismissible panel opened from the toolbar.
 */
export function PlatformChangePassword({
  required = false,
  onChanged,
  onCancel,
}: {
  required?: boolean;
  onChanged: (admin: PlatformAdmin) => void;
  onCancel?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      const result = await window.api.changePlatformPassword({ currentPassword, newPassword });
      if (result.success && result.admin) onChanged(result.admin);
      else setServerError(result.error ?? t("platform.password.failed"));
    } catch (error) {
      // A rejected password (422) already says exactly what to fix; anything
      // else gets the request code so it can be looked up.
      setServerError(
        error instanceof ApiError && error.status === 422 && error.message
          ? error.message
          : formatActionError(t("platform.password.failedPrefix"), error),
      );
    }
  });

  const inputClass =
    "w-full h-11 rounded-md border border-[color:var(--pf-border)] bg-[color:var(--pf-bg)] px-3 text-[15px] text-[color:var(--pf-text)] outline-none transition-colors duration-[var(--iris-dur-fast)] focus:border-[color:var(--pf-text-2)]";
  const field = (
    name: keyof ChangePasswordForm,
    label: string,
    autoComplete: string,
  ): React.JSX.Element => (
    <div>
      <label htmlFor={`platform-${name}`} className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
        {label}
      </label>
      <input id={`platform-${name}`} type="password" autoComplete={autoComplete} {...register(name)} className={inputClass} />
      {errors[name]?.message ? (
        <p className="mt-1.5 text-[12px] text-[#e66767]">
          {t(errors[name]!.message!, { min: MIN_PLATFORM_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES })}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="animate-iris-enter w-full max-w-[400px] rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] p-6 sm:p-7 text-[color:var(--pf-text)]">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[color:var(--pf-text-2)]" />
        <h1 className="text-[18px] font-medium">{t("platform.password.title")}</h1>
      </div>
      <p className="mb-6 text-[13px] leading-5 text-[color:var(--pf-text-2)]">
        {required ? t("platform.password.requiredIntro") : t("platform.password.intro")}
      </p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {field("currentPassword", t("platform.password.current"), "current-password")}
        {field("newPassword", t("platform.password.new"), "new-password")}
        {field("confirmPassword", t("platform.password.confirm"), "new-password")}
        <p className="text-[12px] leading-5 text-[color:var(--pf-muted)]">
          {t("platform.password.hint", { min: MIN_PLATFORM_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES })}
        </p>
        {serverError ? (
          <p role="alert" className="animate-iris-shake rounded-md border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2.5 text-[13px] leading-5">
            {serverError}
          </p>
        ) : null}
        <div className="flex gap-2">
          {onCancel && !required ? (
            <button
              type="button"
              onClick={onCancel}
              className="iris-focusable h-11 flex-1 rounded-md border border-[color:var(--pf-border)] text-[14px] text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]"
            >
              {t("common.cancel")}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="iris-focusable flex-1 h-11 rounded-md bg-[color:var(--pf-text)] text-[14px] font-medium text-[color:var(--pf-bg)] hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? t("common.loading") : t("platform.password.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
