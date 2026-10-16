import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { LOGIN_PATH } from "@/lib/organization-login";
import type { PlatformAdmin } from "@/types/platform";
import { BackofficeScreen } from "./BackofficeScreen";

const schema = z.object({
  username: z.string().trim().min(1, "platform.login.usernameRequired"),
  password: z.string().min(1, "platform.login.passwordRequired"),
});
type PlatformLoginForm = z.infer<typeof schema>;

export function PlatformLogin({ onSignedIn }: { onSignedIn: (admin: PlatformAdmin) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlatformLoginForm>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await window.api.platformLogin(values);
      if (result.success && result.admin) {
        onSignedIn(result.admin);
      } else {
        setServerError(result.error ?? t("platform.login.failed"));
      }
    } catch (error) {
      setServerError(error instanceof Error && error.message ? error.message : t("platform.login.failed"));
    }
  });

  const inputClass =
    "w-full h-11 rounded-md border border-[color:var(--pf-border)] bg-[color:var(--pf-bg)] px-3 text-[15px] text-[color:var(--pf-text)] outline-none focus:border-[color:var(--pf-text-2)]";

  return (
    <BackofficeScreen>
      <div className="w-full max-w-[400px] rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[color:var(--pf-text-2)]" />
          <h1 className="text-[18px] font-medium">{t("platform.login.title")}</h1>
        </div>
        <p className="mb-6 text-[13px] leading-5 text-[color:var(--pf-text-2)]">{t("platform.login.intro")}</p>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="platform-username" className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
              {t("platform.login.username")}
            </label>
            <input id="platform-username" autoComplete="username" autoCapitalize="none" spellCheck={false} {...register("username")} className={inputClass} />
            {errors.username?.message ? (
              <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors.username.message)}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="platform-password" className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
              {t("platform.login.password")}
            </label>
            <input id="platform-password" type="password" autoComplete="current-password" {...register("password")} className={inputClass} />
            {errors.password?.message ? (
              <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors.password.message)}</p>
            ) : null}
          </div>
          {serverError ? (
            <p role="alert" className="rounded-md border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2.5 text-[13px] leading-5">
              {serverError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="iris-focusable w-full h-11 rounded-md bg-[color:var(--pf-text)] text-[14px] font-medium text-[color:var(--pf-bg)] hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? t("common.loading") : t("platform.login.submit")}
          </button>
        </form>
        <Link to={LOGIN_PATH} className="iris-focusable mt-5 flex min-h-10 items-center justify-center text-[13px] text-[color:var(--pf-muted)] hover:text-[color:var(--pf-text-2)]">
          {t("platform.login.back")}
        </Link>
      </div>
    </BackofficeScreen>
  );
}
