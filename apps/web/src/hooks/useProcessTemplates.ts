import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reportUnexpectedError } from '@/lib/errors'
import type { ProcessTemplate, ProcessTemplateInput } from '@/types/process'

interface UseProcessTemplates {
  templates: ProcessTemplate[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  remove: (id: string) => Promise<void>
  setDefault: (template: ProcessTemplate) => Promise<void>
}

/** Process templates for the signed-in organization (window.api.*ProcessTemplate*). */
export function useProcessTemplates(): UseProcessTemplates {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setTemplates(await window.api.getProcessTemplates())
      setError(null)
    } catch (cause) {
      reportUnexpectedError('useProcessTemplates.load', cause)
      setError(t('process.templates.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  const remove = useCallback(
    async (id: string) => {
      await window.api.deleteProcessTemplate(id)
      await reload()
    },
    [reload],
  )

  const setDefault = useCallback(
    async (template: ProcessTemplate) => {
      const input: ProcessTemplateInput = {
        name: template.name,
        description: template.description,
        isDefault: true,
        graph: template.graph,
      }
      await window.api.updateProcessTemplate(template.id, input)
      await reload()
    },
    [reload],
  )

  return { templates, loading, error, reload, remove, setDefault }
}
