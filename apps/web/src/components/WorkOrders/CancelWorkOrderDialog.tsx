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

interface CancelWorkOrderDialogProps {
  orderNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function CancelWorkOrderDialog({
  orderNumber,
  open,
  onOpenChange,
  onConfirm,
}: CancelWorkOrderDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('workOrders.cancelDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('workOrders.cancelDialog.confirm', { order: orderNumber })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('workOrders.cancelDialog.keep')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t('workOrders.detail.cancelOrder')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
