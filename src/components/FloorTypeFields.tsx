// How a floor is built, as a field: the lowest level's floor type in Design › Floors (the old
// layout's Levels), and a room's own in its settings. The usual two show first; the rest wait
// behind "More floor types", as in the card that asks.

import { useState } from 'react'
import {
  DEFAULT_FLOOR_TYPE,
  FLOOR_TYPES,
  FRAMED_FLOOR,
  floorTypeChoices,
  floorTypeInfo,
  isLowestLevel,
  levelFloorType,
  roomFloorType,
  setLevelFloorType,
  type FloorTypeId,
} from '../plan/floorTypes'
import { levelById, type Plan, type Room } from '../plan/model'
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

/** A level's floor type: chosen once for the lowest level; framed above it. */
export function LevelFloorType({ plan, level }: { plan: Plan; level: string }) {
  const [more, setMore] = useState(false)
  const t = levelFloorType(plan, level)
  if (t === 'framed' || !isLowestLevel(plan, level)) {
    return (
      <p className="muted small floor-type-note">
        <b>{FRAMED_FLOOR.label}.</b> Floors above the ground floor are framed, so the ground isn’t touched.
      </p>
    )
  }
  const choices = floorTypeChoices(more, t)
  const options: { id: FloorTypeId | ''; label: string }[] = [...(t ? [] : [{ id: '' as const, label: 'Not chosen yet (builds as a slab)' }]), ...choices.map(c => ({ id: c.id, label: c.label }))]
  return (
    <div className="floor-type-field">
      <Select<FloorTypeId | ''>
        label="Floor type"
        value={t ?? ''}
        options={options}
        onChange={id => usePlan.getState().commit(p => setLevelFloorType(p, level, id || undefined))}
      />
      <MoreLink shown={choices.length} onMore={() => setMore(true)} />
      <p className="muted small">{floorTypeInfo(t ?? DEFAULT_FLOOR_TYPE).earthworks} Rooms follow this unless a room says otherwise.</p>
    </div>
  )
}

/** A room's own floor type on the lowest level, or "same as the floor". */
export function RoomFloorType({ plan, room }: { plan: Plan; room: Room }) {
  const [more, setMore] = useState(false)
  if (!isLowestLevel(plan, room.level)) return null
  const lt = levelFloorType(plan, room.level)
  const levelType = floorTypeInfo(lt === 'framed' || lt === undefined ? DEFAULT_FLOOR_TYPE : lt)
  const own = room.foundation
  const choices = floorTypeChoices(more, own)
  const name = levelById(plan, room.level)?.name ?? 'the floor'
  const options: { id: FloorTypeId | ''; label: string }[] = [{ id: '', label: `Same as ${name} (${levelType.short})` }, ...choices.map(c => ({ id: c.id, label: c.label }))]
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
    </div>
  )
}
