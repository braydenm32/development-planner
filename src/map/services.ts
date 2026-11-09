// The NSW Government map services the map placement calls, straight from the browser. All are
// free, need no key, and answer with CORS open (checked with scripts/probe-nsw-maps.mjs, which
// the "Probe NSW map services" workflow runs, November 2026):
//
//   NSW Spatial Services (maps.six)   aerial imagery tiles and the cadastre (lot outlines)
//   Planning Portal (api.apps1)       address search, and the lots of an address. Undocumented: it's
//                                     the Spatial Viewer's own backend, so it can change.
//   ePlanning layers (mapprod3)       zoning, height, floor space ratio, lot size, heritage, and the
//                                     bushfire, flood and landslide maps, in GDA94.
//
// Nothing here is sent anywhere else, and nothing is sent until someone searches or places a block.

import type { Vec2 } from '../lib/geom'
import { gda2020To94, type LonLat } from './geo'

export const SIX = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public'
export const PORTAL = 'https://api.apps1.nsw.gov.au/planning/viewersf/V1/ePlanningApi'
export const EPLAN = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/ePlanning'

/** Aerial imagery tile (Web Mercator, 256 px). Answers to zoom 21; about 0.15 m a pixel at 20. */
export const imageryTile = (z: number, x: number, y: number) => `${SIX}/NSW_Imagery/MapServer/tile/${z}/${y}/${x}`
export const IMAGERY_CREDIT = 'Aerial imagery and cadastre © Spatial Services, NSW Department of Customer Service'
export const PLANNING_CREDIT = 'Planning layers © NSW Department of Planning, Housing and Infrastructure'

/** A lot from the cadastre, its outline in GDA2020 lon/lat. */
export interface Lot {
  /** As the cadastre writes it: "4//DP12345", or "1/2/DP1234" with a section. */
  id: string
  /** "Lot 4 DP12345". */
  label: string
  ring: LonLat[]
  /** The street address it was found by, when it was found by address: for the DA pack's title blocks. */
  address?: string
}

export interface AddressHit {
  address: string
  propId: number
}

type Fetch = typeof fetch
let fetcher: Fetch = (...a) => fetch(...a)
/** Tests swap the network for recorded replies. */
export function setFetch(f: Fetch | null) {
  fetcher = f ?? ((...a) => fetch(...a))
}

export class MapServiceError extends Error {}

async function getJson(url: string, init?: RequestInit, signal?: AbortSignal): Promise<unknown> {
  let r: Response
  try {
    r = await fetcher(url, { ...init, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new MapServiceError('The NSW map service didn’t answer. Check you’re online, then try again.')
  }
  if (!r.ok) throw new MapServiceError(`The NSW map service answered with an error (${r.status}). Try again in a minute.`)
  const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null
  if (j && typeof j === 'object' && 'error' in j && j.error) throw new MapServiceError(`The NSW map service couldn’t answer that (${j.error.message ?? 'error'}).`)
  return j
}

// ---- Finding the lot ----

/** "Lot 12 DP 34567", "4/12345", "4//DP12345", "Lot 1 Sec 2 DP 1234": the cadastre's id, or null. */
export function parseLotDp(text: string): string | null {
  const t = text.trim().toUpperCase().replace(/\s+/g, ' ')
  let m = t.match(/^(?:LOT )?([0-9A-Z]+) ?\/ ?([0-9A-Z]*) ?\/ ?(DP|SP)? ?(\d+)$/)
  if (m) return `${m[1]}/${m[2]}/${m[3] ?? 'DP'}${m[4]}`
  m = t.match(/^(?:LOT )?([0-9A-Z]+) ?\/ ?(DP|SP)? ?(\d+)$/)
  if (m) return `${m[1]}//${m[2] ?? 'DP'}${m[3]}`
  m = t.match(/^LOT ([0-9A-Z]+),? (?:(?:SEC(?:TION)?|S) ([0-9A-Z]+),? )?(DP|SP|D\.P\.) ?(\d+)$/)
  if (m) return `${m[1]}/${m[2] ?? ''}/${m[3] === 'SP' ? 'SP' : 'DP'}${m[4]}`
  return null
}

/** "4//DP12345" → "Lot 4 DP12345"; "1/2/DP1234" → "Lot 1 Section 2 DP1234". */
export function lotLabel(id: string): string {
  const [lot, sec, plan] = id.split('/')
  return `Lot ${lot}${sec ? ` Section ${sec}` : ''} ${plan ?? ''}`.trim()
}

/** Addresses as you type (the Planning Portal's search). An address can be more than one property. */
export async function searchAddress(text: string, signal?: AbortSignal): Promise<AddressHit[]> {
  const j = await getJson(`${PORTAL}/address?a=${encodeURIComponent(text.trim())}&noOfRecords=8`, undefined, signal)
  if (!Array.isArray(j)) return []
  const seen = new Set<string>()
  const out: AddressHit[] = []
  for (const x of j as { address?: unknown; propId?: unknown }[]) {
    if (typeof x?.address !== 'string' || typeof x.propId !== 'number') continue
    const key = `${x.address}|${x.propId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ address: titleCase(x.address), propId: x.propId })
  }
  return out
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())

const mercToLonLat = ([x, y]: Vec2): LonLat => [(x / 6378137) * (180 / Math.PI), (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * (180 / Math.PI)]

/** The lots an address stands on (the Planning Portal's property, in Web Mercator). */
export async function lotsOfProperty(propId: number, signal?: AbortSignal): Promise<Lot[]> {
  const j = await getJson(`${PORTAL}/lot?propId=${propId}`, undefined, signal)
  if (!Array.isArray(j)) return []
  return (j as { geometry?: { rings?: number[][][] }; attributes?: { LotDescription?: string } }[]).flatMap(x => {
    const ring = x.geometry?.rings?.[0]
    const desc = x.attributes?.LotDescription
    if (!ring || ring.length < 4 || typeof desc !== 'string') return []
    // The portal writes "401/-/DP715513"; the cadastre "401//DP715513".
    const id = desc.replace('/-/', '//')
    return [{ id, label: lotLabel(id), ring: openRing(ring.map(p => mercToLonLat([p[0], p[1]]))) }]
  })
}

interface CadastreReply {
  features?: { attributes?: { lotidstring?: string }; geometry?: { rings?: number[][][] } }[]
  exceededTransferLimit?: boolean
}

function lotsOf(j: unknown): Lot[] {
  const feats = (j as CadastreReply | null)?.features ?? []
  return feats.flatMap(f => {
    const id = f.attributes?.lotidstring
    // A lot can be in parts; the largest ring is the one to fit to.
    const rings = (f.geometry?.rings ?? []).filter(r => r.length >= 4)
    if (!id || !rings.length) return []
    const ring = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a))
    return [{ id, label: lotLabel(id), ring: openRing(ring.map(p => [p[0], p[1]] as LonLat)) }]
  })
}

const ringArea = (r: number[][]) => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2
const openRing = (r: LonLat[]): LonLat[] => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r)

const CADASTRE = `${SIX}/NSW_Cadastre/MapServer/9/query`

/** A lot by its Lot/DP (the cadastre's id, from parseLotDp). */
export async function lotById(id: string, signal?: AbortSignal): Promise<Lot | null> {
  const where = `lotidstring='${id.replace(/'/g, "''")}'`
  const j = await getJson(`${CADASTRE}?where=${encodeURIComponent(where)}&outFields=lotidstring&returnGeometry=true&outSR=4326&f=json`, undefined, signal)
  return lotsOf(j)[0] ?? null
}

/** The lots in a box (west, south, east, north), for the map to pick from. */
export async function lotsInBox(box: [number, number, number, number], signal?: AbortSignal): Promise<Lot[]> {
  const g = box.map(n => n.toFixed(7)).join(',')
  const j = await getJson(
    `${CADASTRE}?geometry=${g}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=lotidstring&returnGeometry=true&outSR=4326&geometryPrecision=7&f=json`,
    undefined,
    signal,
  )
  return lotsOf(j)
}

// ---- Planning layers ----

export type LayerKey = 'lep' | 'zone' | 'height' | 'fsr' | 'lotSize' | 'heritage' | 'bushfire' | 'flood' | 'landslide'

/** Each layer the checks read, by its service and layer id (docs/research/map-placement.md). */
export const LAYERS: Record<LayerKey, { service: string; layer: number; name: string }> = {
  lep: { service: 'Planning_Portal_Principal_Planning', layer: 8, name: 'Local Environmental Plan' },
  zone: { service: 'Planning_Portal_Principal_Planning', layer: 19, name: 'Land zoning' },
  height: { service: 'Planning_Portal_Principal_Planning', layer: 14, name: 'Height of buildings' },
  fsr: { service: 'Planning_Portal_Principal_Planning', layer: 11, name: 'Floor space ratio' },
  lotSize: { service: 'Planning_Portal_Principal_Planning', layer: 22, name: 'Minimum lot size' },
  heritage: { service: 'Planning_Portal_Principal_Planning', layer: 16, name: 'Heritage' },
  bushfire: { service: 'Planning_Portal_Hazard', layer: 229, name: 'Bushfire prone land' },
  flood: { service: 'Planning_Portal_Hazard', layer: 230, name: 'Flood planning' },
  landslide: { service: 'Planning_Portal_Hazard', layer: 232, name: 'Landslide risk land' },
}

export type Attrs = Record<string, string | number | null>

/**
 * Features of one layer that touch any of `points` (GDA2020 lon/lat), as attribute rows. Points,
 * not the lot's outline: an outline catches the zone across the road it touches.
 */
export async function layerAt(key: LayerKey, points: LonLat[], signal?: AbortSignal): Promise<Attrs[]> {
  const { service, layer } = LAYERS[key]
  // The layers are in GDA94; GDA2020 sits about 1.5 to 1.8 m away in NSW.
  const pts = points.map(gda2020To94).map(([x, y]) => [Number(x.toFixed(8)), Number(y.toFixed(8))])
  const geometry = pts.length === 1 ? { x: pts[0][0], y: pts[0][1], spatialReference: { wkid: 4283 } } : { points: pts, spatialReference: { wkid: 4283 } }
  const body = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify(geometry),
    geometryType: pts.length === 1 ? 'esriGeometryPoint' : 'esriGeometryMultipoint',
    inSR: '4283',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
  })
  // Posted as a form (a "simple" request, so no CORS preflight), which also keeps long point lists out of the URL.
  const j = (await getJson(
    `${EPLAN}/${service}/MapServer/${layer}/query`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    signal,
  )) as { features?: { attributes?: Attrs }[] } | null
  return (j?.features ?? []).map(f => f.attributes ?? {})
}
