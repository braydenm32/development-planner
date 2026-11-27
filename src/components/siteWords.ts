// How Site › Block words a slope, apart from its components so other panels can say it the same.

import { gradeText } from '../lib/drape'
import type { SiteStats } from '../lib/terrain'

/** Under this slope (%) a block reads as level: "0% (1 in 10,000)" says nothing a person can use. */
export const LEVEL_PCT = 0.5

/** A block with no fall to speak of: nothing is its low side. */
export const isLevel = (stats: Pick<SiteStats, 'maxSlopePct'>): boolean => stats.maxSlopePct < 0.05

/** "1 in 25.0 (4%)", as every grade is written (gradeText), or "Level" under half a percent. */
export const slopeText = (pct: number): string => (pct < LEVEL_PCT ? 'Level' : gradeText(pct / 100))
