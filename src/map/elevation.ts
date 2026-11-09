// Ground levels (AHD) from the state's elevation model, for a first look at a block before there's
// a survey, and for other features that need the ground somewhere the survey doesn't reach (the
// street level at the kerb, say). See docs/research/elevation.md for the service, its licence and
// how accurate it is.
//
// `groundAt` takes MGA points and answers with a level for each (null where the model has none,
// such as out at sea). It asks in batches, remembers what it was told, and gives up on a slow reply
// with a plain error. Nothing is sent until someone asks for levels.

import { fromMga, type EN } from './geo'

/** The elevation service, and what it says about itself (docs/research/elevation.md). */
export const DEM = {
  id: 'nsw-5m',
  /** ArcGIS ImageServer: getSamples answers many points in one request. */
  url: 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_5M_Elevation/ImageServer',
  /** Its name, as the app shows it. */
  name: 'NSW 5 m elevation model',
  /** Where its levels come from: LiDAR where it has been flown, aerial photos elsewhere. */
  from: 'LiDAR and aerial photos',
  /** Pixel size (m). */
  resolution: 5,
  /** Stated vertical accuracy (m, 95% of points within ±). */
  accuracy: 0.9,
  credit: 'Ground levels © State of New South Wales (Spatial Services, Department of Customer Service), CC BY 4.0',
}

export type DemInfo = typeof DEM

/** Points in one request: the server answers at most 1000 (its maxRecordCount). */
export const BATCH = 1000
/**
 * How long one request may take before it's given up on (ms). The service is slow: 25 to 110 s a
 * request when it was checked, however many points it held.
 */
export const TIMEOUT = 180000
/** Requests in flight at once. */
const PARALLEL = 3
/** Levels outside this range (m AHD) are the service's NoData values, not ground. */
const SANE = { lo: -100, hi: 2300 }

type Fetch = typeof fetch
let fetcher: Fetch = (...a) => fetch(...a)
/** Tests swap the network for recorded replies. */
export function setElevationFetch(f: Fetch | null) {
  fetcher = f ?? ((...a) => fetch(...a))
}

export class ElevationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElevationError'
  }
}

// What the service said, by point (to the centimetre). A block is asked for again when someone
// tries twice, or a later feature asks for a point it already has.
const CACHE_MAX = 50000
const cache = new Map<string, number | null>()
const keyOf = (zone: number, [e, n]: EN) => `${zone}|${e.toFixed(2)}|${n.toFixed(2)}`

/** Forget what the service said (tests, and Read again). */
export function clearElevationCache() {
  cache.clear()
}

function remember(key: string, v: number | null) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, v)
}

/** A level from one sample of the reply, or null for NoData. */
export function readSample(value: unknown): number | null {
  const v = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value.trim().split(/\s+/)[0]) : NaN
  return Number.isFinite(v) && v > SANE.lo && v < SANE.hi ? v : null
}

interface SamplesReply {
  samples?: { locationId?: number; value?: unknown }[]
  error?: { message?: string }
}

/** One request: levels for up to BATCH lon/lat points, in order. */
async function askBatch(lonLat: [number, number][], signal?: AbortSignal): Promise<(number | null)[]> {
  const body = new URLSearchParams({
    geometry: JSON.stringify({ points: lonLat.map(([x, y]) => [Number(x.toFixed(8)), Number(y.toFixed(8))]), spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryMultipoint',
    returnFirstValueOnly: 'true',
    interpolation: 'RSP_BilinearInterpolation',
    f: 'json',
  })
  // Its own timeout, which also stops when the caller does.
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, TIMEOUT)
  const stop = () => ctrl.abort()
  signal?.addEventListener('abort', stop)
  let r: Response
  try {
    // Posted as a form: a "simple" request (no CORS preflight), and long point lists stay out of the URL.
    r = await fetcher(`${DEM.url}/getSamples`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: ctrl.signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new ElevationError(
      timedOut ? 'The NSW elevation service is taking too long to answer. Try again in a minute.' : 'The NSW elevation service didn’t answer. Check you’re online, then try again.',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
  if (!r.ok) throw new ElevationError(`The NSW elevation service answered with an error (${r.status}). Try again in a minute.`)
  const j = (await r.json().catch(() => null)) as SamplesReply | null
  if (!j || typeof j !== 'object') throw new ElevationError('The NSW elevation service sent back something the planner can’t read. Try again in a minute.')
  if (j.error) throw new ElevationError(`The NSW elevation service couldn’t answer that (${j.error.message ?? 'error'}).`)
  const out: (number | null)[] = lonLat.map(() => null)
  // Samples name the point they're for; without a name they come in the order asked.
  ;(j.samples ?? []).forEach((s, i) => {
    const at = typeof s.locationId === 'number' ? s.locationId : i
    if (at >= 0 && at < out.length) out[at] = readSample(s.value)
  })
  return out
}

export interface GroundOptions {
  signal?: AbortSignal
  /** Points answered so far, out of all asked (cached ones count straight away). */
  onProgress?: (done: number, total: number) => void
}

/**
 * Ground levels (m AHD) at MGA points in `zone`, in order: null where the model has no level.
 * Throws an ElevationError with a plain message when the service can't be reached.
 */
export async function groundAt(points: EN[], zone = 56, opts: GroundOptions = {}): Promise<(number | null)[]> {
  const out: (number | null)[] = points.map(() => null)
  const todo: { key: string; at: number[]; ll: [number, number] }[] = []
  const byKey = new Map<string, number>()
  points.forEach((p, i) => {
    const key = keyOf(zone, p)
    if (cache.has(key)) {
      out[i] = cache.get(key) ?? null
      return
    }
    // The same point twice is asked once.
    const k = byKey.get(key)
    if (k !== undefined) todo[k].at.push(i)
    else {
      byKey.set(key, todo.length)
      todo.push({ key, at: [i], ll: fromMga(p, zone) })
    }
  })
  let done = points.length - todo.reduce((s, t) => s + t.at.length, 0)
  opts.onProgress?.(done, points.length)
  const batches: (typeof todo)[] = []
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]
      const levels = await askBatch(
        batch.map(t => t.ll),
        opts.signal,
      )
      batch.forEach((t, k) => {
        remember(t.key, levels[k])
        for (const i of t.at) out[i] = levels[k]
        done += t.at.length
      })
      opts.onProgress?.(done, points.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker))
  return out
}
