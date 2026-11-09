import { useWideView } from './sidebar.js'

// The small button that turns the wider view on and off. Shift+W does the same.
export default function WideToggle() {
  const { wide, toggle } = useWideView()
  const label = wide ? 'Show the menu and the full title (Shift+W)' : 'Wider view: hide the menu and shrink the title (Shift+W)'
  return (
    <button className={`icon-btn wide-toggle${wide ? ' active' : ''}`} onClick={toggle} title={label} aria-label={label} aria-pressed={wide}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {wide ? (
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
    </button>
  )
}
