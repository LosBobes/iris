import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PlugZap } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import type { OrganizationModules } from '@/types/settings'

interface ModuleGateProps {
  /** The organization module the wrapped route needs. */
  module: keyof OrganizationModules
  children: React.ReactNode
}

/**
 * Route guard for optional organization modules. While the module is off the
 * children are not rendered (so none of their requests fire) and a friendly
 * "Modul nije uključen" state is shown instead. Switching modules is a
 * Backoffice-only action, so there is nothing to enable from here.
 */
export function ModuleGate({ module, children }: ModuleGateProps): React.JSX.Element {
  const { t } = useTranslation()
  const { modules } = useOrganization()
  if (modules[module]) return <>{children}</>

  return (
    <div
      role="status"
      data-testid="module-disabled"
      className="animate-iris-enter mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center"
    >
      <PlugZap className="h-8 w-8 text-[color:var(--iris-ink-mute)]" aria-hidden />
      <h1 className="mt-4 text-[22px] font-normal tracking-[-0.4px] text-foreground">
        {t('modules.disabled.title')}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[color:var(--iris-ink-soft)]">
        {t(`modules.disabled.${module}`)}
      </p>
      <Link
        to="/"
        className="iris-focusable iris-press mt-6 border border-border px-3 py-2 text-[12px] text-foreground hover:bg-muted"
      >
        {t('modules.disabled.home')}
      </Link>
    </div>
  )
}
