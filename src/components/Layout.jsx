import { SidebarRoom, WideView } from './sidebar.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { CATEGORIES } from '../data/categories.js'
import { problemById, problems } from '../data/problems.js'
import { checkRunner, getRunnerSettings, runnerMaySleep } from '../runner/client.js'
import { useFocusSession } from '../store/focus.js'
import { rememberOrigin } from '../store/origin.js'
import { statusOf, todayKey, useProgress, useReview } from '../store/progress.js'
import { usePoints } from '../store/points.js'
import Celebration from './Celebration.jsx'
import { FocusBar, FocusSummary } from './FocusSession.jsx'
import NavIcon from './NavIcons.jsx'
import SaveShortcut from './SaveShortcut.jsx'
import { useSyncStatus } from '../sync/status.js'
import { useTheme } from '../theme.jsx'

const SIDEBAR_KEY = 'pl.sidebar' // 'full' | 'collapsed' (icons only)
const WIDE_KEY = 'pl.wide' // 'on' | 'off': the wider view on pages with a work area
const readSetting = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const saveSetting = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked: the choice lasts for this visit
  }
}

function useLaptopWidth() {
  const query = '(min-width: 1001px) and (max-width: 1400px)'
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setMatch(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])
  return match
}

export default function Layout({ children }) {
  const { theme, toggle } = useTheme()
  const { pathname, search } = useLocation()
  // laptop: full or icons-only (remembered); phone/tablet: a drawer opened from the menu button
  const [collapsed, setCollapsed] = useState(() => readSetting(SIDEBAR_KEY) === 'collapsed')
  const [drawerOpen, setDrawerOpen] = useState(false)
  // a designer folds the sidebar on laptop screens, until the learner opens it again
  const [room, setRoom] = useState(false)
  const [keptOpen, setKeptOpen] = useState(false)
  const laptop = useLaptopWidth()
  const folded = room && laptop && !keptOpen
  const focus = useFocusSession()
  const focusing = Boolean(focus && !focus.endedAt)
  // the wider view: only a page that offers it (see useWideView) hides the menu and shrinks its title
  const [wide, setWide] = useState(() => readSetting(WIDE_KEY) === 'on')
  const [wideRoom, setWideRoom] = useState(false)
  const wideOn = wide && wideRoom && !focusing
  const wideView = useMemo(
    () => ({
      wide: wideOn,
      setRoom: setWideRoom,
      toggle: () =>
        setWide((w) => {
          saveSetting(WIDE_KEY, w ? 'off' : 'on')
          return !w
        }),
    }),
    [wideOn],
  )

  useEffect(() => {
    if (!wideRoom) return
    const onKey = (e) => {
      if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.key.toLowerCase() !== 'w') return
      const t = e.target
      // typing a capital W in an editor or a field must not change the layout
      if (t.closest?.('input, textarea, select, [contenteditable="true"], .monaco-editor')) return
      e.preventDefault()
      wideView.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wideRoom, wideView])

  useEffect(() => setDrawerOpen(false), [pathname])

  // a problem's back link returns to the page you opened it from (see store/origin.js)
  useEffect(() => {
    const [, first, second] = pathname.split('/')
    const category = CATEGORIES.find((c) => c.slug === first)
    if (category && second) return // a problem page: keep the page it was opened from
    rememberOrigin(pathname, search, category && !second ? category.label : null)
  }, [pathname, search])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  useEffect(() => {
    if (!room) setKeptOpen(false)
  }, [room])

  function toggleCollapsed() {
    if (room && laptop && !collapsed) {
      setKeptOpen(!keptOpen)
      return
    }
    if (room && laptop) setKeptOpen(true)
    setCollapsed(!collapsed)
    saveSetting(SIDEBAR_KEY, collapsed ? 'full' : 'collapsed')
  }

  return (
    <div className={`app${collapsed || folded || wideOn ? ' sidebar-collapsed' : ''}${wideOn ? ' wide-view' : ''}${drawerOpen ? ' drawer-open' : ''}${focusing ? ' focus-mode' : ''}`}>
      <SaveShortcut />
      {focusing ? <FocusBar key={focus.at} session={focus} /> : (
      <header className="topbar">
        <button
          className="icon-btn menu-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          title="Open menu"
          aria-expanded={drawerOpen}
        >
          <NavIcon name="menu" />
        </button>
        <Link to="/" className="brand">
          <span className="brand-mark">{'</>'}</span>
          <span className="brand-name">
            Mule<span className="brand-accent">Practice</span>Lab
          </span>
        </Link>
        <HeaderSearch />
        <div className="topbar-actions">
          <Link to="/search" className="icon-btn search-icon-link" aria-label="Search" title="Search">
            <SearchIcon />
          </Link>
          <PointsChip />
          <SyncBadge />
          <RunnerStatus />
          <button
            className="icon-btn"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <Link to="/settings" className="icon-btn settings-link" aria-label="Settings" title="Settings">
            <GearIcon />
          </Link>
        </div>
      </header>
      )}

      <div className="app-body">
        {!focusing && <Sidebar collapsed={collapsed || folded} onToggle={toggleCollapsed} onClose={() => setDrawerOpen(false)} />}
        {!focusing && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
        <main className="content">
          <SidebarRoom.Provider value={setRoom}>
            <WideView.Provider value={wideView}>{children}</WideView.Provider>
          </SidebarRoom.Provider>
        </main>
      </div>
      {focus?.endedAt && <FocusSummary session={focus} />}
      <Celebration />
    </div>
  )
}

// Points and level in the header; opens the points card on the Learning Path.
function PointsChip() {
  const { total, level, name, into, need } = usePoints()
  return (
    <Link
      to="/"
      className="points-chip"
      title={`${total} points · Level ${level}, ${name} · ${need - into} points to the next level`}
      aria-label={`${total} points, level ${level}`}
    >
      <span className="points-star" aria-hidden="true">★</span>
      <span className="mono">{total}</span>
      <span className="points-level">Lv {level}</span>
    </Link>
  )
}

// Grouped navigation: study modes, the problem areas (with solved counts), and tools.
function Sidebar({ collapsed, onToggle, onClose }) {
  const review = useReview()
  const progress = useProgress()
  const today = todayKey()
  const dueCount = Object.entries(review).filter(([id, r]) => r.due <= today && problemById.has(id)).length

  const counts = {}
  for (const p of problems) {
    const c = (counts[p.category] ??= { solved: 0, total: 0 })
    c.total++
    if (statusOf(progress[p.id]) === 'solved') c.solved++
  }

  const item = (to, icon, label, extra, end) => (
    <NavLink key={to} to={to} end={end} className="side-link" title={collapsed ? label : undefined}>
      <NavIcon name={icon} />
      <span className="side-label">{label}</span>
      {extra}
    </NavLink>
  )

  return (
    <aside className="sidebar" aria-label="Sections">
      <div className="sidebar-head">
        <span className="side-title">Menu</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close navigation">
          <NavIcon name="close" />
        </button>
      </div>
      <nav className="sidebar-scroll">
        <div className="side-group">
          <div className="side-group-title">Study</div>
          {item('/', 'path', 'Learning Path', null, true)}
          {item('/tracks', 'tracks', 'Topic Tracks')}
          {item('/review', 'review', 'Review', dueCount > 0 && <span className="side-badge">{dueCount}</span>)}
          {item('/flashcards', 'flashcards', 'Flashcards')}
          {item('/mock', 'mock', 'Mock Interview')}
          {item('/exam', 'exam', 'Practice Exam')}
          {item('/interview', 'interview', 'Interview Practice')}
          {item('/weak-areas', 'weak', 'Weak Areas')}
          {item('/readiness', 'readiness', 'Readiness')}
          {item('/projects', 'projects', 'My Projects')}
          {item('/calm', 'calm', 'Calm Corner')}
        </div>
        <div className="side-group">
          <div className="side-group-title">Practice</div>
          {CATEGORIES.map((c) =>
            item(
              `/${c.slug}`,
              c.slug,
              c.label,
              <span className="side-count mono" title={`${counts[c.slug]?.solved ?? 0} of ${counts[c.slug]?.total ?? 0} solved`}>
                {counts[c.slug]?.solved ?? 0}/{counts[c.slug]?.total ?? 0}
              </span>,
            ),
          )}
        </div>
        <div className="side-group">
          <div className="side-group-title">Tools</div>
          {item('/playground', 'playground', 'Playground')}
          {item('/platform-lab', 'lab', 'Platform Lab')}
          {item('/cheatsheets', 'cheatsheets', 'Cheat Sheets')}
          {item('/search', 'search', 'Search')}
          {item('/settings', 'settings', 'Settings')}
        </div>
      </nav>
      <button className="side-collapse" onClick={onToggle} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
        <NavIcon name={collapsed ? 'expand' : 'collapse'} />
        <span className="side-label">Collapse</span>
      </button>
    </aside>
  )
}

// Re-checks the runner on navigation and when the window regains focus.
function RunnerStatus() {
  const [state, setState] = useState('checking')
  const { pathname } = useLocation()
  useSyncStatus() // re-render after a sync: it may bring the runner settings from the account
  const { url, key } = getRunnerSettings()

  useEffect(() => {
    let cancelled = false
    const timers = new Set()
    const check = () => {
      // a hosted runner that hasn't answered within a few seconds is most likely waking from sleep
      const slow = setTimeout(() => !cancelled && runnerMaySleep() && setState((s) => (s === 'online' ? s : 'waking')), 4000)
      timers.add(slow)
      checkRunner().then((r) => {
        clearTimeout(slow)
        timers.delete(slow)
        if (!cancelled) setState(r.ok ? 'online' : 'offline')
      })
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      window.removeEventListener('focus', check)
    }
  }, [pathname, url, key])

  const label = {
    checking: 'Checking runner…',
    waking: 'Runner waking up — the free host sleeps when idle, this takes about a minute',
    online: 'Runner connected',
    offline: 'Runner offline',
  }[state]
  const short = { checking: '…', waking: 'Waking…', online: 'Runner', offline: 'Offline' }[state]
  return (
    <Link to="/settings" className={`runner-status runner-${state}`} title={label}>
      <span className="dot" />
      <span className="runner-label">{short}</span>
    </Link>
  )
}

// Cloud icon showing whether progress is saved to the Google account; opens Settings.
function SyncBadge() {
  const sync = useSyncStatus()
  if (sync.state === 'off') return null
  const title = {
    loading: 'Connecting to your account…',
    'signed-out': 'Not signed in — progress is only in this browser. Click to sign in.',
    syncing: 'Saving to your account…',
    synced: `Progress saved to your Google account${sync.user?.email ? ` (${sync.user.email})` : ''}`,
    offline: 'Offline — changes will sync when you are back online',
    error: `Sync problem: ${sync.error ?? 'unknown error'}`,
  }[sync.state]
  return (
    <Link to="/settings" className={`icon-btn sync-badge sync-${sync.state}`} aria-label={title} title={title}>
      <CloudIcon off={sync.state === 'signed-out'} />
    </Link>
  )
}

function CloudIcon({ off }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z" />
      {off ? <path d="M3 3l18 18" /> : <path d="M9.5 14.5l2 2 3.5-4" />}
    </svg>
  )
}

// Enter opens the search page; "/" focuses the box from anywhere except a text field or the editor.
function HeaderSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const input = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      // the code editor takes keys in a plain <div>, which the check above doesn't catch
      if (t.closest('.monaco-editor')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(e) {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
    setQuery('')
    input.current?.blur()
  }

  return (
    <form className="header-search" role="search" onSubmit={submit}>
      <SearchIcon />
      <input
        ref={input}
        className="input"
        type="search"
        placeholder="Search problems, tags, IDs…"
        aria-label="Search all problems"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <kbd className="kbd">/</kbd>
    </form>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}
