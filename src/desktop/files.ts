// The desktop app's file handling, put in place by startDesktop() (from src/main.tsx):
//
// - Every file the app would download goes straight into a folder instead, with no prompt:
//   project files into the projects folder, everything else (PDFs, DXFs, 3D models, prints) into
//   the exports folder. The toast says where, with Show in folder.
// - Open shows the computer's own file picker, starting in the projects folder, and reads the
//   file straight from disk however big it is.
// - A print goes straight to the slicer (sendToSlicer).
// - The open project can be kept as a file in the projects folder as you work (keepProjectCopy).

import { setFileSaver } from '../lib/download'
import { openFile } from '../safety/flows'
import { handlePicked, setOwnPicker, showToast, type PickMode } from '../safety/store'
import { sayFileError } from '../safety/surveyor'
import { baseName, desktopInfo, findSlicers, isDesktop, openDefault, openWith, pickFile, readFile, reveal, writeFile, type Slicer } from './bridge'
import { exportsDir, folderLabel, projectsDir, setInfo, useDesktop } from './settings'

/** Project files go in the projects folder; anything else in the exports folder. */
export const isProjectFileName = (name: string): boolean => /\.project\.json$/i.test(name)

export const folderFor = (name: string): string => (isProjectFileName(name) ? projectsDir() : exportsDir())

/** Save a file into its folder and say where, with Show in folder. Resolves to its path, or null if it couldn't be saved (the toast says why). */
export async function saveToFolder(name: string, data: Uint8Array | string, opts: { quiet?: boolean } = {}): Promise<string | null> {
  const dir = folderFor(name)
  try {
    const path = await writeFile(dir, name, data)
    if (!opts.quiet) showToast({ text: `Saved ${name} in ${folderLabel(dir)}.`, link: { label: 'Show in folder', go: () => void reveal(path) } })
    return path
  } catch (err) {
    showToast({ text: `${name} couldn’t be saved: ${(err as Error)?.message ?? err}`, error: true })
    return null
  }
}

/** What the computer's picker offers, by what it's open for. */
const FILTERS: Record<PickMode, [string, string[]][]> = {
  any: [
    ['Projects, surveys and plans', ['json', 'dxf', 'xml', 'csv', 'txt']],
    ['Project files', ['json']],
    ['Surveys', ['dxf', 'xml', 'csv', 'txt']],
  ],
  survey: [['Surveys', ['dxf', 'xml', 'csv', 'txt']]],
  plan: [['Plans', ['json']]],
}

/** Pick a file with the computer's own picker and open it as the hidden input would. */
export async function openFromDisk(mode: PickMode): Promise<void> {
  const path = await pickFile(mode === 'plan' ? 'Import a plan' : mode === 'survey' ? 'Choose the survey' : 'Open a project, survey or plan', FILTERS[mode], projectsDir())
  if (!path) return
  await openPath(path, mode)
}

/** Open a file on disk, by its path, as if it had been picked. */
export async function openPath(path: string, mode: PickMode = 'any'): Promise<void> {
  try {
    const bytes = await readFile(path)
    handlePicked(new File([bytes as Uint8Array<ArrayBuffer>], baseName(path)), mode)
  } catch (err) {
    showToast({ text: `${baseName(path)} couldn’t be read: ${(err as Error)?.message ?? err}`, error: true })
  }
}

/** Pick a file with the computer's own picker and read it, or null if none was picked. */
export async function pickFromDisk(mode: PickMode = 'any'): Promise<File | null> {
  const path = await pickFile('Open a project, survey or plan', FILTERS[mode], projectsDir())
  if (!path) return null
  try {
    return new File([(await readFile(path)) as Uint8Array<ArrayBuffer>], baseName(path))
  } catch (err) {
    showToast({ text: `${baseName(path)} couldn’t be read: ${(err as Error)?.message ?? err}`, error: true })
    return null
  }
}

/** Open a project file from the projects folder as a project of its own. */
export async function openPathAsNew(path: string): Promise<void> {
  try {
    const f = new File([(await readFile(path)) as Uint8Array<ArrayBuffer>], baseName(path))
    await openFile(f, { into: 'new' }).catch(sayFileError)
  } catch (err) {
    showToast({ text: `${baseName(path)} couldn’t be read: ${(err as Error)?.message ?? err}`, error: true })
  }
}

/** The slicer to send prints to: the one chosen, or the first one found on this computer. */
export async function slicerToUse(): Promise<Slicer | 'default' | null> {
  const chosen = useDesktop.getState().slicer
  if (chosen) return chosen
  return (await findSlicers().catch(() => []))[0] ?? null
}

/** Save the print's 3MF into the exports folder and open it in the slicer. False if there's no slicer to open it in. */
export async function sendToSlicer(file: { name: string; data: Uint8Array | string }): Promise<boolean> {
  const slicer = await slicerToUse()
  const path = await saveToFolder(file.name, file.data, { quiet: true })
  if (!path) return true
  try {
    if (slicer === 'default' || slicer === null) await openDefault(path)
    else await openWith(slicer.path, path)
    const who = slicer === 'default' || slicer === null ? 'your app for 3MF files' : slicer.name
    showToast({ text: `Sent ${file.name} to ${who}. It’s saved in ${folderLabel(exportsDir())} too.`, link: { label: 'Show in folder', go: () => void reveal(path) } })
  } catch (err) {
    showToast({ text: `The slicer didn’t open: ${(err as Error)?.message ?? err}. ${file.name} is saved in ${folderLabel(exportsDir())}.`, error: true, link: { label: 'Show in folder', go: () => void reveal(path) } })
  }
  return true
}

/** Turn the desktop app's file handling on. Does nothing on the website. */
export function startDesktop(): void {
  if (!isDesktop()) return
  document.documentElement.dataset.desktop = 'true'
  setFileSaver((name, data) => void saveToFolder(name, data))
  setOwnPicker(mode => void openFromDisk(mode))
  void desktopInfo()
    .then(setInfo)
    .catch(() => undefined)
}
