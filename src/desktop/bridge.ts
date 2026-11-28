// The desktop app's own commands (src-tauri/src/lib.rs), and whether this page is in it. On the
// website none of this runs: isDesktop() is false and nothing here is called.

import { invoke } from '@tauri-apps/api/core'

/** This page is the desktop app (Tauri puts its internals on the window before the page runs). */
export const isDesktop = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface DesktopInfo {
  version: string
  /** "macos", "windows" or "linux". */
  os: string
  /** Documents/Contour and Gable/Projects, until the person picks another. */
  projectsDir: string
  /** Documents/Contour and Gable/Exports, until the person picks another. */
  exportsDir: string
}

export interface FolderFile {
  name: string
  path: string
  /** Milliseconds since 1970. */
  modified: number
  size: number
}

export interface Slicer {
  name: string
  /** A program, a macOS .app, or "flatpak:<id>". */
  path: string
}

export const desktopInfo = () => invoke<DesktopInfo>('desktop_info')

/** Write a file into a folder, no prompt; returns its full path. The bytes go raw, so a big model costs no copying into JSON. */
export function writeFile(dir: string, name: string, data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return invoke<string>('write_file', bytes, { headers: { 'x-dir': encodeURIComponent(dir), 'x-name': encodeURIComponent(name) } })
}

/** A file's bytes, straight from disk. */
export const readFile = async (path: string): Promise<Uint8Array> => new Uint8Array(await invoke<ArrayBuffer>('read_file', { path }))

export const listFiles = (dir: string, ending: string) => invoke<FolderFile[]>('list_files', { dir, ending })

export const pickFolder = (title: string, start?: string) => invoke<string | null>('pick_folder', { title, start: start ?? null })

export const pickFile = (title: string, filters: [string, string[]][], start?: string) => invoke<string | null>('pick_file', { title, filters, start: start ?? null })

export const reveal = (path: string) => invoke<void>('reveal', { path })

export const openDefault = (path: string) => invoke<void>('open_default', { path })

export const findSlicers = () => invoke<Slicer[]>('find_slicers')

export const openWith = (app: string, file: string) => invoke<void>('open_with', { app, file })

/** The last part of a path, whichever way its slashes go. */
export const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path
