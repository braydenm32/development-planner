/** Hand the user a file to save. */
export function saveFile(name: string, data: Uint8Array | string, type: string): void {
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
