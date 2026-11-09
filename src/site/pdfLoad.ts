import { pathsFromOps, textsFromItems, type OpCodes, type VectorPage } from './pdfVector'

/**
 * Opening a drawing (a PDF, PNG or JPG) to lay over the plan. PDFs are drawn with pdf.js,
 * which is only downloaded the first time a PDF is opened.
 */
export interface LoadedDrawing {
  name: string
  kind: 'pdf' | 'image'
  /** The picture shown on the plan. */
  image: Blob
  /** Size of the page in drawing units: PDF points, or pixels for a picture. */
  width: number
  height: number
  /** Pixels of `image` per drawing unit. */
  pxPerUnit: number
  /** Words and line work, for a PDF drawn from CAD; null for a picture. */
  vector: VectorPage | null
  /** The scale printed on the drawing (1:n), when it says. */
  scale: number | null
  page: number
  pages: number
}

/** Longest side of the picture made from a PDF page, in pixels; inside every browser's canvas limit. */
const RENDER_PX = 4096

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
export const isPicture = (f: File) => /^image\/(png|jpe?g|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)

async function pdfjs() {
  const lib = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  return lib
}

/** The scale a drawing states in its title block, such as "SCALE 1:200". */
export function statedScale(words: string[]): number | null {
  const text = words.join(' ')
  const m = /scale[^0-9]{0,12}1\s*:\s*(\d{2,5})/i.exec(text) ?? /\b1\s*:\s*(\d{2,4})\s*(?:@|at)\s*A[0-4]\b/i.exec(text)
  const n = m ? Number(m[1]) : NaN
  return n >= 10 && n <= 10000 ? n : null
}

export async function loadDrawing(file: File, page = 1): Promise<LoadedDrawing> {
  if (isPdf(file)) return loadPdf(file, page)
  if (isPicture(file)) return loadPicture(file)
  throw new Error('Please choose a PDF, PNG or JPG drawing.')
}

async function loadPdf(file: File, pageNo: number): Promise<LoadedDrawing> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  try {
    const pages = doc.numPages
    const page = await doc.getPage(Math.min(Math.max(1, pageNo), pages))
    const view = page.view
    const width = view[2] - view[0]
    const height = view[3] - view[1]
    // Unturned, so the picture and the line work read off the page share one frame.
    const px = Math.min(RENDER_PX / Math.max(width, height), 6)
    const viewport = page.getViewport({ scale: px, rotation: 0 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport, background: 'rgba(0,0,0,0)' }).promise
    const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The drawing could not be drawn.'))), 'image/png'))

    const content = await page.getTextContent()
    const texts = textsFromItems(content.items as unknown[], view)
    const ops = await page.getOperatorList()
    const { paths, imageCover } = pathsFromOps(ops.fnArray, ops.argsArray, lib.OPS as unknown as OpCodes, view)
    const vector: VectorPage = { width, height, texts, paths, imageCover }
    return {
      name: file.name,
      kind: 'pdf',
      image,
      width,
      height,
      pxPerUnit: canvas.width / width,
      vector,
      scale: statedScale(texts.map(t => t.str)),
      page: page.pageNumber,
      pages,
    }
  } finally {
    void task.destroy()
  }
}

async function loadPicture(file: File): Promise<LoadedDrawing> {
  const bmp = await createImageBitmap(file)
  const { width, height } = bmp
  let image: Blob = file
  let pxPerUnit = 1
  const big = Math.max(width, height)
  if (big > RENDER_PX) {
    // Shrink very large scans so phones can show them.
    pxPerUnit = RENDER_PX / big
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * pxPerUnit)
    canvas.height = Math.round(height * pxPerUnit)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The picture could not be read.'))), 'image/png'))
  }
  bmp.close()
  return { name: file.name, kind: 'image', image, width, height, pxPerUnit, vector: null, scale: null, page: 1, pages: 1 }
}

/** How many pages a PDF has, to offer a choice before drawing one. */
export async function pdfPageCount(file: File): Promise<number> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const n = (await task.promise).numPages
  void task.destroy()
  return n
}
