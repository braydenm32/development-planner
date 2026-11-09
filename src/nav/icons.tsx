// Line icons from the calm redesign mockups (direction B), drawn on a 24 px grid.
// The paths are fixed strings in this file, never user data.

const ICONS = {
  site: '<path d="M3 18.5c3.2-1.6 5.6-4.6 9-4.6s5.8 3 9 4.6"/><path d="M5.5 13.2c2-1 3.8-3.4 6.5-3.4s4.5 2.4 6.5 3.4"/><path d="M8.5 8.4c1.2-.7 2.2-1.9 3.5-1.9s2.3 1.2 3.5 1.9"/>',
  design: '<rect x="4" y="4" width="16" height="16" rx="1.2"/><path d="M4 12.5h6.5V20M10.5 4v4.5H20"/>',
  earth: '<path d="M3 8.5h6l3.2 5H21"/><path d="M3 18.5h18"/><path d="M9 8.5v10M13.5 13.5v5" stroke-dasharray="1.6 2"/>',
  share: '<path d="M12 3.5v11.5"/><path d="M7.8 7.6 12 3.5l4.2 4.1"/><path d="M5 12.5V20h14v-7.5"/>',
  undo: '<path d="M9 13.5 4.5 9 9 4.5"/><path d="M4.5 9H15a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 13.5 19.5 9 15 4.5"/><path d="M19.5 9H9a5 5 0 0 0 0 10h3"/>',
  search: '<circle cx="11" cy="11" r="6.3"/><path d="m20 20-4.4-4.4"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  select: '<path d="M5.5 3.5 18.5 10l-5.6 1.9-2 5.6z"/>',
  wall: '<path d="M3 9.5h18v5H3z" fill="currentColor" fill-opacity=".25"/>',
  door: '<path d="M4 20h16"/><path d="M6 20V6.5"/><path d="M6 6.5A13.5 13.5 0 0 1 19.5 20"/>',
  window: '<path d="M3 8.5h18v7H3z"/><path d="M3 12h18"/>',
  opening: '<path d="M3 12h5M16 12h5"/><path d="M8 8.5v7M16 8.5v7"/><path d="M10 12h4" stroke-dasharray="1.5 1.5"/>',
  garage: '<path d="M3.5 10.5 12 4.5l8.5 6V20M3.5 10.5V20"/><path d="M7 20v-7.5h10V20"/><path d="M7 15h10M7 17.5h10"/>',
  setback: '<path d="M4 6v12M20 6v12"/><path d="M4 12h16"/><path d="m7 9.5-3 2.5 3 2.5M17 9.5l3 2.5-3 2.5"/>',
  room: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8.5 12h7"/>',
  area: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2.4"/>',
  roof: '<path d="M3 13 12 5l9 8"/><path d="M6 11v8h12v-8"/>',
  section: '<path d="M3 20.5 21 16.5"/><path d="M6 19.8V11l6-5 6 5v6.2"/><path d="M6 13.5h12" stroke-dasharray="1.6 1.8"/>',
  stair: '<path d="M4 20h4.5v-4h4v-4h4V8H20"/>',
  furniture: '<path d="M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/><path d="M4 12.2a1.9 1.9 0 0 1 3.8 0V14h8.4v-1.8a1.9 1.9 0 0 1 3.8 0V17H4z"/><path d="M6 17v2.2M18 17v2.2"/>',
  fitBlock: '<path d="M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5"/><path d="m8.4 8.6 6.6-1 1.2 7.8-6.8.9z"/>',
  fitHouse: '<path d="M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5"/><path d="M7 12.4 12 8l5 4.4"/><path d="M8.6 11.2V16h6.8v-4.8"/><path d="M11 16v-2.6h2V16"/>',
  north: '<path d="M12 3.5 16.5 19 12 16l-4.5 3z" fill="currentColor" fill-opacity=".18"/>',
  pencil: '<path d="M4.5 19.5l1-4.2L16 4.8l3.2 3.2L8.7 18.5z"/><path d="m13.8 7 3.2 3.2"/>',
  check: '<path d="m5 12.5 4.4 4.4L19 7.3"/>',
  drop: '<path d="M12 3.5c3.6 4.6 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.4-6.4 6-11Z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  leaf: '<path d="M5 19c0-8 5.5-13.5 14-13.5C19 14 13.5 19.5 5 19Z"/><path d="M5 19c3-4 6.5-7.5 10-10"/>',
  chevD: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  chevR: '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
  chevL: '<path d="m14.5 6.5-5.5 5.5 5.5 5.5"/>',
  chevU: '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
  warn: '<path d="M12 4.2 21 19.5H3z"/><path d="M12 10v4.2M12 16.8v.3"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 10.8 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
  cube: '<path d="M12 3.2 20 7.6v8.8L12 20.8l-8-4.4V7.6z"/><path d="m4 7.6 8 4.4 8-4.4M12 12v8.8"/>',
  plan: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 11h9v9"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.3"/><path d="M15.6 14.1a4.6 4.6 0 0 1 5.4 5"/>',
  layers: '<path d="m12 4 8.5 4.6L12 13.2 3.5 8.6z"/><path d="m3.5 13 8.5 4.6 8.5-4.6"/>',
  file: '<path d="M6.5 3.5H14l4 4v13H6.5z"/><path d="M14 3.5v4h4"/>',
  print3d: '<path d="M4 20h16"/><path d="M6.5 20v-5.5h11V20"/><path d="M9.5 14.5V10h5v4.5"/><path d="M12 4v6"/><path d="M9.5 4h5"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.7"/>',
  x: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pin: '<path d="M12 21s-6-5.6-6-10.2a6 6 0 0 1 12 0C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.8" r="2.2"/>',
  comment: '<path d="M4.5 5.5h15v10.2h-8.3L7 19.5v-3.8H4.5z"/><path d="M8.5 9.4h7M8.5 12.2h4.5"/>',
  scale: '<path d="M12 4v16M6 20h12"/><path d="M5 8h14"/><path d="m5 8-2.6 6h5.2zM19 8l-2.6 6h5.2z"/>',
  sliders: '<path d="M4 7h9.5M18 7h2M4 17h3.5M11.5 17H20"/><circle cx="15.8" cy="7" r="2.2"/><circle cx="9.5" cy="17" r="2.2"/>',
  send: '<path d="M4.5 11.5 20 4l-6.6 16-2.2-6.4z"/><path d="m11.2 13.6 3.6-3.6"/>',
  shovel: '<path d="m14 10 6-6"/><path d="M18.5 2.5 21.5 5.5"/><path d="M13.6 7.4 16.6 10.4l-6.1 6.1a3 3 0 0 1-4.2 0l-.8-.8a3 3 0 0 1 0-4.2z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 4.5v4.2h-4.2"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" fill-opacity=".18"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="2.4"/>',
  arrowR: '<path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5"/>',
  retain: '<path d="M10.5 4v16"/><path d="M3 8.5h7.5"/><path d="M10.5 16.5H21"/><path d="M5 8.5v.01M7.5 11v.01M5 13.5v.01" stroke-width="2.4"/>',
  drive: '<path d="M8.5 3.5 5.5 20.5M15.5 3.5l3 17"/><path d="M12 5.5v2.5M12 11v2.5M12 16.5V19"/>',
  move: '<path d="M12 3.5v17M3.5 12h17"/><path d="M9.2 6.3 12 3.5l2.8 2.8M9.2 17.7 12 20.5l2.8-2.8M6.3 9.2 3.5 12l2.8 2.8M17.7 9.2l2.8 2.8-2.8 2.8"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1"/><path d="M15.5 8.5v-4h-11v11h4"/>',
  archive: '<path d="M3.5 5h17v4h-17z"/><path d="M5 9v10.5h14V9"/><path d="M10 13h4"/>',
  list: '<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><path d="M4.2 6.5h.1M4.2 12h.1M4.2 17.5h.1" stroke-width="2.6"/>',
  block: '<path d="m5.5 4.5 13.5 2-1.8 13.2-12.7-2.2z"/>',
  floors: '<path d="m12 3.5 8.5 4.3L12 12 3.5 7.8z"/><path d="m3.5 12.2 8.5 4.3 8.5-4.3"/><path d="m3.5 16.4 8.5 4.3 8.5-4.3"/>',
  phoneShare: '<path d="M12 3.5v10"/><path d="m8.3 7.2 3.7-3.7 3.7 3.7"/><rect x="5.5" y="11" width="13" height="9.5" rx="2"/>',
  cloud: '<path d="M7 18.5h10.3a3.8 3.8 0 0 0 .5-7.6 5.7 5.7 0 0 0-11-1.1A4.4 4.4 0 0 0 7 18.5z"/>',
  cloudOff: '<path d="M7 18.5h10.3a3.8 3.8 0 0 0 .5-7.6 5.7 5.7 0 0 0-11-1.1A4.4 4.4 0 0 0 7 18.5z"/><path d="m4 4 16 16"/>',
  key: '<circle cx="8" cy="15.5" r="3.7"/><path d="M10.7 12.8 19 4.5M15.6 7.9l2.6 2.6M17.6 5.9l2 2"/>',
  link: '<path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1.3 1.3"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1.3-1.3"/>',
  ruler: '<path d="M3.5 15.5 15.5 3.5l5 5-12 12z"/><path d="m7.5 11.5 2 2M10.5 8.5l2 2M13.5 5.5l2 2"/>',
  note: '<path d="M4.5 4.5h15v11h-6l-3.5 4v-4h-5.5z"/><path d="M8 9h8M8 12h5"/>',
  costs: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6M9 15.5h3"/>',
}

export type IconName = keyof typeof ICONS

/** A line icon. Decorative: its button or link carries the name. */
export function Icon({ name, size = 18, stroke = 1.7 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}

/** The drafted mark: a gable roof over two contour lines. Built to read at 20 px. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg className="ic logo" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.4 11.4 12 4l8.6 7.4" stroke="#16181b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 15.6c2.9-1.7 5.9 1.4 9.2 0 3.3-1.4 6.2-1.5 9.2 0" stroke="#2346d0" strokeWidth="2" strokeLinecap="round" />
      <path d="M2.8 20c2.9-1.7 5.9 1.4 9.2 0 3.3-1.4 6.2-1.5 9.2 0" stroke="#8da0e6" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
