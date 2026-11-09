// The plan's sections: tool settings, levels, areas, the selection, position on site, cut and
// fill, and the plan file. Design, Earthworks and their More render them (src/shell/tabs), and
// the plan's floating card shows the selection (src/shell/CanvasChrome.tsx).

import { DemFlag } from '../map/DemNotes'
import { useMemo, useRef, useState } from 'react'
import { DRIVE_RUN, driveVerdict, drivewayGrade, gradeText, MAX_DRIVE_GRADE } from '../lib/drape'
import { centroidOf, pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import {
  AREA_KINDS,
  areaKind,
  earthworksOf,
  isRetaining,
  fflForGroundRL,
  OPENING_NAMES,
  floorRL,
  levelById,
  sortedLevels,
  toSite,
  wallLength,
  WALL_KINDS,
  WALL_PRESETS,
  type Area,
  type AreaKind,
  type Earthworks,
  type OpeningKind,
  type Plan,
  type RoofType,
  type StairShape,
} from '../plan/model'
import {
  addLevelAbove,
  planBounds,
  setWallLength,
  updateArea,
  updateLevel,
  updateOpening,
  updateRoof,
  updateRoom,
  updateStair,
  updateWall,
} from '../plan/ops'
import { defaultGables, levelOutlines, roofGeometry } from '../plan/roof'
import { stairComfort, stairCounts, stairLayout } from '../plan/stairs'
import { isOpeningTool, usePlan, type Tool } from '../plan/store'
import { centredPlacement, placeAtClearance, signedClearance } from '../plan/placement'
import { overText } from '../plan/setbacks'
import { housePadRL, piersGroundNote } from '../plan/platforms'
import { onNaturalGround } from '../plan/floorTypes'
import { cancelContourPick, startContourPick, useFlow } from '../flow/store'
import type { RetainingProfile } from '../plan/retaining'
import { useRetaining } from '../plan/retainingSession'
import { crossedBoundaries, levelSummaries, roomArea, roofAboveGround, sideLabel, type PlacementInfo } from '../plan/keyNumbers'
import type { Earth } from '../plan/useEarthworks'
import { copySelected, deleteLevelWithReview, deleteSelected, duplicateSelected } from '../plan/editActions'
import { selectionCounts } from '../plan/editing'
import { shortcutText } from '../nav/keys'
import { Num, Select, TextField } from './fields'
import { LevelFloorType, RoomFloorType } from './FloorTypeFields'
import { RoomGround } from './GroundOverlay'
import { RoomSun } from '../sun/RoomSun'
import { FurniturePicker, FurnitureSelection } from './FurniturePanel'
import { RetainingWallPanel } from './RetainingWallPanel'
import { WallsHere } from './WallsHere'
import { balanceCutFill, lowestOutline, retainedText, useRetainingWalls } from './planNumbers'
import { downloadPlan, importPlanFile, startNewPlan } from './planFile'
import { DrivewayLevels } from './DrivewayLevels'
import { RoofModeSwitch } from './RoofModeSwitch'

const ROOF_TYPES: { id: RoofType; label: string }[] = [
  { id: 'hip', label: 'Hip' },
  { id: 'gable', label: 'Gable' },
  { id: 'skillion', label: 'Skillion (single slope)' },
  { id: 'flat', label: 'Flat' },
]

const STAIR_SHAPES: { id: StairShape; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'l', label: 'L-shaped (quarter landing)' },
  { id: 'u', label: 'U-shaped (half landing)' },
]

const BATTERS: { value: number; label: string }[] = [
  { value: 1, label: '1 in 1 (45°)' },
  { value: 1.5, label: '1 in 1.5' },
  { value: 2, label: '1 in 2' },
  { value: 3, label: '1 in 3' },
  { value: 4, label: '1 in 4' },
  { value: 0, label: 'Retaining wall' },
]

// ---------------------------------------------------------------------------
// Tools

/** Settings for what the current tool draws next. */
export function ToolOptions({ tool: shown }: { tool?: Tool }) {
  const current = usePlan(s => s.tool)
  const tool = shown ?? current
  if (tool === 'wall') return <WallOptions />
  if (tool === 'retaining') return <RetainingToolOptions />
  if (isOpeningTool(tool)) return <OpeningOptions kind={tool} />
  if (tool === 'area') return <AreaOptions />
  if (tool === 'roof') return <RoofOptions />
  if (tool === 'stair') return <StairOptions />
  if (tool === 'furniture') return <FurniturePicker />
  return null
}

export function WallOptions() {
  const wallStyle = usePlan(s => s.wallStyle)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <label className="num">
        <span>New walls</span>
        <select
          value={WALL_PRESETS.findIndex(p => p.thickness === wallStyle.thickness && p.kind === wallStyle.kind)}
          onChange={e => {
            const p = WALL_PRESETS[Number(e.target.value)]
            if (p) st.setWallStyle({ kind: p.kind, thickness: p.thickness })
          }}
        >
          {WALL_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
          <option value={-1}>Custom</option>
        </select>
      </label>
      <Num label="Thickness" unit="mm" value={wallStyle.thickness} min={0.05} onCommit={t => st.setWallStyle({ ...wallStyle, thickness: t })} />
      <Select
        label="Kind"
        value={wallStyle.kind}
        options={WALL_KINDS}
        onChange={kind => {
          // Switch to that kind's usual thickness, unless a custom one was set.
          const preset = WALL_PRESETS.some(p => p.kind === wallStyle.kind && p.thickness === wallStyle.thickness)
          const thickness = preset ? WALL_PRESETS.find(p => p.kind === kind)!.thickness : wallStyle.thickness
          st.setWallStyle({ kind, thickness })
        }}
      />
      {wallStyle.kind === 'retaining' && (
        <p className="muted small">
          Retaining walls hold back earth on the site. Cut and fill stops at them, and their height follows the ground on each side. The
          Retaining wall tool also asks which side it holds back and how high.
        </p>
      )}
    </div>
  )
}

export function OpeningOptions({ kind: tool }: { kind: OpeningKind }) {
  const openingDefaults = usePlan(s => s.openingDefaults)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <Num label="Width" unit="mm" value={openingDefaults[tool].width} min={0.3} onCommit={width => st.setOpeningDefaults(tool, { ...openingDefaults[tool], width })} />
      <Num label="Height" unit="mm" value={openingDefaults[tool].height} min={0.3} onCommit={height => st.setOpeningDefaults(tool, { ...openingDefaults[tool], height })} />
      {tool === 'window' && (
        <Num label="Sill height" unit="mm" value={openingDefaults.window.sill} min={0} onCommit={sill => st.setOpeningDefaults('window', { ...openingDefaults.window, sill })} />
      )}
      {tool === 'door' && (
        <p className="muted small">
          A garage door?{' '}
          <button className="link" onClick={() => st.setTool('garage')}>
            Use the Garage door tool (G)
          </button>
          , which draws it without a swing.
        </p>
      )}
      {tool === 'garage' && <p className="muted small">An overhead door with no swing, drawn as a dashed line across the opening.</p>}
    </div>
  )
}

export function AreaOptions() {
  const areaDefault = usePlan(s => s.areaDefault)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <Select label="New areas" value={areaDefault} options={AREA_KINDS} onChange={k => st.setAreaDefault(k)} />
    </div>
  )
}

export function RoofOptions() {
  const roofDefaults = usePlan(s => s.roofDefaults)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <RoofModeSwitch />
      <Select label="New roofs" value={roofDefaults.type} options={ROOF_TYPES} onChange={type => st.setRoofDefaults({ ...roofDefaults, type })} />
      <Num label="Pitch" unit="°" value={roofDefaults.pitch} min={1} onCommit={pitch => st.setRoofDefaults({ ...roofDefaults, pitch: Math.min(pitch, 75) })} />
      <Num label="Overhang" unit="mm" value={roofDefaults.overhang} min={0} onCommit={overhang => st.setRoofDefaults({ ...roofDefaults, overhang })} />
    </div>
  )
}

export function StairOptions() {
  const stairDefaults = usePlan(s => s.stairDefaults)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <Select label="New stairs" value={stairDefaults.shape} options={STAIR_SHAPES} onChange={shape => st.setStairDefaults({ ...stairDefaults, shape })} />
      <Num label="Width" unit="mm" value={stairDefaults.width} min={0.6} onCommit={width => st.setStairDefaults({ ...stairDefaults, width })} />
      {stairDefaults.shape !== 'straight' && (
        <Select
          label="Turns"
          value={stairDefaults.turn}
          options={[
            { id: 'left', label: 'Left' },
            { id: 'right', label: 'Right' },
          ]}
          onChange={turn => st.setStairDefaults({ ...stairDefaults, turn })}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Levels, areas and the plan file

export function LevelsBody({ plan, beforePick }: { plan: Plan; beforePick?: () => void }) {
  const level = usePlan(s => s.activeLevel)
  const picking = useFlow(s => s.picking)
  const st = usePlan.getState()
  const levels = sortedLevels(plan)
  return (
    <>
      <ul className="levels">
        {[...levels].reverse().map(l => (
          <li key={l.id} className={l.id === level ? 'on' : ''}>
            <button className="level-btn" onClick={() => st.setActiveLevel(l.id)}>
              <span>{l.name}</span>
              <span className="muted">RL {floorRL(plan, l.id).toFixed(2)}</span>
            </button>
          </li>
        ))}
      </ul>
      {levels
        .filter(l => l.id === level)
        .map(l => (
          <div key={l.id} className="tool-options">
            <TextField label="Name" value={l.name} onCommit={name => st.commit(p => updateLevel(p, l.id, { name }))} />
            <Num label="Above ground floor" unit="mm" value={l.elevation} onCommit={elevation => st.commit(p => updateLevel(p, l.id, { elevation }))} />
            <Num label="Ceiling height" unit="mm" value={l.height} min={1.8} onCommit={height => st.commit(p => updateLevel(p, l.id, { height }))} />
            <LevelFloorType key={l.id} plan={plan} level={l.id} />
            <div className="row floor-from-contour">
              <button
                className="secondary"
                aria-pressed={picking?.level === l.id}
                onClick={() => {
                  if (picking?.level === l.id) return cancelContourPick()
                  beforePick?.()
                  startContourPick(l.id)
                }}
              >
                {picking?.level === l.id ? 'Picking a contour… (Esc)' : 'Pick a contour'}
              </button>
            </div>
            <p className="muted small">Click a contour line on the plan to put {l.name}’s floor at its RL.</p>
          </div>
        ))}
      <div className="row">
        <button
          className="secondary"
          onClick={() => {
            let id = ''
            st.commit(p => {
              const r = addLevelAbove(p)
              id = r.id
              return r.plan
            })
            if (id) st.setActiveLevel(id)
          }}
        >
          Add level above
        </button>
        {levels.length > 1 && (
          <button
            className="secondary danger"
            onClick={() => void deleteLevelWithReview(level)}
          >
            Delete level
          </button>
        )}
      </div>
      <p className="muted small">A new level starts with a copy of the external walls below it.</p>
    </>
  )
}

/** Room areas, rooms total, floor area and outdoor areas, level by level. */
export function AreasBody({ plan }: { plan: Plan }) {
  const summary = useMemo(() => levelSummaries(plan), [plan])
  return (
    <>
      {summary.map(s => (
        <div key={s.level.id} className="area-summary">
          <h3>{s.level.name}</h3>
          <dl className="stats">
            {s.rooms.map(r => (
              <FragmentRow key={r.room.id} label={r.room.name} value={r.area === null ? 'not enclosed' : `${r.area.toFixed(2)} m²`} />
            ))}
            {s.rooms.length > 0 && <FragmentRow label="Rooms total" value={`${s.rooms.reduce((t, r) => t + (r.area ?? 0), 0).toFixed(2)} m²`} strong />}
            <FragmentRow label="Floor area (outside of walls)" value={`${s.gross.area.toFixed(2)} m²`} strong />
            {s.areas.map(a => (
              <FragmentRow key={a.area.id} label={a.area.name} value={`${a.size.toFixed(2)} m²`} />
            ))}
          </dl>
        </div>
      ))}
    </>
  )
}

export function PlanFileBody({ plan }: { plan: Plan }) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <>
      <p className="muted small">Your plan saves automatically in this browser. Export it to keep a copy or move it to another computer.</p>
      <div className="row">
        <button className="secondary" onClick={() => downloadPlan(plan)}>
          Export
        </button>
        <button className="secondary" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <button className="secondary danger" onClick={startNewPlan}>
          Start again
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          await importPlanFile(f)
        }}
      />
    </>
  )
}

export function FragmentRow({ label, value, strong, bad }: { label: string; value: string; strong?: boolean; bad?: boolean }) {
  const cls = [strong && 'strong', bad && 'bad'].filter(Boolean).join(' ')
  return (
    <>
      <dt className={strong ? 'strong' : ''}>{label}</dt>
      <dd className={cls}>{value}</dd>
    </>
  )
}

// ---------------------------------------------------------------------------
// Selection

interface SelectionProps {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

/** Settings and numbers for the selected wall, opening, room, roof, stair, area or piece of furniture; a room leads with its area. */
export function SelectionPanel({ plan, survey, terrain, earth }: SelectionProps) {
  const selection = usePlan(s => s.selection)
  const extra = usePlan(s => s.extra)
  const st = usePlan.getState()
  if (!selection) return null
  // Several items: a short summary and what can be done with them together.
  if (extra.length > 0) {
    const all = [selection, ...extra]
    return (
      <section className="selection multi">
        <h2>{all.length} items selected</h2>
        <p className="muted small">{selectionCounts(all)}</p>
        <p className="muted small">Drag one to move them together, or use the arrow keys (Shift for bigger steps). Esc clears the selection.</p>
        <div className="row">
          <button className="secondary" onClick={() => copySelected()}>
            Copy
          </button>
          <button className="secondary" onClick={() => duplicateSelected()}>
            Duplicate
          </button>
          <button className="secondary danger" onClick={() => deleteSelected()}>
            Delete
          </button>
        </div>
        <p className="muted small">
          <kbd>{shortcutText('mod+C')}</kbd> copy, <kbd>{shortcutText('mod+V')}</kbd> paste, <kbd>{shortcutText('mod+D')}</kbd> duplicate.
        </p>
      </section>
    )
  }
  const pl = plan.placement
  /** Finished ground (after cut and fill) at a plan point. */
  const groundAt = (p: Vec2) => {
    const q = toSite(p, pl, survey.origin)
    return (earth?.result.grid ?? terrain.grid).sample(q[0], q[1])
  }
  const isLowest = (levelId: string) => sortedLevels(plan)[0]?.id === levelId
  const del = (
    <button
      className="secondary danger"
      onClick={() => deleteSelected()}
    >
      Delete
    </button>
  )

  if (selection.type === 'wall') {
    const w = plan.walls.find(x => x.id === selection.id)
    if (!w) return null
    if (isRetaining(w)) return <RetainingWallPanel wall={w} plan={plan} survey={survey} terrain={terrain} earth={earth} />
    return (
      <section className="selection">
        <h2>{isRetaining(w) ? 'Retaining wall' : 'Wall'}</h2>
        <WallsHere wall={w} plan={plan} />
        <Num label="Length (centreline)" unit="mm" value={wallLength(w)} min={0.05} onCommit={len => st.commit(p => setWallLength(p, w.id, len))} />
        <Num label="Thickness" unit="mm" value={w.thickness} min={0.05} onCommit={thickness => st.commit(p => updateWall(p, w.id, { thickness }))} />
        <Select label="Kind" value={w.kind} options={WALL_KINDS} onChange={kind => st.commit(p => updateWall(p, w.id, { kind }))} />
        <div className="row">{del}</div>
      </section>
    )
  }

  if (selection.type === 'opening') {
    const o = plan.openings.find(x => x.id === selection.id)
    const w = o && plan.walls.find(x => x.id === o.wall)
    if (!o || !w) return null
    const set = (patch: Partial<typeof o>) => st.commit(p => updateOpening(p, o.id, patch))
    return (
      <section className="selection">
        <h2>{OPENING_NAMES[o.kind]}</h2>
        <label className="num">
          <span>Type</span>
          <select value={o.kind} onChange={e => set({ kind: e.target.value as OpeningKind, sill: e.target.value === 'window' ? Math.max(o.sill, 0.9) : 0 })}>
            <option value="door">Door</option>
            <option value="garage">Garage door</option>
            <option value="window">Window</option>
            <option value="opening">Opening (no door)</option>
          </select>
        </label>
        <Num label="Width" unit="mm" value={o.width} min={0.3} onCommit={width => set({ width })} />
        <Num label="Height" unit="mm" value={o.height} min={0.3} onCommit={height => set({ height })} />
        {o.kind === 'window' && <Num label="Sill height" unit="mm" value={o.sill} min={0} onCommit={sill => set({ sill })} />}
        <Num
          label="From wall start to near edge"
          unit="mm"
          value={o.offset - o.width / 2}
          min={0}
          onCommit={edge => set({ offset: edge + o.width / 2 })}
        />
        {o.kind === 'door' && (
          <div className="row">
            <button className="secondary" onClick={() => set({ flipHinge: !o.flipHinge })}>
              Flip hinge
            </button>
            <button className="secondary" onClick={() => set({ flipSwing: !o.flipSwing })}>
              Flip swing
            </button>
          </div>
        )}
        <div className="row">{del}</div>
      </section>
    )
  }

  if (selection.type === 'room') {
    const r = plan.rooms.find(x => x.id === selection.id)
    if (!r) return null
    const area = roomArea(plan, r)
    return (
      <section className="selection">
        <h2>Room</h2>
        <div className="sel-figure">
          <span>Area</span>
          <b>{area === null ? 'not enclosed' : `${area.toFixed(2)} m²`}</b>
        </div>
        <TextField label="Name" value={r.name} onCommit={name => st.commit(p => updateRoom(p, r.id, { name }))} />
        <RoomFloorType key={r.id} plan={plan} room={r} />
        <RoomGround plan={plan} room={r} survey={survey} terrain={terrain} />
        <RoomSun plan={plan} room={r} survey={survey} terrain={terrain} earth={earth} />
        <p className="muted small">
          The room's shape comes from the walls around its label. Drag the label to move it.
          {isLowest(r.level) && onNaturalGround(plan, r) && ` ${piersGroundNote(earthworksOf(plan))}`}
        </p>
        <div className="row">{del}</div>
      </section>
    )
  }

  if (selection.type === 'roof') {
    const r = plan.roofs.find(x => x.id === selection.id)
    if (!r) return null
    const g = roofGeometry(r)
    const level = levelById(plan, r.level)
    const base = floorRL(plan, r.level) + (level?.height ?? 0)
    // Height above the natural ground directly below, checked at every corner and ridge point.
    const aboveGround = roofAboveGround(plan, r, g, survey, terrain)
    const set = (patch: Partial<typeof r>) => st.commit(p => updateRoof(p, r.id, patch))
    const fitToWalls = () => {
      const c = centroidOf(r.pts)
      const outlines = levelOutlines(plan.walls.filter(w => w.level === r.level))
      const o = outlines.find(x => pointInPolygon(c[0], c[1], x)) ?? outlines[0]
      if (!o) return
      const len = o.map((p, i) => Math.hypot(o[(i + 1) % o.length][0] - p[0], o[(i + 1) % o.length][1] - p[1]))
      set({ pts: o, gables: defaultGables(o), lowEdge: len.indexOf(Math.max(...len)) })
    }
    return (
      <section className="selection">
        <h2>Roof</h2>
        <Select<RoofType> label="Type" value={r.type} options={ROOF_TYPES} onChange={type => set({ type })} />
        {r.type !== 'flat' && <Num label="Pitch" unit="°" value={r.pitch} min={1} onCommit={pitch => set({ pitch: Math.min(pitch, 75) })} />}
        <Num label="Overhang" unit="mm" value={r.overhang} min={0} onCommit={overhang => set({ overhang })} />
        {r.type === 'gable' && <p className="muted small">Click the G and H markers on the plan to choose which ends are gables (G) and which are hipped (H).</p>}
        {r.type === 'skillion' && <p className="muted small">Click a marker on the plan to choose the low side. The roof rises away from it.</p>}
        {g.error ? (
          <p className="notice small">{g.error}</p>
        ) : (
          <>
          <dl className="stats">
            <FragmentRow label="Top of roof" value={`RL ${(base + g.height).toFixed(2)}`} />
            <FragmentRow label="Height above ground" value={`${aboveGround.toFixed(2)} m`} strong />
            <FragmentRow label="Roof area (sloping)" value={`${g.area.toFixed(1)} m²`} />
          </dl>
          <p className="muted small">Height above ground is the most the roof rises above the natural ground directly under it.</p>
          </>
        )}
        <p className="muted small">The roof sits on top of this level's walls. Drag its corners to reshape it.</p>
        <div className="row">
          <button className="secondary" onClick={fitToWalls}>
            Fit to walls
          </button>
          {del}
        </div>
      </section>
    )
  }

  if (selection.type === 'furniture') {
    const f = plan.furniture.find(x => x.id === selection.id)
    return f ? <FurnitureSelection item={f} del={del} /> : null
  }

  if (selection.type === 'stair') {
    const s = plan.stairs.find(x => x.id === selection.id)
    if (!s) return null
    const L = stairLayout(s)
    const bottom = floorRL(plan, s.level) + s.base
    const top = bottom + s.rise
    const comfort = stairComfort(s)
    const counts = stairCounts(s)
    const set = (patch: Partial<typeof s>) => st.commit(p => updateStair(p, s.id, patch))
    const length = s.shape === 'straight' ? (L.risers - 1) * s.going : null
    return (
      <section className="selection">
        <h2>Stair</h2>
        <Select<StairShape> label="Shape" value={s.shape} options={STAIR_SHAPES} onChange={shape => set({ shape })} />
        {s.shape !== 'straight' && (
          <Select
            label="Turns"
            value={s.turn}
            options={[
              { id: 'left', label: 'Left' },
              { id: 'right', label: 'Right' },
            ]}
            onChange={turn => set({ turn })}
          />
        )}
        <Num label="Width" unit="mm" value={s.width} min={0.5} onCommit={width => set({ width })} />
        <Num label="Tread depth (going)" unit="mm" value={s.going} min={0.15} onCommit={going => set({ going })} />
        <Num label="Bottom" unit="RL" value={bottom} onCommit={b => b < top - 0.1 && set({ base: b - floorRL(plan, s.level), rise: top - b })} />
        <Num label="Top" unit="RL" value={top} onCommit={t => t > bottom + 0.1 && set({ rise: t - bottom })} />
        <Num label="Direction" unit="°" value={s.angle} onCommit={angle => set({ angle: ((angle % 360) + 360) % 360 })} />
        <dl className="stats">
          <FragmentRow label="Risers" value={counts.risers} />
          <FragmentRow label="Treads" value={counts.treads} />
          {length !== null && <FragmentRow label="Length" value={`${length.toFixed(2)} m`} />}
          <FragmentRow label="2 risers + going" value={`${Math.round(comfort.value * 1000)} mm`} strong={!comfort.ok} />
        </dl>
        {!comfort.ok && <p className="notice small">Comfortable stairs usually have 2 risers + going between 550 and 700 mm. Change the tread depth to bring it into range.</p>}
        <div className="row">
          <button className="secondary" onClick={() => set({ angle: (s.angle + 90) % 360 })}>
            Rotate 90°
          </button>
          <button
            className="secondary"
            title="Start the stair on the ground at its bottom step, keeping its top where it is"
            onClick={() => {
              const g = Math.round(groundAt(s.at) * 1000) / 1000
              if (g < top - 0.1) set({ base: g - floorRL(plan, s.level), rise: top - g })
            }}
          >
            Start on the ground
          </button>
        </div>
        <p className="muted small">Drag the stair to move it. The level above gets an opening where the stair arrives.</p>
        <div className="row">{del}</div>
      </section>
    )
  }

  const a = plan.areas.find(x => x.id === selection.id)
  if (!a) return null
  const kind = areaKind(a)
  return (
    <section className="selection">
      <h2>Area</h2>
      <TextField label="Name" value={a.name} onCommit={name => st.commit(p => updateArea(p, a.id, { name }))} />
      <Select<AreaKind> label="Type" value={kind} options={AREA_KINDS} onChange={k => st.commit(p => updateArea(p, a.id, { kind: k }))} />
      {(kind === 'slab' || kind === 'deck') && (
        <Num
          label="Top level"
          unit="RL"
          value={floorRL(plan, a.level) + (a.top ?? 0)}
          onCommit={rl => st.commit(p => updateArea(p, a.id, { top: Math.round((rl - floorRL(plan, a.level)) * 1000) / 1000 }))}
        />
      )}
      {kind === 'slab' && <p className="muted small">The ground under a slab is levelled as part of the cut and fill.</p>}
      {kind === 'driveway' && (
        <>
          <DrivewayLevels plan={plan} area={a} survey={survey} terrain={terrain} earth={earth} />
          <DrivewayGrade plan={plan} area={a} survey={survey} terrain={terrain} earth={earth} />
        </>
      )}
      <p className="muted small">Drag the corner handles to reshape it.</p>
      <div className="row">{del}</div>
    </section>
  )
}

/** A driveway's grade along its length and across it, with whether a car can manage it. */
export function DrivewayGrade({ plan, area: a, survey, terrain, earth }: { plan: Plan; area: Area; survey: Survey; terrain: Terrain; earth: Earth | null }) {
  const pl = plan.placement
  // With levels of its own the finished ground under it is the drive itself, which Levels reads;
  // these are the natural ground's grades along it, for comparison.
  const levelled = !!a.drive
  const grade = drivewayGrade(
    levelled ? terrain.grid : (earth?.result.grid ?? terrain.grid),
    a.pts.map(p => toSite(p, pl, survey.origin)),
  )
  const tooSteep = !!grade && grade.steepest > MAX_DRIVE_GRADE
  return (
    <>
      {levelled && grade !== null && <h4 className="drive-ground">The ground there now</h4>}
      {grade !== null && (
        <>
          <dl className="stats">
            <FragmentRow label="Average grade along the drive" value={gradeText(grade.average)} />
            <FragmentRow label={`Steepest ${DRIVE_RUN} m along the drive`} value={gradeText(grade.steepest)} strong={tooSteep} />
            <FragmentRow label="Cross-fall, steepest" value={`${(grade.crossFall * 100).toFixed(0)}%`} />
          </dl>
          {!levelled && <p className={tooSteep ? 'notice small' : 'muted small'}>{driveVerdict(grade)}.</p>}
        </>
      )}
      <p className="muted small">
        {levelled
          ? 'The cut and fill grades the ground under it to its levels. These are the natural ground’s grades along it, down the middle, before the works.'
          : `A driveway follows the finished ground. Grades are along its length, down the middle; steeper than about 1 in 4 (25%) over ${DRIVE_RUN} m, about a car's wheelbase, is hard to drive on.`}
      </p>
    </>
  )
}


/** All the retaining walls together: how many, how long, the most any holds back, and their face. */
export function RetainingTotals({ walls }: { walls: RetainingProfile[] }) {
  return (
    <>
      <h3>Retaining walls</h3>
      <dl className="stats">
        <FragmentRow label={`${walls.length} wall${walls.length > 1 ? 's' : ''}, total length`} value={`${walls.reduce((t, w) => t + w.length, 0).toFixed(1)} m`} />
        <FragmentRow label="Holds back up to" value={retainedText(Math.max(...walls.map(w => w.maxHeight)))} />
        <FragmentRow label="Face, ground to ground" value={`${walls.reduce((t, w) => t + w.faceArea, 0).toFixed(1)} m²`} strong />
      </dl>
    </>
  )
}


// ---------------------------------------------------------------------------
// Cut and fill

interface EarthProps {
  plan: Plan
  survey: Survey
  earth: Earth | null
  terrain: Terrain
}

const setEarthworks = (patch: Partial<Earthworks>) =>
  usePlan.getState().commit(p => ({ ...p, earthworks: { ...earthworksOf(p), ...patch } }))

export function EarthworksIntro() {
  return (
    <p className="muted small">
      The ground is levelled under slab floors and concrete slabs, cut back under floors on piers to leave room underneath, and brought to a level where you paint it with the grading brush below. Batters slope from there back to the natural ground.
    </p>
  )
}

export function MarginField({ plan }: { plan: Plan }) {
  return <Num label="Level area past slab edges" unit="mm" value={earthworksOf(plan).margin} min={0} onCommit={margin => setEarthworks({ margin })} />
}

export function BatterFields({ plan }: { plan: Plan }) {
  const ew = earthworksOf(plan)
  return (
    <>
      <Select label="Cut slopes" value={ew.cutBatter} options={BATTERS.map(b => ({ id: b.value, label: b.label }))} onChange={cutBatter => setEarthworks({ cutBatter })} />
      <Select label="Fill slopes" value={ew.fillBatter} options={BATTERS.map(b => ({ id: b.value, label: b.label }))} onChange={fillBatter => setEarthworks({ fillBatter })} />
    </>
  )
}

export function SubfloorField({ plan }: { plan: Plan }) {
  return <Num label="Gap under floors on piers" unit="mm" value={earthworksOf(plan).subfloor} min={0} onCommit={subfloor => setEarthworks({ subfloor })} />
}


/** Volumes, the boundary warning, the retaining walls' totals and Balance. */
export function EarthworksResults({ plan, survey, earth, terrain, retaining = true }: EarthProps & { retaining?: boolean }) {
  const [message, setMessage] = useState<string | null>(null)
  const r = earth?.result
  const pad = housePadRL(plan)
  const walls = useRetainingWalls(plan, survey, terrain, earth)
  const crossed = r ? crossedBoundaries(r, survey) : null
  const balance = () => {
    const m = balanceCutFill(earth)
    if (m) setMessage(m)
  }
  return r && earth && earth.platforms.length > 0 ? (
    <>
      <dl className="stats">
        <FragmentRow label="House pad (under the slab)" value={`RL ${pad.toFixed(2)}`} />
        <FragmentRow label="Cut" value={`${r.cut.toFixed(1)} m³`} strong />
        <FragmentRow label="Fill" value={`${r.fill.toFixed(1)} m³`} strong />
        <FragmentRow label={r.cut >= r.fill ? 'Left over to take away' : 'Extra fill to bring in'} value={`${Math.abs(r.cut - r.fill).toFixed(1)} m³`} />
        <FragmentRow label="Deepest cut" value={`${r.maxCut.toFixed(2)} m`} />
        <FragmentRow label="Deepest fill" value={`${r.maxFill.toFixed(2)} m`} />
      </dl>
      <DemFlag what="these volumes" />
      {crossed && (
        <p className="notice small">
          Batters cross {crossed}. Add a suggested retaining wall below, or draw one there (Retaining wall tool), to hold them back, or move the house.
        </p>
      )}
      {retaining && walls.length > 0 && <RetainingTotals walls={walls} />}
      <div className="row">
        <button className="secondary" onClick={balance}>
          Balance cut and fill
        </button>
      </div>
      {message && <p className="muted small">{message}</p>}
      <p className="muted small">
        Volumes are in the ground; dug soil bulks up by roughly a quarter once it is loose. Retaining walls stop the batters, so the ground
        behind them stays as it is, unless a wall is given a level for that side; then it's levelled beside the wall and battered back.
      </p>
    </>
  ) : (
    <p className="muted small">Draw walls on the lowest level, or a concrete slab, or paint ground with the grading brush below, to see cut and fill.</p>
  )
}

// ---------------------------------------------------------------------------
// Position on site

const setPlacement = (patch: Partial<Plan['placement']>) => usePlan.getState().commit(p => ({ ...p, placement: { ...p.placement, ...patch } }))



export function PlacementOriginFields({ plan }: { plan: Plan }) {
  const pl = plan.placement
  return (
    <>
      <Num label="Easting of plan origin" unit="m" value={pl.e} onCommit={e => setPlacement({ e })} />
      <Num label="Northing of plan origin" unit="m" value={pl.n} onCommit={n => setPlacement({ n })} />
    </>
  )
}

export function PlacementRotationField({ plan }: { plan: Plan }) {
  return <Num label="Rotation (anticlockwise)" unit="°" value={plan.placement.rotation} onCommit={rotation => setPlacement({ rotation })} />
}

/** The ground floor's RL (it includes that floor's "Above ground floor" height). */
export function FloorLevelField({ plan }: { plan: Plan }) {
  return <Num label="Ground floor level (FFL)" unit="RL" value={floorRL(plan)} onCommit={rl => setPlacement({ ffl: fflForGroundRL(plan, rl) })} />
}

export function PlacementActions({ plan, survey, info }: { plan: Plan; survey: Survey; info: PlacementInfo | null }) {
  const pl = plan.placement
  const alignToBoundary = () => {
    if (!info) return
    const closest = [...info.sides].sort((a, b) => a.dist - b.dist)[0]
    let r = closest.angle
    while (r > 45) r -= 90
    while (r <= -45) r += 90
    setPlacement({ rotation: Math.round(r * 10) / 10 })
  }

  const centreOnBlock = () => {
    const b = planBounds(plan)
    if (!b) return
    const { e, n } = centredPlacement(pl, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], survey)
    setPlacement({ e, n })
  }

  return (
    <div className="row">
      <button className="secondary" onClick={centreOnBlock}>
        Centre on block
      </button>
      <button className="secondary" onClick={alignToBoundary} disabled={!info}>
        Square to boundary
      </button>
      {info && (
        <button className="secondary" onClick={() => setPlacement({ ffl: fflForGroundRL(plan, Math.round(info.centreRL * 20) / 20) })}>
          Floor at ground level
        </button>
      )}
    </div>
  )
}

export function GroundUnderHouse({ plan, info }: { plan: Plan; info: PlacementInfo }) {
  const ffl = floorRL(plan)
  return (
    <dl className="stats">
      <FragmentRow label="Ground under the house" value={`RL ${info.minRL.toFixed(2)} to ${info.maxRL.toFixed(2)}`} />
      <FragmentRow label="Floor vs highest ground" value={`${Math.abs(ffl - info.maxRL).toFixed(2)} m ${ffl >= info.maxRL ? 'above' : 'below'}`} />
      <FragmentRow label="Floor vs lowest ground" value={`${Math.abs(ffl - info.minRL).toFixed(2)} m ${ffl >= info.minRL ? 'above' : 'below'}`} />
    </dl>
  )
}

/**
 * Typed setbacks: the house's distance to each side of the block, which slides it square to that
 * side. A side the house goes past shows how far, below its field in red, and a negative distance.
 */
export function BoundaryDistances({ plan, survey, info }: { plan: Plan; survey: Survey; info: PlacementInfo }) {
  const gross = useMemo(() => lowestOutline(plan), [plan])
  return (
    <>
      <h3>Distance to boundary</h3>
      <p className="muted small">Type a distance to slide the house square to that side.</p>
      {info.sides.map((s, i) => (
        <div key={i} className={s.over > 0 ? 'boundary-over' : undefined}>
          <Num
            label={sideLabel(info.sides, s)}
            unit="mm"
            value={Math.round(signedClearance(s) * 1000) / 1000}
            min={0}
            onCommit={d => setPlacement(placeAtClearance(gross, plan.placement, survey, i, d))}
          />
          {s.over > 0 && <p className="over-note small">{overText(s.over)} the boundary: part of the house is outside the lot.</p>}
        </div>
      ))}
    </>
  )
}
/** Thickness of the next retaining wall, from the retaining presets. */
export function RetainingToolOptions() {
  const thickness = useRetaining(s => s.thickness)
  const presets = WALL_PRESETS.filter(p => p.kind === 'retaining')
  return (
    <div className="tool-options">
      <Select
        label="Type"
        value={thickness}
        options={presets.map(p => ({ id: p.thickness, label: p.label.replace('Retaining (', '').replace(')', '') }))}
        onChange={t => useRetaining.setState({ thickness: t })}
      />
      <p className="muted small">Click its start and its end. It then asks which side it holds back and how high, and cuts or fills the ground to suit.</p>
    </div>
  )
}
