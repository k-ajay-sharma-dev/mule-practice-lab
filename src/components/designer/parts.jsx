import { useLayoutEffect, useState } from 'react'

// What the flow designer and the architecture designer share: the small icons, the side panel buttons and the zoom bar.

const ICONS = {
  left: 'M14 6l-6 6 6 6',
  right: 'M10 6l6 6-6 6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  close: 'M7 7l10 10M17 7L7 17',
  plus: 'M12 5v14M5 12h14',
  swap: 'M7 4L3.5 7.5 7 11M3.5 7.5H20M17 13l3.5 3.5L17 20M20.5 16.5H4',
  target: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 2v5M12 17v5M2 12h5M17 12h5',
  chevron: 'M9 6l6 6-6 6',
  out: 'M4 12h15M13 6l6 6-6 6',
  in: 'M20 12H5M11 6l-6 6 6 6',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 6 6v1',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0-6 6v1',
  warn: 'M12 4l9 16H3zM12 10v4.5M12 17.2h.01',
}

export function Icon({ name, size = 15 }) {
  return (
    <svg className={`ap-icon ap-icon-${name}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

export function IconButton({ icon, label, title = label, className = '', ...rest }) {
  return (
    <button type="button" className={`ap-tool ${className}`} title={title} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}

// The side panels can be hidden to give the canvas their room. The choice is kept per browser.
// shown: whether they start open.
export function usePanels(key, shown = true) {
  const [panels, setPanels] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key))
      return { palette: v?.palette ?? shown, properties: v?.properties ?? shown }
    } catch {
      return { palette: shown, properties: shown }
    }
  })
  function toggle(name) {
    const next = { ...panels, [name]: !panels[name] }
    setPanels(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  }
  const className = `${panels.palette ? '' : ' no-palette'}${panels.properties ? '' : ' no-properties'}`
  return { panels, toggle, className }
}

// True while the element is narrower than this many pixels.
export function useNarrow(ref, width) {
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const measure = () => setNarrow(ref.current.clientWidth > 0 && ref.current.clientWidth < width)
    measure()
    const seen = new ResizeObserver(() => ref.current && measure())
    seen.observe(ref.current)
    return () => seen.disconnect()
  }, [ref, width])
  return narrow
}

export function PanelToggles({ panels, toggle }) {
  return [
    ['palette', 'M4 5h16v14H4zM9.5 5v14', 'components'],
    ['properties', 'M4 5h16v14H4zM14.5 5v14', 'properties'],
  ].map(([name, path, word]) => {
    const label = `${panels[name] ? 'Hide' : 'Show'} the ${word} panel`
    return (
      <button key={name} className={`btn btn-ghost btn-sm tb-icon panel-toggle${panels[name] ? ' on' : ''}`} onClick={() => toggle(name)} aria-pressed={panels[name]} title={label} aria-label={label}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d={path} />
        </svg>
      </button>
    )
  })
}

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 1.5
export const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 20) / 20))

// zoom: what was asked for, a number or 'fit' · scale: what it came to
export function ZoomBar({ zoom, scale, setZoom, fitTitle }) {
  return (
    <div className="zoom-bar" role="group" aria-label="Zoom">
      <button onClick={() => setZoom(clampZoom(scale - 0.1))} disabled={scale <= ZOOM_MIN} title="Zoom out (Ctrl and wheel)" aria-label="Zoom out">
        −
      </button>
      <button className="zoom-value" onClick={() => setZoom(1)} title="Back to 100%">
        {Math.round(scale * 100)}%
      </button>
      <button onClick={() => setZoom(clampZoom(scale + 0.1))} disabled={scale >= ZOOM_MAX} title="Zoom in (Ctrl and wheel)" aria-label="Zoom in">
        +
      </button>
      <button className={zoom === 'fit' ? 'on' : ''} onClick={() => setZoom('fit')} aria-pressed={zoom === 'fit'} title={fitTitle}>
        Fit
      </button>
    </div>
  )
}
