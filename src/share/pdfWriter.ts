/**
 * A small vector PDF writer: lines, filled shapes and Helvetica text, which is all a
 * plan drawing needs. Units are millimetres from the bottom-left of the page.
 */

// Helvetica and Helvetica-Bold advance widths (per 1000 em) for characters 32 to 126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584,
  584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500,
  722, 500, 500, 500, 334, 260, 334, 584,
]
const HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584,
  584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556,
  778, 556, 556, 500, 389, 280, 389, 584,
]
// A few characters outside ASCII that plans use, as WinAnsi codes and widths.
const EXTRA: Record<string, { code: number; w: number; wb: number }> = {
  '²': { code: 0xb2, w: 333, wb: 333 },
  '³': { code: 0xb3, w: 333, wb: 333 },
  '°': { code: 0xb0, w: 400, wb: 400 },
  '×': { code: 0xd7, w: 584, wb: 584 },
  'Ø': { code: 0xd8, w: 778, wb: 778 },
  '–': { code: 0x96, w: 556, wb: 556 },
  '—': { code: 0x97, w: 1000, wb: 1000 },
  '’': { code: 0x92, w: 222, wb: 278 },
  '·': { code: 0xb7, w: 278, wb: 278 },
  '›': { code: 0x9b, w: 333, wb: 333 },
  '‘': { code: 0x91, w: 222, wb: 278 },
}

export type Font = 'regular' | 'bold'

export function textWidth(s: string, size: number, font: Font = 'regular'): number {
  const table = font === 'bold' ? HELV_BOLD : HELV
  let w = 0
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (c >= 32 && c <= 126) w += table[c - 32]
    else if (EXTRA[ch]) w += font === 'bold' ? EXTRA[ch].wb : EXTRA[ch].w
    else w += 556
  }
  return (w / 1000) * size
}

/** Break `s` into lines no wider than `width` mm at `size`, at spaces (a word longer than the line stays whole). */
export function wrapText(s: string, width: number, size: number, font: Font = 'regular'): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size, font) > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

const PT = 72 / 25.4
const n = (v: number) => {
  const s = v.toFixed(2)
  return s === '-0.00' ? '0' : s.replace(/\.?0+$/, '')
}

function encodeText(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else if (c >= 32 && c <= 126) out += ch
    else if (EXTRA[ch]) out += `\\${EXTRA[ch].code.toString(8).padStart(3, '0')}`
    else out += '?'
  }
  return out
}

export type RGB = [number, number, number]

export interface TextOptions {
  size?: number
  font?: Font
  align?: 'left' | 'center' | 'right'
  /** Degrees anticlockwise. */
  angle?: number
  color?: RGB
  /** Vertical placement of `y`: the baseline, or the middle of capital letters. */
  baseline?: 'alphabetic' | 'middle'
}

export class PdfPage {
  readonly width: number
  readonly height: number
  private ops: string[] = []

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  get content(): string {
    return this.ops.join('\n')
  }

  save() {
    this.ops.push('q')
    return this
  }
  restore() {
    this.ops.push('Q')
    return this
  }
  lineWidth(mm: number) {
    this.ops.push(`${n(mm * PT)} w`)
    return this
  }
  stroke(c: RGB) {
    this.ops.push(`${c.map(n).join(' ')} RG`)
    return this
  }
  fill(c: RGB) {
    this.ops.push(`${c.map(n).join(' ')} rg`)
    return this
  }
  dash(pattern: number[] = []) {
    this.ops.push(`[${pattern.map(v => n(v * PT)).join(' ')}] 0 d`)
    return this
  }
  /** Round joins and caps look better on plans. */
  round() {
    this.ops.push('1 J 1 j')
    return this
  }

  private path(pts: [number, number][], close: boolean) {
    if (pts.length < 2) return false
    this.ops.push(`${n(pts[0][0] * PT)} ${n(pts[0][1] * PT)} m`)
    for (let i = 1; i < pts.length; i++) this.ops.push(`${n(pts[i][0] * PT)} ${n(pts[i][1] * PT)} l`)
    if (close) this.ops.push('h')
    return true
  }

  polyline(pts: [number, number][]) {
    if (this.path(pts, false)) this.ops.push('S')
    return this
  }
  line(a: [number, number], b: [number, number]) {
    return this.polyline([a, b])
  }
  /** Close and draw one or more rings; `mode` is stroke, fill, or both. Holes need even-odd rings. */
  shape(rings: [number, number][][], mode: 'stroke' | 'fill' | 'both') {
    let any = false
    for (const r of rings) any = this.path(r, true) || any
    if (any) this.ops.push(mode === 'stroke' ? 'S' : mode === 'fill' ? 'f*' : 'B*')
    return this
  }
  /** Draw only inside these rings until the matching restore(). */
  clip(rings: [number, number][][]) {
    let any = false
    for (const r of rings) any = this.path(r, true) || any
    if (any) this.ops.push('W n')
    return this
  }
  rect(x: number, y: number, w: number, h: number, mode: 'stroke' | 'fill' | 'both') {
    return this.shape(
      [
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
      ],
      mode,
    )
  }
  /** A circle as a polygon of `n` sides (more for big circles that would show their facets). */
  circle(cx: number, cy: number, r: number, mode: 'stroke' | 'fill' | 'both', n = 24) {
    const pts: [number, number][] = []
    for (let i = 0; i < n; i++) pts.push([cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)])
    return this.shape([pts], mode)
  }

  text(x: number, y: number, s: string, o: TextOptions = {}) {
    const size = o.size ?? 3
    const font = o.font ?? 'regular'
    const w = textWidth(s, size, font)
    const dx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0
    const dy = o.baseline === 'middle' ? -size * 0.35 : 0
    const a = ((o.angle ?? 0) * Math.PI) / 180
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const tx = x + dx * c - dy * sn
    const ty = y + dx * sn + dy * c
    this.ops.push(
      'q',
      'BT',
      `/${font === 'bold' ? 'F2' : 'F1'} ${n(size * PT)} Tf`,
      `${(o.color ?? [0.12, 0.14, 0.17]).map(n).join(' ')} rg`,
      `${n(c)} ${n(sn)} ${n(-sn)} ${n(c)} ${n(tx * PT)} ${n(ty * PT)} Tm`,
      `(${encodeText(s)}) Tj`,
      'ET',
      'Q',
    )
    return this
  }
}

export class PdfDocument {
  private pages: PdfPage[] = []
  readonly title: string

  constructor(title: string) {
    this.title = title
  }

  addPage(widthMm: number, heightMm: number): PdfPage {
    const p = new PdfPage(widthMm, heightMm)
    this.pages.push(p)
    return p
  }

  output(): Uint8Array {
    const objects: string[] = []
    const add = (body: string) => {
      objects.push(body)
      return objects.length
    }
    const catalog = add('') // filled in below
    const pagesId = add('')
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    const kids: number[] = []
    for (const p of this.pages) {
      const stream = p.content
      const contents = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`)
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(p.width * PT)} ${n(p.height * PT)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contents} 0 R >>`,
        ),
      )
    }
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
    const info = add(`<< /Title (${encodeText(this.title)}) /Producer (Contour and Gable) >>`)

    const enc = new TextEncoder()
    let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const offsets: number[] = []
    let length = enc.encode(body).length
    const parts: string[] = [body]
    objects.forEach((o, i) => {
      offsets.push(length)
      const chunk = `${i + 1} 0 obj\n${o}\nendobj\n`
      parts.push(chunk)
      length += enc.encode(chunk).length
    })
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
    parts.push(xref, `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`)
    body = parts.join('')
    return enc.encode(body)
  }
}
