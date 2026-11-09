// How a floor is built, as a field: each level's floor type in Design › Floors (the old layout's
// Levels), and a room's own in its settings. The usual two show first; the rest wait behind
// "More floor types", as in the card that asks.

import { useContext, useState } from 'react'
import type { Vec2 } from '../lib/geom'
import { buildingOutline, faceAround, offsetPolygon, planarFaces } from '../plan/geometry'
import { cutUnderPiers } from '../plan/platforms'
import { ShellContext } from '../shell/context'
import {
  DEFAULT_FLOOR_TYPE,
  FLOOR_TYPES,
  FRAMED_FLOOR,
  floorTypeChoices,
  floorTypeInfo,
  isLowestLevel,
  levelBuildsAs,
  levelFloorAnswer,
  levelFloorChoices,
  levelFloorType,
  ON_GROUND_GAP,
  roomFloorType,
  setLevelFloorType,
  type FloorTypeId,
  type LevelFloor,
} from '../plan/floorTypes'
import { earthworksOf, levelById, type Plan, type Room } from '../plan/model'
import { updateRoom } from '../plan/ops'
import { usePlan } from '../plan/store'
import { Select } from './fields'

/** The "More floor types" link, while some are hidden. */
function MoreLink({ shown, onMore }: { shown: number; onMore: () => void }) {
  if (shown >= FLOOR_TYPES.length) return null
  return (
    <button type="button" className="link floor-more" onClick={onMore}>
      More floor types
    </button>
  )
}

/**
 * A level's floor type. A level on the ground (the lowest, or a split level within about a metre
 * of the ground under its walls: `onGround`) chooses from the floor types; one well above the
 * ground is framed, or a suspended slab. Whatever the level holds already always shows.
 */
export function LevelFloorType({ plan, level, onGround }: { plan: Plan; level: string; onGround?: boolean }) {
  const [more, setMore] = useState(false)
  const lowest = isLowestLevel(plan, level)
  const grounded = onGround || lowest
  const answer = levelFloorAnswer(plan, level)
  const t = levelBuildsAs(plan, level)
  const choices = levelFloorChoices(grounded, lowest, more, answer)
  // Not chosen yet: on the ground that's asked for; well above it, framed is the answer already.
  const unset = answer === undefined && grounded
  const options: { id: LevelFloor | ''; label: string }[] = [
    ...(unset ? [{ id: '' as const, label: t === 'framed' ? 'Not chosen yet (framed for now)' : 'Not chosen yet (builds as a slab)' }] : []),
    ...choices,
  ]
  // Built as if on the ground (a slab or piers) though it's well above it.
  const high = !grounded && t !== 'framed' && t !== 'suspended'
  const gap = `${Math.round(ON_GROUND_GAP * 1000) / 1000} m`
  return (
    <div className="floor-type-field">
      <Select<LevelFloor | ''>
        label="Floor type"
        value={unset ? '' : (answer ?? t)}
        options={options}
        onChange={id => usePlan.getState().commit(p => setLevelFloorType(p, level, id || undefined))}
      />
      {grounded && <MoreLink shown={choices.filter(c => c.id !== FRAMED_FLOOR.id).length} onMore={() => setMore(true)} />}
      <p className="muted small">
        {t === 'framed' ? FRAMED_FLOOR.earthworks : `${floorTypeInfo(t).earthworks} Rooms follow this unless a room says otherwise.`}
        {grounded && !lowest && ` It’s within ${gap} of the ground under its walls, so it can sit on it.`}
        {!grounded && !high && ' This level is well above the ground.'}
      </p>
      {high && <p className="small floor-type-warn">This level is more than {gap} above the ground under all its walls: built this way it needs a lot of fill or tall piers.</p>}
      {t !== 'framed' && floorTypeInfo(t).ground === 'natural' && (
        <PiersCut plan={plan} level={level} rings={buildingOutline(planarFaces(plan.walls.filter(w => w.level === level))).outlines} />
      )}
    </div>
  )
}

/** A room's own floor type on a level built on the ground, or "same as the floor". */
export function RoomFloorType({ plan, room }: { plan: Plan; room: Room }) {
  const [more, setMore] = useState(false)
  // A room has a floor of its own only on a level built on the ground; a framed level's rooms are framed.
  const lt = levelFloorType(plan, room.level)
  if (lt === 'framed') return null
  const levelType = floorTypeInfo(lt ?? DEFAULT_FLOOR_TYPE)
  const own = room.foundation
  const choices = floorTypeChoices(more, own)
  const name = levelById(plan, room.level)?.name ?? 'the floor'
  // Until the floor's own type is answered, "same as" says so rather than naming the default.
  const options: { id: FloorTypeId | ''; label: string }[] = [{ id: '', label: `Same as ${name} (${lt === undefined ? 'not chosen yet' : levelType.short})` }, ...choices.map(c => ({ id: c.id, label: c.label }))]
  const t = roomFloorType(plan, room)
  return (
    <div className="floor-type-field">
      <Select<FloorTypeId | ''>
        label="Floor"
        value={own ?? ''}
        options={options}
        onChange={id => usePlan.getState().commit(p => updateRoom(p, room.id, { foundation: id || undefined }))}
      />
      <MoreLink shown={choices.length} onMore={() => setMore(true)} />
      {t !== 'framed' && <p className="muted small">{floorTypeInfo(t).earthworks}</p>}
      {t !== 'framed' && floorTypeInfo(t).ground === 'natural' && <PiersCut plan={plan} level={room.level} rings={roomRing(plan, room)} />}
    </div>
  )
}

/** A room's floor, out to the outside of its walls; none while its walls don't enclose it. */
function roomRing(plan: Plan, room: Room): Vec2[][] {
  const f = faceAround(room.at, planarFaces(plan.walls.filter(w => w.level === room.level)))
  return f ? [offsetPolygon(f.pts, f.thickness.map(t => -t / 2))] : []
}

/**
 * A floor on piers sitting at or below the ground: the earthworks dig the ground out under it to
 * keep the gap under the framing, so say how deep, where it's picked.
 */
function PiersCut({ plan, level, rings }: { plan: Plan; level: string; rings: Vec2[][] }) {
  const shell = useContext(ShellContext)
  const survey = shell?.survey
  const terrain = shell?.terrain
  const depth = survey && terrain ? cutUnderPiers(plan, level, rings, survey.origin, terrain.grid) : 0
  if (depth < 0.02) return null
  const gap = Math.round(earthworksOf(plan).subfloor * 1000)
  return (
    <p className="notice small">
      The ground here is up to {depth.toFixed(2)} m too high to leave the {gap} mm gap under the floor, so it’s dug out under it. A slab on ground, or a
      higher floor, would need less cut.
    </p>
  )
}
