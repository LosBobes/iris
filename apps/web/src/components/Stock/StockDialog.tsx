import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { getOverlayContainer } from '@/lib/overlay-container'
import { cn } from '@/lib/utils'

interface StockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Wider shell for table-like content (stocktake). */
  wide?: boolean
  children: React.ReactNode
}

/** Shared modal shell of the warehouse forms (receipt, stocktake). */
export function StockDialog({
  open,
  onOpenChange,
  title,
  description,
  wide = false,
  children,
}: StockDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={getOverlayContainer()}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[min(var(--stock-dialog-width),calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            wide ? '[--stock-dialog-width:860px]' : '[--stock-dialog-width:640px]',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="text-[15px] font-medium text-foreground">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-[12px] text-[color:var(--iris-ink-soft)]">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t('common.close')}>
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
