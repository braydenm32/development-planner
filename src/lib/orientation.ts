/** Compass bearing of the direction at the top of the view, given the setting and the house's rotation. */
export function upBearing(up: 'house' | number, rotation: number): number {
  // The house's own y axis points at bearing -rotation.
  return up === 'house' ? (((-rotation % 360) + 360) % 360) : up
}

/** How far the plan is turned anticlockwise from the house's own frame (radians) to put `up` at the top. */
export function planTurn(up: 'house' | number, rotation: number): number {
  return up === 'house' ? 0 : ((up + rotation) * Math.PI) / 180
}
