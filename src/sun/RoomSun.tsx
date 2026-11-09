// The selected room's sun: whether it's a living area, and for one, the hours of direct sun on
// its windows from 9 am to 3 pm on 21 June. Rooms have no type, so a name like Living or Family
// counts until the tick says otherwise.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan, Room } from '../plan/model'
import { updateRoom } from '../plan/ops'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { hoursText } from './facts'
import { isLiving } from './rooms'
import { useSunFacts } from './useSun'
import './sun.css'

interface Props {
  plan: Plan
  room: Room
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

export function RoomSun({ plan, room, survey, terrain, earth }: Props) {
  const living = isLiving(room)
  return (
    <div className="sun-room">
      <label className="check">
        <input type="checkbox" checked={living} onChange={e => usePlan.getState().commit(p => updateRoom(p, room.id, { living: e.target.checked }))} />
        Living area
      </label>
      {living && <RoomHours plan={plan} room={room} survey={survey} terrain={terrain} earth={earth} />}
    </div>
  )
}

function RoomHours({ plan, room, survey, terrain, earth }: Props) {
  const facts = useSunFacts(plan, survey, terrain, earth)
  const r = facts.rooms.find(x => x.room === room.id)
  // Worked out once the plan settles; a room just ticked shows nothing for a moment.
  if (!r) return null
  if (!r.windows.length) return <p className="muted small">No windows to the outside, so no winter sun.</p>
  return (
    <p className="muted small">
      Winter sun on its windows: <b>{hoursText(r.hours)}</b> between 9 am and 3 pm on 21 June ({r.windows.map(w => `${w.facing} ${hoursText(w.hours)}`).join(', ')}).
    </p>
  )
}
