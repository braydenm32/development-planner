// The retaining wall panel's words, in one place so they can be changed together.

/** The labels the panel uses: plain words, the earth behind the wall and the open ground in front. */
export const SIDE_WORDS = {
  earth: 'Ground behind the wall (earth side)',
  open: 'Ground in front (open side)',
  top: 'Top of wall',
  question: 'How high is the earth behind it?',
  details: 'Exact levels and wall details',
} as const

/** The one sentence the panel leads its numbers with: "Holds back 0.60 m of earth; wall 0.70 m high." */
export const holdsBackSentence = (held: number, exposed: number) => `Holds back ${held.toFixed(2)} m of earth; wall ${exposed.toFixed(2)} m high.`
