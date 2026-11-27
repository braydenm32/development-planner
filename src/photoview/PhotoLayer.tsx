// The photo view outside the 3D canvas: the photo itself behind the canvas (the canvas is
// see-through there), a shade over what lies outside the photo, the lining-up helper's marks, and
// the panel: add a photo, say where it was taken, line it up, and choose what shows over it.

import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { announce } from '../a11y/announce'
import { CanvasFrame } from '../components/canvasFrame'
import { Num, Select, TextField } from '../components/fields'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { Icon } from '../nav/icons'
import { useTouchCanvas } from '../phone/device'
import { forTouch, isTouch, withKey } from '../phone/words'
import { levelById, sortedLevels, type Plan } from '../plan/model'
import { showToast } from '../safety/store'
import { savePicture } from '../export/files'
import { useSiteStore } from '../site/store'
import { clockText } from '../sun/solar'
import { useSun } from '../sun/store'
import { InsetPlan } from './InsetPlan'
import { STEP_DEG, STEP_M } from './keySteps'
import { addPhotoFile, PHOTO_ACCEPT } from './load'
import { addedWords } from './words'
import { clampFov, FOV_MAX, FOV_MIN, wrap180, wrap360, type PhotoView } from './model'
import { sunTimeOf } from './facts'
import { leavePhotoView, openPhotoView, removePhoto, updatePhoto, usePhotoView, type ShowOver } from './store'
import './photoview.css'

/** How to look round, as written for a mouse and keys (src/phone/words.ts rewords it for a finger). */
export const PHOTO_HINT = 'Drag to turn the model onto the photo; the wheel changes the lens angle. Arrow keys move the spot, Q and E turn, R and F tilt, [ and ] lean, + and − change the lens.'
const PHOTO_HINT_TOUCH = 'Drag to turn the model onto the photo; pinch to change the lens angle.'

/** One empty list, so a project with no photos doesn't draw again and again. */
const NO_PHOTOS: PhotoView[] = []

const SHOW: { id: ShowOver; label: string }[] = [
  { id: 'house', label: 'The new house' },
  { id: 'earthworks', label: 'The house with cut and fill' },
  { id: 'all', label: 'Everything' },
]

/** The view bar's button: open the photo view, or leave it. */
export function PhotoViewButton() {
  const active = usePhotoView(s => s.active)
  // A share link opens no project here, and carries no photos to look from.
  const shared = useTouchCanvas()?.projectKey === ''
  if (shared) return null
  return (
    <button
      onClick={() => (active ? leavePhotoView() : openPhotoView())}
      aria-pressed={active}
      aria-label="From a photo"
      title={active ? 'Leave the photo view (Esc)' : 'See the house from where a photo was taken on the block'}
    >
      <Icon name="photo" size={16} />
      <span>From a photo</span>
    </button>
  )
}

/** The photo, the shade round it and the panel, while the photo view is on. */
export function PhotoLayer({ survey, plan, exag }: { survey: Survey; plan: Plan | null; exag: number }) {
  const active = usePhotoView(s => s.active)
  if (!active) return null
  return <Layer survey={survey} plan={plan} exag={exag} />
}

function Layer({ survey, plan, exag }: { survey: Survey; plan: Plan | null; exag: number }) {
  const id = usePhotoView(s => s.id)
  const rect = usePhotoView(s => s.rect)
  const picking = usePhotoView(s => s.picking)
  const photos = useSiteStore(s => s.data.photos ?? NO_PHOTOS)
  const photo = photos.find(p => p.id === id) ?? null
  const image = useSiteStore(s => (id ? s.images[id] : undefined))
  const insets = useContext(CanvasFrame)?.insets
  const layer = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const [narrow, setNarrow] = useState(false)

  // Tell the 3D view how much of the canvas the panel takes, so the photo fits beside or above it.
  useLayoutEffect(() => {
    const el = layer.current
    const p = panel.current
    if (!el || !p) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      const isNarrow = box.width < 760
      setNarrow(isNarrow)
      const pr = p.getBoundingClientRect()
      usePhotoView.getState().set({
        panel: isNarrow ? { l: 0, r: 0, t: 0, b: Math.max(0, box.bottom - pr.top) } : { l: 0, r: Math.max(0, box.right - pr.left) - (insets?.r ?? 0), t: 0, b: 0 },
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(p)
    return () => {
      ro.disconnect()
      usePhotoView.getState().set({ panel: null })
    }
  }, [insets])

  const looking = !!(photo?.at && rect)
  const style = rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined
  return (
    <div ref={layer} className={`pv-layer${narrow ? ' narrow' : ''}`}>
      {looking && image && <img className="pv-photo" src={image} alt="" style={style} draggable={false} />}
      {looking && rect && (
        <>
          <div className="pv-shade" style={{ left: 0, top: 0, right: 0, height: rect.top }} />
          <div className="pv-shade" style={{ left: 0, top: rect.top + rect.height, right: 0, bottom: 0 }} />
          <div className="pv-shade" style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }} />
          <div className="pv-shade" style={{ left: rect.left + rect.width, top: rect.top, right: 0, height: rect.height }} />
          {picking?.pairs.map((p, i) => (
            <span key={i} className="pv-mark" style={{ left: rect.left + p.photo[0] * rect.width, top: rect.top + p.photo[1] * rect.height }} aria-hidden="true">
              {i + 1}
            </span>
          ))}
          {picking?.photo && (
            <span className="pv-mark waiting" style={{ left: rect.left + picking.photo[0] * rect.width, top: rect.top + picking.photo[1] * rect.height }} aria-hidden="true">
              {picking.pairs.length + 1}
            </span>
          )}
        </>
      )}
      <section
        ref={panel}
        className="pv-panel"
        aria-label="View from a photo"
        // On a phone, above the sheet and the 2D|3D pill at the foot.
        style={narrow ? { bottom: (insets?.b ?? 0) + 56 } : { right: 14 + (insets?.r ?? 0) }}
      >
        <Panel photo={photo} photos={photos} image={image} survey={survey} plan={plan} narrow={narrow} exag={exag} />
      </section>
    </div>
  )
}

function Panel({ photo, photos, image, survey, plan, narrow, exag }: { photo: PhotoView | null; photos: PhotoView[]; image?: string; survey: Survey; plan: Plan | null; narrow: boolean; exag: number }) {
  const touch = isTouch()
  const [note, setNote] = useState<string | null>(null)
  return (
    <>
      <div className="pv-head">
        <h2>View from a photo</h2>
        <button type="button" className="pv-btn primary" onClick={leavePhotoView} aria-label={withKey('Leave the photo view', 'Esc', touch)}>
          Done
        </button>
      </div>
      {photos.length > 1 && photo && (
        <Select label="Photo" value={photo.id} options={photos.map(p => ({ id: p.id, label: p.name }))} onChange={v => usePhotoView.getState().set({ id: v, picking: null })} />
      )}
      {!photo ? (
        <>
          <p className="pv-note">
            Add a photo you took on or near the block, then say where you stood. The new house is drawn over it, as it would look from there. Stand where a window or deck will be to see the outlook from it.
          </p>
          <AddPhoto onAdded={setNote} />
          <Privacy />
        </>
      ) : (
        <PhotoControls key={photo.id} photo={photo} image={image} survey={survey} plan={plan} narrow={narrow} exag={exag} note={note} setNote={setNote} />
      )}
    </>
  )
}

/** The photo stays in this browser with the project, like a drawing. */
function Privacy() {
  return (
    <p className="pv-note small">
      The photo is kept with this project, as drawings are, and saved again without its location. It goes in a project file only if you tick it, and never in a share link.
    </p>
  )
}

export function AddPhoto({ onAdded, compact }: { onAdded?: (note: string) => void; compact?: boolean }) {
  const file = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const touch = isTouch()
  const take = async (f: File) => {
    setError(null)
    setBusy(true)
    try {
      const added = await addPhotoFile(f)
      usePhotoView.getState().set({ id: added.view.id, picking: null })
      const words = addedWords(added)
      onAdded?.(words)
      announce(`Photo added: ${added.view.name}. ${words}`)
    } catch (e) {
      setError((e as Error).message || 'That photo couldn’t be added.')
    } finally {
      setBusy(false)
    }
  }
  const input = (ref: typeof file, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      hidden
      accept={capture ? 'image/*' : PHOTO_ACCEPT}
      {...(capture ? { capture: 'environment' } : {})}
      onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) void take(f)
      }}
    />
  )
  return (
    <div className="pv-add">
      <div className="pv-row">
        <button type="button" className={`pv-btn${compact ? '' : ' primary'}`} disabled={busy} onClick={() => file.current?.click()}>
          {busy ? 'Adding the photo…' : 'Choose a photo…'}
        </button>
        {touch && (
          <button type="button" className="pv-btn" disabled={busy} onClick={() => camera.current?.click()}>
            Take a photo
          </button>
        )}
      </div>
      {input(file, false)}
      {input(camera, true)}
      {!compact && <p className="pv-note small">JPEG, PNG or WebP. A photo from an iPhone in HEIC opens where the browser can read it.</p>}
      {error && (
        <p className="pv-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** A number with − and + for fine steps beside it. */
function Stepped({ label, value, unit, step, min, max, decimals, onCommit, onStep }: { label: string; value: number; unit: '°' | 'm'; step: number; min?: number; max?: number; decimals: number; onCommit: (v: number) => void; onStep?: (v: number) => void }) {
  const go = onStep ?? onCommit
  return (
    <div className="pv-stepped">
      <Num label={label} value={value} unit={unit} min={min} max={max} decimals={decimals} onCommit={onCommit} />
      <div className="pv-steps" role="group" aria-label={`${label}: fine steps`}>
        <button type="button" className="pv-btn icon" aria-label={`${label} down ${step} ${unit === '°' ? 'degrees' : 'metres'}`} onClick={() => go(value - step)}>
          −
        </button>
        <button type="button" className="pv-btn icon" aria-label={`${label} up ${step} ${unit === '°' ? 'degrees' : 'metres'}`} onClick={() => go(value + step)}>
          +
        </button>
      </div>
    </div>
  )
}

/** A part of the panel that folds away on a phone. */
function Part({ title, open, children }: { title: string; open: boolean; children: ReactNode }) {
  return (
    <details className="pv-part" open={open}>
      <summary>{title}</summary>
      <div className="pv-part-body">{children}</div>
    </details>
  )
}

function PhotoControls({ photo, image, survey, plan, narrow, exag, note, setNote }: { photo: PhotoView; image?: string; survey: Survey; plan: Plan | null; narrow: boolean; exag: number; note: string | null; setNote: (s: string | null) => void }) {
  const picking = usePhotoView(s => s.picking)
  const show = usePhotoView(s => s.show)
  const seeThrough = usePhotoView(s => s.seeThrough)
  const lines = usePhotoView(s => s.lines)
  const touch = isTouch()
  const set = (patch: Partial<PhotoView>) => updatePhoto(photo.id, patch)
  const boundary = survey.boundary as Vec2[]
  const origin = survey.origin as Vec2
  const levels = plan ? sortedLevels(plan) : []
  const onLevel = photo.level && plan && levelById(plan, photo.level)

  if (!photo.at) {
    return (
      <>
        <p className="pv-lead">Where was “{photo.name}” taken?</p>
        <p className="pv-note">{forTouch('Click the spot on this plan of the block, then drag the way you faced. A photo from the street is fine: put the spot on the road.', touch)}</p>
        <InsetPlan photo={photo} boundary={boundary} origin={origin} plan={plan} placing width={narrow ? 300 : 290} height={narrow ? 170 : 230} />
        {!image && <MissingPicture />}
      </>
    )
  }

  const sun = sunTimeOf(photo.taken, photo.offset)
  return (
    <>
      {photo.guessed && (
        <div className="pv-guess" role="status">
          <span>Rough guess from the phone’s location and compass: check the spot and the direction.</span>
          <button type="button" className="pv-btn" onClick={() => set({ guessed: false })}>
            Looks right
          </button>
        </div>
      )}
      {note && (
        <p className="pv-note" role="status">
          {note}{' '}
          <button type="button" className="pv-link" onClick={() => setNote(null)}>
            OK
          </button>
        </p>
      )}
      {!image && <MissingPicture />}
      {exag !== 1 && <p className="pv-warn">Heights are stretched ×{exag} in Show, so the house won’t sit true on the photo. Set it back to 1 for a true picture.</p>}
      <p className="pv-note small">{touch ? PHOTO_HINT_TOUCH : PHOTO_HINT}</p>
      <Part title="Line it up" open={!narrow}>
        {picking ? (
          <PointPairs photo={photo} />
        ) : (
          <div className="pv-row">
            <button type="button" className="pv-btn" onClick={() => usePhotoView.getState().set({ picking: { pairs: [], photo: null, extra: 'fov', problem: null } })}>
              Line up by points…
            </button>
          </div>
        )}
        <Stepped label="Direction" unit="°" step={STEP_DEG} decimals={1} value={photo.heading} onCommit={v => set({ heading: wrap360(v), guessed: false })} />
        <Stepped label="Tilt" unit="°" step={STEP_DEG} min={-85} max={85} decimals={1} value={photo.tilt} onCommit={v => set({ tilt: Math.max(-85, Math.min(85, v)) })} />
        <Stepped label="Lean" unit="°" step={STEP_DEG} min={-45} max={45} decimals={1} value={photo.roll} onCommit={v => set({ roll: wrap180(v) })} />
        <Stepped label="Lens angle" unit="°" step={STEP_DEG} min={FOV_MIN} max={FOV_MAX} decimals={1} value={photo.fov} onCommit={v => set({ fov: clampFov(v), lens: 'set' })} />
        <p className="pv-note small">
          {photo.lens === 'photo' ? 'Lens angle from the photo’s details.' : photo.lens === 'phone' ? 'The photo didn’t say its lens: a normal phone lens to start with.' : 'Lens angle set by hand.'}
        </p>
      </Part>
      <Part title="Where it was taken" open={!narrow}>
        <InsetPlan photo={photo} boundary={boundary} origin={origin} plan={plan} placing={false} width={narrow ? 300 : 290} height={narrow ? 150 : 170} />
        <div className="pv-row pv-move" role="group" aria-label="Move the spot">
          <span className="pv-note small">Move the spot {STEP_M * 1000} mm:</span>
          {(
            [
              ['ArrowUp', 'Forward', 'chevU'],
              ['ArrowDown', 'Back', 'chevD'],
              ['ArrowLeft', 'Left', 'chevL'],
              ['ArrowRight', 'Right', 'chevR'],
            ] as const
          ).map(([key, label, icon]) => (
            <button key={key} type="button" className="pv-btn icon" aria-label={`Move the spot ${label.toLowerCase()} ${STEP_M * 1000} mm`} title={withKey(label, key.replace('Arrow', ''), touch)} onClick={() => set(moveSpot(photo, key))}>
              <Icon name={icon} size={16} />
            </button>
          ))}
        </div>
        <Stepped label="Eye height" unit="m" step={STEP_M} min={0} max={100} decimals={2} value={photo.eyeHeight} onCommit={v => set({ eyeHeight: Math.max(0, v) })} />
        <Select
          label="Above"
          value={onLevel ? (photo.level as string) : ''}
          options={[{ id: '', label: 'The ground at the spot' }, ...levels.map(l => ({ id: l.id, label: `${l.name} floor (a deck or window)` }))]}
          onChange={v => set({ level: v || null, eyeHeight: photo.eyeHeight })}
        />
      </Part>
      <Part title="What shows over the photo" open={!narrow}>
        <fieldset className="pv-show">
          <legend className="sr-only">What shows over the photo</legend>
          {SHOW.map(o => (
            <label key={o.id} className="check">
              <input type="radio" name="pv-show" checked={show === o.id} onChange={() => usePhotoView.getState().set({ show: o.id })} />
              {o.label}
            </label>
          ))}
        </fieldset>
        <label className="pv-range">
          <span>See-through</span>
          <input type="range" min={0} max={0.9} step={0.05} value={seeThrough} aria-label="How much of the photo shows through the model" onChange={e => usePhotoView.getState().set({ seeThrough: Number(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={lines} onChange={e => usePhotoView.getState().set({ lines: e.target.checked })} />
          Show the block’s boundary and the ground as lines
        </label>
      </Part>
      <Part title="Photo" open={!narrow}>
        {sun && (
          <button type="button" className="pv-btn" onClick={() => setSun(photo)}>
            Set the sun to when this was taken
          </button>
        )}
        <div className="pv-row">
          <button type="button" className="pv-btn" disabled={!plan} onClick={() => plan && void savePicture(plan, '3d').then(err => err && showToast({ text: err, error: true }))}>
            <Icon name="download" size={16} /> Save the picture
          </button>
        </div>
        <TextField label="Name" value={photo.name} onCommit={v => v.trim() && set({ name: v.trim().slice(0, 60) })} />
        <label className="check" title="The project file is private to whoever you send it to; by default it carries where the photo was taken from, not the photo">
          <input type="checkbox" checked={photo.include} onChange={e => set({ include: e.target.checked })} />
          Put the photo in the project file
        </label>
        <div className="pv-row">
          <AddPhoto compact />
          <button
            type="button"
            className="pv-btn"
            onClick={() => {
              removePhoto(photo.id)
              showToast({ text: `Photo “${photo.name}” removed. Undo brings it back.` })
            }}
          >
            Remove this photo
          </button>
        </div>
      </Part>
    </>
  )
}

function MissingPicture() {
  return <p className="pv-warn">The photo itself isn’t in this browser (the project came without it). Where it was taken is kept; add the photo again to see it.</p>
}

/** The arrows' move of the spot, as the keys do it. */
function moveSpot(v: PhotoView, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): Partial<PhotoView> {
  const h = (v.heading * Math.PI) / 180
  const [f, s] = key === 'ArrowUp' ? [STEP_M, 0] : key === 'ArrowDown' ? [-STEP_M, 0] : key === 'ArrowLeft' ? [0, -STEP_M] : [0, STEP_M]
  return v.at ? { at: [v.at[0] + Math.sin(h) * f + Math.cos(h) * s, v.at[1] + Math.cos(h) * f - Math.sin(h) * s], guessed: false } : {}
}

function setSun(photo: PhotoView) {
  const t = sunTimeOf(photo.taken, photo.offset)
  if (!t) return
  const s = useSun.getState()
  s.setOn(true)
  s.setDay(t.month, t.day)
  s.setMinutes(t.minutes)
  const day = new Date(Date.UTC(2000, t.month - 1, t.day)).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  const words = `The sun is set to ${day}, ${clockText(t.minutes)} (Sydney standard time)${t.clamped ? ', as near as the sun study goes to when it was taken' : ''}${t.zoneGuessed ? '. The photo didn’t say its time zone, so daylight saving was assumed from the date' : ''}.`
  showToast({ text: words })
  announce(words)
}

/** The lining-up helper: pairs of points, a point in the photo then the same point on the model. */
function PointPairs({ photo }: { photo: PhotoView }) {
  const picking = usePhotoView(s => s.picking)!
  const n = picking.pairs.length
  const step = picking.photo ? `Now click the same point on the model (the blue dots are corners and marks it knows).` : n === 0 ? 'Click a point in the photo you can also find on the model: a corner of the block, a survey mark, a fence or wall corner you have drawn.' : 'Click another point in the photo, further away from the first, to set the lens angle or the lean too.'
  return (
    <div className="pv-pairs" role="group" aria-label="Line up by points">
      <p className="pv-lead small" aria-live="polite">
        {forTouch(step, isTouch())}
      </p>
      {n > 0 && (
        <ol className="pv-pair-list">
          {picking.pairs.map((p, i) => (
            <li key={i}>{p.label}</li>
          ))}
        </ol>
      )}
      {picking.problem && (
        <p className="pv-error" role="alert">
          {picking.problem}
        </p>
      )}
      <Select
        label="With two points, also set"
        value={picking.extra}
        options={[
          { id: 'fov', label: 'The lens angle' },
          { id: 'roll', label: 'The lean (a sloping horizon)' },
        ]}
        onChange={extra => usePhotoView.getState().set({ picking: { ...picking, extra } })}
      />
      <div className="pv-row">
        <button type="button" className="pv-btn" disabled={!n && !picking.photo} onClick={() => usePhotoView.getState().set({ picking: { ...picking, pairs: [], photo: null, problem: null } })}>
          Start again
        </button>
        <button type="button" className="pv-btn primary" onClick={() => usePhotoView.getState().set({ picking: null })}>
          Done lining up
        </button>
      </div>
      <p className="pv-note small">From one point the direction and tilt are set, from two the lens angle or the lean as well, from three or more all of them. {photo.lens === 'photo' ? 'This photo gave its lens angle, so the lean is usually the better second choice.' : ''}</p>
    </div>
  )
}

/** Site › 3D: the photos, each with a thumbnail and a way to look from it, and Add a photo. */
export function PhotoViewsSection() {
  const photos = useSiteStore(s => s.data.photos ?? NO_PHOTOS)
  const images = useSiteStore(s => s.images)
  return (
    <div className="pv-section" id="photo-views">
      <h3>View from a photo</h3>
      <p className="muted small">See the new house drawn over a photo taken on or near the block, or what a window or deck will look out on.</p>
      {photos.length > 0 && (
        <ul className="pv-list">
          {photos.map(p => (
            <li key={p.id}>
              {images[p.id] ? <img src={images[p.id]} alt="" className="pv-thumb" /> : <span className="pv-thumb none" aria-hidden="true" />}
              <span className="pv-list-name">
                <b>{p.name}</b>
                <small className="muted">{p.at ? (p.guessed ? 'Spot guessed' : 'Spot set') : 'Spot not set yet'}</small>
              </span>
              <button type="button" className="pv-btn" onClick={() => openPhotoView(p.id)}>
                Look from here
              </button>
              <button
                type="button"
                className="pv-btn icon"
                aria-label={`Remove the photo ${p.name}`}
                title="Remove (Undo brings it back)"
                onClick={() => {
                  removePhoto(p.id)
                  showToast({ text: `Photo “${p.name}” removed. Undo brings it back.` })
                }}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddPhoto
        compact={photos.length > 0}
        onAdded={() => {
          const id = usePhotoView.getState().id
          if (id) openPhotoView(id)
        }}
      />
      {!photos.length && <Privacy />}
    </div>
  )
}

