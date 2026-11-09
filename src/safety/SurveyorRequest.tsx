// What to ask the surveyor for, ready to copy, under a survey that can't be read (the start screen,
// and the layer review when no layer holds the contours).

import { useRef, useState } from 'react'
import { Icon } from '../nav/icons'
import { SURVEYOR_REQUEST } from './files'
import { copyText } from './surveyor'
import './safety.css'

export function SurveyorRequest({ lead = 'To ask your surveyor for a file that reads:' }: { lead?: string }) {
  const [copied, setCopied] = useState(false)
  const words = useRef<HTMLParagraphElement>(null)
  const copy = async () => {
    if (await copyText(SURVEYOR_REQUEST)) return setCopied(true)
    // Select it instead, so it can be copied by hand.
    const el = words.current
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(range)
  }
  return (
    <div className="sv-request" role="group" aria-label="What to ask your surveyor">
      <span className="sv-lead">{lead}</span>
      <p ref={words} className="sv-words">
        {SURVEYOR_REQUEST}
      </p>
      <button type="button" className="sv-copy" onClick={() => void copy()}>
        <Icon name={copied ? 'check' : 'copy'} size={15} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
