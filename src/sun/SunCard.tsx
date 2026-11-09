// The sun study's controls on the 3D view: the day (21 June, an equinox, 21 December or any
// date), the time from 6 am to 6 pm, and Play to run through the day. The light in the scene
// follows (src/sun/SceneLights.tsx).

import { useEffect, useLayoutEffect, useRef } from 'react'
import { Icon } from '../nav/icons'
import { navigate } from '../nav/router'
import type { Plan } from '../plan/model'
import { inNsw, locationOf, locationText } from './location'
import { clockText, compassPoint, sunAt, sunDay } from './solar'
import { DAY_END, DAY_START, PLAY_MS, QUICK_DAYS, studyDate, useSun } from './store'
import './sun.css'

const pad = (n: number) => String(n).padStart(2, '0')

/** `onHeight` hears the card's height (0 when it's hidden), so the 3D picture can move up clear of it. */
export function SunCard({ plan, onHeight }: { plan: Plan; onHeight?: (h: number) => void }) {
  const s = useSun()
  usePlayer()
  const card = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = card.current
    if (!el || !onHeight) return
    const tell = () => onHeight(el.offsetHeight)
    tell()
    const watch = new ResizeObserver(tell)
    watch.observe(el)
    return () => {
      watch.disconnect()
      onHeight(0)
    }
  }, [s.on, onHeight])
  if (!s.on) return null
  const location = locationOf(plan)
  const date = studyDate(s)
  const sun = sunAt(location.lat, location.lon, date, s.minutes)
  const day = sunDay(location.lat, location.lon, date)
  const times = day.sunrise !== null && day.sunset !== null ? `Sunrise ${clockText(day.sunrise)}, sunset ${clockText(day.sunset)}` : ''
  return (
    <section ref={card} className="float-card sun-card" aria-label="Sun study">
      <header>
        <h2>
          <Icon name="sun" size={16} /> Sun study
        </h2>
        <button
          className="link quiet sun-place"
          onClick={() => navigate({ kind: 'app', area: 'site', tab: 'sun', view: '3d' })}
          title="Where the block is, for the sun"
        >
          {locationText(location)}
        </button>
        <button className="icon-button" onClick={() => s.setOn(false)} aria-label="Turn the sun study off" title="Turn the sun study off">
          <Icon name="x" size={15} />
        </button>
      </header>
      <div className="sun-days" role="group" aria-label="Day">
        {QUICK_DAYS.map(d => (
          <button key={d.id} className={s.month === d.month && s.day === d.day ? 'on' : ''} aria-pressed={s.month === d.month && s.day === d.day} onClick={() => s.setDay(d.month, d.day)}>
            {d.label}
          </button>
        ))}
        <input
          type="date"
          aria-label="Another day"
          value={`${date.year}-${pad(date.month)}-${pad(date.day)}`}
          onChange={e => {
            const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(e.target.value)
            if (m) s.setDay(Number(m[1]), Number(m[2]))
          }}
        />
      </div>
      <div className="sun-time">
        <button
          className="icon-button sun-play"
          onClick={() => {
            if (!s.playing && s.minutes >= DAY_END) s.setMinutes(DAY_START)
            s.setPlaying(!s.playing)
          }}
          aria-label={s.playing ? 'Pause' : 'Play the day'}
          title={s.playing ? 'Pause' : 'Play the day'}
        >
          <Icon name={s.playing ? 'pause' : 'play'} size={16} />
        </button>
        <input
          type="range"
          min={DAY_START}
          max={DAY_END}
          step={5}
          value={s.minutes}
          aria-label="Time of day"
          aria-valuetext={clockText(s.minutes)}
          onChange={e => {
            s.setPlaying(false)
            s.setMinutes(Number(e.target.value))
          }}
        />
        <b className="sun-clock">{clockText(s.minutes)}</b>
      </div>
      <p className="sun-readout" aria-live="polite">
        {sun.elevation > 0 ? (
          <>
            Sun {Math.round(sun.elevation)}° up in the {compassPoint(sun.azimuth)} ({Math.round(sun.azimuth)}° from true north)
          </>
        ) : (
          <>The sun is down.</>
        )}
        <span className="muted">
          {times ? ` ${times}.` : ''} AEST, no daylight saving{inNsw(location) ? '' : '; this place may keep other time'}.
        </span>
      </p>
    </section>
  )
}

/** While playing, move the time on each frame, a day in PLAY_MS, stopping at 6 pm. */
function usePlayer() {
  const playing = useSun(s => s.playing)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const st = useSun.getState()
      const next = st.minutes + ((now - last) / PLAY_MS) * (DAY_END - DAY_START)
      last = now
      if (next >= DAY_END) {
        st.setMinutes(DAY_END)
        st.setPlaying(false)
        return
      }
      st.setMinutes(next)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])
}
