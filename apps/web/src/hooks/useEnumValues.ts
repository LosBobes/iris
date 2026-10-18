import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { EnumField, EnumValue, EnumValueInput } from '@/types/work-order'
import i18n from '@/i18n'
import { queryKeys, REFERENCE_STALE_TIME_MS } from '@/lib/query-client'

export interface EnumOption {
  value: string
  label: string
  isBuiltin: boolean
}

export interface UseEnumValuesResult {
  values: EnumValue[]
  loading: boolean
  error: string | null
  /** Built-ins first, then custom values, for a single field. */
  optionsFor: (field: EnumField) => EnumOption[]
  /** Resolves a stored value to its display label (falls back to the raw value). */
  labelFor: (field: EnumField, value: string | null | undefined) => string
  reload: () => Promise<void>
  createValue: (input: EnumValueInput) => Promise<void>
  updateValue: (id: string, input: EnumValueInput) => Promise<void>
  deleteValue: (id: string) => Promise<void>
}

const EMPTY: EnumValue[] = []

/**
 * The managed enum values (built-ins + admin-added). Cached for 5 minutes and
 * shared by every caller, so the work-order form and print sheet using it
 * several times cost one request.
 */
export function useEnumValues(): UseEnumValuesResult {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.enumValues,
    queryFn: () => window.api.getEnumValues(),
    staleTime: REFERENCE_STALE_TIME_MS,
  })
  const values = query.data ?? EMPTY
  let error: string | null = null
  if (query.error) {
    error = query.error instanceof Error ? query.error.message : i18n.t('common.loadEnumsError')
  }

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.enumValues })
  }, [queryClient])

  const optionsFor = useCallback(
    (field: EnumField): EnumOption[] =>
      values
        .filter((entry) => entry.field === field)
        .map((entry) => ({
          value: entry.value,
          label: entry.label,
          isBuiltin: entry.isBuiltin,
        })),
    [values],
  )

  const labelFor = useCallback(
    (field: EnumField, value: string | null | undefined): string => {
      if (value == null || value === '') return ''
      const match = values.find((entry) => entry.field === field && entry.value === value)
      return match?.label ?? value
    },
    [values],
  )

  // Each mutation refreshes the shared cache before resolving, so callers that
  // await it see the new list.
  const createValue = useCallback(
    async (input: EnumValueInput) => {
      await window.api.createEnumValue(input)
      await reload()
    },
    [reload],
  )

  const updateValue = useCallback(
    async (id: string, input: EnumValueInput) => {
      await window.api.updateEnumValue(id, input)
      await reload()
    },
    [reload],
  )

  const deleteValue = useCallback(
    async (id: string) => {
      await window.api.deleteEnumValue(id)
      await reload()
    },
    [reload],
  )

  return useMemo(
    () => ({
      values,
      loading: query.isPending,
      error,
      optionsFor,
      labelFor,
      reload,
      createValue,
      updateValue,
      deleteValue,
    }),
    [values, query.isPending, error, optionsFor, labelFor, reload, createValue, updateValue, deleteValue],
  )
}
