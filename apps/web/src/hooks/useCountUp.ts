import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3)
}

/**
 * Counts from 0 up to `target` once on mount, then eases from the currently
 * shown number whenever `target` changes. A re-render with the same target
 * (e.g. an unchanged refetch) does nothing. Under reduced motion the final
 * value is returned immediately. Returns whole numbers.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = useMediaQuery(REDUCED_MOTION)
  const [value, setValue] = useState(0)
  // The number currently on screen; the start of the next tween.
  const shown = useRef(0)
  const animatable = Number.isFinite(target)

  useEffect(() => {
    if (reduced || !animatable) {
      shown.current = animatable ? target : 0
      return
    }
    const from = shown.current
    if (from === target) return
    const startedAt = performance.now()
    let frame = 0
    const tick = (now: number): void => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs))
      const next = progress >= 1 ? target : Math.round(from + (target - from) * easeOutCubic(progress))
      shown.current = next
      setValue(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, reduced, animatable, durationMs])

  return reduced || !animatable ? target : value
}
