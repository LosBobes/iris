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

interface DeleteWorkOrderDialogProps {
  orderNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteWorkOrderDialog({
  orderNumber,
  open,
  onOpenChange,
  onConfirm,
}: DeleteWorkOrderDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Brisanje radnog naloga</AlertDialogTitle>
          <AlertDialogDescription>
            Da li ste sigurni da želite da obrišete radni nalog {orderNumber}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Otkaži</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Obriši
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
