// A view from a photo, as kept with the project's site features (src/site/store.ts): the photo's
// name and size, where it was taken from and how the camera was aimed. The picture itself is kept
// with the drawings' pictures (SiteFiles.drawings, under the view's id), so it is stored, saved,
// synced and left out of share links exactly as they are. Nothing of the photo's own location data
// is kept: only the spot on the block, which the person sets (or confirms).

import type { Vec2 } from '../lib/geom'

/** How the camera was aimed: degrees throughout (see ./camera.ts for the sums). */
export interface Aim {
  /** Compass bearing faced, degrees clockwise from the survey's north. */
  heading: number
  /** Up (+) or down (−) from level, degrees. */
  tilt: number
  /** The camera turned clockwise, degrees (the photo's horizon then rises to the right). */
  roll: number
  /** The lens angle across the photo's width (side to side), degrees. */
  fov: number
}

/** The lens angles the controls allow (degrees across the photo). */
export const FOV_MIN = 10
export const FOV_MAX = 120

/** Degrees kept in −180..180, for a heading change or a lean. */
export const wrap180 = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180

/** A heading in 0..360. */
export const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360

export const clampFov = (f: number): number => Math.min(FOV_MAX, Math.max(FOV_MIN, f))

export interface PhotoView extends Aim {
  id: string
  name: string
  /** The stored picture's size in pixels. */
  width: number
  height: number
  /** Where it was taken from, survey grid (easting, northing); null until it is set. */
  at: Vec2 | null
  /** The eye's height (m) above the ground at the spot, or above a level's floor when `level` is set. */
  eyeHeight: number
  /** A level's id: standing on that floor (a deck, a window); null on the ground. */
  level: string | null
  /** Where the lens angle came from: the photo's details, a normal phone lens, or set by hand. */
  lens: 'photo' | 'phone' | 'set'
  /** When it was taken, by the camera's clock ("2026-11-27T14:05:09"), when the photo said. */
  taken: string | null
  /** The camera's time zone then, minutes ahead of UTC, when the photo said. */
  offset: number | null
  /** The spot and direction are a first guess from the phone's location and compass. */
  guessed: boolean
  /** Put the photo in the project file too (as the drawings' tick box). */
  include: boolean
}

export const EYE_HEIGHT = 1.6

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every(isNum)

/** Check a saved or opened view; null when it can't be used. */
export function normalizePhotoView(raw: unknown): PhotoView | null {
  const r = raw as Partial<PhotoView> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !isNum(r.width) || !isNum(r.height) || r.width <= 0 || r.height <= 0) return null
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Photo',
    width: r.width,
    height: r.height,
    at: isVec(r.at) ? r.at : null,
    heading: isNum(r.heading) ? wrap360(r.heading) : 0,
    tilt: isNum(r.tilt) ? Math.max(-85, Math.min(85, r.tilt)) : 0,
    roll: isNum(r.roll) ? wrap180(r.roll) : 0,
    fov: isNum(r.fov) ? clampFov(r.fov) : 60,
    eyeHeight: isNum(r.eyeHeight) ? Math.max(0, Math.min(100, r.eyeHeight)) : EYE_HEIGHT,
    level: typeof r.level === 'string' ? r.level : null,
    lens: r.lens === 'photo' || r.lens === 'set' ? r.lens : 'phone',
    taken: typeof r.taken === 'string' ? r.taken : null,
    offset: isNum(r.offset) ? r.offset : null,
    guessed: !!r.guessed,
    include: !!r.include,
  }
}

export const normalizePhotoViews = (raw: unknown): PhotoView[] =>
  Array.isArray(raw) ? raw.map(normalizePhotoView).filter((p): p is PhotoView => !!p) : []

/** The name a photo gets from its file: "IMG_2041.jpg" → "IMG_2041". */
export function photoName(fileName: string, taken: string | null): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').trim()
  if (base && !/^image$/i.test(base)) return base.slice(0, 60)
  return taken ? `Photo of ${taken.slice(0, 10)}` : 'Photo'
}
