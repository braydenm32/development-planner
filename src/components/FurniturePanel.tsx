import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { CATALOG, catalogItem, furnitureName, furnitureSymbol, FURNITURE_GROUPS, normDeg, type CatalogItem, type FurnitureGroup } from '../plan/furniture'
import { CUSTOM_BOX } from '../plan/furnitureCatalog'
import { searchCatalog } from '../plan/furnitureSearch'
import type { Furniture } from '../plan/model'
import { resizeFurniture, updateFurniture } from '../plan/ops'
import { usePlan } from '../plan/store'
import { Num, Select, TextField } from './fields'
import './copy-kinds.css'
import { forTouch } from '../phone/words'

const mm = (m: number) => Math.round(m * 1000)

/** A small drawing of a catalog item, fitted to a square. */
function Thumb({ item }: { item: CatalogItem }) {
  const [w, d] = item.size
  const s = 26 / Math.max(w, d)
  const f: Furniture = { id: item.key, level: '', kind: item.key, at: [0, 0], rotation: 0, width: w, depth: d, height: item.size[2] }
  const P = (p: [number, number]) => `${(15 + p[0] * s).toFixed(1)} ${(15 - p[1] * s).toFixed(1)}`
  const parts = furnitureSymbol(f).parts
  return (
    <svg className="furniture-thumb" viewBox="0 0 30 30" aria-hidden="true">
      <path className="fill" d={parts.filter(p => p.closed).map(p => `M${p.pts.map(P).join('L')}Z`).join('')} />
      <path d={parts.filter(p => !p.closed).map(p => `M${p.pts.map(P).join('L')}`).join('')} />
    </svg>
  )
}

/** How far the pointer travels with the button down before a press on a piece becomes a drag (px). */
const DRAG_START = 5

/**
 * Dragging a piece from the list onto the plan (a mouse or pen; a finger scrolls the list, and
 * taps to pick). Once the pointer has moved, the piece is the one the Furniture tool places, so
 * the plan draws it under the pointer and puts it down where the button is let go, exactly as a
 * click there would. Until the pointer reaches the plan a small tag follows it.
 */
function useCatalogDrag() {
  const [tag, setTag] = useState<{ item: CatalogItem; x: number; y: number } | null>(null)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])
  const start = (item: CatalogItem, e: ReactPointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const [x0, y0] = [e.clientX, e.clientY]
    let dragging = false
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START) return
      if (!dragging) {
        dragging = true
        const st = usePlan.getState()
        st.setFurnitureDefaults({ ...st.furnitureDefaults, kind: item.key })
        st.setTool('furniture')
        document.body.classList.add('dragging-furniture')
      }
      const overPlan = !!(ev.target as Element | null)?.closest?.('.plan-svg')
      setTag(overPlan ? null : { item, x: ev.clientX, y: ev.clientY })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.classList.remove('dragging-furniture')
      stop.current = null
      setTag(null)
    }
    stop.current?.()
    stop.current = end
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  return { tag, start }
}

/** The Furniture tool's options: which piece to place, found by typing or picked from the catalog by room. */
export function FurniturePicker() {
  const defaults = usePlan(s => s.furnitureDefaults)
  const st = usePlan.getState()
  const [query, setQuery] = useState('')
  const drag = useCatalogDrag()
  const group = catalogItem(defaults.kind)?.group ?? 'bedroom'
  const searching = query.trim() !== ''
  const items = searching ? searchCatalog(query) : CATALOG.filter(c => c.group === group)
  // The option Tab lands on: the one last focused, else the piece picked, else the first.
  const [active, setActive] = useState<string | null>(null)
  const roving = (items.find(c => c.key === active) ?? items.find(c => c.key === defaults.kind) ?? items[0])?.key
  return (
    <div className="tool-options">
      <label className="num furniture-search">
        <span>Find a piece</span>
        <input className="text" type="search" value={query} placeholder="bed, couch, fridge…" onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Escape' && query && (e.stopPropagation(), setQuery(''))} />
      </label>
      {!searching && (
        <Select<FurnitureGroup>
          label="Room"
          value={group}
          options={FURNITURE_GROUPS}
          onChange={g => st.setFurnitureDefaults({ ...defaults, kind: CATALOG.find(c => c.group === g)!.key })}
        />
      )}
      <p className="furniture-found" role="status">
        {searching ? (items.length === 1 ? '1 piece found' : `${items.length} pieces found`) : ''}
      </p>
      {searching && !items.length && (
        <p className="muted small">
          Nothing called “{query.trim()}”. Clear the box to browse by room, or use the{' '}
          <button
            className="link"
            onClick={() => {
              st.setFurnitureDefaults({ ...defaults, kind: CUSTOM_BOX })
              setQuery('custom')
            }}
          >
            Custom box
          </button>{' '}
          and give it a name and a size.
        </p>
      )}
      <div className="furniture-items" role="listbox" aria-label="Furniture to place">
        {items.map(c => (
          <button
            key={c.key}
            role="option"
            aria-selected={c.key === defaults.kind}
            // One Tab stop for the whole list, as the tool rail is; the arrow keys move within it (src/nav/arrowKeys.ts).
            tabIndex={c.key === roving ? 0 : -1}
            onFocus={() => setActive(c.key)}
            className={c.key === defaults.kind ? 'on' : ''}
            onClick={() => st.setFurnitureDefaults({ ...defaults, kind: c.key })}
            onPointerDown={e => drag.start(c, e)}
            title={`${c.name}, ${mm(c.size[0])} × ${mm(c.size[1])} mm`}
          >
            <Thumb item={c} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <p className="muted small">
        {forTouch('Click a piece, then click on the plan to place it')}
        <span className="mouse-only">, or drag it straight onto the plan</span>.{forTouch(' Press Q to turn the next piece a quarter turn before you place it.')}
        {defaults.kind === CUSTOM_BOX && ' A custom box stands in for anything else: place it, then give it a name and a size on its card.'}
      </p>
      {drag.tag && (
        <div className="furniture-drag-tag" style={{ left: drag.tag.x, top: drag.tag.y }} aria-hidden="true">
          <Thumb item={drag.tag.item} />
          <span>{drag.tag.item.name}</span>
        </div>
      )}
    </div>
  )
}

/** Settings for a selected piece of furniture. */
export function FurnitureSelection({ item: f, del }: { item: Furniture; del: ReactNode }) {
  const st = usePlan.getState()
  const size = (patch: Partial<Pick<Furniture, 'width' | 'depth' | 'height'>>) => st.commit(p => resizeFurniture(p, f.id, patch))
  const turn = (rotation: number) => st.commit(p => updateFurniture(p, f.id, { rotation: normDeg(rotation) }))
  const item = catalogItem(f.kind)
  const original = item && (item.size[0] !== f.width || item.size[1] !== f.depth || item.size[2] !== f.height)
  return (
    <section className="selection">
      <h2>{item?.name ?? 'Furniture'}</h2>
      <TextField label="Name" value={furnitureName(f)} onCommit={label => st.commit(p => updateFurniture(p, f.id, { label: label === item?.name ? undefined : label }))} />
      <Num label="Width" unit="mm" value={f.width} min={0.05} max={10} onCommit={width => size({ width })} />
      <Num label="Depth" unit="mm" value={f.depth} min={0.05} max={10} onCommit={depth => size({ depth })} />
      <Num label="Height" unit="mm" value={f.height} min={0.02} max={5} onCommit={height => size({ height })} />
      {/* Clockwise, as the house's own turn is given (Earthworks › Place); the plan keeps it anticlockwise. */}
      <Num label="Turned clockwise" unit="°" value={normDeg(-f.rotation)} onCommit={cw => turn(-cw)} />
      <div className="row">
        <button className="secondary" onClick={() => turn(f.rotation - 90)} title="Turn a quarter turn clockwise (Q)">
          Turn 90°
        </button>
        {item && original && (
          <button className="secondary" onClick={() => size({ width: item.size[0], depth: item.size[1], height: item.size[2] })}>
            Usual size
          </button>
        )}
      </div>
      <p className="muted small">
        Drag it to move it; {item?.wall ? 'its back snaps flush to a wall, and into a corner. ' : ''}Drag the round handle to turn it, or press Q. The
        distances to the walls show on the plan. Changing the depth keeps its back where it is.
      </p>
      <div className="row">{del}</div>
    </section>
  )
}
