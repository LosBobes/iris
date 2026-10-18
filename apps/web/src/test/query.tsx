import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

/** A fresh, isolated query cache for one test: no retries, no shared state. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * Wrapper component providing a query client. Pass `client` to inspect or
 * pre-seed the cache; otherwise each call gets a fresh one.
 */
export function QueryWrapper({
  children,
  client,
}: {
  children: ReactNode
  client?: QueryClient
}): React.JSX.Element {
  return (
    <QueryClientProvider client={client ?? createTestQueryClient()}>{children}</QueryClientProvider>
  )
}

/** Builds a `wrapper` for render/renderHook, optionally nesting another one. */
export function queryWrapper(
  client: QueryClient = createTestQueryClient(),
  Inner?: React.ComponentType<{ children: ReactNode }>,
): React.ComponentType<{ children: ReactNode }> {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {Inner ? <Inner>{children}</Inner> : children}
      </QueryClientProvider>
    )
  }
}

/** `render` inside a fresh QueryClientProvider (retry off). */
export function renderWithQueryClient(
  ui: ReactElement,
  options: Omit<RenderOptions, 'queries'> & { client?: QueryClient } = {},
) {
  const { client, wrapper, ...rest } = options
  return render(ui, {
    ...rest,
    wrapper: queryWrapper(client, wrapper as React.ComponentType<{ children: ReactNode }> | undefined),
  })
}

/** `renderHook` inside a fresh QueryClientProvider (retry off). */
export function renderHookWithQueryClient<Result, Props>(
  hook: (props: Props) => Result,
  options: {
    client?: QueryClient
    wrapper?: React.ComponentType<{ children: ReactNode }>
    initialProps?: Props
  } = {},
) {
  const { client, wrapper, ...rest } = options
  return renderHook(hook, { ...rest, wrapper: queryWrapper(client, wrapper) })
}
