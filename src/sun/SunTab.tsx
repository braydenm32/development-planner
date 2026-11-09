// Site › Sun: where the block is (for the sun), the sun study in 3D, the 21 June shadows on the
// plan, and what they mean for the living areas and the neighbours.

import { useEffect } from 'react'
import { Num, Select } from '../components/fields'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { navigate } from '../nav/router'
import { useShell } from '../shell/context'
import { boundaryText, hoursText, OVER_MIN, overText, STUDY_FROM, STUDY_TO, type ShadowDiagram, type SunFacts } from './facts'
import { coordsText, DEFAULT_LOCATION, inNsw, locationOf, mgaConvergence, NSW_TOWNS, type SiteLocation } from './location'
import { compassPoint, hourText } from './solar'
import { setLocation, useSun } from './store'
import { useShadowDiagram, useSunFacts } from './useSun'
import './sun.css'

const OTHER = '__other'

export function SiteSunTab() {
  const { survey, terrain, earth } = useShell()
  const plan = usePlan(s => s.plan)
  const on = useSun(s => s.on)
  const planShadows = useSun(s => s.planShadows)
  // The tab is the sun's home, so opening it lights the 3D view by the sun.
  useEffect(() => useSun.getState().setOn(true), [])
  const location = locationOf(plan)
  return (
    <div className="sun-tab">
      <LocationFields location={location} />
      <h3>Sun study in 3D</h3>
      <label className="check">
        <input type="checkbox" checked={on} onChange={e => useSun.getState().setOn(e.target.checked)} />
        Light the 3D view by the sun
      </label>
      <p className="muted small">Pick the day and the time on the card over the 3D view, or play the day through. The house, the roof and the ground cast their shadows for that moment.</p>
      <h3>Shadows on 21 June</h3>
      <label className="check">
        <input type="checkbox" checked={planShadows} onChange={e => useSun.getState().setPlanShadows(e.target.checked)} />
        Show them on the plan at 9 am, 12 pm and 3 pm
      </label>
      {plan && survey && terrain ? <SunFindings plan={plan} survey={survey} terrain={terrain} earth={earth} /> : <p className="muted small">The shadows need the survey&rsquo;s ground.</p>}
      <p className="muted small">
        Shadows are estimates. The walls and roof cast them onto the surveyed ground (the finished ground where it&rsquo;s cut or filled; past the survey, the ground is held at its edge level). Trees, fences and the neighbours&rsquo; houses aren&rsquo;t in
        them.
      </p>
    </div>
  )
}

function LocationFields({ location }: { location: SiteLocation }) {
  const town = location.place && NSW_TOWNS.some(t => t.name === location.place) ? location.place : OTHER
  const conv = mgaConvergence(location.lat, location.lon)
  const turned = !!location.trueNorth
  // The grid's turn differs from place to place, so a new place works it out again.
  const go = (l: SiteLocation, mga = turned) => setLocation({ ...l, trueNorth: mga ? -Number(mgaConvergence(l.lat, l.lon).toFixed(2)) : undefined })
  return (
    <>
      <h3>Where the block is</h3>
      <Select<string>
        label="Near"
        value={town}
        options={[...NSW_TOWNS.map(t => ({ id: t.name, label: t.name })), { id: OTHER, label: 'Somewhere else (type it in)' }]}
        onChange={id => {
          const t = NSW_TOWNS.find(x => x.name === id)
          go(t ? { lat: t.lat, lon: t.lon, place: t.name } : { lat: location.lat, lon: location.lon })
        }}
      />
      {town === OTHER && (
        <div className="sun-latlon">
          <Num label="Latitude" unit="°" decimals={3} min={-44} max={-9} value={location.lat} onCommit={lat => go({ lat, lon: location.lon })} />
          <Num label="Longitude" unit="°" decimals={3} min={112} max={154} value={location.lon} onCommit={lon => go({ lat: location.lat, lon })} />
        </div>
      )}
      <p className="muted small">
        The survey doesn&rsquo;t say where on the map it is, so the sun works from {town === OTHER ? coordsText(location) : `${location.place} (${coordsText(location)})`}. A town nearby is close enough: 10 km moves the sun by about a tenth of a
        degree.{location === DEFAULT_LOCATION && ' Projects start in Sydney.'}
      </p>
      <p className="muted small">
        Times are Australian Eastern Standard Time (UTC+10), with no daylight saving. On 21 June that&rsquo;s the time on the clock; from October to April, clocks in NSW read an hour later.
        {!inNsw(location) && ' This place may keep another time.'}
      </p>
      <h3>North</h3>
      <p className="muted small">
        The sun takes the survey&rsquo;s north as true north{turned ? `, turned by ${Math.abs(conv).toFixed(1)}° for the MGA grid` : ''}. The house sits on the survey as placed in Earthworks › Place.
      </p>
      <label className="check">
        <input type="checkbox" checked={turned} onChange={e => go(location, e.target.checked)} />
        The survey&rsquo;s north is MGA grid north (it&rsquo;s {Math.abs(conv).toFixed(1)}° {conv >= 0 ? 'clockwise' : 'anticlockwise'} of true north here)
      </label>
    </>
  )
}

function SunFindings({ plan, survey, terrain, earth }: { plan: Plan; survey: Survey; terrain: Terrain; earth: Earth | null }) {
  const facts = useSunFacts(plan, survey, terrain, earth)
  const diagram = useShadowDiagram(plan, survey, terrain, earth, true)
  if (facts.empty) return <p className="muted small">Draw the house&rsquo;s walls to see its shadows.</p>
  return (
    <>
      {diagram && <ShadowTimes diagram={diagram} />}
      <p className="small">{overText(facts)}</p>
      <LivingSun facts={facts} />
    </>
  )
}

function ShadowTimes({ diagram }: { diagram: ShadowDiagram }) {
  return (
    <ul className="sun-shadow-times small">
      {diagram.shadows.map(d => (
        <li key={d.minutes}>
          <b>{hourText(d.minutes)}</b>: sun {Math.round(d.sun.elevation)}° up in the {compassPoint(d.sun.azimuth)}
          {d.shadow && (
            <>
              ; shadow {Math.round(d.shadow.area)} m²
              {d.shadow.over.area >= OVER_MIN && `, ${d.shadow.over.area.toFixed(1)} m² over ${boundaryText(d.shadow.over.sides)}`}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function LivingSun({ facts }: { facts: SunFacts }) {
  return (
    <>
      <h3>Winter sun to living areas</h3>
      {facts.rooms.length ? (
        <>
          {facts.rooms.map(r => (
            <p key={r.room} className="sun-room small">
              {r.name}: <b>{hoursText(r.hours)}</b>
              {r.windows.length ? <span className="muted"> ({r.windows.map(w => `${w.facing} window ${hoursText(w.hours)}`).join(', ')})</span> : <span className="muted"> (no windows to the outside)</span>}
            </p>
          ))}
          <p className="muted small">
            Hours of direct sun on the windows between {hourText(STUDY_FROM)} and {hourText(STUDY_TO)} on 21 June, with the house&rsquo;s own walls, roof and the ground in the way. Councils ask for different hours; see Design › Checks.
          </p>
        </>
      ) : (
        <p className="muted small">
          No living areas yet. Rooms called living, family, dining or lounge count, or tick Living area on a room in{' '}
          <button className="link" onClick={() => navigate({ kind: 'app', area: 'design', tab: 'rooms', view: 'plan' })}>
            Design › Rooms
          </button>
          .
        </p>
      )}
    </>
  )
}
