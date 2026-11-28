type Saver = (name: string, data: Uint8Array | string, type: string) => void

/** Where files go instead of the browser's download: the desktop app's folders (src/desktop/files.ts). */
let saver: Saver | null = null

export function setFileSaver(s: Saver | null): void {
  saver = s
}

/** Somewhere other than a download takes the files (the desktop app), so "Downloaded …" isn't said. */
export const savesElsewhere = (): boolean => saver !== null

/** Hand the user a file to save. */
export function saveFile(name: string, data: Uint8Array | string, type: string): void {
  if (saver) return saver(name, data, type)
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
