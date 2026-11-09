// What two of the plan's questions ask, opened from the question list (./QuestionTray.tsx): how a
// floor is built, and a retaining wall where a slab room cuts deep or fills high. They used to
// pop up over the plan by themselves; now they open only when you choose to answer (C19).
// Never the browser's confirm().

import { useMemo, useState } from 'react'
import { FLOOR_TYPES, floorTypeChoices } from '../plan/floorTypes'
import { levelById } from '../plan/model'
import { HOUSE_WALL_NOTE, OFFER_PLACEMENT, offeredHeight, offeredWall, type OfferPlacement } from '../plan/retainOffer'
import { usePlan } from '../plan/store'
import { acceptOffer, answerFloorType, dismissOffer, putOffFloorType, quietOffer, setOfferGap, setOfferPlacement, useFlow, type OfferState } from './store'

/** How a level's floor is built: the common types, more on request, or decide later. */
export function FloorTypeCard({ level, onDone }: { level: string; onDone?: () => void }) {
  const name = usePlan(s => (s.plan ? levelById(s.plan, level)?.name : undefined)) ?? 'this floor'
  const [more, setMore] = useState(false)
  const hidden = FLOOR_TYPES.length - floorTypeChoices(false).length
  return (
    <section className="flow-card" aria-label="Floor type">
      <header>
        <h2>How is the {name} built?</h2>
        <p>Asked once for this floor. A room can still differ, in its own settings.</p>
      </header>
      <div className="flow-choices">
        {floorTypeChoices(more).map(t => (
          <button
            key={t.id}
            type="button"
            className="flow-choice"
            onClick={() => {
              answerFloorType(t.id, level)
              onDone?.()
            }}
          >
            <b>{t.label}</b>
            <span>{t.earthworks}</span>
          </button>
        ))}
      </div>
      <footer>
        {!more && hidden > 0 && (
          <button type="button" className="flow-link" onClick={() => setMore(true)}>
            More floor types
          </button>
        )}
        <button
          type="button"
          className="flow-quiet"
          onClick={() => {
            putOffFloorType(level)
            onDone?.()
          }}
        >
          Decide later
        </button>
      </footer>
    </section>
  )
}

/** The retaining wall offer: where it goes, and add it, not now, or don't ask for this room. */
export function OfferCard({ o }: { o: OfferState }) {
  const plan = usePlan(s => s.plan)
  const ground = useFlow(s => s.ground)
  const [gapText, setGapText] = useState<string | null>(null)
  const { offer, placement, gap } = o
  const height = useMemo(
    () => (plan && ground ? offeredHeight(plan, offeredWall(offer, placement, gap), ground.survey, ground.natural) : null),
    [plan, ground, offer, placement, gap],
  )
  if (!plan) return null
  const room = o.space.room ? plan.rooms.find(r => r.id === o.space.room) : undefined
  const who = room ? `${room.name}’s floor` : 'The floor'
  const m = (v: number) => `${v.toFixed(2)} m`
  const cut = offer.kind === 'cut'
  const choose = (p: OfferPlacement) => setOfferPlacement(p)
  const commitGap = () => {
    if (gapText === null) return
    const v = parseFloat(gapText)
    setGapText(null)
    if (Number.isFinite(v) && v >= 0 && v <= 8) setOfferGap(Math.round(v * 100) / 100)
  }
  return (
    <section className="flow-card" aria-label="Retaining wall suggestion">
      <header>
        <h2>A retaining wall on the {offer.facing} side?</h2>
        <p>
          {who} is {m(offer.depth)} {cut ? 'below the ground' : 'above the ground'} on its {offer.facing} side ({cut ? 'uphill: cut' : 'downhill: fill'}).{' '}
          {cut ? 'A wall there holds the earth back' : 'A wall there holds up the fill under the house'}
          {height !== null && height > 0.005
            ? Math.abs(height - offer.depth) >= 0.05
              ? `: about ${m(height)}, ${placement === 'gap' ? `${gap.toFixed(1)} m out, where` : 'at the house wall, where'} the ground is ${(cut ? height > offer.depth : height < offer.depth) ? 'higher' : 'lower'} than at the room’s edge. Dashed on the plan.`
              : `: about ${m(height)}. Dashed on the plan.`
            : '. Dashed on the plan.'}
        </p>
      </header>
      {OFFER_PLACEMENT === 'ask' ? (
        <div className="flow-choices" role="radiogroup" aria-label="Where the wall goes">
          <label className={`flow-choice flow-radio${placement === 'gap' ? ' on' : ''}`}>
            <input type="radio" name="flow-place" checked={placement === 'gap'} onChange={() => choose('gap')} />
            <span className="flow-radio-body">
              <b>
                <span className="flow-gap">
                  <input
                    aria-label="Gap between the house and the wall"
                    inputMode="decimal"
                    value={gapText ?? gap.toFixed(1)}
                    onFocus={e => {
                      choose('gap')
                      setGapText(gap.toFixed(1))
                      e.target.select()
                    }}
                    onChange={e => setGapText(e.target.value)}
                    onBlur={commitGap}
                    onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />{' '}
                  m
                </span>{' '}
                out from the house
              </b>
              <span>The gap between them is levelled to the house pad, as a bench.</span>
            </span>
          </label>
          <label className={`flow-choice flow-radio${placement === 'house' ? ' on' : ''}`}>
            <input type="radio" name="flow-place" checked={placement === 'house'} onChange={() => choose('house')} />
            <span className="flow-radio-body">
              <b>The house wall itself</b>
              <span>{HOUSE_WALL_NOTE}</span>
            </span>
          </label>
        </div>
      ) : (
        placement === 'house' && <p className="flow-note">{HOUSE_WALL_NOTE}</p>
      )}
      <footer>
        <button type="button" className="flow-pri" onClick={acceptOffer}>
          Add retaining wall
        </button>
        <button type="button" className="flow-quiet" onClick={dismissOffer}>
          Not now
        </button>
        <button type="button" className="flow-quiet" onClick={quietOffer}>
          Don’t ask for this room
        </button>
      </footer>
    </section>
  )
}
