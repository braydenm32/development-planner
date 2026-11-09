// The aerial photo and the lot's lines under the plan, once the block is placed. Tiles come
// straight from NSW Spatial Services (no copy is kept); each is laid on the survey's grid by the
// affine its three corners give, which is exact to well under a pixel at a block's size.

import type { Affine } from '../site/align'
import { compose } from '../site/align'
import type { Vec2 } from '../lib/geom'
import { mgaToGrid } from './fit'
import { tileLonLat, tileXY, toMga, fromMga } from './geo'
import type { MapPlace } from './model'
import { imageryTile, IMAGERY_CREDIT } from './services'
import { useMap } from './store'
import './map.css'

/** How much ground around the lot gets photo (m). */
const MARGIN = 40
const TILE = 256

export interface AerialTile {
  key: string
  url: string
  /** Tile pixels to the survey grid. */
  toGrid: Affine
}

/** A zoom with about one photo pixel per screen pixel or finer, within what the service has. */
export const zoomFor = (pxPerMetre: number) => (pxPerMetre > 5 ? 20 : pxPerMetre > 2.5 ? 19 : 18)

/** The tiles that cover the lot and some ground around it, each laid on the survey grid. */
export function aerialTiles(place: MapPlace, z: number): AerialTile[] {
  const mga = place.lot.ring.map(p => toMga(p, place.zone))
  const xs = mga.map(p => p[0])
  const ys = mga.map(p => p[1])
  const sw = fromMga([Math.min(...xs) - MARGIN, Math.min(...ys) - MARGIN], place.zone)
  const ne = fromMga([Math.max(...xs) + MARGIN, Math.max(...ys) + MARGIN], place.zone)
  const [x0, y1] = tileXY(sw, z).map(Math.floor)
  const [x1, y0] = tileXY(ne, z).map(Math.floor)
  const grid = (x: number, y: number): Vec2 => mgaToGrid(place.fit, toMga(tileLonLat(x, y, z), place.zone))
  const out: AerialTile[] = []
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const o = grid(x, y)
      const r = grid(x + 1, y)
      const d = grid(x, y + 1)
      out.push({
        key: `${z}/${x}/${y}`,
        url: imageryTile(z, x, y),
        toGrid: [(r[0] - o[0]) / TILE, (r[1] - o[1]) / TILE, (d[0] - o[0]) / TILE, (d[1] - o[1]) / TILE, o[0], o[1]],
      })
    }
  return out
}

/** The lot's lines from the cadastre, in survey grid coordinates. */
export const lotOnGrid = (place: MapPlace): Vec2[] => place.lot.ring.map(p => mgaToGrid(place.fit, toMga(p, place.zone)))

/** Under the plan: the photo, then the lot's lines. `worldToScreen` maps the survey grid to screen pixels. */
export function useAerialLayer(worldToScreen: Affine, pxPerMetre: number) {
  const place = useMap(s => s.place)
  if (!place) return null
  const z = zoomFor(pxPerMetre)
  const tiles = place.aerial ? aerialTiles(place, z) : []
  const lot = lotOnGrid(place).map(p => {
    const [a, b, c, d, e, f] = worldToScreen
    return [a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f]
  })
  return (
    <g className="map-aerial" aria-label="Aerial photo and lot lines">
      <title>{IMAGERY_CREDIT}</title>
      {tiles.map(t => {
        const m = compose(worldToScreen, t.toGrid)
        return (
          <image
            key={t.key}
            href={t.url}
            width={TILE + 0.6}
            height={TILE + 0.6}
            preserveAspectRatio="none"
            transform={`matrix(${m.map(n => n.toFixed(6)).join(' ')})`}
            opacity={place.opacity}
          />
        )
      })}
      <path className="map-lot-line" d={`M${lot.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`} />
    </g>
  )
}
