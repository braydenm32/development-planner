// Comments on share links (worker/src/comments.ts), in the app: what a comment is, the same
// limits the Worker keeps (so a comment is refused here before it is sent), where its pin goes on
// the plan, and the words for who wrote it and which link it came by.
//
// A pin is kept as the survey's easting and northing and the floor's id, so it stays on its spot
// of the block whichever way the view is turned or panned. The plan is drawn in the house's own
// frame, so a pin's place on the screen follows from the house's placement on the block.

import type { Vec2 } from '../lib/geom'
import { fromSite, sortedLevels, toSite, type Placement, type Plan } from '../plan/model'
import { edited, onDay } from '../projects/format'

/** Comments on a link: off, on with each person seeing their own, or on with everyone seeing all. */
export type CommentMode = 'off' | 'own' | 'all'

export const TEXT_MAX = 500
export const NAME_MAX = 40
/** Who wrote it, when they gave no name. */
export const SOMEONE = 'Someone with the link'

/** Where a comment is pinned: the floor (a plan level id), and the easting and northing (m). */
export interface Spot {
  floor: string
  x: number
  y: number
}

interface CommentBase extends Spot {
  id: string
  text: string
  name: string | null
  created: number
}

/** A comment as someone with the link sees it. */
export interface ViewerComment extends CommentBase {
  resolved: boolean
  /** Written in this browser. */
  mine: boolean
}

/** A comment as the person who shared the link sees it: which link, and when it was resolved. */
export interface OwnerComment extends CommentBase {
  /** The link's id (the SHA-256 of its token), as ShareLink.id. */
  link: string
  resolved: number | null
}

/** Each link with comments, by its id: when it was made and ends (to name it by), how many it has and how many are new (not resolved yet). */
export type CommentCounts = Record<string, { created: number; expires: number | null; total: number; new: number }>

/** The survey's easting and northing of a point on the plan (the house's frame). */
export function planToSurvey(p: Vec2, placement: Placement): Vec2 {
  return toSite(p, placement, [0, 0])
}

/** Where a pin goes on the plan (the house's frame). */
export function surveyToPlan(s: Pick<Spot, 'x' | 'y'>, placement: Placement): Vec2 {
  return fromSite([s.x, s.y], placement, [0, 0])
}

/** The spot a tap on the plan pins, to the millimetre (as the Worker keeps it). */
export function spotAt(p: Vec2, floor: string, placement: Placement): Spot {
  const [x, y] = planToSurvey(p, placement)
  const mm = (v: number) => Math.round(v * 1000) / 1000
  return { floor, x: mm(x), y: mm(y) }
}

/**
 * The floor a pin shows on: its own, or the lowest if that floor has gone from the plan since
 * (so a comment never goes missing).
 */
export function floorOf(c: Spot, plan: Plan): string {
  return plan.levels.some(l => l.id === c.floor) ? c.floor : (sortedLevels(plan)[0]?.id ?? c.floor)
}

/** Each comment's number on the plan and in the list: by when it was written, from 1. */
export function numbered<T extends { id: string; created: number }>(list: T[]): Map<string, number> {
  return new Map([...list].sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1)).map((c, i) => [c.id, i + 1]))
}

/** A control character (a line break is fine where `breaks` says so), or a mark that turns text around: as the Worker refuses them. */
export function hasControl(text: string, breaks = false): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if ((c < 0x20 && !(breaks && c === 0x0a)) || (c >= 0x7f && c <= 0x9f)) return true
    if (c === 0x200e || c === 0x200f || c === 0x2028 || c === 0x2029 || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true
  }
  return false
}

/** Length as people count it: an emoji or an accented letter is one character. */
export const charCount = (s: string) => [...s].length

/** What is wrong with a comment before it is sent, in plain words; null when it can go. */
export function commentProblem(text: string, name: string): string | null {
  const t = text.trim()
  if (!t) return 'Write a comment first.'
  if (charCount(t) > TEXT_MAX) return `A comment can be up to ${TEXT_MAX} characters.`
  if (hasControl(t.replace(/\r\n?/g, '\n'), true)) return 'That comment has characters it can’t keep. Type it again as plain text.'
  if (charCount(name.trim()) > NAME_MAX) return `A name can be up to ${NAME_MAX} characters.`
  if (hasControl(name.trim())) return 'That name has characters it can’t keep. Type it again as plain text.'
  return null
}

/** Who wrote it: the name they gave, or "Someone with the link". */
export const whoWrote = (c: Pick<CommentBase, 'name'>) => c.name?.trim() || SOMEONE

/** "Sam · 2 hours ago". */
export const byLine = (c: Pick<CommentBase, 'name' | 'created'>, now: number) => `${whoWrote(c)} · ${edited(c.created, now)}`

/** Which link a comment came by, as Share › Send names links: "the link made 3 Nov", and whether it has ended. */
export function linkName(link: { created: number; expires: number | null } | undefined, now: number): string {
  if (!link) return 'a share link'
  return `the link made ${onDay(link.created, now)}${link.expires !== null && link.expires <= now ? ', which has ended' : ''}`
}

/** New first (oldest first among them, as they were written), then resolved ones, newest resolved first. */
export function ownerOrder(list: OwnerComment[]): OwnerComment[] {
  return [...list].sort((a, b) => {
    if ((a.resolved === null) !== (b.resolved === null)) return a.resolved === null ? -1 : 1
    if (a.resolved === null) return a.created - b.created
    return (b.resolved ?? 0) - (a.resolved ?? 0)
  })
}

/** How many comments are new across the project's links. */
export const newCount = (counts: CommentCounts | null | undefined) => Object.values(counts ?? {}).reduce((n, c) => n + c.new, 0)

/** "2 comments, 1 new", "1 comment", or nothing at all. */
export function countWords(c: { total: number; new: number } | undefined): string | null {
  if (!c?.total) return null
  const all = `${c.total} comment${c.total === 1 ? '' : 's'}`
  return c.new ? `${all}, ${c.new} new` : all
}
