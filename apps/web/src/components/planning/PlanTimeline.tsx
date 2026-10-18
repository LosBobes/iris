import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Crown, Lock } from 'lucide-react'
import {
  dayWindow,
  layoutLanes,
  minutesOfLocal,
  orderHue,
  timeOfLocal,
  toMinutes,
  isoWeekday,
  fromMinutes,
} from '@/lib/planning/time'
import { cn } from '@/lib/utils'
import type { Machine, PlanAssignment, WorkingHours } from '@/types/planning'

export type TimelineView = 'machines' | 'people'

interface PlanTimelineProps {
  date: string
  assignments: readonly PlanAssignment[]
  view: TimelineView
  workingHours?: WorkingHours
  /** userId to username. */
  userNames: ReadonlyMap<string, string>
  /** Units in service; in the machines view they get a row even without blocks. */
  machines?: readonly Machine[]
  selectedId?: string | null
  onSelect: (assignment: PlanAssignment) => void
}

const LANE_HEIGHT = 40
const LABEL_WIDTH = 132
const HOUR_WIDTH = 84

interface Row {
  key: string
  label: string
  items: { assignment: PlanAssignment; isLead: boolean }[]
}

function buildRows(
  view: TimelineView,
  assignments: readonly PlanAssignment[],
  userNames: ReadonlyMap<string, string>,
  machines: readonly Machine[],
  unassignedLabel: string,
): Row[] {
  const rows = new Map<string, Row>()
  if (view === 'machines') {
    for (const machine of machines) {
      if (machine.inService) rows.set(machine.id, { key: machine.id, label: machine.name, items: [] })
    }
    for (const assignment of assignments) {
      const key = assignment.machineId ?? `name:${assignment.machineName}`
      const row = rows.get(key) ?? {
        key,
        label: assignment.machineName || unassignedLabel,
        items: [],
      }
      row.items.push({ assignment, isLead: false })
      rows.set(key, row)
    }
  } else {
    for (const assignment of assignments) {
      for (const userId of assignment.userIds) {
        const row = rows.get(userId) ?? { key: userId, label: userNames.get(userId) ?? userId, items: [] }
        row.items.push({ assignment, isLead: assignment.leadUserId === userId })
        rows.set(userId, row)
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label, 'sr-Latn'))
}

/** Day timeline: one row per machine or person, blocks positioned by start/end inside the shift. */
export function PlanTimeline({
  date,
  assignments,
  view,
  workingHours,
  userNames,
  machines = [],
  selectedId,
  onSelect,
}: PlanTimelineProps): React.JSX.Element {
  const { t } = useTranslation()
  const bounds = useMemo(() => dayWindow(date, workingHours, assignments), [date, workingHours, assignments])
  const span = bounds.end - bounds.start
  const hours = span / 60
  const rows = useMemo(
    () => buildRows(view, assignments, userNames, machines, t('planning.timeline.noMachine')),
    [view, assignments, userNames, machines, t],
  )
  const breaks = useMemo(
    () => workingHours?.days.find((day) => day.weekday === isoWeekday(date))?.breaks ?? [],
    [workingHours, date],
  )

  if (assignments.length === 0) {
    return (
      <p className="border border-border bg-card px-4 py-10 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
        {t('planning.timeline.empty')}
      </p>
    )
  }

  const pct = (minutes: number): number => ((minutes - bounds.start) / span) * 100
  const ticks = Array.from({ length: hours + 1 }, (_, i) => bounds.start + i * 60)

  return (
    <div className="overflow-x-auto border border-border bg-card" data-testid="plan-timeline">
      <div style={{ minWidth: LABEL_WIDTH + hours * HOUR_WIDTH }}>
        <div className="flex border-b border-border text-[10px] text-[color:var(--iris-ink-mute)]">
          <div style={{ width: LABEL_WIDTH }} className="sticky left-0 z-20 shrink-0 bg-card px-3 py-1.5">
            {view === 'machines' ? t('planning.timeline.machine') : t('planning.timeline.person')}
          </div>
          <div className="relative h-6 flex-1" aria-hidden>
            {ticks.map((tick) => (
              <span
                key={tick}
                className="tnum absolute top-1.5 -translate-x-1/2 first:translate-x-0"
                style={{ left: `${pct(tick)}%` }}
              >
                {fromMinutes(tick)}
              </span>
            ))}
          </div>
        </div>
        <ul>
          {rows.map((row) => {
            const { lanes, count } = layoutLanes(
              row.items.map(({ assignment }) => ({
                id: assignment.id,
                start: minutesOfLocal(assignment.start),
                end: minutesOfLocal(assignment.end),
              })),
            )
            return (
              <li
                key={row.key}
                aria-label={row.label}
                className="flex border-b border-[color:var(--iris-border-soft)] last:border-b-0"
              >
                <div
                  style={{ width: LABEL_WIDTH }}
                  className="sticky left-0 z-20 shrink-0 truncate bg-card px-3 py-2 text-[12px]"
                  title={row.label}
                >
                  {row.label}
                </div>
                <div className="relative flex-1" style={{ height: count * LANE_HEIGHT }}>
                  {ticks.slice(1, -1).map((tick) => (
                    <span
                      key={tick}
                      aria-hidden
                      className="absolute inset-y-0 w-px bg-[color:var(--iris-border-soft)]"
                      style={{ left: `${pct(tick)}%` }}
                    />
                  ))}
                  {breaks.map((brk) => {
                    const from = toMinutes(brk.start)
                    const to = toMinutes(brk.end)
                    if (Number.isNaN(from) || Number.isNaN(to)) return null
                    return (
                      <span
                        key={`${brk.start}-${brk.end}`}
                        aria-hidden
                        className="absolute inset-y-0 bg-muted/60"
                        style={{ left: `${pct(from)}%`, width: `${((to - from) / span) * 100}%` }}
                      />
                    )
                  })}
                  {row.items.map(({ assignment, isLead }) => {
                    const start = minutesOfLocal(assignment.start)
                    const end = minutesOfLocal(assignment.end)
                    const hue = orderHue(assignment.workOrderId)
                    const lane = lanes.get(assignment.id) ?? 0
                    const range = `${timeOfLocal(assignment.start)}–${timeOfLocal(assignment.end)}`
                    return (
                      <button
                        key={`${row.key}:${assignment.id}`}
                        type="button"
                        onClick={() => onSelect(assignment)}
                        aria-label={t('planning.timeline.blockAria', {
                          order: assignment.orderNumber,
                          step: assignment.stepLabel,
                          time: range,
                          machine: assignment.machineName || t('planning.timeline.noMachine'),
                        })}
                        aria-pressed={selectedId === assignment.id}
                        data-locked={assignment.locked ? 'true' : undefined}
                        style={{
                          left: `${pct(start)}%`,
                          width: `${Math.max(((end - start) / span) * 100, 1)}%`,
                          top: lane * LANE_HEIGHT + 3,
                          height: LANE_HEIGHT - 6,
                          backgroundColor: `hsl(${hue} 65% 50% / 0.22)`,
                          borderColor: `hsl(${hue} 55% 45%)`,
                        }}
                        className={cn(
                          'iris-focusable absolute flex flex-col justify-center overflow-hidden border-l-4 border-y border-r px-1.5 text-left text-[11px] leading-tight hover:brightness-95',
                          selectedId === assignment.id && 'ring-2 ring-foreground',
                          assignment.locked && 'border-dashed',
                        )}
                      >
                        <span className="flex items-center gap-1 truncate font-medium">
                          {assignment.locked && <Lock className="size-3 shrink-0" aria-hidden />}
                          {isLead && <Crown className="size-3 shrink-0" aria-hidden />}
                          <span className="truncate">{assignment.orderNumber}</span>
                          {assignment.parts > 1 && (
                            <span className="tnum shrink-0 text-[10px] text-[color:var(--iris-ink-soft)]">
                              {assignment.part}/{assignment.parts}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-[10px] text-[color:var(--iris-ink-soft)]">
                          {assignment.stepLabel} · {range}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
