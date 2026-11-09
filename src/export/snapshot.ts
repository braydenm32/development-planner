// Pictures of what is on screen, as PNG: the plan (an SVG, drawn out again with its styles written
// into it so it looks as it does on screen) and the 3D view (read back from its canvas). Each gets
// the caveat on a strip along the bottom, so it carries it when it is pasted into an email.

import { EXPORT_CAVEAT } from './exportCaveat'

/** Longest side of a picture, in pixels. */
const MAX_SIDE = 4096

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'paint-order',
  'letter-spacing',
] as const

/** Copy what the page's style sheets do to each element into the element itself, in a copy of the SVG. */
export function inlineStyles(svg: SVGSVGElement): SVGSVGElement {
  const copy = svg.cloneNode(true) as SVGSVGElement
  const from = [svg, ...svg.querySelectorAll('*')]
  const to = [copy, ...copy.querySelectorAll('*')]
  from.forEach((el, i) => {
    const target = to[i] as SVGElement
    const cs = getComputedStyle(el)
    if (cs.display === 'none') {
      target.remove()
      return
    }
    for (const p of STYLE_PROPS) target.style.setProperty(p, cs.getPropertyValue(p))
    // Hover and focus rings, handles and the like belong to the screen, not the picture.
    if (el.getAttribute('pointer-events') === 'none' && !el.textContent) target.remove()
  })
  return copy
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The picture could not be drawn.'))
    img.src = src
  })

/** Words wrapped to a width, as lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** The picture on a canvas with the caveat strip under it, as PNG bytes. */
export async function withCaveat(source: CanvasImageSource, w: number, h: number, background = '#ffffff'): Promise<Uint8Array> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const pw = Math.round(w * scale)
  const ph = Math.round(h * scale)
  const font = Math.max(12, Math.round(pw / 110))
  const measureCtx = document.createElement('canvas').getContext('2d')!
  measureCtx.font = `${font}px sans-serif`
  const lines = wrap(measureCtx, EXPORT_CAVEAT, pw - font * 2)
  const strip = Math.round(font * 1.4 * lines.length + font)
  const canvas = document.createElement('canvas')
  canvas.width = pw
  canvas.height = ph + strip
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, pw, ph)
  ctx.fillStyle = '#f2f3f5'
  ctx.fillRect(0, ph, pw, strip)
  ctx.fillStyle = '#3d434b'
  ctx.font = `${font}px sans-serif`
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, font, ph + font / 2 + i * font * 1.4))
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The picture could not be saved.')
  return new Uint8Array(await blob.arrayBuffer())
}

/** The plan as it looks now, as a PNG. Drawn twice as sharp as the screen, within MAX_SIDE. */
export async function planPicture(svg: SVGSVGElement): Promise<Uint8Array> {
  const w = svg.clientWidth || 800
  const h = svg.clientHeight || 600
  const copy = inlineStyles(svg)
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(w * 2))
  copy.setAttribute('height', String(h * 2))
  copy.setAttribute('viewBox', `0 0 ${w} ${h}`)
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = await loadImage(url)
    // The plan's own paper colour (App.css .plan-svg), which the copy doesn't carry.
    return await withCaveat(img, w * 2, h * 2, getComputedStyle(svg).backgroundColor || '#ffffff')
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ---- The 3D view ----

type Grab3d = () => string

let grab3d: Grab3d | null = null

/** The 3D canvas registers how to read itself while it is on screen (see SnapshotGrab in SiteView). */
export function setGrab3d(fn: Grab3d | null): void {
  grab3d = fn
}

export const has3dView = (): boolean => grab3d !== null

/** The 3D view as it looks now, as a PNG; null when the 3D view isn't open. */
export async function view3dPicture(): Promise<Uint8Array | null> {
  if (!grab3d) return null
  // Rendered then read in the same step, so the canvas needs no extra memory kept between frames.
  const img = await loadImage(grab3d())
  return withCaveat(img, img.width, img.height, '#eef1f4')
}
