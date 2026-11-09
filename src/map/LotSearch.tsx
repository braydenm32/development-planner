// Finding a lot on the NSW map: an address as you type (the Planning Portal's search), or a Lot and
// DP (the cadastre). Site › Map and the start screen's "start from the address" both use it.

import { useEffect, useRef, useState } from 'react'
import { lotById, lotsOfProperty, MapServiceError, parseLotDp, searchAddress, type AddressHit, type Lot } from './services'

/** The lots of an address, each keeping the address it was found by (for the DA pack's title blocks). */
const lotsAt = async (h: AddressHit, signal: AbortSignal): Promise<Lot[]> => (await lotsOfProperty(h.propId, signal)).map(l => ({ ...l, address: h.address }))

export function LotSearch({ onLots }: { onLots: (lots: Lot[]) => void }) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState<AddressHit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  // Addresses as you type, a moment after you stop.
  const q = text.trim()
  // An address picked from the list is in the box now; it isn't searched for again.
  const [chosen, setChosen] = useState<string | null>(null)
  const typing = q.length >= 4 && !parseLotDp(q) && text !== chosen
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
        return h[0] ? lotsAt(h[0], s) : []
      },
      'No address like that was found. Try the street number and name, and the suburb.',
    )
  }
  const choose = (h: AddressHit) => {
    setText(h.address)
    setChosen(h.address)
    void run(s => lotsAt(h, s), 'That address has no lot on the map. Try its Lot and DP instead.')
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
