// Site › Map: put the survey on the NSW map. Find the lot (an address, a Lot and DP, or a tap on
// the aerial), fit the survey's boundary to it, nudge it if needed, and read what the NSW planning
// maps say about the lot. The aerial photo and the lot's lines then show under the plan, and the
// land's flags join Design › Checks.

import { useEffect, useMemo, useRef, useState } from 'react'
import { activeCouncil, checkSettingsOf, COUNCILS } from '../checks/councils'
import { setCheckSettings, setCouncil } from '../checks/settings'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { navigate } from '../nav/router'
import { usePlan } from '../plan/store'
import { useShell } from '../shell/context'
import { gridToMga } from './fit'
import { fromMga, type LonLat } from './geo'
import { MapPicker, type MapViewState } from './MapPicker'
import type { MapPlace } from './model'
import type { PlanningFacts } from './planning'
import { lotById, lotsOfProperty, MapServiceError, parseLotDp, PLANNING_CREDIT, searchAddress, type AddressHit, type Lot } from './services'
import { adjustPlace, placeOnLot, refreshPlanning, removePlace, setMapOptions, useMap, type SurveyOutline } from './store'
import { fitWords } from './words'
import './map.css'

/** Wollongong, where the app starts looking. */
const START: MapViewState = { center: [150.8931, -34.4248], zoom: 15 }

const outlineOf = (survey: Survey): SurveyOutline => ({ boundary: survey.boundary.map(p => [p[0] + survey.origin[0], p[1] + survey.origin[1]] as Vec2), origin: survey.origin })

const middleOf = (ring: LonLat[]): LonLat => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]

export function MapTab() {
  const { survey } = useShell()
  const place = useMap(s => s.place)
  const [view, setView] = useState<MapViewState>(() => (place ? { center: middleOf(place.lot.ring), zoom: 19 } : START))
  const [found, setFound] = useState<Lot[]>([])
  const [picked, setPicked] = useState<Lot | null>(null)
  const [moving, setMoving] = useState(!place)

  if (!survey) return <p className="muted">The survey needs to open before it can go on the map.</p>
  const outline = outlineOf(survey)

  const pick = (lot: Lot) => {
    setPicked(lot)
    setFound(f => (f.some(l => l.id === lot.id) ? f : [...f, lot]))
  }
  const show = (lots: Lot[]) => {
    setFound(lots)
    if (lots[0]) {
      setPicked(lots[0])
      setView({ center: middleOf(lots[0].ring), zoom: 19 })
    }
  }
  const place_ = (lot: Lot) => {
    const p = placeOnLot(outline, lot)
    setMoving(false)
    setPicked(null)
    setView({ center: middleOf(p.lot.ring), zoom: 19 })
  }

  return (
    <div className="map-tab">
      {place && !moving ? (
        <Placed place={place} outline={outline} view={view} onView={setView} onMove={() => setMoving(true)} />
      ) : (
        <>
          <p className="muted small">
            Find your block to see it on the aerial photo and read its zone and hazards from the NSW planning maps. What you type, and where the block is, go to NSW Government map services; nothing else leaves this browser.
          </p>
          <Search onLots={show} />
          <MapPicker view={view} onView={setView} lots={found} selected={picked?.id ?? place?.lot.id ?? null} onPick={pick} />
          {picked ? (
            <div className="map-picked">
              <b>{picked.label}</b>
              <div className="row">
                <button className="primary" onClick={() => place_(picked)}>
                  Fit my survey to this lot
                </button>
              </div>
              <p className="muted small">The survey’s boundary is laid over the lot’s lines and turned until they match. You can nudge it after.</p>
            </div>
          ) : (
            <p className="muted small">Tap your lot on the map to pick it.</p>
          )}
          {place && (
            <div className="row">
              <button className="link" onClick={() => setMoving(false)}>
                Keep it on {place.lot.label}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Search({ onLots }: { onLots: (lots: Lot[]) => void }) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState<AddressHit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  // Addresses as you type, a moment after you stop.
  const q = text.trim()
  const typing = q.length >= 4 && !parseLotDp(q)
  useEffect(() => {
    if (!typing) return
    const c = new AbortController()
    const t = setTimeout(() => searchAddress(q, c.signal).then(setHits, () => {}), 300)
    return () => {
      clearTimeout(t)
      c.abort()
    }
  }, [q, typing])
  const shownHits = typing ? hits : []

  const run = async (job: (signal: AbortSignal) => Promise<Lot[]>, none: string) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setBusy(true)
    setError(null)
    try {
      const lots = await job(c.signal)
      if (c.signal.aborted) return
      if (!lots.length) setError(none)
      else {
        setHits([])
        onLots(lots)
      }
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof MapServiceError ? e.message : 'That search didn’t work. Try again in a minute.')
    } finally {
      if (!c.signal.aborted) setBusy(false)
    }
  }

  const submit = () => {
    const id = parseLotDp(text)
    if (id) return run(async s => [(await lotById(id, s))].filter((l): l is Lot => !!l), `No lot ${id.replace(/\//g, ' ').replace(/\s+/g, ' ')} was found. Check the numbers on your title or survey.`)
    if (shownHits[0]) return choose(shownHits[0])
    return run(
      async s => {
        const h = await searchAddress(text, s)
        return h[0] ? lotsOfProperty(h[0].propId, s) : []
      },
      'No address like that was found. Try the street number and name, and the suburb.',
    )
  }
  const choose = (h: AddressHit) => {
    setText(h.address)
    void run(s => lotsOfProperty(h.propId, s), 'That address has no lot on the map. Try its Lot and DP instead.')
  }

  return (
    <div className="map-search">
      <form
        className="row"
        onSubmit={e => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          type="search"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Address, or Lot and DP"
          aria-label="Address, or Lot and DP"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button className="secondary" type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Finding…' : 'Find'}
        </button>
      </form>
      {shownHits.length > 0 && (
        <ul className="map-hits" role="listbox" aria-label="Addresses found">
          {shownHits.map(h => (
            <li key={`${h.address}|${h.propId}`}>
              <button className="link" role="option" aria-selected={false} onClick={() => choose(h)}>
                {h.address}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="notice small" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function Placed({ place, outline, view, onView, onMove }: { place: MapPlace; outline: SurveyOutline; view: MapViewState; onView: (v: MapViewState) => void; onMove: () => void }) {
  const [step, setStep] = useState(0.25)
  const surveyLonLat = useMemo(() => outline.boundary.map(p => fromMga(gridToMga(place.fit, p), place.zone)), [outline, place.fit, place.zone])
  const fit = fitWords(place)
  const handle = place.areaRatio < 0.92 && !fit.loose
  const turn = (deg: number) => adjustPlace(outline, { turn: deg })
  const shift = (e: number, n: number) => adjustPlace(outline, { shift: [e * step, n * step] })
  const north = Math.abs(place.fit.rotation) >= 0.05 && !place.onGrid

  return (
    <>
      <div className="map-placed-head">
        <b>On {place.lot.label}</b>
        <button className="link" onClick={onMove}>
          Pick another lot
        </button>
      </div>
      <MapPicker view={view} onView={onView} lots={[place.lot]} selected={place.lot.id} onPick={() => {}} outline={surveyLonLat} height={260} />
      <p className={fit.loose ? 'notice small' : 'muted small'}>{fit.text}</p>
      {handle && <p className="muted small">The survey covers {Math.round(place.areaRatio * 100)}% of the lot’s area, so part of the lot isn’t in it. On a battle-axe lot that’s usually the access handle.</p>}
      {north && (
        <p className="muted small">
          Your survey’s north is turned {Math.abs(place.fit.rotation).toFixed(1)}° {place.fit.rotation > 0 ? 'anticlockwise' : 'clockwise'} from grid north.
        </p>
      )}
      <details className="checks-more map-nudge">
        <summary>Nudge it into place</summary>
        <div className="map-nudge-grid" role="group" aria-label="Move the survey on the map">
          <button className="secondary" onClick={() => turn(0.25)} aria-label="Turn anticlockwise a quarter degree">
            ↺
          </button>
          <button className="secondary" onClick={() => shift(0, 1)} aria-label="Move north">
            ↑
          </button>
          <button className="secondary" onClick={() => turn(-0.25)} aria-label="Turn clockwise a quarter degree">
            ↻
          </button>
          <button className="secondary" onClick={() => shift(-1, 0)} aria-label="Move west">
            ←
          </button>
          <button className="secondary" onClick={() => shift(0, -1)} aria-label="Move south">
            ↓
          </button>
          <button className="secondary" onClick={() => shift(1, 0)} aria-label="Move east">
            →
          </button>
        </div>
        <label className="map-step">
          <span>Each move</span>
          <select value={step} onChange={e => setStep(Number(e.target.value))}>
            <option value={0.05}>5 cm</option>
            <option value={0.25}>25 cm</option>
            <option value={1}>1 m</option>
          </select>
          <span className="muted small">Turns are ¼°.</span>
        </label>
      </details>

      <label className="check">
        <input type="checkbox" checked={place.aerial} onChange={e => setMapOptions({ aerial: e.target.checked })} />
        Aerial photo under the plan
      </label>
      {place.aerial && (
        <label className="sf-opacity">
          <span>Fade</span>
          <input type="range" min={0.2} max={1} step={0.05} value={place.opacity} aria-label="How strongly the photo shows" onChange={e => setMapOptions({ opacity: Number(e.target.value) })} />
        </label>
      )}
      <Planning place={place} />
      <label className="check">
        <input type="checkbox" checked={place.include} onChange={e => setMapOptions({ include: e.target.checked })} />
        Put the lot in project files I save
      </label>
      <p className="muted small">The lot stays with this project in this browser (and your cloud saves). Share links never show it, and project files only when this is ticked.</p>
      <div className="row">
        <button className="secondary" onClick={removePlace}>
          Take it off the map
        </button>
      </div>
    </>
  )
}

const yesNo = (hits: { name: string; middle: boolean }[], none: string) =>
  hits.length ? hits.map(h => `${h.name}${h.middle ? '' : ' (part of the lot)'}`).join(', ') : none

function Planning({ place }: { place: MapPlace }) {
  const reading = useMap(s => s.reading)
  const error = useMap(s => s.error)
  const plan = usePlan(s => s.plan)
  const settings = checkSettingsOf(plan?.checks)
  const f: PlanningFacts | null = place.planning
  const council = f?.lga ? COUNCILS.find(c => c.name.toUpperCase() === f.lga) : undefined
  const on = activeCouncil(settings)
  const mapValues = f && (f.height !== null || f.fsr !== null) && (f.height !== (settings.lepHeight ?? null) || f.fsr !== (settings.lepFsr ?? null))

  return (
    <section className="map-planning" aria-labelledby="map-planning-head">
      <div className="map-placed-head">
        <h3 id="map-planning-head">What the planning maps say</h3>
        <button className="link" onClick={() => void refreshPlanning()} disabled={reading}>
          {reading ? 'Reading…' : 'Read again'}
        </button>
      </div>
      {error && (
        <p className="notice small" role="alert">
          {error}
        </p>
      )}
      {!f && reading && <p className="muted small">Reading the zone and hazard maps for your lot…</p>}
      {f && (
        <>
          <dl className="map-facts">
            <dt>Council</dt>
            <dd>{f.lga ? titleCase(f.lga) : 'Not found'}</dd>
            <dt>Zone</dt>
            <dd>{f.zones.length ? f.zones.map(z => `${z.name}${z.middle ? '' : ' (part)'}`).join(', ') : 'Not found'}</dd>
            {f.height !== null && (
              <>
                <dt>Height of buildings</dt>
                <dd>{f.height} m</dd>
              </>
            )}
            {f.fsr !== null && (
              <>
                <dt>Floor space ratio</dt>
                <dd>{f.fsr}:1</dd>
              </>
            )}
            {f.lotSize && (
              <>
                <dt>Minimum lot size</dt>
                <dd>{f.lotSize}</dd>
              </>
            )}
            <dt>Heritage</dt>
            <dd>{f.heritage.length ? f.heritage.map(h => `${h.name}${h.kind && h.kind !== h.name ? `, ${h.kind.toLowerCase()}` : ''}`).join('; ') : 'None'}</dd>
            <dt>Bushfire prone</dt>
            <dd>{yesNo(f.bushfire, 'No')}</dd>
            <dt>Flood planning</dt>
            <dd>{yesNo(f.flood, f.lga === 'WOLLONGONG' ? 'Not on a map (ask council)' : 'No')}</dd>
            <dt>Landslide risk</dt>
            <dd>{yesNo(f.landslide, 'No')}</dd>
          </dl>
          {f.failed.length > 0 && <p className="notice small">Some maps didn’t answer ({f.failed.length}). Their checks say so; read again in a minute.</p>}
          {council && on?.id !== council.id && (
            <div className="row">
              <button className="secondary" onClick={() => setCouncil(council.id, true)}>
                Check against {council.name}’s rules
              </button>
            </div>
          )}
          {!council && f.lga && <p className="muted small">The checks don’t know {titleCase(f.lga)}’s own rules yet, so the DA checks stay off. The Housing Code checks apply across NSW.</p>}
          {mapValues && (
            <div className="row">
              <button className="secondary" onClick={() => setCheckSettings({ ...(f.height !== null ? { lepHeight: f.height } : {}), ...(f.fsr !== null ? { lepFsr: f.fsr } : {}) })}>
                Use the map’s {[f.height !== null && 'height', f.fsr !== null && 'floor space ratio'].filter(Boolean).join(' and ')} in the checks
              </button>
            </div>
          )}
          <div className="row">
            <button className="link" onClick={() => navigate({ kind: 'app', area: 'design', tab: 'checks', view: 'plan' })}>
              See them in Checks
            </button>
          </div>
          <p className="muted small">
            A guide from the state’s maps, not a planning certificate: the council’s section 10.7 certificate is the final word. {PLANNING_CREDIT}.
          </p>
        </>
      )}
    </section>
  )
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())
