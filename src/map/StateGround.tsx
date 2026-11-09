// "No survey yet? Use the state's ground levels": once a lot is found (on the start screen, or in
// Site › Map for a block with no survey), read the ground for it from the state's elevation model
// and start the project on it. The levels are rough, and it says so before and after.

import { useEffect, useRef, useState } from 'react'
import { nameFromLot } from '../projects/ops'
import { projectsNow } from '../projects/session'
import { replaceSurvey, startFromGround } from '../safety/flows'
import { blockFromLot } from './demSite'
import { DEM, ElevationError } from './elevation'
import type { Lot } from './services'
import { placeDemBlock } from './store'

interface Props {
  lot: Lot
  /** A new project, the open one with no survey yet, or in place of the open one's sketch (after a review). */
  into: 'new' | 'current' | 'replace'
  /** The class of the main button, to match the screen it's on. */
  buttonClass?: string
  /** Lead with "No survey yet?" (off where the heading already asks it). */
  ask?: boolean
}

/** What the levels are good for, in one line, wherever they're offered. */
export const DEM_GOOD_FOR = `Accurate to about ±${DEM.accuracy} m: good for a first look before you buy, not for design or earthworks quantities.`

export function StateGround({ lot, into, buttonClass = 'primary', ask = true }: Props) {
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  // Leaving (or picking another lot: callers key this by the lot) stops the reading.
  useEffect(() => () => ctrl.current?.abort(), [])

  const go = async () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setError(null)
    setProgress(0)
    try {
      const block = await blockFromLot(lot, { signal: c.signal, onProgress: (d, t) => setProgress(t ? d / t : 1) })
      if (c.signal.aborted) return
      if (into === 'replace') {
        await replaceSurvey(block.survey)
        // Only if the review was accepted.
        if (projectsNow().opened?.survey === block.survey) placeDemBlock(block, lot)
      } else {
        await startFromGround(block.survey, into, nameFromLot(lot))
        placeDemBlock(block, lot)
      }
    } catch (e) {
      if (c.signal.aborted) return
      setError(e instanceof ElevationError ? e.message : (e as Error)?.message || 'The ground levels couldn’t be read. Try again in a minute.')
    } finally {
      if (ctrl.current === c) {
        ctrl.current = null
        setProgress(null)
      }
    }
  }

  return (
    <div className="state-ground">
      <p>
        {ask && <b>No survey yet? Use the state’s ground levels. </b>}
        The lot’s lines come from the NSW cadastre and the ground from the state’s elevation model ({DEM.from}, on a {DEM.resolution} m grid). {DEM_GOOD_FOR}
      </p>
      {progress === null ? (
        <div className="row">
          <button className={buttonClass} onClick={() => void go()}>
            Use the state’s ground levels
          </button>
        </div>
      ) : (
        <div className="state-ground-busy" role="status">
          <span>
            Reading the ground levels… {Math.round(progress * 100)}%. The state’s service can take a minute or two.
          </span>
          <button className="link" onClick={() => ctrl.current?.abort()}>
            Stop
          </button>
        </div>
      )}
      {error && (
        <p className="notice small" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">The lot’s position goes to the NSW elevation service to read its levels. {DEM.credit}.</p>
    </div>
  )
}
