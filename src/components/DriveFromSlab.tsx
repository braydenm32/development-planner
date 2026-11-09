// "Make it a driveway": offered where a driveway is missing (Earthworks › Driveway, and the
// driveway checks) for a concrete slab that looks like one. One undoable step, with a note.

import type { Survey } from '../lib/survey'
import { asDriveway, driveSlabs } from '../plan/driveFromSlab'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { showToast } from '../safety/store'
import '../grading/grading.css'

function makeDriveway(id: string, name: string) {
  const st = usePlan.getState()
  st.commit(p => asDriveway(p, id))
  const after = usePlan.getState().plan
  showToast({
    text: `${name} is a driveway now: its grade, levels and street crossing show in Earthworks › Driveway.`,
    undo: () => {
      if (usePlan.getState().plan === after) usePlan.getState().undo()
    },
  })
}

export function DriveFromSlab({ plan, survey }: { plan: Plan; survey: Pick<Survey, 'origin' | 'boundary'> }) {
  const slabs = driveSlabs(plan, survey)
  if (!slabs.length) return null
  return (
    <div className="drive-from-slab">
      {slabs.map(({ area, why }) => (
        <p key={area.id} className="small">
          <b>{area.name}</b> is drawn as a concrete slab{why === 'name' ? '' : ' and reaches the street side'}. Is it the driveway?{' '}
          <button className="secondary-sm" onClick={() => makeDriveway(area.id, area.name)}>
            Make it a driveway
          </button>
        </p>
      ))}
    </div>
  )
}
