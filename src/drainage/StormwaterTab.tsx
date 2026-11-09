// Earthworks › Stormwater: the roof's catchment, the tank the person is planning and what it holds,
// which way the block falls and where the water would have to go. A concept for the DA's
// stormwater sketch; the plan draws the path as a dashed line while this tab is open.

import { Num } from '../components/fields'
import { navigate } from '../nav/router'
import { useTouchCanvas } from '../phone/device'
import { useStreetSide } from '../phone/cameraStore'
import { bearingName } from '../lib/terrain'
import { levelById } from '../plan/model'
import { pickTool, useLoaded, type Loaded } from '../shell/useSite'
import { Waiting } from '../shell/tabs/Waiting'
import { setStormwater, stormwaterOf } from './model'
import {
  destinationText,
  fallReport,
  litresFromRain,
  rainHeldByTank,
  roofCatchments,
  SOURCES,
  streetEdgeOf,
  tankRoofs,
  totalCatchment,
  verdictText,
  type FallReport,
  type StreetFrom,
} from './stormwater'
import './drainage.css'

const ROOF_NAMES = { hip: 'Hip roof', gable: 'Gable roof', skillion: 'Skillion roof', flat: 'Flat roof' }
const CONFIDENCE_TEXT = { read: 'Read', secondary: 'Summary', unverified: 'Unverified' }
const CONFIDENCE_TIP = {
  read: 'Read from the official text',
  secondary: 'From an official summary or explainer, not the legal text',
  unverified: 'Not confirmed yet: check before relying on it',
}
const STREET_FROM: Record<StreetFrom, string> = {
  'lot-facts': 'from Lot facts under Design › Checks',
  picked: 'as picked for Street view under Site › 3D',
  'low-side': 'taken as the low side until you pick it under Design › Checks › Lot facts',
}

const fmt = (n: number, d = 1) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
const litres = (n: number) => `${Math.round(n).toLocaleString()} L`

export function StormwaterTab() {
  const d = useLoaded()
  return d ? <Stormwater d={d} /> : <Waiting />
}

/** The fall report for the plan as it stands, with the street side the app knows. */
function useFallReport(d: Loaded): FallReport {
  const key = useTouchCanvas()?.projectKey ?? null
  const side = useStreetSide(key)
  const street = streetEdgeOf(d.plan, d.survey, side, d.terrain.stats.fallBearing)
  return fallReport(d.plan, d.survey, d.terrain, street)
}

function Stormwater({ d }: { d: Loaded }) {
  const { plan } = d
  const roofs = roofCatchments(plan)
  const total = totalCatchment(roofs)
  const sw = stormwaterOf(plan)
  const toTank = tankRoofs(plan, roofs)
  const tankArea = totalCatchment(toTank)
  const held = rainHeldByTank(sw.tankLitres, tankArea)
  const report = useFallReport(d)
  const stats = d.terrain.stats
  const level = stats.maxSlopePct < 0.05
  return (
    <div className="stormwater">
      <p className="muted small">
        A stormwater concept for a DA: how much roof catches rain, the tank you plan, and where the water has to go. The plan shows the path as a dashed line
        while this tab is open. A hydraulic engineer designs the real pipes, pits and any on-site detention.
      </p>

      <h3>Roof catchment</h3>
      {roofs.length ? (
        <>
          <ul className="pick-list">
            {roofs.map(r => (
              <li key={r.id}>
                <button onClick={() => navigate({ kind: 'app', area: 'design', tab: 'roofs', view: 'plan', level: r.level, sel: r.id })}>
                  <span>
                    {ROOF_NAMES[r.type]} <span className="muted">· {levelById(plan, r.level)?.name}</span>
                  </span>
                  <span className="muted">{fmt(r.planArea)} m²</span>
                </button>
              </li>
            ))}
          </ul>
          <dl className="stats">
            <dt className="strong">Roof area, seen from above</dt>
            <dd className="strong">{fmt(total)} m²</dd>
            <dt>Rain of 10 mm on it</dt>
            <dd>about {litres(litresFromRain(total, 10))}</dd>
          </dl>
          <p className="muted small">The plan area of each roof with its eaves: what the rain lands on. Design › Roofs shows the sloping surface, which is larger.</p>
        </>
      ) : (
        <p className="muted small">
          No roofs yet, so nothing catches rain.{' '}
          <button className="link" onClick={() => pickTool('roof')}>
            Draw a roof
          </button>{' '}
          and its catchment shows here.
        </p>
      )}

      <h3>Rainwater tank</h3>
      <Num label="Tank size you’re planning" value={sw.tankLitres} unit="L" decimals={0} min={0} onCommit={v => setStormwater({ tankLitres: Math.round(v) })} />
      <p className="muted small">Your BASIX certificate and the council’s stormwater rules set the size; this only shows what a tank that size holds from your roof.</p>
      {roofs.length > 1 && (
        <>
          <div className="muted small">Roofs that drain to the tank</div>
          {roofs.map(r => {
            const on = toTank.some(t => t.id === r.id)
            return (
              <label key={r.id} className="check">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={e => {
                    const ids = roofs.filter(x => (x.id === r.id ? e.target.checked : toTank.some(t => t.id === x.id))).map(x => x.id)
                    setStormwater({ tankRoofs: ids.length === roofs.length ? undefined : ids })
                  }}
                />
                {ROOF_NAMES[r.type]} <span className="muted small">· {levelById(plan, r.level)?.name}</span>
              </label>
            )
          })}
        </>
      )}
      {roofs.length > 0 && (
        <dl className="stats">
          <dt>Roof draining to the tank</dt>
          <dd>
            {fmt(tankArea)} m²{roofs.length > 1 ? ` (${toTank.length} of ${roofs.length} roofs)` : ''}
          </dd>
          {sw.tankLitres > 0 && held !== null && (
            <>
              <dt>Rain that fills it</dt>
              <dd>about {fmt(held, held < 10 ? 1 : 0)} mm</dd>
            </>
          )}
        </dl>
      )}
      {roofs.length > 0 && sw.tankLitres > 0 && held !== null && (
        <p className="muted small">
          Plain arithmetic: 1 mm of rain on 1 m² of roof is 1 litre. Water lost to first-flush, splash and overflow isn’t counted, and a tank is rarely empty
          when it rains, so the real catch is less.
        </p>
      )}

      <h3>Fall of the block</h3>
      <dl className="stats">
        <dt>Falls towards</dt>
        <dd>{level ? 'Level (no fall)' : `${bearingName(stats.fallBearing)} (${fmt(stats.fallBearing, 0)}°)`}</dd>
        {report.street && (
          <>
            <dt>Street side</dt>
            <dd>{report.street.name}</dd>
          </>
        )}
        {report.low && (
          <>
            <dt>Low point of the block</dt>
            <dd>
              RL {report.low.rl.toFixed(2)}, {report.low.name}
            </dd>
          </>
        )}
        {report.house && (
          <>
            <dt>Water leaves the house at</dt>
            <dd>RL {report.house.rl.toFixed(2)} (ground)</dd>
          </>
        )}
        {report.fall !== null && report.run !== null && report.run > 0.05 && (
          <>
            <dt>Fall to {report.verdict === 'street' ? 'the street' : 'the low point'}</dt>
            <dd>
              {fmt(report.fall, 2)} m over {fmt(report.run)} m{report.fall > 0.005 ? ` (1 in ${fmt(report.run / report.fall, 0)})` : ''}
            </dd>
          </>
        )}
      </dl>
      {report.street && <p className="muted small">Street side {STREET_FROM[report.street.from]}.</p>}
      <p className={report.verdict === 'away' ? 'notice small' : 'small'}>{verdictText(report)}</p>

      <h3>On the plan</h3>
      <ul className="drainage-legend small">
        <li>
          <span className="swatch path" aria-hidden /> Concept path from the house to {destinationText(report)}. Not a pipe design.
        </li>
        <li>
          <span className="swatch dp" aria-hidden /> Likely downpipe spots: the corners of each roof.
        </li>
        <li>
          <span className="swatch arrow" aria-hidden /> Which way the ground falls (overland flow).
        </li>
      </ul>
      <p className="muted small">
        Levels are the natural ground from the survey; the kerb and any pit are usually lower than the boundary. Council may also ask for on-site detention,
        which the engineer sizes.
      </p>

      <details className="checks-more">
        <summary>Sources</summary>
        <ul className="drainage-sources">
          {SOURCES.map(s => (
            <li key={s.instrument}>
              <div>
                <span className={`conf ${s.confidence}`} title={CONFIDENCE_TIP[s.confidence]}>
                  {CONFIDENCE_TEXT[s.confidence]}
                </span>{' '}
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.instrument}
                  </a>
                ) : (
                  s.instrument
                )}
                {s.clause ? `, ${s.clause}` : ''}
              </div>
              <div className="muted small">
                {s.gives} ({s.asAt})
              </div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
