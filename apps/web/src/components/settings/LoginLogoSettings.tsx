import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { LoginLogoUpload } from "@/types/settings";

// Mirrors the API's limits (iris-api/internal/store/login_logo.go), so a wrong
// file is caught before it is uploaded; the server still re-checks the bytes.
export const MAX_LOGIN_LOGO_BYTES = 512 * 1024;
const ACCEPTED_TYPES: LoginLogoUpload["contentType"][] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Admin-only: the image the organization's users see on the sign-in page
 * (/login/<slug>). Without one, that page shows the organization name.
 */
export function LoginLogoSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    window.api
      .getLoginLogo()
      .then((blob) => {
        if (!active) return;
        objectUrl = blob ? URL.createObjectURL(blob) : null;
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) toast.error(t("settings.loginLogo.loadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [refresh, t]);

  const failed = (error: unknown): void => {
    toast.error(
      error instanceof Error && error.message.trim() !== ""
        ? `${t("settings.loginLogo.saveError")}: ${error.message}`
        : t("settings.loginLogo.saveError"),
    );
  };

  const upload = async (file: File): Promise<void> => {
    const contentType = file.type as LoginLogoUpload["contentType"];
    if (!ACCEPTED_TYPES.includes(contentType)) {
      toast.error(t("settings.loginLogo.wrongType"));
      return;
    }
    if (file.size > MAX_LOGIN_LOGO_BYTES) {
      toast.error(t("settings.loginLogo.tooLarge"));
      return;
    }
    setBusy(true);
    try {
      await window.api.updateLoginLogo({ contentType, data: await readAsBase64(file) });
      toast.success(t("settings.loginLogo.saved"));
      setRefresh((n) => n + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await window.api.deleteLoginLogo();
      toast.success(t("settings.loginLogo.removed"));
      setRefresh((n) => n + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <ImageIcon size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.loginLogo.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.loginLogo.hint")}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-sm border border-dashed border-border bg-white p-3 sm:w-48">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[color:var(--iris-ink-mute)]" />
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={t("settings.loginLogo.preview")}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-[color:var(--iris-ink-faint)]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 space-y-1 text-[12px] text-[color:var(--iris-ink-soft)]">
          {!loading && !previewUrl ? <p>{t("settings.loginLogo.empty")}</p> : null}
          <p>{t("settings.loginLogo.formats")}</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          data-testid="login-logo-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        {previewUrl ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="iris-focusable iris-press inline-flex items-center justify-center gap-2 border border-border px-4 py-2 text-[12px] font-medium text-foreground hover:bg-black/[0.03] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("settings.loginLogo.remove")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || loading}
          className="iris-focusable iris-press inline-flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {previewUrl ? t("settings.loginLogo.replace") : t("settings.loginLogo.upload")}
        </button>
      </div>
    </section>
  );
}
