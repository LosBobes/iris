import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Loader2, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOverlayContainer } from '@/lib/overlay-container'
import { BackofficeDialog } from '@/components/platform/BackofficeDialog'
import type { ProcessGraph } from '@/types/process'

// The simulator pulls in React Flow; load it only when somebody opens it.
const ProcessSimulator = lazy(() => import('./ProcessSimulator'))

interface ProcessSimulatorButtonProps {
  /** Graph to preview; never modified or saved. */
  graph: ProcessGraph
  /** `backoffice` uses the console's dark dialog shell. */
  variant?: 'app' | 'backoffice'
  disabled?: boolean
}

/** "Simuliraj" button that opens the process simulator in a large dialog. */
export function ProcessSimulatorButton({
  graph,
  variant = 'app',
  disabled,
}: ProcessSimulatorButtonProps): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const body = (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-4 text-[12px] text-[color:var(--iris-ink-soft)]">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
        </div>
      }
    >
      <ProcessSimulator graph={graph} />
    </Suspense>
  )

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <Play aria-hidden /> {t('process.sim.button')}
      </Button>

      {open && variant === 'backoffice' && (
        <BackofficeDialog wide title={t('process.sim.title')} onClose={() => setOpen(false)}>
          {/* `dark` scopes the app's dark tokens to the editor, like the template form. */}
          <div className="dark m-3 rounded-md bg-background p-4 text-foreground">{body}</div>
        </BackofficeDialog>
      )}

      {variant === 'app' && (
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Portal container={getOverlayContainer()}>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-24px)] w-[min(1100px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <DialogPrimitive.Title className="text-[15px] font-medium text-foreground">
                  {t('process.sim.title')}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('common.close')}>
                    <X aria-hidden />
                  </Button>
                </DialogPrimitive.Close>
              </div>
              {body}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  )
}
