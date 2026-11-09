import type { ReactNode } from 'react'
import { CATALOG, catalogItem, furnitureName, furnitureSymbol, FURNITURE_GROUPS, normDeg, type CatalogItem, type FurnitureGroup } from '../plan/furniture'
import type { Furniture } from '../plan/model'
import { resizeFurniture, updateFurniture } from '../plan/ops'
import { usePlan } from '../plan/store'
import { Num, Select, TextField } from './fields'

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

/** The Furniture tool's options: which piece to place, picked from the catalog by room. */
export function FurniturePicker() {
  const defaults = usePlan(s => s.furnitureDefaults)
  const st = usePlan.getState()
  const group = catalogItem(defaults.kind)?.group ?? 'bedroom'
  const items = CATALOG.filter(c => c.group === group)
  return (
    <div className="tool-options">
      <Select<FurnitureGroup>
        label="Room"
        value={group}
        options={FURNITURE_GROUPS}
        onChange={g => st.setFurnitureDefaults({ ...defaults, kind: CATALOG.find(c => c.group === g)!.key })}
      />
      <div className="furniture-items" role="listbox" aria-label="Furniture to place">
        {items.map(c => (
          <button
            key={c.key}
            role="option"
            aria-selected={c.key === defaults.kind}
            className={c.key === defaults.kind ? 'on' : ''}
            onClick={() => st.setFurnitureDefaults({ ...defaults, kind: c.key })}
            title={`${c.name}, ${mm(c.size[0])} × ${mm(c.size[1])} mm`}
          >
            <Thumb item={c} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Click on the plan to place it. Press Q to turn the next piece a quarter turn before you click.</p>
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
      <Num label="Width" unit="mm" value={f.width} min={0.05} onCommit={width => size({ width })} />
      <Num label="Depth" unit="mm" value={f.depth} min={0.05} onCommit={depth => size({ depth })} />
      <Num label="Height" unit="mm" value={f.height} min={0.02} onCommit={height => size({ height })} />
      <Num label="Turned (anticlockwise)" unit="°" value={f.rotation} onCommit={turn} />
      <div className="row">
        <button className="secondary" onClick={() => turn(f.rotation + 90)} title="Turn a quarter turn anticlockwise (Q)">
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
