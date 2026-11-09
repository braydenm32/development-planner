// A small DXF writer: plain ASCII, AutoCAD R12 (AC1009) compatible, so any CAD package opens it.
// Polylines are the old POLYLINE/VERTEX/SEQEND kind (R12 has no LWPOLYLINE) and notes are TEXT.
// Coordinates are written as given; the caller passes the survey's own eastings and northings.

import type { Vec2 } from '../lib/geom'

export interface DxfLayer {
  name: string
  /** AutoCAD colour index (1 red, 2 yellow, 3 green, 4 cyan, 5 blue, 6 magenta, 7 white/black). */
  color: number
}

type Entity = string[]

/** DXF text is ASCII: drop accents, and turn anything else into "?" rather than corrupt the file. */
export function asciiText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?')
}

/** A layer name: letters, digits, "-" and "_" only, in capitals, as CAD expects. */
export const layerName = (s: string): string => asciiText(s).toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || '0'

const num = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3)

export class DxfWriter {
  private layers = new Map<string, DxfLayer>()
  private ents: Entity[] = []

  /** Declare a layer; one that is drawn on without being declared comes out white. */
  addLayer(name: string, color = 7): void {
    const n = layerName(name)
    if (!this.layers.has(n)) this.layers.set(n, { name: n, color })
  }

  private onLayer(name: string): string {
    const n = layerName(name)
    this.addLayer(n)
    return n
  }

  /** A line of points, joined in order; `z` makes it a flat polyline at that elevation (a contour). */
  polyline(layer: string, pts: Vec2[], opts: { closed?: boolean; z?: number } = {}): void {
    if (pts.length < 2) return
    const z = opts.z ?? 0
    const e: Entity = ['0', 'POLYLINE', '8', this.onLayer(layer), '66', '1', '10', '0.0', '20', '0.0', '30', num(z), '70', opts.closed ? '1' : '0']
    for (const p of pts) e.push('0', 'VERTEX', '8', layerName(layer), '10', num(p[0]), '20', num(p[1]), '30', num(z))
    e.push('0', 'SEQEND', '8', layerName(layer))
    this.ents.push(e)
  }

  /** A label at a point; `height` is the letter height in drawing units (metres). */
  text(layer: string, at: Vec2, text: string, height = 0.5): void {
    const t = asciiText(text)
    if (!t) return
    this.ents.push(['0', 'TEXT', '8', this.onLayer(layer), '10', num(at[0]), '20', num(at[1]), '30', '0.0', '40', num(height), '1', t])
  }

  toString(): string {
    const out: string[] = []
    const add = (...a: string[]) => out.push(...a)
    // Metres, so a reader that honours $INSUNITS needs no conversion.
    add('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC')
    // R12 wants the CONTINUOUS line type defined before a layer can use it.
    add('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB')
    add('0', 'TABLE', '2', 'LAYER', '70', String(this.layers.size))
    for (const l of this.layers.values()) add('0', 'LAYER', '2', l.name, '70', '0', '62', String(l.color), '6', 'CONTINUOUS')
    add('0', 'ENDTAB', '0', 'ENDSEC')
    add('0', 'SECTION', '2', 'ENTITIES')
    for (const e of this.ents) add(...e)
    add('0', 'ENDSEC', '0', 'EOF')
    return `${out.join('\r\n')}\r\n`
  }
}
