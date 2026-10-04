import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { UnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

type UnsavedChangesDialogProps = Pick<
  UnsavedChangesGuard,
  "blocked" | "confirmLeave" | "stay"
>;

/** Confirmation shown when the operator tries to leave a dirty form. */
export function UnsavedChangesDialog({
  blocked,
  confirmLeave,
  stay,
}: UnsavedChangesDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={blocked}
      onOpenChange={(open) => {
        if (!open) stay();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("unsavedChanges.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("unsavedChanges.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("unsavedChanges.stay")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmLeave}>
            {t("unsavedChanges.leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
