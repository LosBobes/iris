import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import type { PlatformTwoFactorSetup } from "@/types/platform";
import { ApiError } from "@/lib/errors";
import {
  BackofficeDialog,
  backofficeError,
  backofficeInputClass,
  backofficePrimaryButtonClass,
  backofficeSmallButtonClass,
} from "./BackofficeDialog";

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "platform.twoFactor.codeRequired"),
});
type CodeForm = z.infer<typeof codeSchema>;

type Step =
  | { kind: "intro" }
  | { kind: "scan"; setup: PlatformTwoFactorSetup }
  | { kind: "codes"; codes: string[] }
  | { kind: "on" };

/**
 * Two-factor sign-in for the signed-in superadmin: start an enrollment (QR
 * code and key for the authenticator app), confirm it with a code, then show
 * the one-time recovery codes once. Turning it off is server-side only
 * (`irisctl reset-platform-2fa`).
 */
export function PlatformTwoFactorDialog({
  enabled,
  onEnabled,
  onClose,
}: {
  enabled: boolean;
  onEnabled: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(enabled ? { kind: "on" } : { kind: "intro" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<CodeForm>({ resolver: zodResolver(codeSchema) });

  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setStep({ kind: "scan", setup: await window.api.setupPlatformTwoFactor() });
    } catch (cause) {
      setError(backofficeError(cause, t("platform.twoFactor.failed")));
    } finally {
      setBusy(false);
    }
  };

  const confirm = handleSubmit(async ({ code }) => {
    setError(null);
    try {
      const result = await window.api.confirmPlatformTwoFactor(code);
      setStep({ kind: "codes", codes: result.recoveryCodes });
      onEnabled();
    } catch (cause) {
      resetField("code");
      setError(
        cause instanceof ApiError && cause.status === 422 && cause.message
          ? cause.message
          : backofficeError(cause, t("platform.twoFactor.failed")),
      );
    }
  });

  const copyCodes = async (codes: string[]): Promise<void> => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the codes stay on screen to copy by hand.
    }
  };

  return (
    <BackofficeDialog
      title={step.kind === "codes" ? t("platform.twoFactor.recoveryTitle") : t("platform.twoFactor.title")}
      description={step.kind === "codes" ? t("platform.twoFactor.recoveryIntro") : t("platform.twoFactor.intro")}
      // The recovery codes are shown only once: closing goes through "done".
      onClose={step.kind === "codes" ? () => undefined : onClose}
    >
      <div className="space-y-4 p-4">
        {error ? (
          <div role="alert" className="rounded border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2 text-[12px]">
            {error}
          </div>
        ) : null}

        {step.kind === "on" ? (
          <>
            <p role="status" className="flex items-center gap-2 text-[14px]">
              <Check className="h-4 w-4 text-[#5cc98a]" />
              {t("platform.twoFactor.enabled")}
            </p>
            <p className="text-[12px] leading-5 text-[color:var(--pf-muted)]">{t("platform.twoFactor.enabledNote")}</p>
          </>
        ) : null}

        {step.kind === "intro" ? (
          <button type="button" disabled={busy} onClick={() => void start()} className={`${backofficePrimaryButtonClass} w-full`}>
            {busy ? t("common.loading") : t("platform.twoFactor.start")}
          </button>
        ) : null}

        {step.kind === "scan" ? (
          <>
            <p className="text-[13px] text-[color:var(--pf-text-2)]">{t("platform.twoFactor.scan")}</p>
            <div className="flex justify-center">
              {/* White quiet zone so phone cameras read it on the dark console. */}
              <img
                src={step.setup.qrCode}
                alt={t("platform.twoFactor.qrAlt")}
                width={200}
                height={200}
                className="rounded-md bg-white p-2"
              />
            </div>
            <div>
              <div className="mb-1 text-[12px] text-[color:var(--pf-text-2)]">{t("platform.twoFactor.secret")}</div>
              <code
                data-testid="totp-secret"
                className="block select-all break-all rounded-md border border-[color:var(--pf-border)] bg-[color:var(--pf-bg)] px-3 py-2 font-mono text-[13px] tracking-[1px]"
              >
                {step.setup.secret}
              </code>
            </div>
            <form onSubmit={confirm} noValidate className="space-y-3">
              <div>
                <label htmlFor="totp-code" className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
                  {t("platform.twoFactor.code")}
                </label>
                <input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  {...register("code")}
                  className={`${backofficeInputClass} font-mono tracking-[3px]`}
                />
                {errors.code?.message ? <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors.code.message)}</p> : null}
              </div>
              <button type="submit" disabled={isSubmitting} className={`${backofficePrimaryButtonClass} w-full`}>
                {isSubmitting ? t("common.loading") : t("platform.twoFactor.confirm")}
              </button>
            </form>
          </>
        ) : null}

        {step.kind === "codes" ? (
          <>
            <ul
              aria-label={t("platform.twoFactor.recoveryTitle")}
              className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-[color:var(--pf-border)] bg-[color:var(--pf-bg)] px-4 py-3 font-mono text-[14px]"
            >
              {step.codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" onClick={() => void copyCodes(step.codes)} className={`${backofficeSmallButtonClass} h-11 flex-1 justify-center`}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t("platform.twoFactor.copied") : t("platform.twoFactor.copy")}
              </button>
              <button type="button" onClick={onClose} className={`${backofficePrimaryButtonClass} flex-1`}>
                {t("platform.twoFactor.done")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </BackofficeDialog>
  );
}
