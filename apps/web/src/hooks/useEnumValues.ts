import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EnumField, EnumValue, EnumValueInput } from '@/types/work-order'

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

export function useEnumValues(): UseEnumValuesResult {
  const [values, setValues] = useState<EnumValue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const next = await window.api.getEnumValues()
    setValues(next)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    window.api
      .getEnumValues()
      .then((next) => {
        if (active) setValues(next)
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Greška pri učitavanju šifarnika.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

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
      loading,
      error,
      optionsFor,
      labelFor,
      reload,
      createValue,
      updateValue,
      deleteValue,
    }),
    [values, loading, error, optionsFor, labelFor, reload, createValue, updateValue, deleteValue],
  )
}
