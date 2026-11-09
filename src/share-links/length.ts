// How long a view-only link works, in words: the lengths to pick from, and when a link ends.

import { onDay } from '../projects/format'
import type { LinkDays, ShareLink } from './api'

const DAY = 86_400_000

/** "30 days", "90 days", "1 year". */
export const lengthName = (d: LinkDays) => (d === 365 ? '1 year' : `${d} days`)

/** "Works until 9 Dec", with the days left once it is a week off; "No end date" for an old link. */
export function worksUntil(l: ShareLink, now: number): { text: string; soon: boolean } {
  if (l.expires === null) return { text: 'No end date', soon: false }
  const left = l.expires - now
  if (left > 7 * DAY) return { text: `Works until ${onDay(l.expires, now)}`, soon: false }
  const days = Math.ceil(left / DAY)
  return { text: `Works until ${onDay(l.expires, now)}, ${days <= 1 ? 'less than a day' : `${days} days`} left`, soon: true }
}
