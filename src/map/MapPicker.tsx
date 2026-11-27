// An aerial map for finding the block: NSW imagery with the cadastre's lots on top. Drag to
// move, the buttons or the wheel to zoom, click (or tap) a lot to pick it. From the keyboard the
// arrow keys move it, + and − zoom, and Enter picks the lot under the cross in the middle; the
// four move buttons do the same for anyone who can't drag. While the lot is being
// found it fills the canvas (`height="fill"`); once the survey is placed it's a small map in the
// panel, with the survey's boundary drawn over the lot so the fit can be seen.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { pointInPolygon } from '../lib/geom'
import { tileLonLat, tileXY, type LonLat } from './geo'
import { crossWords, lotAt, mapKey, PAN_STEP } from './keys'
import { imageryTile, IMAGERY_CREDIT, lotsInBox, type Lot } from './services'
import { pointWord } from './words'

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
  /** Pixels, or the whole of what it sits in. */
  height?: number | 'fill'
  /** The map can't be reached (no photo tiles load, or the lots don't come): true, and false once it can. */
  onTrouble?: (trouble: boolean) => void
}

export function MapPicker({ view, onView, lots, selected, onPick, outline, height: asked = 300, onTrouble }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [boxH, setBoxH] = useState(300)
  const fill = asked === 'fill'
  const height = fill ? boxH : asked
  const [nearby, setNearby] = useState<Lot[]>([])
  const [drag, setDrag] = useState<{ x: number; y: number; moved: boolean } | null>(null)
  /** The keyboard is driving: the cross shows, and what's under it is read out. */
  const [keys, setKeys] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const size = () => {
      setWidth(el.clientWidth || 320)
      if (el.clientHeight) setBoxH(el.clientHeight)
    }
    const ro = new ResizeObserver(size)
    ro.observe(el)
    size()
    return () => ro.disconnect()
  }, [])

  // Tiles that came and that failed, to tell a dead connection from a slow one.
  const tileState = useRef({ ok: 0, failed: 0 })
  const [lotsFailed, setLotsFailed] = useState(false)
  const tileDone = (ok: boolean) => {
    const t = tileState.current
    if (ok) t.ok++
    else t.failed++
    report()
  }
  const report = () => {
    const t = tileState.current
    onTrouble?.((t.ok === 0 && t.failed >= 2) || lotsFailed)
  }

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
      lotsInBox([w, s, e, n], ctrl.signal).then(
        l => {
          setNearby(l)
          setLotsFailed(false)
        },
        () => {
          if (!ctrl.signal.aborted) setLotsFailed(true)
        },
      )
    }, 350)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(report, [lotsFailed])

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

  const pan = (dx: number, dy: number) => onView({ center: tileLonLat((cx + dx) / TILE, (cy + dy) / TILE, z), zoom: z })
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    const k = mapKey(e.key, e.shiftKey)
    if (!k) return
    e.preventDefault()
    // The map's keys are its own: the plan beside it doesn't also zoom or nudge.
    e.stopPropagation()
    setKeys(true)
    if ('pan' in k) pan(k.pan[0], k.pan[1])
    else if ('zoom' in k) zoomTo(z + k.zoom)
    else if (under) onPick(under)
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    setKeys(false)
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
  const under = lotAt(view.center, shown)

  return (
    <div className={`map-picker${fill ? ' fill' : ''}`} style={fill ? undefined : { height }}>
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
        onKeyDown={onKey}
        onBlur={() => setKeys(false)}
        tabIndex={0}
        role="application"
        aria-label={`Aerial map. Drag or use the arrow keys to move, plus and minus to zoom. ${pointWord()} a lot to pick it, or press Enter for the lot under the cross in the middle.`}
      >
        {tiles.map(t => (
          <img key={t.key} src={t.url} alt="" draggable={false} className="map-tile" style={{ left: t.x, top: t.y }} onLoad={() => tileDone(true)} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; tileDone(false) }} />
        ))}
        <svg className="map-lines" width={width} height={height}>
          {shown.map(l => (
            <path key={l.id} d={path(l.ring)} className={l.id === selected ? 'map-lot picked' : 'map-lot'} />
          ))}
          {sel && <path d={path(sel.ring)} className="map-lot picked" />}
          {outline && outline.length > 2 && <path d={path(outline)} className="map-survey" />}
        </svg>
        {z < LOTS_FROM && <div className="map-hint">Zoom in to see the lots</div>}
        {keys && <span className="map-cross" aria-hidden="true" />}
      </div>
      {keys && (
        <p className="sr-only" role="status">
          {crossWords(under, z >= LOTS_FROM)}
        </p>
      )}
      <div className="map-zoom">
        <button className="icon-button" aria-label="Zoom in" onClick={() => zoomTo(z + 1)} disabled={z >= MAX_ZOOM}>
          +
        </button>
        <button className="icon-button" aria-label="Zoom out" onClick={() => zoomTo(z - 1)} disabled={z <= MIN_ZOOM}>
          −
        </button>
      </div>
      {/* Moving the map without a drag: each press is one arrow key's worth. */}
      <div className="map-pan" role="group" aria-label="Move the map">
        <button className="icon-button up" aria-label="Move the map north" onClick={() => pan(0, -PAN_STEP)}>
          ↑
        </button>
        <button className="icon-button left" aria-label="Move the map west" onClick={() => pan(-PAN_STEP, 0)}>
          ←
        </button>
        <button className="icon-button down" aria-label="Move the map south" onClick={() => pan(0, PAN_STEP)}>
          ↓
        </button>
        <button className="icon-button right" aria-label="Move the map east" onClick={() => pan(PAN_STEP, 0)}>
          →
        </button>
      </div>
      <div className="map-credit">{IMAGERY_CREDIT}</div>
    </div>
  )
}
