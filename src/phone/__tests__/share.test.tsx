// Share on a phone: the PDF plans and the project file come first, each to the phone's
// share sheet where it has one and a download where it hasn't, and the 3D print after.

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OutFile } from '../../components/printFiles'
import { PHONE_SHARE_ORDER, canShareFiles, shareOrSave } from '../share'
import { ShareFirst } from '../ShareFirst'
import { house, loadBlock, shellData, words } from './block'

const pdf: OutFile = { name: 'Phone test house.pdf', data: new Uint8Array([37, 80, 68, 70]), type: 'application/pdf' }

/** A browser that can share files, recording what it was given. */
function sharer(outcome: 'ok' | 'cancel' | 'fail' = 'ok', files = true) {
  const shared: { files?: File[]; title?: string }[] = []
  return {
    shared,
    nav: {
      canShare: (d?: ShareData) => files && !!d?.files,
      share: async (d?: ShareData) => {
        if (outcome === 'cancel') throw Object.assign(new Error('closed'), { name: 'AbortError' })
        if (outcome === 'fail') throw Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })
        shared.push(d as { files?: File[]; title?: string })
      },
    },
  }
}

describe('the order on a phone', () => {
  it('is the PDF plans, then the project file, then the 3D print', () => {
    expect([...PHONE_SHARE_ORDER]).toEqual(['pdf', 'project', '3d-print'])
  })

  const { survey, terrain } = loadBlock()
  const d = { ...shellData(survey, terrain, null), plan: house(), survey, terrain }
  afterEach(() => vi.unstubAllGlobals())

  it('puts both files first, as one tap each, and the 3D print after them', () => {
    vi.stubGlobal('navigator', sharer().nav)
    const html = words(renderToStaticMarkup(<ShareFirst d={d} />))
    const at = (s: string) => html.indexOf(s)
    expect(at('Send PDF plans')).toBe(0)
    expect(at('Send project file')).toBeGreaterThan(at('Send PDF plans'))
    expect(at('3D print a model')).toBeGreaterThan(at('Send project file'))
  })

  it('says Download where the phone cannot share files', () => {
    vi.stubGlobal('navigator', {})
    const html = words(renderToStaticMarkup(<ShareFirst d={d} />))
    expect(html).toContain('Download PDF plans')
    expect(html).toContain('Download project file')
    expect(html).not.toContain('Send')
  })

  it('shows just the project file on the Send tab', () => {
    vi.stubGlobal('navigator', sharer().nav)
    const html = words(renderToStaticMarkup(<ShareFirst d={d} only="project" />))
    expect(html).toContain('Send project file')
    expect(html).not.toContain('PDF')
    expect(html).not.toContain('3D print')
  })
})

describe('handing a file over', () => {
  it('knows whether the browser can share files', () => {
    expect(canShareFiles(sharer().nav)).toBe(true)
    expect(canShareFiles(sharer('ok', false).nav)).toBe(false)
    expect(canShareFiles({})).toBe(false)
    expect(canShareFiles(undefined)).toBe(false)
    expect(
      canShareFiles({
        share: async () => {},
        canShare: () => {
          throw new Error('no')
        },
      }),
    ).toBe(false)
  })

  it('goes to the share sheet with the file and the project’s name', async () => {
    const s = sharer()
    const save = vi.fn()
    expect(await shareOrSave(pdf, 'Phone test house', s.nav, save)).toBe('shared')
    expect(save).not.toHaveBeenCalled()
    expect(s.shared).toHaveLength(1)
    expect(s.shared[0].title).toBe('Phone test house')
    const f = s.shared[0].files![0]
    expect(f.name).toBe('Phone test house.pdf')
    expect(f.type).toBe('application/pdf')
    expect(f.size).toBe(4)
  })

  it('does nothing more when the person closes the share sheet', async () => {
    const save = vi.fn()
    expect(await shareOrSave(pdf, 'x', sharer('cancel').nav, save)).toBe('cancelled')
    expect(save).not.toHaveBeenCalled()
  })

  it('downloads the file when sharing fails, or the browser cannot share', async () => {
    for (const nav of [sharer('fail').nav, sharer('ok', false).nav, {}]) {
      const save = vi.fn()
      expect(await shareOrSave(pdf, 'x', nav, save)).toBe('saved')
      expect(save).toHaveBeenCalledWith(pdf.name, pdf.data, pdf.type)
    }
  })
})
