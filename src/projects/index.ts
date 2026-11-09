/**
 * Projects: several projects saved in this browser and opened from the Projects home.
 * The app mounts <ProjectsHome /> at #/projects, inside its frame, and reads useProjects()
 * for the current project and for opening, creating and saving.
 */
export { ProjectsHome } from './ProjectsHome'
export { useProjects, useProjectSite, projectActions, projectsNow, registerRecordKind, ensureProjects, flushPlan, type ProjectPrefs, type OpenProject, type ProjectsState } from './session'
// Undo and Redo are kept with each project: loading this module starts it.
export { flushHistory, HISTORY_KIND } from './undoHistory'
export { createLocalProjectStore, type LocalProjectStore } from './localStore'
export { createMemoryProjectStore } from './memoryStore'
export { withWriteQueue, type QueuedProjectStore } from './queue'
export type { ProjectStore, ProjectMeta, ProjectChange, ProjectRecords, ProjectNumbers, ProjectThumbnail, MetaPatch, NewProject, RecordKind } from './types'
