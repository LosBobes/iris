import { useCallback, useSyncExternalStore } from 'react'
import {
  getPwaInstallState,
  promptInstall,
  subscribePwaInstall,
  type PwaInstallState,
} from '@/lib/pwa'

export function usePwaInstall(): {
  state: PwaInstallState
  install: () => Promise<boolean>
} {
  const state = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallState,
    () => 'unavailable' as const,
  )
  const install = useCallback(() => promptInstall(), [])
  return { state, install }
}
