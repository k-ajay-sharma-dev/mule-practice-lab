import { useState } from 'react'

// A drag handle between the scenario and the canvas of a design workspace. The width of the left side is kept per
// browser; a double click goes back to the default.
const KEY = 'pl.designSplit'
const MIN = 18
const MAX = 62

function readSplit() {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v >= MIN && v <= MAX ? v : null
  } catch {
    return null
  }
}

export function useSplit() {
  const [pct, setPct] = useState(readSplit)
  const save = (v) => {
    setPct(v)
    try {
      if (v == null) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, String(Math.round(v * 10) / 10))
    } catch {
      // storage blocked: the width lasts for this visit
    }
  }
  return [pct, save]
}

export default function SplitHandle({ onChange }) {
  function start(e) {
    const grid = e.currentTarget.closest('.workspace')
    if (!grid) return
    e.preventDefault()
    const box = grid.getBoundingClientRect()
    const move = (ev) => onChange(Math.min(MAX, Math.max(MIN, ((ev.clientX - box.left) / box.width) * 100)))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('dragging-split')
    }
    document.body.classList.add('dragging-split')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  return (
    <div
      className="split-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize the scenario and the canvas"
      title="Drag to resize. Double click to reset."
      onPointerDown={start}
      onDoubleClick={() => onChange(null)}
    />
  )
}
