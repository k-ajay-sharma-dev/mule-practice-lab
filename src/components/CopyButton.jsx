import { useEffect, useRef, useState } from 'react'
import { formatJson } from '../study/json-format.js'

const ICONS = {
  idle: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  copied: <path d="M5 13l4 4L19 7" />,
  failed: <path d="M6 6l12 12M18 6L6 18" />,
}
const LABELS = { idle: 'Copy', copied: 'Copied', failed: "Couldn't copy" }

// Icon only: the tooltip and screen-reader label say what it does and how it went.
export default function CopyButton({ text }) {
  const [state, setState] = useState('idle')
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    let next = 'copied'
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      next = 'failed' // the browser blocked clipboard access
    }
    setState(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1500)
  }

  return (
    <button type="button" className={`copy-btn ${state}`} onClick={copy} title={LABELS[state]} aria-label={LABELS[state]}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[state]}
      </svg>
    </button>
  )
}

// A <pre> with the copy icon in its corner. `children` is the text it shows, and JSON is laid out one entry per line.
export function CodeBlock({ className = 'code-block', children }) {
  const text = formatJson(children)
  return (
    <div className="copyable">
      <pre className={className}>{text}</pre>
      <CopyButton text={text} />
    </div>
  )
}
