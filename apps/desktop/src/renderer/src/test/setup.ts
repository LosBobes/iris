import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
// Initialize i18n (Serbian default) so components using useTranslation render
// real strings in tests instead of raw keys.
import '@/i18n'

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

afterEach(() => {
  cleanup()
})
