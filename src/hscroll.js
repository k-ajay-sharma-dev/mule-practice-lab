// Sideways scrolling with a mouse. The site hides scrollbars, and a mouse wheel only scrolls up and down, so any area
// wider than its box (a router's routes, a designer canvas, a wide table or diagram) can be dragged sideways:
// press on it and drag. Shift + wheel scrolls sideways too (the browser does that by itself).
//
// A drag starts only after the pointer moves a few pixels, mostly sideways, so clicks still work. It never starts on
// something you type in, press, or drag on purpose, or on code, where dragging selects text.

const SKIP = 'input, textarea, select, button, a, label, summary, [contenteditable], pre, code, .monaco-editor, .cm-editor, .no-pan'
const START = 6 // pixels

function sideways(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const x = getComputedStyle(n).overflowX
      if (x === 'auto' || x === 'scroll') return n
    }
  }
  return null
}

function both(el) {
  const y = getComputedStyle(el).overflowY
  return (y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 1
}

export function enableDragScroll() {
  let drag = null

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    if (e.target.closest?.(SKIP)) return
    const area = sideways(e.target)
    if (!area) return
    // a component inside the area is dragged to move it; the area itself may sit inside one (a router's routes)
    const movable = e.target.closest?.('[draggable="true"]')
    if (movable && area.contains(movable)) return
    drag = { area, x: e.clientX, y: e.clientY, left: area.scrollLeft, top: area.scrollTop, panY: both(area), moving: false }
  })

  // dragging inside a router's routes scrolls them, instead of picking up the whole router
  document.addEventListener(
    'dragstart',
    (e) => {
      if (drag && e.target instanceof Element && e.target.contains(drag.area)) e.preventDefault()
    },
    true,
  )

  document.addEventListener('mousemove', (e) => {
    if (!drag) return
    // the button is no longer down: the release happened where the page could not see it
    if (!(e.buttons & 1)) return end()
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moving) {
      if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(dy)) {
        // a mostly up-and-down movement is not a sideways drag: leave it to the page
        if (Math.abs(dy) >= START) drag = null
        return
      }
      drag.moving = true
      document.documentElement.classList.add('drag-scrolling')
      window.getSelection()?.removeAllRanges()
    }
    e.preventDefault()
    drag.area.scrollLeft = drag.left - dx
    if (drag.panY) drag.area.scrollTop = drag.top - dy
  })

  // a hand cursor on an area you can drag sideways, so you can tell it is wider than it looks
  let marked = null
  document.addEventListener('mouseover', (e) => {
    if (drag?.moving) return
    const area = e.target.closest?.(SKIP) ? null : sideways(e.target)
    if (area === marked) return
    marked?.classList.remove('can-drag-scroll')
    marked = area
    marked?.classList.add('can-drag-scroll')
  })

  const end = () => {
    if (!drag) return
    if (drag.moving) {
      document.documentElement.classList.remove('drag-scrolling')
      // the release after a drag is not a click: it must not select or deselect what is under the pointer
      const swallow = (ev) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    }
    drag = null
  }
  window.addEventListener('mouseup', end, true)
  window.addEventListener('pointerup', end, true)
  window.addEventListener('pointercancel', end, true)
  window.addEventListener('blur', end)
}
