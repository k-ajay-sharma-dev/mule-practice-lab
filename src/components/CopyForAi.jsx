import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadProblem, problemById } from '../data/problems.js'
import { lastRunOf } from '../store/last-run.js'
import { getEntry } from '../store/progress.js'
import { flushAutosaves } from '../workspaces/useAutosave.js'

// Writes to the clipboard, the older way when the browser does not allow the newer one.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.append(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false // the browser blocked clipboard access
    }
    area.remove()
    return ok
  }
}

const WIDTH = 280

// Under the button and inside the window. The menu is drawn on the page itself, so no panel can cut it off.
function placeUnder(button) {
  const r = button.getBoundingClientRect()
  const left = Math.max(8, Math.min(r.right - WIDTH, document.documentElement.clientWidth - WIDTH - 8))
  return { top: r.bottom + 6, left, width: WIDTH, maxHeight: Math.max(160, window.innerHeight - r.bottom - 14) }
}

const load = (id) => Promise.all([import('../study/ai-prompt.js'), loadProblem(id)])

// Copies the question, the learner's work so far, the checks and the test runs as a prompt to paste into an AI chat.
// The menu picks the kind of help. Nothing is sent anywhere: it only goes to the clipboard.
export default function CopyForAi({ id, className = 'btn btn-ghost head-btn' }) {
  const [open, setOpen] = useState(false)
  const [kinds, setKinds] = useState(null)
  const [state, setState] = useState('idle') // 'idle' | 'copied' | 'failed'
  const [place, setPlace] = useState(null)
  const box = useRef(null)
  const pop = useRef(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open) return
    const away = (e) => !box.current?.contains(e.target) && !pop.current?.contains(e.target) && setOpen(false)
    const close = () => setOpen(false) // the button moved away from under the menu
    const esc = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // Esc closes the menu, not the full screen behind it
      setOpen(false)
      box.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function show(next) {
    setState(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }

  async function toggle() {
    setPlace(placeUnder(box.current))
    setOpen(!open)
    if (open) return
    try {
      const [{ promptKinds }] = await load(id)
      setKinds(promptKinds(problemById.get(id).exercise))
    } catch {
      setOpen(false)
      show('failed')
    }
  }

  async function copy(kind) {
    try {
      const [{ buildPrompt }, problem] = await load(id) // loaded when the menu opened, so this does not wait
      flushAutosaves() // what was typed or drawn in the last moment counts too
      const entry = getEntry(id)
      const code = typeof entry.code === 'string' ? entry.code : problem.starterCode
      show((await copyText(buildPrompt(problem, entry, kind, lastRunOf(id, code)))) ? 'copied' : 'failed')
    } catch {
      show('failed')
    }
    setOpen(false)
  }

  return (
    <div className="timer-menu copy-ai" ref={box}>
      <button
        type="button"
        className={`${className}${state === 'copied' ? ' active-toggle' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        title="Copy the question, your work, the checks and the runs as a prompt for an AI"
      >
        <span aria-live="polite">{state === 'copied' ? '✓ Copied' : state === 'failed' ? "Couldn't copy" : 'Copy for AI'}</span>
      </button>
      {open && createPortal(
        <div className="timer-pop copy-ai-pop" ref={pop} style={place}>
          <p className="small muted">Copies the question, your work so far, the checks and the test runs. Paste it into your AI chat.</p>
          {kinds ? (
            kinds.map((k) => (
              <button type="button" key={k.key} className="copy-ai-item" onClick={() => copy(k.key)}>
                <b>{k.label}</b>
                <span className="small muted">{k.about}</span>
              </button>
            ))
          ) : (
            <p className="small muted">Loading…</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
