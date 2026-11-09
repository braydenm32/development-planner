// The start screen's third way in: no survey, only an address. Find the lot, check it on the
// aerial, and start on the state's ground levels for it (src/map/StateGround.tsx).

import { useState } from 'react'
import { middleOf } from './geo'
import { LotSearch } from './LotSearch'
import { MapPicker, type MapViewState } from './MapPicker'
import type { Lot } from './services'
import { StateGround } from './StateGround'
import './map.css'

export function AddressStart({ into }: { into: 'new' | 'current' }) {
  const [found, setFound] = useState<Lot[]>([])
  const [picked, setPicked] = useState<Lot | null>(null)
  const [view, setView] = useState<MapViewState | null>(null)

  const show = (lots: Lot[]) => {
    setFound(lots)
    setPicked(lots[0] ?? null)
    if (lots[0]) setView({ center: middleOf(lots[0].ring), zoom: 19 })
  }
  const pick = (lot: Lot) => {
    setPicked(lot)
    setFound(f => (f.some(l => l.id === lot.id) ? f : [...f, lot]))
  }

  return (
    <div className="address-start">
      <LotSearch onLots={show} />
      {view && (
        <>
          <MapPicker view={view} onView={setView} lots={found} selected={picked?.id ?? null} onPick={pick} height={240} />
          {picked ? (
            <div className="map-picked">
              <b>{picked.label}</b>
              <StateGround key={picked.id} lot={picked} into={into} buttonClass="st-btn primary" ask={false} />
            </div>
          ) : (
            <p className="st-note">Tap your lot on the map to pick it.</p>
          )}
        </>
      )}
    </div>
  )
}
