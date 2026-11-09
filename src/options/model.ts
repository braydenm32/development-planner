import { normalizePlan, type Plan } from '../plan/model'

/**
 * Options: named versions of the design inside one project (slab vs piers, say). The survey,
 * the site features and the costs are the project's, shared by every option; each option is its
 * own plan.
 *
 * How they are kept: the project's `plan` record is always the option open now, so everything
 * that reads or writes the plan (autosave, undo, the cloud, older versions of the app) works
 * unchanged. The `options` record lists every option by id and name and holds the plan of each
 * one that is NOT open. A project with no `options` record is one option called "Option 1".
 */
export const OPTIONS_KIND = 'options'

export interface OptionItem {
  id: string
  name: string
  /** Only on an option that isn't the open one; the open one's plan is the `plan` record. */
  plan?: Plan
}

export interface OptionsRecord {
  version: 1
  /** The option open now: its plan is the project's `plan` record. */
  current: string
  items: OptionItem[]
}

/** The id the lone, unnamed option of an older project gets. */
export const FIRST_OPTION = 'option-1'
export const FIRST_NAME = 'Option 1'

export const MAX_OPTIONS = 8
export const MAX_NAME = 40

export function newOptionId(): string {
  const c = globalThis.crypto
  return `o_${c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 10)}`
}

/** What a project with no `options` record has: one option. */
export const singleOption = (): OptionsRecord => ({ version: 1, current: FIRST_OPTION, items: [{ id: FIRST_OPTION, name: FIRST_NAME }] })

const isPlan = (p: unknown): p is Plan => !!p && typeof p === 'object' && (p as Plan).version === 1 && Array.isArray((p as Plan).walls)

/**
 * Read an `options` record, however it got here (this browser, the cloud, a project file).
 * Anything unreadable is dropped rather than thrown on, so a damaged record never stops a
 * project opening; null (use the single option) when nothing usable is left.
 */
export function normalizeOptions(raw: unknown): OptionsRecord | null {
  const r = raw as Partial<OptionsRecord> | null | undefined
  if (!r || typeof r !== 'object' || r.version !== 1 || !Array.isArray(r.items) || typeof r.current !== 'string') return null
  const seen = new Set<string>()
  const items: OptionItem[] = []
  for (const i of r.items) {
    if (!i || typeof i.id !== 'string' || !i.id || seen.has(i.id)) continue
    // Another option with no plan to show is no option at all; the open one's plan is elsewhere.
    if (i.id !== r.current && !isPlan(i.plan)) continue
    seen.add(i.id)
    const name = typeof i.name === 'string' && i.name.trim() ? i.name.trim().slice(0, MAX_NAME) : `Option ${items.length + 1}`
    items.push(i.id === r.current ? { id: i.id, name } : { id: i.id, name, plan: normalizePlan(i.plan as Plan) })
  }
  if (!seen.has(r.current)) return null
  return { version: 1, current: r.current, items: items.slice(0, MAX_OPTIONS) }
}

/** `name`, or `name 2`, `name 3`… when another option has it. */
export function freeOptionName(items: OptionItem[], name: string, except?: string): string {
  const base = name.trim().slice(0, MAX_NAME) || 'Option'
  const taken = new Set(items.filter(i => i.id !== except).map(i => i.name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

/**
 * The record after opening option `to`: `open` (the editor's plan) is filed under the option
 * that was open, and `to`'s own plan comes out to become the project's plan. Returns that plan.
 */
export function switchedTo(rec: OptionsRecord, to: string, open: Plan): { rec: OptionsRecord; plan: Plan } {
  const target = rec.items.find(i => i.id === to)
  if (!target) throw new Error('That option is no longer here.')
  if (to === rec.current) return { rec, plan: open }
  if (!target.plan) throw new Error('That option has no plan saved.')
  const items = rec.items.map(i => (i.id === rec.current ? { ...i, plan: open } : i.id === to ? { id: i.id, name: i.name } : i))
  return { rec: { ...rec, current: to, items }, plan: target.plan }
}

/** The record with a copy of the open design added as a new option, which becomes the open one. */
export function copiedFrom(rec: OptionsRecord, open: Plan, id: string, name: string): OptionsRecord {
  const items = rec.items.map(i => (i.id === rec.current ? { ...i, plan: open } : i))
  return { ...rec, current: id, items: [...items, { id, name }] }
}

/** What a project file or download carries: the options, unless the project has only its one unnamed option. */
export function optionsForFile(raw: unknown): OptionsRecord | undefined {
  const rec = normalizeOptions(raw)
  return rec && (rec.items.length > 1 || rec.items[0]?.name !== FIRST_NAME) ? rec : undefined
}

/** Every option's plan, the open one's from the editor: what Compare and the project file work from. */
export function plansOf(rec: OptionsRecord, open: Plan): { id: string; name: string; plan: Plan }[] {
  return rec.items.map(i => ({ id: i.id, name: i.name, plan: i.id === rec.current ? open : (i.plan as Plan) }))
}
