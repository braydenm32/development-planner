// A toolbar that is one Tab stop: the arrow keys move along it, Home and End go to its ends, and
// it wraps (the WAI-ARIA toolbar pattern). Used by the plan's tool rail, whose fifteen tools were
// fifteen Tab stops between the plan and the panel.

/** The button to focus after `key`, from the one at `from` among `count`; null for a key that isn't the toolbar's. */
export function toolbarStep(key: string, from: number, count: number): number | null {
  if (count < 1) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const at = from < 0 ? 0 : from
  if (key === 'ArrowDown' || key === 'ArrowRight') return (at + 1) % count
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (at - 1 + count) % count
  return null
}
