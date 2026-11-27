// "Start from a house": put a starter on the block open now, as one undo step, ready to move and
// turn. A plan with a house drawn asks first (replace it, or add the starter beside it) on the
// app's review sheet. With no block yet (the start screen) a sketch block is made first, the way
// "Start sketching" makes one, and the house goes on that.

import { navigate } from '../nav/router'
import { usePlan } from '../plan/store'
import { projectThumbnail } from '../projects/summary'
import { projectsNow } from '../projects/session'
import { currentSite, startSketch } from '../safety/flows'
import { planLine } from '../safety/review'
import { askReview, showToast } from '../safety/store'
import { ROUGH_SIZE, type SketchBlock } from '../start/sketch'
import { factsLine, sizeLine, starterFacts } from './facts'
import { starterById, type Starter } from './houses'
import { hasHouse, placeStarter, type StarterMode } from './place'

export interface StartOptions {
  /** No project with a block yet: the sketch block to make for it (the rough sheet if none). */
  block?: SketchBlock
  into?: 'current' | 'new'
  name?: string | null
}

/** Ask what to do with the house already drawn; null if put aside. */
async function askMode(s: Starter): Promise<StarterMode | null> {
  const plan = usePlan.getState().plan!
  const site = currentSite()
  const thumb = (mode: StarterMode) => (site ? projectThumbnail({ boundary: site.survey.boundary, origin: site.survey.origin }, placeStarter(plan, s.plan, site, mode).plan) : null)
  const f = starterFacts(s.plan)
  const choice = await askReview({
    kind: 'starter',
    title: `Put the ${s.name.toLowerCase()} on your block?`,
    facts: [
      { label: 'It has', value: factsLine(f) },
      { label: 'Size', value: sizeLine(f) },
      { label: 'Your plan now', value: planLine(plan) },
    ],
    changes: ['Replace: your house goes, and this one goes in the middle of the block, facing the street if you’ve said which side it is.', 'Beside: this one goes 3 m to the side of yours, and both stay.'],
    kept: ['The block, retaining walls, outdoor areas and notes.', 'Undo puts your plan back as it was.'],
    choicesLegend: 'What happens to the house you’ve drawn',
    choices: [
      { id: 'replace', label: 'Replace my house with it', detail: 'Your walls, rooms, roofs, stairs and furniture go.', thumb: thumb('replace') },
      { id: 'beside', label: 'Add it beside my house', detail: 'Both stay. Move it into place afterwards.', thumb: thumb('beside') },
    ],
    confirm: 'Put it in',
    replaces: false,
  })
  return choice === 'replace' || choice === 'beside' ? choice : null
}

/** Put a starter house on the block (making a sketch block first when there's none). */
export async function startFromHouse(id: string, opts: StartOptions = {}): Promise<void> {
  const s = starterById(id)
  if (!s) return
  if (!projectsNow().opened?.survey || opts.into === 'new') {
    await startSketch(opts.block ?? { ...ROUGH_SIZE, fall: 0, street: 'S', rough: true }, opts.into ?? 'new', opts.name)
  }
  const st = usePlan.getState()
  const before = st.plan
  if (!before) return
  const mode = hasHouse(before) ? await askMode(s) : 'replace'
  if (!mode || usePlan.getState().plan !== before) return
  const placed = placeStarter(before, s.plan, currentSite(), mode)
  st.commit(() => placed.plan)
  const after = usePlan.getState().plan
  if (after === before) return
  // To the plan first: going there would otherwise drop what's picked.
  navigate({ kind: 'app', area: 'design', tab: 'plan', view: 'plan', level: placed.level })
  st.setActiveLevel(placed.level)
  if (mode === 'beside') {
    // It's picked, so its card's Move, turn or flip moves it into place.
    st.setTool('select')
    st.selectMany(placed.added)
  } else st.setTool('move')
  usePlan.getState().requestFit(mode === 'beside' ? 'house' : 'block')
  showToast({
    text: mode === 'beside' ? `Added the ${s.name.toLowerCase()} beside your house. It’s picked: move or turn it from its card.` : `Put the ${s.name.toLowerCase()} on your block. Drag it to move it.`,
    link: mode === 'beside' ? undefined : { label: 'Turn or place it exactly', go: () => navigate({ kind: 'app', area: 'earthworks', tab: 'place', view: 'plan' }) },
    undo: () => {
      if (usePlan.getState().plan === after) usePlan.getState().undo()
    },
  })
}
