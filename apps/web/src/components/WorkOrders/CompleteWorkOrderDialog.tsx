import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface CompleteWorkOrderDialogProps {
  orderNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Confirms closing a work order (the move into "completed"). The transition is
 * one-way, so an accidental click on the advance-status button would otherwise
 * take the order out of production with no way back.
 */
export function CompleteWorkOrderDialog({
  orderNumber,
  open,
  onOpenChange,
  onConfirm,
}: CompleteWorkOrderDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('workOrders.completeDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('workOrders.completeDialog.confirm', { order: orderNumber })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('workOrders.completeDialog.keep')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('workOrders.completeDialog.confirmAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
