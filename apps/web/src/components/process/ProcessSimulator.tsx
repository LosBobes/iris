import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, CircleAlert, Pause, Play, RotateCcw, StepForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { percentToScale } from '@/lib/motion'
import {
  analyzeProcess,
  formatSimQuantity,
  maxPosition,
  nodeStatesAt,
  planSimulation,
  simulationGraph,
  waveAt,
  type SimItem,
  type SimTotal,
} from '@/lib/process/simulation'
import type { ProcessGraph } from '@/types/process'
import ProcessGraphEditor from './ProcessGraphEditor'

const SPEEDS = [0.5, 1, 2] as const
/** One playback position (a wave starting or finishing) at 1x. */
const BASE_TICK_MS = 1100

type Tab = 'flow' | 'steps' | 'test'

const noop = (): void => {}

function itemsText(items: SimItem[], empty: string): string {
  if (items.length === 0) return empty
  return items.map((item) => `${item.label} ${formatSimQuantity(item.quantity, item.unit)}`).join(', ')
}

function totalsText(totals: SimTotal[], empty: string, unknownLabel: (count: number) => string): string {
  if (totals.length === 0) return empty
  return totals
    .map((total) => {
      const known = total.quantity > 0 || total.unknown === 0 ? formatSimQuantity(total.quantity, total.unit) : ''
      const unknown = total.unknown > 0 ? unknownLabel(total.unknown) : ''
      return [known, unknown].filter(Boolean).join(' ')
    })
    .join(' · ')
}

export interface ProcessSimulatorProps {
  /** The graph to preview. It is only read, never changed or saved. */
  graph: ProcessGraph
}

/**
 * Read-only process tester and simulator. Plays the graph wave by wave
 * (running, then finished) next to a read-only graph view, with a tester tab
 * listing structural problems.
 */
export function ProcessSimulator({ graph }: ProcessSimulatorProps): React.JSX.Element {
  const { t } = useTranslation()
  const uid = useId()
  const [tab, setTab] = useState<Tab>('flow')
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const [quantityText, setQuantityText] = useState('1')
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [highlight, setHighlight] = useState<string[]>([])

  const parsed = Number(quantityText)
  const quantity = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1

  const plan = useMemo(() => planSimulation(graph, { quantity, skipped }), [graph, quantity, skipped])
  const issues = useMemo(() => analyzeProcess(graph), [graph])
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')

  const max = maxPosition(plan)
  const at = Math.min(position, max)
  const running = playing && at < max
  const finished = max > 0 && at >= max
  const wave = waveAt(at)

  // Cleared on pause, on reaching the end and on unmount.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setPosition((current) => Math.min(current + 1, max)), BASE_TICK_MS / speed)
    return () => window.clearInterval(id)
  }, [running, speed, max])

  const states = useMemo(() => nodeStatesAt(graph, plan, at), [graph, plan, at])
  const view = useMemo(() => simulationGraph(graph, states, quantity), [graph, states, quantity])
  const steps = useMemo(() => graph.nodes.filter((node) => node.kind === 'step'), [graph.nodes])

  const play = (): void => {
    if (at >= max) setPosition(0)
    setPlaying(true)
  }
  const stepForward = (): void => {
    setPlaying(false)
    setPosition(Math.min(at + 1, max))
  }
  const reset = (): void => {
    setPlaying(false)
    setPosition(0)
  }
  const toggleSkip = (id: string, skip: boolean): void => {
    const next = new Set(skipped)
    if (skip) next.add(id)
    else next.delete(id)
    setSkipped(next)
    reset()
  }
  const selectIssue = (nodeIds: string[]): void => {
    setHighlight((current) => (current.join() === nodeIds.join() ? [] : nodeIds))
  }

  const emptyText = t('process.sim.nothing')
  const unknownLabel = (count: number): string => t('process.sim.summary.unknown', { count })
  const unusable = plan.cyclic || steps.length === 0

  const tabs: { id: Tab; label: string }[] = [
    { id: 'flow', label: t('process.sim.tabs.flow') },
    { id: 'steps', label: t('process.sim.tabs.steps') },
    {
      id: 'test',
      label: `${t('process.sim.tabs.test')}${issues.length > 0 ? ` (${issues.length})` : ''}`,
    },
  ]

  return (
    <div className="space-y-3" data-testid="process-simulator">
      <p className="text-[12px] text-[color:var(--iris-ink-soft)]">{t('process.sim.description')}</p>

      <div role="toolbar" aria-label={t('process.sim.controls.label')} className="flex flex-wrap items-end gap-2">
        {running ? (
          <Button type="button" size="sm" onClick={() => setPlaying(false)}>
            <Pause aria-hidden /> {t('process.sim.controls.pause')}
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={unusable} onClick={play}>
            <Play aria-hidden /> {t('process.sim.controls.play')}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" disabled={unusable || finished} onClick={stepForward}>
          <StepForward aria-hidden /> {t('process.sim.controls.step')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={at === 0 && !playing} onClick={reset}>
          <RotateCcw aria-hidden /> {t('process.sim.controls.reset')}
        </Button>

        <div role="radiogroup" aria-label={t('process.sim.controls.speed')} className="flex rounded-sm border border-border p-0.5">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={speed === value}
              onClick={() => setSpeed(value)}
              className={cn(
                'iris-focusable h-6 rounded-[2px] px-2 text-[11px] tabular-nums transition-colors',
                speed === value ? 'bg-muted text-foreground' : 'text-[color:var(--iris-ink-soft)] hover:text-foreground',
              )}
            >
              {value}×
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor={`${uid}-qty`} className="text-[12px]">
            {t('process.sim.controls.quantity')}
          </Label>
          <Input
            id={`${uid}-qty`}
            type="number"
            min={1}
            step="any"
            inputMode="decimal"
            className="h-8 w-20"
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
            onBlur={() => setQuantityText(String(quantity))}
            onKeyDown={(event) => {
              // Never let Enter submit a surrounding template form.
              if (event.key === 'Enter') event.preventDefault()
            }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-[color:var(--iris-ink-soft)]">
          <span>{t('process.sim.progress')}</span>
          <span className="tnum">
            {wave > 0 ? t('process.sim.waveOf', { current: wave, total: plan.ticks.length }) : t('process.sim.notStarted')}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('process.sim.progress')}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={at}
          className="h-1.5 w-full overflow-hidden bg-muted"
        >
          <div
            className="iris-bar h-full w-full bg-[color:var(--iris-status-done)]"
            style={
              {
                '--iris-bar': max > 0 ? percentToScale((at / max) * 100) : 0,
                scale: `${max > 0 ? percentToScale((at / max) * 100) : 0} 1`,
              } as React.CSSProperties
            }
          />
        </div>
      </div>

      {plan.cyclic && (
        <p role="alert" className="text-[12px] text-destructive">
          {t('process.sim.cyclic')}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div aria-label={t('process.sim.view')} className="min-w-0">
          <ProcessGraphEditor
            mode="order"
            readOnly
            value={view}
            onChange={noop}
            simStates={states}
            highlightIds={highlight}
          />
        </div>

        <aside className="flex min-w-0 flex-col border border-border bg-card text-[12px]">
          <div role="tablist" aria-label={t('process.sim.tabs.label')} className="flex border-b border-border">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`${uid}-tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`${uid}-panel`}
                onClick={() => setTab(item.id)}
                className={cn(
                  'iris-focusable flex-1 border-b-2 px-2 py-2 text-[12px] transition-colors',
                  tab === item.id
                    ? 'border-[color:var(--iris-accent)] text-foreground'
                    : 'border-transparent text-[color:var(--iris-ink-soft)] hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`${uid}-panel`}
            aria-labelledby={`${uid}-tab-${tab}`}
            key={tab}
            className="animate-iris-rise max-h-[420px] min-h-[160px] flex-1 space-y-3 overflow-y-auto p-3 lg:max-h-[470px]"
          >
            {tab === 'flow' && (
              <>
                {wave === 0 && <p className="text-[color:var(--iris-ink-soft)]">{t('process.sim.notStarted')}</p>}
                <ol aria-live="polite" className="space-y-2">
                  {plan.ticks.slice(0, wave).map((tick) => {
                    const done = at >= tick.index * 2
                    return (
                      <li key={tick.index} className="animate-iris-rise space-y-0.5 border-l-2 border-border pl-2">
                        <div className="font-medium text-foreground">
                          {t('process.sim.wave', { n: tick.index })}:{' '}
                          {tick.steps
                            .map((step) => (step.skipped ? t('process.sim.skippedStep', { label: step.label }) : step.label))
                            .join(', ')}
                          <span className="ml-2 text-[10px] font-normal uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                            {done ? t('process.sim.finished') : t('process.sim.running')}
                          </span>
                        </div>
                        <div className="text-[color:var(--iris-ink-soft)]">
                          {t('process.sim.consumed')}: {itemsText(tick.consumed, emptyText)}
                        </div>
                        {done && (
                          <div className="animate-iris-rise text-[color:var(--iris-ink-soft)]">
                            {t('process.sim.produced')}: {itemsText(tick.products, emptyText)}
                            {tick.byproducts.length > 0 &&
                              ` · ${t('process.sim.byproducts')}: ${itemsText(tick.byproducts, emptyText)}`}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>

                {finished && (
                  <section aria-label={t('process.sim.summary.title')} className="animate-iris-rise space-y-1.5 border-t border-border pt-3">
                    <h3 className="text-[11px] font-medium uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                      {t('process.sim.summary.title')}{' '}
                      <span className="font-normal normal-case tracking-normal">
                        ({t('process.sim.summary.perQuantity', { quantity })})
                      </span>
                    </h3>
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-border">
                        {(
                          [
                            ['inputs', plan.totals.inputs],
                            ['products', plan.totals.products],
                            ['byproducts', plan.totals.byproducts],
                          ] as const
                        ).map(([key, totals]) => (
                          <tr key={key}>
                            <th scope="row" className="py-1 pr-2 align-top font-normal text-[color:var(--iris-ink-soft)]">
                              {t(`process.sim.summary.${key}`)}
                            </th>
                            <td className="tnum py-1 text-right text-foreground">
                              {totalsText(totals, t('process.sim.summary.none'), unknownLabel)}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <th scope="row" className="py-1 pr-2 align-top font-normal text-[color:var(--iris-ink-soft)]">
                            {t('process.sim.summary.yield')}
                          </th>
                          <td className="tnum py-1 text-right text-foreground">
                            {plan.yieldPercent === null ? '—' : `${plan.yieldPercent}%`}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {plan.yieldPercent === null && (
                      <p className="text-[11px] text-[color:var(--iris-ink-mute)]">
                        {t('process.sim.summary.yieldUnavailable')}
                      </p>
                    )}
                  </section>
                )}
              </>
            )}

            {tab === 'steps' && (
              <>
                <p className="text-[color:var(--iris-ink-soft)]">{t('process.sim.skipHint')}</p>
                {steps.length === 0 ? (
                  <p className="text-[color:var(--iris-ink-soft)]">{t('process.sim.noSteps')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {steps.map((step) => (
                      <li key={step.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`${uid}-skip-${step.id}`}
                          checked={skipped.has(step.id)}
                          aria-label={t('process.sim.skipAria', { label: step.label })}
                          onCheckedChange={(checked) => toggleSkip(step.id, checked === true)}
                        />
                        <Label htmlFor={`${uid}-skip-${step.id}`} className="flex-1 truncate text-[12px] font-normal">
                          {step.label}
                        </Label>
                        <span className="text-[10px] uppercase tracking-[0.5px] text-[color:var(--iris-ink-mute)]">
                          {t('process.sim.skip')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {tab === 'test' && (
              <>
                <h3 className="sr-only">{t('process.sim.test.title')}</h3>
                {issues.length === 0 ? (
                  <p className="animate-iris-pop flex items-center gap-2 text-[color:var(--iris-status-done)]">
                    <Check className="size-4" aria-hidden /> {t('process.sim.test.ok')}
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-[color:var(--iris-ink-mute)]">{t('process.sim.test.hint')}</p>
                    {(
                      [
                        ['errors', errors, CircleAlert, 'text-destructive'],
                        ['warnings', warnings, AlertTriangle, 'text-amber-600 dark:text-amber-400'],
                      ] as const
                    ).map(([key, list, Icon, tone]) =>
                      list.length === 0 ? null : (
                        <section key={key} aria-label={t(`process.sim.test.${key}`)} className="space-y-1">
                          <h4 className={cn('text-[11px] font-medium uppercase tracking-[1px]', tone)}>
                            {t(`process.sim.test.${key}`)} ({list.length})
                          </h4>
                          <ul className="space-y-1">
                            {list.map((issue, index) => {
                              const selectable = issue.nodeIds.length > 0
                              const active = selectable && highlight.join() === issue.nodeIds.join()
                              return (
                                <li key={`${issue.code}-${issue.nodeIds.join()}-${index}`} className="animate-iris-rise">
                                  <button
                                    type="button"
                                    disabled={!selectable}
                                    aria-pressed={selectable ? active : undefined}
                                    onClick={() => selectIssue(issue.nodeIds)}
                                    className={cn(
                                      'iris-focusable flex w-full items-start gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors',
                                      active ? 'border-[color:var(--iris-accent)] bg-muted' : 'border-border',
                                      selectable ? 'hover:bg-muted/60' : 'cursor-default',
                                    )}
                                  >
                                    <Icon className={cn('mt-0.5 size-3.5 shrink-0', tone)} aria-hidden />
                                    <span className="text-foreground">{issue.message}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </section>
                      ),
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default ProcessSimulator
