// Handing a file over on a phone: the system share sheet (Messages, Mail, AirDrop, Drive)
// where the browser can share files, and a plain download everywhere else.

import { saveFile } from '../lib/download'
import type { OutFile } from '../components/printFiles'

type Nav = Pick<Navigator, 'share' | 'canShare'>

export type Handed = 'shared' | 'saved' | 'cancelled'

export type ShareKind = 'pdf' | 'project'

/** What goes first in Share on a phone, in order: the two files to send, then the 3D print. */
export const PHONE_SHARE_ORDER = ['pdf', 'project', '3d-print'] as const

const asFile = (f: OutFile) => new File([typeof f.data === 'string' ? f.data : new Uint8Array(f.data)], f.name, { type: f.type })

/** Whether this browser can put files in the system share sheet. */
export function canShareFiles(nav: Partial<Nav> | undefined = globalThis.navigator): boolean {
  try {
    return typeof nav?.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [asFile({ name: 'plans.pdf', data: '', type: 'application/pdf' })] })
  } catch {
    return false
  }
}

/**
 * Share a file, or save it. Call it straight from a tap: the share sheet needs one. A
 * person closing the sheet is not an error; anything else falls back to a download.
 */
export async function shareOrSave(f: OutFile, title: string, nav: Partial<Nav> | undefined = globalThis.navigator, save = saveFile): Promise<Handed> {
  if (canShareFiles(nav)) {
    const file = asFile(f)
    if (nav!.canShare!({ files: [file] })) {
      try {
        await nav!.share!({ files: [file], title })
        return 'shared'
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'cancelled'
      }
    }
  }
  save(f.name, f.data, f.type)
  return 'saved'
}
