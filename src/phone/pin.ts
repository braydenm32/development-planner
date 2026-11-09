// A level read off the 3D ground by a tap.

export interface Pin {
  /** Where the tap landed, in the 3D view's units. */
  at: [number, number, number]
  rl: number
  /** Finished ground less natural ground: below zero is cut, above is fill (0 where untouched). */
  dz: number
}

/** What the tooltip says under the level. */
export function pinLabel(dz: number): string {
  if (Math.abs(dz) <= 0.02) return 'Natural ground'
  return `Finished ground · ${Math.abs(dz).toFixed(2)} m ${dz < 0 ? 'cut' : 'fill'}`
}
