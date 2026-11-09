// Design › BASIX: a checklist that gets the person ready for the official BASIX tool. It reads what
// it can off the plan (orientation, glazing, floor and roof areas, the tank) and asks for the rest
// (insulation, hot water, heating, cooling, lighting, pool). No score, no stars, no certificate.

import { Num, Select, TextField } from '../components/fields'
import { saveFile } from '../lib/download'
import { navigate } from '../nav/router'
import { projectTitle } from '../share/project'
import { useLoaded, type Loaded } from '../shell/useSite'
import { Waiting } from '../shell/tabs/Waiting'
import { basixOf, setBasix, setBasixDone } from './model'
import { BASIX_LINKS, basixCsv, basixFacts, checklistRows, COOLING, FACADE_NAMES, FACADES, HEATING, HOT_WATER, LIGHTING, readyCount, WHEN_NEEDED } from './basix'
import './basix.css'

const CONFIDENCE_TEXT = { read: 'Read', secondary: 'Summary', unverified: 'Unverified' }
const CONFIDENCE_TIP = {
  read: 'Read from the official page',
  secondary: 'From an official summary or explainer, not the legal text',
  unverified: 'Not confirmed yet: check before relying on it',
}

const m2 = (n: number) => `${n.toFixed(1)} m²`

export function BasixTab() {
  const d = useLoaded()
  return d ? <Basix d={d} /> : <Waiting />
}

function Basix({ d }: { d: Loaded }) {
  const { plan } = d
  const a = basixOf(plan)
  const facts = basixFacts(plan)
  const rows = checklistRows(facts, a)
  const ready = readyCount(rows, a)
  const download = () => {
    const title = projectTitle(plan)
    const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    saveFile(`${title.replace(/[^\w.-]+/g, '-')}-basix-checklist.csv`, basixCsv(plan, title, date), 'text/csv')
  }
  return (
    <div className="basix">
      <p className="basix-lede">This doesn’t calculate a BASIX score or issue a certificate: it gathers what the BASIX tool will ask for.</p>
      <p className="muted small">{WHEN_NEEDED} Tick each item when you have an answer ready, then take the list to the tool.</p>
      <p className="basix-ready" aria-live="polite">
        {ready.done} of {ready.of} ready
      </p>

      <h3>From the plan</h3>
      <ul className="basix-list">
        {rows
          .filter(r => r.fromPlan)
          .map(r => (
            <li key={r.id} className="basix-row">
              <label className="check">
                <input type="checkbox" checked={!!a.done?.[r.id]} onChange={e => setBasixDone(r.id, e.target.checked)} />
                <span className="basix-item">{r.item}</span>
              </label>
              {r.id === 'glazing' ? (
                <dl className="stats basix-facades">
                  {FACADES.map(f => (
                    <FacadeRow key={f} name={FACADE_NAMES[f]} area={facts.windows[f]} />
                  ))}
                  <dt className="strong">All windows</dt>
                  <dd className="strong">{m2(facts.windowTotal)}</dd>
                  {facts.glazingRatio !== null && (
                    <>
                      <dt>Glazing to floor area</dt>
                      <dd>{(facts.glazingRatio * 100).toFixed(0)}%</dd>
                    </>
                  )}
                </dl>
              ) : r.id === 'orientation' && facts.living.length ? (
                <dl className="stats">
                  {facts.living.map((l, i) => (
                    <LivingRow key={i} room={l.room} main={l.main ? FACADE_NAMES[l.main] : null} />
                  ))}
                </dl>
              ) : (
                <div className="basix-value">{r.value}</div>
              )}
              <p className="muted small">{r.why}</p>
            </li>
          ))}
      </ul>
      <p className="muted small">
        Windows count where they sit on an outside wall; name a room living, kitchen or dining and its orientation shows. Roof and tank come from{' '}
        <button className="link" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'stormwater', view: 'plan' })}>
          Earthworks › Stormwater
        </button>
        .
      </p>

      <h3>Your answers</h3>
      <ul className="basix-list">
        {rows
          .filter(r => !r.fromPlan)
          .map(r => (
            <li key={r.id} className="basix-row">
              <label className="check">
                <input type="checkbox" checked={!!a.done?.[r.id]} onChange={e => setBasixDone(r.id, e.target.checked)} />
                <span className="basix-item">{r.item}</span>
              </label>
              {r.id === 'insulation' && <TextField label="Ceiling, walls, floor (R-values)" value={a.insulation ?? ''} onCommit={v => setBasix({ insulation: v })} />}
              {r.id === 'hot-water' && <Select label="System" value={a.hotWater ?? 'undecided'} options={HOT_WATER} onChange={v => setBasix({ hotWater: v })} />}
              {r.id === 'heating' && <Select label="Heating" value={a.heating ?? 'undecided'} options={HEATING} onChange={v => setBasix({ heating: v })} />}
              {r.id === 'cooling' && <Select label="Cooling" value={a.cooling ?? 'undecided'} options={COOLING} onChange={v => setBasix({ cooling: v })} />}
              {r.id === 'lighting' && <Select label="Fittings" value={a.lighting ?? 'undecided'} options={LIGHTING} onChange={v => setBasix({ lighting: v })} />}
              {r.id === 'pool' && (
                <>
                  <label className="check">
                    <input type="checkbox" checked={!!a.pool} onChange={e => setBasix({ pool: e.target.checked })} />
                    A pool or spa is planned
                  </label>
                  {a.pool && <Num label="Its size" value={a.poolLitres ?? 0} unit="L" decimals={0} min={0} onCommit={v => setBasix({ poolLitres: Math.round(v) })} />}
                </>
              )}
              <p className="muted small">{r.why}</p>
            </li>
          ))}
      </ul>

      <div className="row">
        <button className="secondary" onClick={download}>
          Download the checklist (CSV)
        </button>
      </div>

      <h3>The official tool</h3>
      <ul className="basix-links">
        {BASIX_LINKS.map(l => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.label}
            </a>{' '}
            <span className={`conf ${l.confidence}`} title={CONFIDENCE_TIP[l.confidence]}>
              {CONFIDENCE_TEXT[l.confidence]}
            </span>
            <div className="muted small">{l.note}</div>
          </li>
        ))}
      </ul>
      <p className="muted small">The certificate comes from the BASIX tool, usually through an energy assessor. Nothing here is a rating.</p>
    </div>
  )
}

function FacadeRow({ name, area }: { name: string; area: number }) {
  return (
    <>
      <dt>{name}</dt>
      <dd>{m2(area)}</dd>
    </>
  )
}

function LivingRow({ room, main }: { room: string; main: string | null }) {
  return (
    <>
      <dt>{room}</dt>
      <dd>{main ? `mostly ${main.toLowerCase()}` : 'no outside windows yet'}</dd>
    </>
  )
}
