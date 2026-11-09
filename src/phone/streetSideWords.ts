// Site › Block's street side, for links to it and its picker's words (src/phone/StreetSide.tsx).

import { navigate, useRouter } from '../nav/router'
import { tabRoute } from '../nav/route'
import type { StreetSide } from './camera'

/** Where Site › Block's street side is, for links to it. */
export const STREET_SIDE_ID = 'street-side'

/** Go to Site › Block's street side, from wherever you are. */
export const goToStreetSide = () => navigate(tabRoute(useRouter.getState().route, 'site', 'block'), { focus: STREET_SIDE_ID })

const SIDE_NAME: Record<Exclude<StreetSide, 'auto'>, string> = { N: 'North side', E: 'East side', S: 'South side', W: 'West side' }

/** The picker's words for each choice: "Auto (low side: east)" until one is set. */
export function streetSideLabel(side: StreetSide, low: string): string {
  return side === 'auto' ? `Auto (low side: ${low})` : SIDE_NAME[side]
}
