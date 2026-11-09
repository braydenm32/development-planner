// A small aerial map for finding the block: NSW imagery with the cadastre's lots on top. Drag to
// move, the buttons or the wheel to zoom, tap a lot to pick it. Once the survey is placed, its
// boundary is drawn over the lot so the fit can be seen.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { pointInPolygon } from '../lib/geom'
import { tileLonLat, tileXY, type LonLat } from './geo'
import { imageryTile, IMAGERY_CREDIT, lotsInBox, type Lot } from './services'

const TILE = 256
export const MIN_ZOOM = 15
export const MAX_ZOOM = 20
/** Lots are fetched from this zoom in; further out there are too many to draw. */
const LOTS_FROM = 17

export interface MapViewState {
  center: LonLat
  zoom: number
}

interface Props {
  view: MapViewState
  onView: (v: MapViewState) => void
  /** Lots found by a search, shown even before the map's own fetch. */
  lots: Lot[]
  selected: string | null
  onPick: (lot: Lot) => void
  /** The survey boundary, laid on the map (lon/lat). */
  outline?: LonLat[] | null
  height?: number
}

export function MapPicker({ view, onView, lots, selected, onPick, outline, height = 300 }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [nearby, setNearby] = useState<Lot[]>([])
  const [drag, setDrag] = useState<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 320))
    ro.observe(el)
    setWidth(el.clientWidth || 320)
    return () => ro.disconnect()
  }, [])

  const z = view.zoom
  const [cx, cy] = tileXY(view.center, z).map(v => v * TILE)
  const left = cx - width / 2
  const top = cy - height / 2
  const px = (ll: LonLat): [number, number] => {
    const [x, y] = tileXY(ll, z)
    return [x * TILE - left, y * TILE - top]
  }
  const toLonLat = (x: number, y: number): LonLat => tileLonLat((x + left) / TILE, (y + top) / TILE, z)

  // The lots in view, a moment after the map stops moving.
  const viewKey = `${z}|${view.center[0].toFixed(5)}|${view.center[1].toFixed(5)}|${width}`
  useEffect(() => {
    if (z < LOTS_FROM) {
      setNearby([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      const [w, n] = tileLonLat(left / TILE, top / TILE, z)
      const [e, s] = tileLonLat((left + width) / TILE, (top + height) / TILE, z)
      lotsInBox([w, s, e, n], ctrl.signal).then(setNearby, () => {})
    }, 350)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  const shown = useMemo(() => {
    const byId = new Map<string, Lot>()
    for (const l of [...nearby, ...lots]) byId.set(l.id, l)
    return [...byId.values()]
  }, [nearby, lots])

  const tiles: { key: string; url: string; x: number; y: number }[] = []
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++)
      tiles.push({ key: `${z}/${tx}/${ty}`, url: imageryTile(z, tx, ty), x: tx * TILE - left, y: ty * TILE - top })

  const zoomTo = (nz: number, at?: [number, number]) => {
    const zz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nz))
    if (zz === z) return
    if (!at) return onView({ center: view.center, zoom: zz })
    // Keep the point under the pointer where it is.
    const ll = toLonLat(at[0], at[1])
    const [ax, ay] = tileXY(ll, zz).map(v => v * TILE)
    onView({ center: tileLonLat((ax - at[0] + width / 2) / TILE, (ay - at[1] + height / 2) / TILE, zz), zoom: zz })
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDrag({ x: e.clientX, y: e.clientY, moved: false })
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    onView({ center: tileLonLat((cx - dx) / TILE, (cy - dy) / TILE, z), zoom: z })
    setDrag({ x: e.clientX, y: e.clientY, moved: true })
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag
    setDrag(null)
    if (!d || d.moved || !box.current) return
    const r = box.current.getBoundingClientRect()
    const at = toLonLat(e.clientX - r.left, e.clientY - r.top)
    const hit = shown.find(l => pointInPolygon(at[0], at[1], l.ring))
    if (hit) onPick(hit)
  }

  const path = (ring: LonLat[]) => `M${ring.map(p => px(p).map(v => v.toFixed(1)).join(' ')).join('L')}Z`
  const sel = shown.find(l => l.id === selected)

  return (
    <div className="map-picker" style={{ height }}>
      <div
        ref={box}
        className={`map-surface${drag?.moved ? ' dragging' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        onWheel={e => {
          const r = box.current!.getBoundingClientRect()
          zoomTo(z + (e.deltaY < 0 ? 1 : -1), [e.clientX - r.left, e.clientY - r.top])
        }}
        role="application"
        aria-label="Aerial map. Drag to move, tap a lot to pick it."
      >
        {tiles.map(t => (
          <img key={t.key} src={t.url} alt="" draggable={false} className="map-tile" style={{ left: t.x, top: t.y }} />
        ))}
        <svg className="map-lines" width={width} height={height}>
          {shown.map(l => (
            <path key={l.id} d={path(l.ring)} className={l.id === selected ? 'map-lot picked' : 'map-lot'} />
          ))}
          {sel && <path d={path(sel.ring)} className="map-lot picked" />}
          {outline && outline.length > 2 && <path d={path(outline)} className="map-survey" />}
        </svg>
        {z < LOTS_FROM && <div className="map-hint">Zoom in to see the lots</div>}
      </div>
      <div className="map-zoom">
        <button className="icon-button" aria-label="Zoom in" onClick={() => zoomTo(z + 1)} disabled={z >= MAX_ZOOM}>
          +
        </button>
        <button className="icon-button" aria-label="Zoom out" onClick={() => zoomTo(z - 1)} disabled={z <= MIN_ZOOM}>
          −
        </button>
      </div>
      <div className="map-credit">{IMAGERY_CREDIT}</div>
    </div>
  )
}
