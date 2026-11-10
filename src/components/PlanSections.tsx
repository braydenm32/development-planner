// The plan's sections: tool settings, levels, areas, the selection, position on site, cut and
// fill, and the plan file. Design, Earthworks and their More render them (src/shell/tabs), and
// the plan's floating card shows the selection (src/shell/CanvasChrome.tsx).

import { useMemo, useRef } from 'react'
import { DRIVE_RUN, driveVerdict, drivewayGrade, gradeText, MAX_DRIVE_GRADE } from '../lib/drape'
import { centroidOf, pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import {
  AREA_KINDS,
  areaKind,
  earthworksOf,
  isRetaining,
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
  type Wall,
} from '../plan/model'
import {
  setWallLength,
  updateArea,
  updateOpening,
  updateRoof,
  updateRoom,
  updateStair,
  updateWall,
} from '../plan/ops'
import { defaultGables, levelOutlines, roofGeometry } from '../plan/roof'
import { stairCounts, stairJoins, stairLayout, stairMeetsNoFloor, stairRules, type StairRule } from '../plan/stairs'
import { isOpeningTool, usePlan, type Tool } from '../plan/store'
import { placeAtClearance, signedClearance } from '../plan/placement'
import { overText } from '../plan/setbacks'
import { piersGroundNote } from '../plan/platforms'
import { onNaturalGround } from '../plan/floorTypes'
import type { RetainingProfile } from '../plan/retaining'
import { useRetaining } from '../plan/retainingSession'
import { earthAgainstWall, roomArea, roofAboveGround, sideLabel, type PlacementInfo } from '../plan/keyNumbers'
import type { Earth } from '../plan/useEarthworks'
import { copySelected, deleteSelected, duplicateSelected } from '../plan/editActions'
import { selectionCounts } from '../plan/editing'
import { shortcutText } from '../nav/keys'
import { Num, Select, TextField } from './fields'
import { RoomFloorType } from './FloorTypeFields'
import { RoomGround } from './GroundOverlay'
import { RoomSun } from '../sun/RoomSun'
import { FurniturePicker, FurnitureSelection } from './FurniturePanel'
import { RetainingWallPanel } from './RetainingWallPanel'
import { WallsHere } from './WallsHere'
import { houseOutline, retainedText } from './planNumbers'
import { downloadPlan, importPlanFile, startNewPlan } from './planFile'
import { navigate } from '../nav/router'
import { RoofModeSwitch } from './RoofModeSwitch'
import { RoofLineFields } from './RoofLineFields'
import { SketchColours, SketchOptions, SketchSelection } from '../sketch/SketchPanel'
import { colourSketch } from '../sketch/actions'
import { colourOf } from '../sketch/colours'
import './roofs-stairs.css'
import { roofEavesRL, wallsUnderRoofline, wallTopRL } from '../plan/roofline'

const ROOF_TYPES: { id: RoofType; label: string }[] = [
  { id: 'hip', label: 'Hip' },
  { id: 'gable', label: 'Gable' },
  { id: 'skillion', label: 'Skillion (single slope)' },
  { id: 'flat', label: 'Flat' },
]

/** The stair panel's "Goes up to" choice for a top typed in by hand, not joined to a level. */
const CUSTOM_TOP = '__custom'

const STAIR_SHAPES: { id: StairShape; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'l', label: 'L-shaped (quarter landing)' },
  { id: 'u', label: 'U-shaped (half landing)' },
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
  if (tool === 'sketch') return <SketchOptions />
  return null
}

/** Draw retaining walls with their own tool, at this thickness. */
function pickRetainingTool(thickness: number) {
  useRetaining.setState({ thickness })
  usePlan.getState().setTool('retaining')
}

export function WallOptions() {
  const wallStyle = usePlan(s => s.wallStyle)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <label className="num">
        <span>Wall type</span>
        <select
          value={WALL_PRESETS.findIndex(p => p.thickness === wallStyle.thickness && p.kind === wallStyle.kind)}
          onChange={e => {
            const p = WALL_PRESETS[Number(e.target.value)]
            if (!p) return
            // One tool draws retaining walls, and asks once what they hold back.
            if (p.kind === 'retaining') return pickRetainingTool(p.thickness)
            st.setWallStyle({ kind: p.kind, thickness: p.thickness })
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
          if (kind === 'retaining') return pickRetainingTool(WALL_PRESETS.find(p => p.kind === 'retaining')!.thickness)
          // Switch to that kind's usual thickness, unless a custom one was set.
          const preset = WALL_PRESETS.some(p => p.kind === wallStyle.kind && p.thickness === wallStyle.thickness)
          const thickness = preset ? WALL_PRESETS.find(p => p.kind === kind)!.thickness : wallStyle.thickness
          st.setWallStyle({ kind, thickness })
        }}
      />
      <p className="muted small">A retaining preset or kind picks the Retaining wall tool (T), which asks once which side a wall holds back and how high.</p>
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

/** What each kind of area does, so a new slab's levelled ground is never a surprise. */
const AREA_NOTES: Record<AreaKind, string> = {
  slab: 'A concrete slab levels the ground under it: it adds to the cut and fill.',
  driveway: 'Follows the finished ground, so it leaves the ground as it is.',
  deck: 'Stands on posts, so it leaves the ground as it is.',
  garden: 'An outline on the ground for a lawn or garden bed. It leaves the ground as it is.',
}

export function AreaOptions() {
  const areaDefault = usePlan(s => s.areaDefault)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <Select label="Type" value={areaDefault} options={AREA_KINDS} onChange={k => st.setAreaDefault(k)} />
      <p className="muted small">{AREA_NOTES[areaDefault]}</p>
    </div>
  )
}

export function RoofOptions() {
  const roofDefaults = usePlan(s => s.roofDefaults)
  const st = usePlan.getState()
  return (
    <div className="tool-options">
      <RoofModeSwitch />
      <Select label="Type" value={roofDefaults.type} options={ROOF_TYPES} onChange={type => st.setRoofDefaults({ ...roofDefaults, type })} />
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
      <Select label="Shape" value={stairDefaults.shape} options={STAIR_SHAPES} onChange={shape => st.setStairDefaults({ ...stairDefaults, shape })} />
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
// The plan file (levels and areas are in ./LevelsPanel.tsx)

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
    // Sketch lines among them can be coloured together (kept measurements stay grey).
    const ids = new Set(all.filter(x => x.type === 'sketch').map(x => x.id))
    const lines = (plan.sketch ?? []).filter(x => ids.has(x.id) && x.kind !== 'measure')
    const shared = lines.length && lines.every(x => colourOf(x) === colourOf(lines[0])) ? colourOf(lines[0]) : null
    return (
      <section className="selection multi">
        <h2>{all.length} items selected</h2>
        <p className="muted small">{selectionCounts(all)}</p>
        {lines.length > 0 && (
          <div className="sketch-colour-pick">
            <span className="small">{lines.length === 1 ? 'Sketch line colour' : `Colour of the ${lines.length} sketch lines`}</span>
            <SketchColours value={shared} onChange={c => colourSketch(lines.map(x => x.id), c)} label="Colour of the selected sketch lines" />
          </div>
        )}
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
  const del = (
    <button
      className="secondary danger"
      onClick={() => deleteSelected()}
    >
      Delete
    </button>
  )

  if (selection.type === 'sketch') {
    const item = plan.sketch?.find(x => x.id === selection.id)
    return item ? <SketchSelection item={item} plan={plan} survey={survey} terrain={terrain} /> : null
  }

  if (selection.type === 'wall') {
    const w = plan.walls.find(x => x.id === selection.id)
    if (!w) return null
    if (isRetaining(w)) return <RetainingWallPanel wall={w} plan={plan} survey={survey} terrain={terrain} earth={earth} />
    return (
      <section className="selection">
        <h2>{w.kind === 'internal' ? 'Internal wall' : 'External wall'}</h2>
        <WallsHere wall={w} plan={plan} />
        <WallFacts plan={plan} wall={w} groundAt={groundAt} />
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
          {onNaturalGround(plan, r) && ` ${piersGroundNote(earthworksOf(plan))}`}
        </p>
        <div className="row">{del}</div>
      </section>
    )
  }

  if (selection.type === 'roof') {
    const r = plan.roofs.find(x => x.id === selection.id)
    if (!r) return null
    const g = roofGeometry(r)
    const base = roofEavesRL(plan, r)
    // Height above the natural ground directly below, checked at every corner and ridge point.
    const aboveGround = roofAboveGround(plan, r, g, survey, terrain)
    const set = (patch: Partial<typeof r>) => st.commit(p => updateRoof(p, r.id, patch))
    const fitToWalls = () => {
      const c = centroidOf(r.pts)
      const outlines = levelOutlines(wallsUnderRoofline(plan, r.level))
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
        <RoofLineFields plan={plan} roof={r} />
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
        <p className="muted small">Drag its corners to reshape it.</p>
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
    const rules = stairRules(s)
    const joins = stairJoins(plan, s)
    const counts = stairCounts(s)
    const set = (patch: Partial<typeof s>) => st.commit(p => updateStair(p, s.id, patch))
    const length = s.shape === 'straight' ? (L.risers - 1) * s.going : null
    // The floors it can go up to: any above its bottom step, or a top typed in by hand.
    const from = levelById(plan, s.level)
    const ups = sortedLevels(plan).filter(l => l.id !== s.level && l.elevation > (from?.elevation ?? 0) + s.base + 0.1)
    const joined = typeof s.toLevel === 'string' ? s.toLevel : CUSTOM_TOP
    const goesTo = [...ups.map(l => ({ id: l.id, label: l.name })), { id: CUSTOM_TOP, label: 'Custom top RL' }]
    const typedTop = (t: number) => {
      if (t <= bottom + 0.1) return
      // Typing the joined floor's own level keeps it joined; any other top is the person's own.
      const keep = typeof s.toLevel === 'string' && Math.abs(floorRL(plan, s.toLevel) - t) < 0.0005
      set({ rise: t - bottom, ...(keep ? {} : { toLevel: null }) })
    }
    return (
      <section className="selection">
        <h2>Stair</h2>
        <div className="stair-joins">
          <span>
            {joins.joined ? 'Joins' : 'From'} <b>{joins.from}</b> → <b>{joins.to}</b>
          </span>
          <strong>{joins.risers}</strong>
        </div>
        <ul className="stair-rules" aria-label="NCC stair limits">
          {rules.map(r => (
            <li key={r.id} className={r.ok ? 'ok' : 'bad'}>
              {r.ok ? '✓' : '✗'} {r.label} {Math.round(r.value * 1000)} mm <span>({Math.round(r.range[0] * 1000)}–{Math.round(r.range[1] * 1000)})</span>
            </li>
          ))}
        </ul>
        {rules.some(r => !r.ok) && <p className="notice small">{stairRuleAdvice(rules)}</p>}
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
        <Select label="Goes up to" value={joined} options={goesTo} onChange={id => set({ toLevel: id === CUSTOM_TOP ? null : id })} />
        <Num label="Bottom" unit="RL" value={bottom} onCommit={b => b < top - 0.1 && set({ base: b - floorRL(plan, s.level), rise: top - b })} />
        <Num label="Top" unit="RL" value={top} onCommit={typedTop} />
        {stairMeetsNoFloor(plan, s) && (
          <p className="notice small">Its top (RL {top.toFixed(2)}) meets no floor. Pick the level it goes up to, or add a level above.</p>
        )}
        <Num label="Direction" unit="°" value={s.angle} onCommit={angle => set({ angle: ((angle % 360) + 360) % 360 })} />
        <dl className="stats">
          <FragmentRow label="Treads" value={counts.treads} />
          {length !== null && <FragmentRow label="Length" value={`${length.toFixed(2)} m`} />}
        </dl>
        <p className="muted small">The limits are the NCC’s for a house stair: risers 115–190 mm, going 240–355 mm, and 2 risers + going 550–700 mm, the range people find comfortable.</p>
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
        <p className="muted small">Drag the stair to move it. The floor it goes up to gets an opening where the stair arrives, and its top follows that floor's level.</p>
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
        <p className="muted small">
          Its levels, grade and street crossing are in{' '}
          <button className="link" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'driveway', view: 'plan' })}>
            Earthworks › Driveway
          </button>
          .
        </p>
      )}
      <p className="muted small">Drag the corner handles to reshape it.</p>
      <div className="row">{del}</div>
    </section>
  )
}

/** A house wall's level, its height and top, and how far the ground comes up it. */
function WallFacts({ plan, wall: w, groundAt }: { plan: Plan; wall: Wall; groundAt: (p: Vec2) => number }) {
  const level = levelById(plan, w.level)
  if (!level) return null
  const floor = floorRL(plan, w.level)
  // Inside walls stand on the floor; only an outside wall can have earth against it.
  const outside = w.kind === 'external'
  const earth = outside ? earthAgainstWall(w, floor, groundAt) : -Infinity
  const buried = earth > 0.05
  // An outside wall under a roof whose eaves sit above the ceiling rises to meet it.
  const top = wallTopRL(plan, w)
  const raised = top > floor + level.height + 0.0005
  return (
    <>
      <dl className="stats">
        <FragmentRow label="On" value={`${level.name}, floor RL ${floor.toFixed(2)}`} />
        <FragmentRow
          label="Height"
          value={
            raised
              ? `${Math.round((top - floor) * 1000)} mm, up to the roof at RL ${top.toFixed(2)}`
              : `${Math.round(level.height * 1000)} mm, top RL ${(floor + level.height).toFixed(2)}`
          }
        />
        {outside && <FragmentRow label="Ground against it" value={buried ? `up to ${Math.round(earth * 1000)} mm above the floor` : 'below the floor'} strong={buried} />}
      </dl>
      {buried && (
        <p className="notice small">
          Earth comes up this wall. A wall holding back earth has to be built as a retaining wall (tanked masonry or concrete), or the ground cut back
          clear of it.
        </p>
      )}
      <p className="muted small">
        {raised
          ? `It runs up past ${level.name}’s ceiling to meet the roof, whose eaves sit higher; change where the roof sits in Roofs.`
          : `Its height is ${level.name}’s ceiling height; change it in Floors.`}
      </p>
    </>
  )
}

/** What to change when a stair is outside the NCC's limits, in a sentence. */
function stairRuleAdvice(rules: StairRule[]): string {
  const bad = new Set(rules.filter(r => !r.ok).map(r => r.id))
  if (bad.has('riser')) return 'Its risers are under 115 mm: the climb is too small for a stair. Use a ramp, or start the stair lower.'
  if (bad.has('going')) return 'Its tread depth (going) is outside 240–355 mm. Change it to bring the stair into range.'
  return 'Comfortable stairs have 2 risers + going between 550 and 700 mm. Change the tread depth to bring it into range.'
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


const setEarthworks = (patch: Partial<Earthworks>) =>
  usePlan.getState().commit(p => ({ ...p, earthworks: { ...earthworksOf(p), ...patch } }))

export function MarginField({ plan }: { plan: Plan }) {
  return <Num label="Level area past slab edges" unit="mm" value={earthworksOf(plan).margin} min={0} onCommit={margin => setEarthworks({ margin })} />
}

export function SubfloorField({ plan }: { plan: Plan }) {
  return <Num label="Gap under floors on piers" unit="mm" value={earthworksOf(plan).subfloor} min={0} onCommit={subfloor => setEarthworks({ subfloor })} />
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

export function GroundUnderHouse({ plan, info }: { plan: Plan; info: PlacementInfo }) {
  const ffl = floorRL(plan)
  // The ground is under every level; the floor compared with it is the lowest one.
  const floor = plan.levels.length > 1 ? 'Lowest floor' : 'Floor'
  return (
    <dl className="stats">
      <FragmentRow label={plan.levels.length > 1 ? 'Ground under the house (all levels)' : 'Ground under the house'} value={`RL ${info.minRL.toFixed(2)} to ${info.maxRL.toFixed(2)}`} />
      <FragmentRow label={`${floor} vs highest ground`} value={`${Math.abs(ffl - info.maxRL).toFixed(2)} m ${ffl >= info.maxRL ? 'above' : 'below'}`} />
      <FragmentRow label={`${floor} vs lowest ground`} value={`${Math.abs(ffl - info.minRL).toFixed(2)} m ${ffl >= info.minRL ? 'above' : 'below'}`} />
    </dl>
  )
}

/**
 * Typed setbacks: the house's distance to each side of the block, which slides it square to that
 * side. A side the house goes past shows how far, below its field in red, and a negative distance.
 */
export function BoundaryDistances({ plan, survey, info }: { plan: Plan; survey: Survey; info: PlacementInfo }) {
  const gross = useMemo(() => houseOutline(plan).rings, [plan])
  return (
    <>
      <h3>Distance to boundary</h3>
      <p className="muted small">
        Type a distance to slide the house square to that side.{info.sides.some(s => s.level) && ' Each is measured from the nearest level.'}
      </p>
      {info.sides.map((s, i) => (
        <div key={i} className={s.over > 0 ? 'boundary-over' : undefined}>
          <Num
            label={s.level ? `${sideLabel(info.sides, s)}, ${s.level}` : sideLabel(info.sides, s)}
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
      <p className="muted small">Click its start, then each corner; double-click or Esc to finish. Its panel asks once which side it holds back and how high, for every piece, and cuts or fills the ground to suit.</p>
    </div>
  )
}
