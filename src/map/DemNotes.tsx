// What a block made from the state's ground levels shows until the survey comes, so nobody takes
// the levels for a survey: a calm chip on the canvas, a note in Site › Block with the licence
// attribution, and a line beside the numbers that lean on levels (cut and fill, retaining walls,
// the driveway, the checks). A real survey shows none of them.

import { useProjects } from '../projects/session'
import { pickFile } from '../safety/store'
import type { DemSource } from '../lib/storage'
import './map.css'

const useDem = (): DemSource | undefined => useProjects().opened?.survey?.dem

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

/** On the canvas: the ground is rough, and the survey can come in any time. */
export function DemChip() {
  const dem = useDem()
  if (!dem) return null
  return (
    <div className="sketch-chip dem-chip" role="status" title={dem.credit}>
      <span>
        <b>Rough ground</b> · state elevation data, about ±{dem.accuracy} m
      </span>
      <button onClick={() => pickFile('survey')}>Add the survey</button>
    </div>
  )
}

/** In Site › Block: where the levels came from, how far to trust them, and Add the survey. */
export function DemNotice() {
  const dem = useDem()
  if (!dem) return null
  return (
    <div className="sketch-notice dem-notice">
      <p>
        <b>No survey yet.</b> The ground is from the state’s elevation model ({dem.from}), read on {dateOf(dem.at)} every {dem.spacing} m. It’s accurate to about ±{dem.accuracy} m: good for a first look, not for design or earthworks quantities. Your plan is kept when the survey comes in.
      </p>
      <div className="row">
        <button className="secondary" onClick={() => pickFile('survey')}>
          Add the survey…
        </button>
      </div>
      <p className="muted small">{dem.credit}.</p>
    </div>
  )
}

/** Beside results that lean on the levels. */
export function DemFlag({ what = 'these' }: { what?: string }) {
  const dem = useDem()
  if (!dem) return null
  return (
    <p className="notice small dem-flag">
      From state elevation data (about ±{dem.accuracy} m): get a survey before relying on {what}.
    </p>
  )
}
