import { useEffect, useRef } from 'react'

// Stops everything that changes the work, in every workspace, without each one needing its own read-only mode. These
// listeners run in the capture phase, so the editors and designers underneath never see the event.
const READING = '.md, .panel-tab, .sub-tabs, summary, a, .copy-btn, .designer.read-only'
const POINTER_EVENTS = ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'dragstart']
const EDIT_EVENTS = ['beforeinput', 'paste', 'cut', 'drop']
const MOVING_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Escape'])

const stop = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

const blockPointer = (event) => {
  if (!event.target.closest?.(READING)) stop(event)
}

const blockKey = (event) => {
  const copying = (event.ctrlKey || event.metaKey) && ['a', 'c'].includes(event.key.toLowerCase())
  if (!MOVING_KEYS.has(event.key) && !copying) stop(event)
}

export default function ReadOnlyLock({ locked, children }) {
  const box = useRef(null)

  useEffect(() => {
    if (!locked) return
    const el = box.current
    if (el.contains(document.activeElement)) document.activeElement.blur()
    const listen = (action) => {
      POINTER_EVENTS.forEach((name) => el[action](name, blockPointer, true))
      EDIT_EVENTS.forEach((name) => el[action](name, stop, true))
      el[action]('keydown', blockKey, true)
    }
    listen('addEventListener')
    return () => listen('removeEventListener')
  }, [locked])

  return (
    <div ref={box} className={`read-only-lock${locked ? ' locked' : ''}`}>
      {children}
    </div>
  )
}
