// The photo view's sentences that more than one place says.

import type { Added } from './load'

/** What adding a photo found out, in plain words. */
export function addedWords(a: Added): string {
  const parts: string[] = []
  if (a.guess) parts.push(`The spot${a.guess.heading !== null ? ' and direction are a rough guess' : ' is a rough guess'} from the phone’s location${a.guess.heading !== null ? ' and compass' : ''}: check them.`)
  else if (a.gpsUnused === 'not-on-map') parts.push('The photo has a location, but the block isn’t placed on the map (Site › Map), so set the spot by hand.')
  else if (a.gpsUnused === 'far') parts.push('The photo’s location is nowhere near the block, so it wasn’t used.')
  if (a.view.lens === 'photo') parts.push(`Lens angle from the photo: ${a.view.fov.toFixed(0)}° across.`)
  else parts.push(`The photo doesn’t say its lens, so it starts as a normal phone lens (about 65° across its long side). Line it up to correct it.`)
  return parts.join(' ')
}
