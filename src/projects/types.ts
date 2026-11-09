/**
 * Several projects saved in one place. Each project is a small index entry (ProjectMeta) plus
 * its own records: the survey, the plan, per-project preferences, and anything a later feature
 * adds (site features, for example) under its own record kind.
 *
 * The store treats every record as an opaque value: it never looks inside the survey or the plan,
 * so their shapes can change without touching it. Whatever implements ProjectStore (this
 * browser's IndexedDB today, a cloud store later) only has to keep records and the index.
 */

/**
 * Record kinds the app writes today. Other features add their own kinds.
 *
 * Adding one (site features' `site`, say), from the feature's store module:
 *
 *   import { registerRecordKind } from '../projects'
 *   const saveSite = registerRecordKind<SiteFeatures>('site', value => useSite.setState(value ?? EMPTY_SITE))
 *   useSite.subscribe(s => void saveSite(s))   // debounce it if it changes per keystroke
 *
 * `load` runs whenever a project opens (undefined for a project without the record) and when
 * the last one closes; `saveSite` writes to the project open now, through the same write queue
 * as the plan, and moves its `updated` and revision. Duplicate copies the record, delete removes
 * it, and a cloud store later syncs it like any other, with no change here. Keep the value plain
 * data (structured-cloneable) and version it inside (`{ version: 1, … }`); the store never looks
 * in. Moving an older global key (`site-v1`) in is the feature's own one-off: on the first load,
 * if the current project has no `site` record, save the old value to it, read it back, then
 * remove the old key, as src/projects/legacy.ts does for the survey and plan. The project file
 * (src/share/project.ts) carries only the survey, the plan and the name; adding a kind there is
 * the feature's choice.
 */
export type RecordKind = 'survey' | 'plan' | 'prefs' | (string & {})

/** The numbers a project card shows. They come from the same helpers the app shows them with. */
export interface ProjectNumbers {
  /** m², the block inside its boundary (the Site panel's "Area"). */
  siteArea: number | null
  /** m², every floor to the outside of its walls (the Areas panel's "Floor area", summed over floors). */
  floorArea: number | null
  /** RL of the ground floor's finished floor. */
  ffl: number | null
}

/** A tiny north-up drawing of the block and the house, as SVG path data. */
export interface ProjectThumbnail {
  /** SVG viewBox, "0 0 w h". */
  viewBox: string
  /** The block boundary. */
  block: string
  /** The house outline(s), to the outside of the walls. */
  house: string
}

export interface ProjectMeta {
  id: string
  name: string
  /** ms since 1970. */
  created: number
  /** ms since 1970: the last change to the project's content (survey, plan or name). */
  updated: number
  /** Goes up by one with every saved change, preferences included. A cloud sync compares these. */
  revision: number
  /** Archived projects are kept but tucked away; only they can be deleted. */
  archived: boolean
  surveyFileName: string | null
  thumbnail: ProjectThumbnail | null
  numbers: ProjectNumbers
}

/** The parts of a project's index entry a save may change. */
export type MetaPatch = Partial<Pick<ProjectMeta, 'name' | 'archived' | 'surveyFileName' | 'thumbnail' | 'numbers'>>

export type ProjectRecords = Partial<Record<RecordKind, unknown>>

export interface ProjectChange {
  meta?: MetaPatch
  /** Records to write. `null` removes a record. */
  records?: Partial<Record<RecordKind, unknown | null>>
  /** Counts as an edit and moves `updated` (default true). Preference saves pass false. */
  touch?: boolean
}

export interface NewProject {
  name: string
  records?: ProjectRecords
  meta?: MetaPatch
  /** Only for the one-off migration, which needs a known id so running it twice is harmless. */
  id?: string
}

/**
 * Where projects live. Every call is atomic for one project: a save either lands whole (records
 * and index entry together, with the revision bumped) or not at all, so a failed save never
 * spoils the last good one.
 */
export interface ProjectStore {
  /** Every project's index entry, most recently edited first. */
  list(): Promise<ProjectMeta[]>
  get(id: string): Promise<ProjectMeta | null>
  /** A project's records (all of them, or just `kinds`). Null when the project doesn't exist. */
  read(id: string, kinds?: RecordKind[]): Promise<ProjectRecords | null>
  create(init: NewProject): Promise<ProjectMeta>
  /** Write records and index changes together. Fails if the project doesn't exist. */
  save(id: string, change: ProjectChange): Promise<ProjectMeta>
  /** Delete for good. Refuses unless the project is archived. */
  remove(id: string): Promise<void>
}

/** Thrown when something asks to delete a project that isn't archived. */
export class NotArchivedError extends Error {
  constructor() {
    super('Archive a project before deleting it.')
    this.name = 'NotArchivedError'
  }
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`There is no project ${id}.`)
    this.name = 'ProjectNotFoundError'
  }
}

export const EMPTY_NUMBERS: ProjectNumbers = { siteArea: null, floorArea: null, ffl: null }

export function newProjectId(): string {
  const c = globalThis.crypto
  const rand = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
  return `p_${rand}`
}
