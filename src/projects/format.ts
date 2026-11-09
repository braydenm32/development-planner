const DAY = 86_400_000

/** A day ahead, such as when something ends: "9 Dec", or "9 Jan 2027" in another year. */
export function onDay(t: number, now = Date.now()): string {
  const d = new Date(t)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** "just now", "12 minutes ago", "today, 3:42 pm", "yesterday", "8 Nov", "8 Nov 2025". */
export function edited(t: number, now = Date.now()): string {
  const mins = Math.round((now - t) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const d = new Date(t)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (t >= start.getTime()) return `today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  if (t >= start.getTime() - DAY) return 'yesterday'
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
