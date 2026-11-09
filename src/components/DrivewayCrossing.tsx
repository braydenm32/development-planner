// Earthworks › Driveway: the street side of a driveway and whether a car gets from the road to the
// garage. The kerb's level where the drive meets the road (typed, from the survey's level at the
// boundary, or read from the state's elevation data when the block is on the map) and the
// footpath's width; the long section from the garage to the gutter with each grade; and the
// crossing checks, the same rows Design › Checks lists (src/checks/crossing.ts).

import { useEffect, useMemo, useRef, useState } from 'react'
import { checkSettingsOf, activeCouncil } from '../checks/councils'
import { analyseDrive, crossingStandard, driveChecks, fallText, kerbText, type DriveCrossing } from '../checks/crossing'
import { gradeText } from '../lib/drape'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { DEM, ElevationError, groundAt } from '../map/elevation'
import { gridToMga } from '../map/fit'
import { useMap } from '../map/store'
import { driveLines, kerbFromBoundary, kerbPoint, segmentsOf, type DriveProfile, type ProfilePoint } from '../plan/crossing'
import { driveGround } from '../plan/driveway'
import type { Area, CrossingFacts, Plan } from '../plan/model'
import { updateArea } from '../plan/ops'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { useProjects } from '../projects/session'
import { navigate } from '../nav/router'
import { CheckRow } from '../shell/tabs/ChecksTab'
import { Num } from './fields'
import '../checks/checks.css'
import './finishing.css'

interface Props {
  plan: Plan
  area: Area
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

const setCrossing = (id: string, now: CrossingFacts, patch: Partial<CrossingFacts>) => {
  const next: CrossingFacts = { ...now, ...patch }
  for (const k of Object.keys(next) as (keyof CrossingFacts)[]) if (next[k] === undefined) delete next[k]
  usePlan.getState().commit(p => updateArea(p, id, { crossing: Object.keys(next).length ? next : undefined }))
}

/** The drive's crossing, worked out as the checks do. */
function useDriveCrossing({ plan, area, survey, terrain, earth }: Props): DriveCrossing | null {
  const dem = !!useProjects().opened?.survey?.dem
  return useMemo(() => {
    const s = checkSettingsOf(plan.checks)
    const ground = driveGround(earth, terrain.grid)
    const lines = driveLines({ ...plan, areas: [area] }, survey.origin, survey.boundary, ground, {
      frontEdge: s.frontEdge,
      battleAxe: s.battleAxe,
      natural: dem ? undefined : p => terrain.grid.sample(p[0], p[1]),
    })
    return lines[0] ? analyseDrive(lines[0], crossingStandard(activeCouncil(s))) : null
  }, [plan, area, survey, terrain, earth, dem])
}

export function DrivewayCrossing(props: Props) {
  const { plan, area, survey } = props
  const d = useDriveCrossing(props)
  // Say why rather than leave the panel silent: the checks skip it too.
  if (!d)
    return (
      <div className="drive-levels drive-crossing">
        <h4>Street crossing</h4>
        <p className="muted small">The app can’t find this drive’s two ends from its outline, so its footpath crossing isn’t checked. Redraw it as a long shape from the garage to the street.</p>
      </div>
    )
  const facts = area.crossing ?? {}
  const council = activeCouncil(checkSettingsOf(plan.checks))
  const rows = driveChecks(d)
  const set = (patch: Partial<CrossingFacts>) => setCrossing(area.id, facts, patch)
  const kerb = d.kerb
  const typed = facts.kerb?.from === 'typed'
  // A first guess to type over: a standard crossing down from the drive's level at the boundary.
  const guess = () => Math.round(kerbFromBoundary(d.line.along[d.line.along.length - 1]?.z ?? 0, d.shape) * 100) / 100

  return (
    <div className="drive-levels drive-crossing">
      <h4>Street crossing</h4>
      {d.line.why === 'battle-axe' ? (
        <p className="muted small">On a battle-axe lot the drive meets the street at the end of the access handle, which the survey leaves out, so its crossing isn’t checked here.</p>
      ) : d.line.why ? (
        <p className="muted small">The drive doesn’t run out to the street side of the block. Draw it to the boundary to check the footpath crossing.</p>
      ) : (
        <>
          {typed || kerb ? (
            <Num label="Kerb level at the crossing" unit="RL" value={kerb?.rl ?? facts.kerb?.rl ?? 0} onCommit={rl => set({ kerb: { rl, from: 'typed' } })} />
          ) : null}
          <p className={kerb ? 'muted small' : 'notice small'}>
            {kerb ? (
              <>
                {kerbText(kerb, d.shape)}{' '}
                {typed && (
                  <button className="link" onClick={() => set({ kerb: undefined })}>
                    Use the survey or state data instead
                  </button>
                )}
              </>
            ) : (
              <>
                <b>Needs a fact:</b> the kerb’s level where the drive meets the road (the gutter’s lowest point). It’s on the survey if it reaches the street, or the council can give it.{' '}
                <button className="link" onClick={() => set({ kerb: { rl: guess(), from: 'typed' } })}>
                  Type the kerb level
                </button>
              </>
            )}
          </p>
          {!typed && kerb?.from !== 'survey' && <StateKerb d={d} facts={facts} survey={survey} set={set} />}
          <Num label="Footpath width" unit="m" decimals={1} min={0.5} max={30} value={facts.footpath ?? d.std.footpath.width} onCommit={v => set({ footpath: v })} />
          <p className="muted small">
            Kerb to boundary.{' '}
            {council?.crossing?.footpath?.width
              ? `${council.name}’s crossing drawing shows ${council.crossing.footpath.width.toFixed(1)} m.`
              : `The app takes ${d.std.footpath.width.toFixed(1)} m until you measure it.`}
            {facts.footpath !== undefined && (
              <>
                {' '}
                <button className="link" onClick={() => set({ footpath: undefined })}>
                  Use {d.std.footpath.width.toFixed(1)} m
                </button>
              </>
            )}
          </p>
        </>
      )}
      <ProfileChart d={d} rows={rows} />
      <ul className="check-list drive-checks">
        {rows.map(r => (
          <CheckRow key={r.id} r={r} />
        ))}
      </ul>
      <p className="muted small">
        These are in{' '}
        <button className="link" onClick={() => navigate({ kind: 'app', area: 'design', tab: 'checks', view: 'plan' })}>
          Design › Checks
        </button>{' '}
        too, with the rest of the rules.
      </p>
    </div>
  )
}

/** Read the street's level at the kerb point from the state's elevation data, once the block is on the map. */
function StateKerb({ d, facts, survey, set }: { d: DriveCrossing; facts: CrossingFacts; survey: Survey; set: (p: Partial<CrossingFacts>) => void }) {
  const place = useMap(s => s.place)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  const at = kerbPoint(d.line, d.shape.footpath)
  if (!place || !at) return facts.kerb?.from === 'state' ? null : <p className="muted small">Or place the block on the map under Site › Map, and the street’s level can be read from the state’s elevation data.</p>
  const go = async () => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setError(null)
    setProgress(0)
    try {
      const grid: Vec2 = [at[0] + survey.origin[0], at[1] + survey.origin[1]]
      const [z] = await groundAt([gridToMga(place.fit, grid) as [number, number]], place.zone, { signal: c.signal, onProgress: (n, t) => setProgress(t ? n / t : 1) })
      if (c.signal.aborted) return
      if (z === null) setError('The state’s elevation data has no level there. Type the kerb level instead.')
      else set({ kerb: { rl: Math.round(z * 100) / 100, from: 'state' } })
    } catch (e) {
      if (c.signal.aborted) return
      setError(e instanceof ElevationError ? e.message : 'The street level couldn’t be read. Try again in a minute.')
    } finally {
      if (ctrl.current === c) {
        ctrl.current = null
        setProgress(null)
      }
    }
  }
  return (
    <div className="drive-state">
      {progress === null ? (
        <div className="row">
          <button className="secondary" onClick={() => void go()}>
            {facts.kerb?.from === 'state' ? 'Read the street level again' : 'Read the street level from state data'}
          </button>
        </div>
      ) : (
        <div className="state-ground-busy" role="status">
          <span>Reading the street level… {Math.round(progress * 100)}%. The state’s service can take a minute or two.</span>
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
      <p className="muted small">
        At the kerb point, the boundary crossing pushed out by the footpath’s width. About ±{DEM.accuracy} m, so check it before you rely on it. {DEM.credit}.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The long section

const W = 300
const H = 176
const PAD = { l: 6, r: 6, t: 24, b: 36 }
/** The share of the width the footpath and layback get at least: at true scale they'd be a sliver beside a long drive. */
const CROSSING_SHARE = 0.36

/** A grade for the chart: "8% · 1 in 12" with room, "8%" with a little, nothing with none. */
function gradeLabel(g: number, room: number): string | null {
  if (room < 30) return null
  if (g < 0.0005) return 'level'
  const pct = `${(g * 100).toFixed(g < 0.1 ? 1 : 0).replace(/\.0$/, '')}%`
  return room >= 84 ? `${pct} · 1 in ${(1 / g).toFixed(g > 0.1 ? 1 : 0)}` : pct
}

/**
 * The long section from the garage to the gutter, not to scale: heights stretched to fill the box
 * and the footpath drawn wider than its share, so the crossing reads. Each grade is labelled and the
 * stretches that fail are red (amber for a warning).
 */
function ProfileChart({ d, rows }: { d: DriveCrossing; rows: { id: string; status: string }[] }) {
  const p: DriveProfile | null = d.profile
  const pts: ProfilePoint[] = p ? p.points : d.own.length ? [{ x: d.own[0].x0, z: d.own[0].z0, mark: 'garage' }, ...d.own.map(s => ({ x: s.x1, z: s.z1 }))] : []
  if (pts.length < 2) return null
  const x0 = pts[0].x
  const x1 = pts[pts.length - 1].x
  const zs = pts.map(q => q.z)
  const zlo = Math.min(...zs)
  const zhi = Math.max(...zs)
  const span = W - PAD.l - PAD.r
  // Along: the drive, then the crossing given at least its share of the width.
  const split = p ? Math.min(0.5, Math.max(CROSSING_SHARE, (p.gutter - p.boundary) / Math.max(x1 - x0, 1e-6))) : 0
  const X = (x: number) => {
    if (!p) return PAD.l + ((x - x0) / Math.max(x1 - x0, 1e-6)) * span
    const a = span * (1 - split)
    return x <= p.boundary ? PAD.l + ((x - x0) / Math.max(p.boundary - x0, 1e-6)) * a : PAD.l + a + ((x - p.boundary) / Math.max(p.gutter - p.boundary, 1e-6)) * (span - a)
  }
  const tall = H - PAD.t - PAD.b
  const range = Math.max(zhi - zlo, 0.3)
  const Z = (z: number) => H - PAD.b - (z - zlo) * (tall / range) - (range > zhi - zlo ? (tall - (zhi - zlo) * (tall / range)) / 2 : 0)
  const status = (id: string) => rows.find(r => r.id === id || r.id.startsWith(`${id}:`))?.status
  const footpathStatus = status('drive-footpath')
  const segs = segmentsOf(pts)
  const max = d.std.maxGrade.max
  const top = p?.points.find(q => q.mark === 'layback')
  const tone = (s: (typeof segs)[number]) => {
    if (!p || s.x1 <= p.boundary + 1e-6) return Math.abs(s.grade) > max + 1e-6 ? 'bad' : Math.abs(s.grade) > 0.2 + 1e-6 ? 'warn' : ''
    if (top && s.x1 <= top.x + 1e-6) return footpathStatus === 'fail' ? 'bad' : footpathStatus === 'warn' ? 'warn' : ''
    return 'council'
  }
  const scrape = d.scrape && d.scrape.clearance < -0.0005 ? d.scrape : null
  const marks = pts.filter(q => q.mark === 'garage' || q.mark === 'boundary' || q.mark === 'gutter')
  const NAMES = { garage: 'Garage', boundary: 'Boundary', gutter: 'Gutter' } as const
  const anchorAt = (x: number) => (x < PAD.l + 30 ? 'start' : x > W - PAD.r - 30 ? 'end' : 'middle')
  // Where the scrape is, kept inside the box (it can be out on the road past the gutter).
  const sx = scrape ? Math.min(Math.max(X(scrape.x), PAD.l + 4), W - PAD.r - 4) : 0
  return (
    <figure className="drive-profile">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Long section of the drive: ${segs.map(s => `${gradeText(Math.abs(s.grade))} over ${(s.x1 - s.x0).toFixed(1)} m`).join(', ')}`}>
        {p && <rect className="verge" x={X(p.boundary)} y={PAD.t - 6} width={X(p.gutter) - X(p.boundary)} height={H - PAD.b - PAD.t + 12} />}
        {marks.map(q => (
          <g key={`${q.mark}-${q.x}`} className="mark">
            <line x1={X(q.x)} x2={X(q.x)} y1={Z(q.z) + 5} y2={H - PAD.b + 5} />
            <text x={X(q.x)} y={H - PAD.b + 17} textAnchor={anchorAt(X(q.x))}>
              {NAMES[q.mark as keyof typeof NAMES]}
              {q.mark === 'boundary' ? ` · ${(q.x - x0).toFixed(1)} m` : ''}
            </text>
            <text x={X(q.x)} y={H - PAD.b + 29} textAnchor={anchorAt(X(q.x))} className="rl">
              RL {q.z.toFixed(2)}
            </text>
          </g>
        ))}
        {segs.map((s, i) => (
          <line key={i} className={`seg ${tone(s)}`} x1={X(s.x0)} y1={Z(s.z0)} x2={X(s.x1)} y2={Z(s.z1)} />
        ))}
        {segs.map((s, i) => {
          const label = tone(s) === 'council' ? null : gradeLabel(Math.abs(s.grade), X(s.x1) - X(s.x0))
          if (!label) return null
          return (
            <text key={`t${i}`} x={(X(s.x0) + X(s.x1)) / 2} y={(Z(s.z0) + Z(s.z1)) / 2 - 7} textAnchor="middle" className={`grade ${tone(s)}`}>
              {label}
            </text>
          )
        })}
        {scrape && (
          <g className="scrape">
            <circle cx={sx} cy={Z(levelAtPts(pts, Math.min(scrape.x, x1)))} r={4.5} />
            <text x={sx} y={PAD.t - 10} textAnchor={sx > W * 0.66 ? 'end' : sx < W * 0.34 ? 'start' : 'middle'}>
              Scrapes {Math.round(-scrape.clearance * 1000)} mm
            </text>
          </g>
        )}
      </svg>
      <figcaption className="muted small">
        Down the drive’s centreline{p ? `, then ${fallText(p.footpathFall)} across the footpath and down the kerb’s layback to the gutter` : ''}. Not to scale: heights stretched{p ? ' and the footpath drawn wider' : ''}.
        {!p && !d.line.why && ' The footpath and gutter join it once there’s a kerb level.'}
      </figcaption>
    </figure>
  )
}

function levelAtPts(pts: { x: number; z: number }[], x: number): number {
  if (x <= pts[0].x) return pts[0].z
  for (let i = 0; i + 1 < pts.length; i++) if (x <= pts[i + 1].x) return pts[i].z + ((pts[i + 1].z - pts[i].z) * (x - pts[i].x)) / (pts[i + 1].x - pts[i].x || 1)
  return pts[pts.length - 1].z
}
