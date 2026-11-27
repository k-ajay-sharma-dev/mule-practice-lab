import { createContext, useEffect, useRef } from 'react'

// Tells the code editors inside a lock to switch to their own read-only mode: you can still select and copy there.
export const LockContext = createContext(false)

// Stops everything that changes the work, in every workspace, without each one needing its own read-only mode. These
// listeners run in the capture phase, so the editors and designers underneath never see the event.
// Reading stays possible: text and the code editors take the mouse, so you can select and copy, and Ctrl+A and Ctrl+C
// work. The editors are read only themselves while locked, so a click or a drag there changes nothing.
const READING = '.md, .panel-tab, .sub-tabs, summary, a, .copy-btn, .copy-ai, .designer.read-only, .problem-timer, .full-view, .monaco-editor, textarea, input[type=text], input[type=search], input:not([type]), pre, code'
const FIELDS = 'textarea, input[type=text], input[type=search], input:not([type])'
// plain text fields are made read only while the lock is on, so a click lets you select in them and changes nothing
function holdFields(el) {
  const mark = () =>
    el.querySelectorAll(FIELDS).forEach((f) => {
      // Monaco keeps its own hidden field in step with its read-only option
      if (f.readOnly || f.closest('.monaco-editor')) return
      f.readOnly = true
      f.dataset.lockRo = '1'
    })
  mark()
  const watch = new MutationObserver(mark)
  watch.observe(el, { childList: true, subtree: true })
  return () => {
    watch.disconnect()
    el.querySelectorAll('[data-lock-ro]').forEach((f) => {
      f.readOnly = false
      delete f.dataset.lockRo
    })
  }
}
const POINTER_EVENTS = ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'dragstart']
const EDIT_EVENTS = ['beforeinput', 'paste', 'cut', 'drop']
const MOVING_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Shift', 'Control', 'Meta'])

const stop = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

const blockPointer = (event) => {
  if (!event.target.closest?.(READING)) stop(event)
}

// dragging selected text out of an editor would move it, so a drag starts only where it cannot change the work
const blockDrag = (event) => {
  if (!event.target.closest?.('.md, pre, code')) stop(event)
}

const blockKey = (event) => {
  const copying = (event.ctrlKey || event.metaKey) && ['a', 'c'].includes(event.key.toLowerCase())
  // the clock and the full screen buttons have to answer the keyboard too, or a pause could not be ended
  const pressing = ['Enter', ' '].includes(event.key) && event.target.closest?.('.problem-timer, .full-view')
  if (!MOVING_KEYS.has(event.key) && !copying && !pressing) stop(event)
}

export default function ReadOnlyLock({ locked, children }) {
  const box = useRef(null)

  useEffect(() => {
    if (!locked) return
    const el = box.current
    if (el.contains(document.activeElement)) document.activeElement.blur()
    const listen = (action) => {
      POINTER_EVENTS.filter((name) => name !== 'dragstart').forEach((name) => el[action](name, blockPointer, true))
      el[action]('dragstart', blockDrag, true)
      EDIT_EVENTS.forEach((name) => el[action](name, stop, true))
      el[action]('keydown', blockKey, true)
    }
    listen('addEventListener')
    const release = holdFields(el)
    return () => {
      listen('removeEventListener')
      release()
    }
  }, [locked])

  return (
    <LockContext.Provider value={Boolean(locked)}>
      <div ref={box} className={`read-only-lock${locked ? ' locked' : ''}`}>
        {children}
      </div>
    </LockContext.Provider>
  )
}
