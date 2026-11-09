// Text notes on the plan: add, change and remove, as pure changes the store commits (so each is one undo).

import type { Vec2 } from '../lib/geom'
import { newId, type Plan, type PlanNote } from './model'

/** Longest note, so a label stays a label. */
export const NOTE_MAX = 80

/** Trim, join lines and cap the length. */
export const cleanNote = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)

export const notesOf = (plan: Plan): PlanNote[] => plan.notes ?? []

export function newNote(level: string, at: Vec2, text: string): PlanNote {
  return { id: newId('note'), level, at, text: cleanNote(text) }
}

export function addNote(plan: Plan, note: PlanNote): Plan {
  return { ...plan, notes: [...notesOf(plan), note] }
}

export function updateNote(plan: Plan, id: string, patch: Partial<Pick<PlanNote, 'text' | 'at'>>): Plan {
  return { ...plan, notes: notesOf(plan).map(n => (n.id === id ? { ...n, ...patch, text: patch.text === undefined ? n.text : cleanNote(patch.text) } : n)) }
}

export function deleteNote(plan: Plan, id: string): Plan {
  return { ...plan, notes: notesOf(plan).filter(n => n.id !== id) }
}
