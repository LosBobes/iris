import { Cog, Layers, PackageCheck, Recycle, type LucideIcon } from 'lucide-react'
import type { ProcessNodeKind, ProcessStepStatus } from '@/types/process'

interface KindMeta {
  icon: LucideIcon
  /** Border + icon accent, tied to the --iris-proc-* theme tokens (light and dark). */
  accent: string
  iconWrap: string
}

// Class strings are spelled out so Tailwind can see them.
export const KIND_META: Record<ProcessNodeKind, KindMeta> = {
  step: {
    icon: Cog,
    accent: 'border-l-[color:var(--iris-proc-step)]',
    iconWrap: 'text-[color:var(--iris-proc-step)] bg-[color:var(--iris-proc-step)]/10',
  },
  input: {
    icon: Layers,
    accent: 'border-l-[color:var(--iris-proc-input)]',
    iconWrap: 'text-[color:var(--iris-proc-input)] bg-[color:var(--iris-proc-input)]/10',
  },
  product: {
    icon: PackageCheck,
    accent: 'border-l-[color:var(--iris-proc-product)]',
    iconWrap: 'text-[color:var(--iris-proc-product)] bg-[color:var(--iris-proc-product)]/10',
  },
  byproduct: {
    icon: Recycle,
    accent: 'border-l-[color:var(--iris-proc-byproduct)]',
    iconWrap: 'text-[color:var(--iris-proc-byproduct)] bg-[color:var(--iris-proc-byproduct)]/10',
  },
}

export const STATUS_CLASSES: Record<ProcessStepStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-[color:var(--iris-status-active)]/15 text-[color:var(--iris-status-active)]',
  done: 'bg-[color:var(--iris-status-done)]/15 text-[color:var(--iris-status-done)]',
  skipped: 'bg-[color:var(--iris-status-draft)]/15 text-[color:var(--iris-status-draft)] line-through',
}
