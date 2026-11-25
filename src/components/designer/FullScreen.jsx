import { useState } from 'react'

// The full screen of both designers: a bar on top with the problem, the clock and the main buttons, and the requirement
// beside the canvas when it is wanted.

const KEY = 'pl.fullRequirement'
const isWide = () => window.innerWidth > 1000

function readOpen() {
  try {
    return localStorage.getItem(KEY) !== 'hidden'
  } catch {
    return true
  }
}

// The requirement starts open on a wide screen, and your own choice is kept per browser. Below that width it covers the
// canvas, so it starts closed there.
export function useRequirement() {
  const [open, setOpen] = useState(false)
  return {
    open,
    start: () => setOpen(isWide() && readOpen()), // on entering full screen
    show: () => setOpen(true), // for a check result, which is not a choice to keep
    toggle() {
      setOpen(!open)
      if (!isWide()) return
      try {
        localStorage.setItem(KEY, open ? 'hidden' : 'shown')
      } catch {
        // storage blocked: the choice lasts for this visit
      }
    },
  }
}

export const isShiftKey = (e, letter) => e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === letter

export function FullBar({ problem, open, onToggle, clock, children, onClose }) {
  return (
    <div className="full-bar">
      <button
        type="button"
        className={`btn btn-sm full-view full-req${open ? ' active' : ''}`}
        onClick={onToggle}
        aria-pressed={open}
        title={open ? 'Hide the requirement (Shift+R)' : 'Show the requirement beside the canvas (Shift+R)'}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3h9l4 4v14H6zM9.5 11h6M9.5 15h6" />
        </svg>
        <span>Requirement</span>
      </button>
      <span className="full-title" title={problem.title}>
        {problem.title} <span className="mono muted small">{problem.id.toUpperCase()}</span>
      </span>
      <div className="full-clock">{clock}</div>
      <div className="full-bar-end">
        {children}
        <button type="button" className="btn btn-ghost btn-sm tb-icon full-view" onClick={onClose} title="Close full screen (Esc or Shift+F)" aria-label="Close full screen">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
