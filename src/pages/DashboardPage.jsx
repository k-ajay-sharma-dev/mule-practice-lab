import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { categoryBySlug } from '../data/categories.js'
import { problemById, problems } from '../data/problems.js'
import { currentStage, PHASES, phaseProblems } from '../data/roadmap.js'
import { statusOf, todayKey, useProgress, useReview } from '../store/progress.js'
import { LevelBadge, StatusBadge } from '../components/Badges.jsx'
import Pagination, { paginate } from '../components/Pagination.jsx'
import TodayPlan from '../components/TodayPlan.jsx'
import { signIn, useSyncStatus } from '../sync/status.js'

const PHASE_PAGE_SIZE = 10

// The problem you last worked on (its progress carries the time, so this also works across synced devices), and
// when that one is solved, the next unsolved problem in the same tab.
function lastWorked(progress) {
  let last = null
  let lastAt = ''
  for (const [id, e] of Object.entries(progress)) {
    if (e && typeof e.updatedAt === 'string' && e.updatedAt > lastAt && problemById.has(id)) {
      last = id
      lastAt = e.updatedAt
    }
  }
  if (!last) return null
  const p = problemById.get(last)
  const solved = statusOf(progress[last]) === 'solved'
  const next = solved ? nextUnsolved(p, progress) : null
  const target = next ?? p
  return {
    target,
    label: solved ? (next ? 'Next in this tab' : 'Last solved') : 'Continue where you left off',
    meta: `${categoryBySlug.get(target.category)?.label ?? ''}${solved && next ? ` · after ${p.title}` : ''}${
      !solved ? ` · ${statusOf(progress[last]) === 'not-started' ? 'opened' : 'in progress'} ${new Date(lastAt).toLocaleDateString()}` : ''
    }`,
    action: solved ? 'Start' : 'Continue',
  }
}

const ICONS = {
  path: 'M4 19h4l3-7 3 4 6-10M17 6h3v3',
  resume: 'M12 8v4l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
}

function NextCard({ icon, label, target, meta, action }) {
  return (
    <Link to={`/${target.category}/${target.id}`} className="next-card">
      <span className="next-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[icon]} />
        </svg>
      </span>
      <span className="next-body">
        <span className="stat-label">{label}</span>
        <span className="next-title">{target.title}</span>
        <span className="muted small next-meta">{meta}</span>
      </span>
      <span className="btn btn-primary next-go">{action} →</span>
    </Link>
  )
}

// The first unsolved problem after this one in its tab, going round to the start
function nextUnsolved(p, progress) {
  const list = problems.filter((x) => x.category === p.category)
  const i = list.findIndex((x) => x.id === p.id)
  for (let k = 1; k < list.length; k++) {
    const x = list[(i + k) % list.length]
    if (statusOf(progress[x.id]) !== 'solved') return x
  }
  return null
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const progress = useProgress()
  const review = useReview()
  const sync = useSyncStatus()
  const [openPhase, setOpenPhase] = useState(null)
  const [phasePage, setPhasePage] = useState(1)

  function togglePhase(stage) {
    setOpenPhase(openPhase === stage ? null : stage)
    setPhasePage(1)
  }

  const isSolved = (p) => statusOf(progress[p.id]) === 'solved'
  const count = (status) => problems.filter((p) => statusOf(progress[p.id]) === status).length
  const solved = count('solved')
  const pct = problems.length ? Math.round((solved / problems.length) * 100) : 0

  const phases = PHASES.map((ph) => {
    const list = phaseProblems(ph, problems)
    return { ...ph, list, done: list.filter(isSolved).length }
  })
  const activePhase = currentStage(phases)
  const nextUp = activePhase?.list.find((p) => !isSolved(p))
  const resume = lastWorked(progress)

  // any section and any level; when everything is solved, any problem at all
  function openRandom() {
    const open = problems.filter((p) => !isSolved(p))
    const pool = open.length ? open : problems
    const p = pool[Math.floor(Math.random() * pool.length)]
    navigate(`/${p.category}/${p.id}`)
  }

  const today = todayKey()
  const due = Object.entries(review)
    .filter(([id, r]) => r.due <= today && problemById.has(id))
    .map(([id]) => problemById.get(id))

  return (
    <div className="dashboard">
      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">// learning path</p>
          <h1>Your path to interview-ready</h1>
          <p className="muted">
            A structured path from DataWeave basics to architect-level case studies. Work through the stages in order at
            your own pace, and practise the interview follow-ups out loud.
          </p>
          <div className="hero-actions">
            {nextUp && (
              <Link className="btn btn-primary" to={`/${nextUp.category}/${nextUp.id}`}>
                Continue the roadmap →
              </Link>
            )}
            <button className="btn btn-ghost" onClick={openRandom} title="Open a problem you have not solved, from any section">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7h3.5c5 0 5.5 10 11 10H21M3 17h3.5c1.9 0 3.1-1.4 4.1-3.2M13.4 10.2c1-1.8 2.2-3.2 4.1-3.2H21M18 4l3 3-3 3M18 14l3 3-3 3" />
              </svg>
              Random problem
            </button>
            <Link className="btn btn-ghost" to="/dashboard">
              See your dashboard
            </Link>
            <Link className="btn btn-ghost" to="/readiness">
              Check readiness
            </Link>
          </div>
        </div>
        <div className="hero-progress">
          <div className="hero-ring" aria-label={`${pct}% complete`}>
            <Ring pct={pct} />
            <div className="ring-label">
              <strong>{pct}%</strong>
              <span className="muted small">complete</span>
            </div>
          </div>
          <dl className="hero-stats">
            <div>
              <dt>Solved</dt>
              <dd>
                {solved.toLocaleString()} <span className="muted">/ {problems.length.toLocaleString()}</span>
              </dd>
            </div>
            {activePhase && (
              <div>
                <dt>Current stage</dt>
                <dd>
                  {activePhase.stage}. {activePhase.title}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      {(nextUp || resume) && (
        <section className="next-row">
          {nextUp && (
            <NextCard
              icon="path"
              label={`Roadmap · Stage ${activePhase.stage}`}
              target={nextUp}
              meta={`${categoryBySlug.get(nextUp.category)?.label ?? ''} · ${activePhase.title}`}
              action="Start"
            />
          )}
          {resume && resume.target.id !== nextUp?.id && <NextCard icon="resume" {...resume} />}
        </section>
      )}

      {sync.state === 'signed-out' && (
        <section className="sync-nudge">
          <span>
            <strong>Your progress is only saved in this browser.</strong>{' '}
            <span className="muted">Sign in with Google to keep it permanently and use it on every device.</span>
          </span>
          <button className="btn btn-primary" onClick={signIn}>
            Sign in with Google
          </button>
        </section>
      )}

      <TodayPlan />

      <section className="practice-row">
        <div className="practice-card due-card">
          <div className="practice-head">
            <span className="stat-label">Due for review today</span>
            <Link to="/review" className="small">
              Open review →
            </Link>
          </div>
          {due.length ? (
            <ul className="due-list">
              {due.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <Link to={`/${p.category}/${p.id}`}>{p.title}</Link>
                  <span className="muted small">{categoryBySlug.get(p.category).label}</span>
                </li>
              ))}
              {due.length > 4 && <li className="muted small">+ {due.length - 4} more</li>}
            </ul>
          ) : (
            <p className="muted small">Nothing due. Missed answers and Revisit ratings come back here after 1, 3, 7 and 21 days.</p>
          )}
        </div>
        <Link to="/mock" className="practice-card practice-link">
          <span className="stat-label">Mock interview</span>
          <strong>Timed mixed round</strong>
          <span className="muted small">DataWeave, flow, architecture, incident and quiz — scored with weak areas.</span>
        </Link>
        <Link to="/flashcards" className="practice-card practice-link">
          <span className="stat-label">Flashcards</span>
          <strong>10-minute warm-up</strong>
          <span className="muted small">Interview follow-ups and key points, flip and self-grade.</span>
        </Link>
        <Link to="/tracks" className="practice-card practice-link">
          <span className="stat-label">Topic tracks</span>
          <strong>API-led, ActiveMQ + Oracle…</strong>
          <span className="muted small">One ordered path per topic across every tab.</span>
        </Link>
      </section>

      <h2 className="section-heading">Roadmap</h2>
      <section className="phase-grid">
        {phases.map((ph) => {
          const state = ph.done === ph.list.length ? 'done' : ph === activePhase ? 'current' : 'upcoming'
          const open = openPhase === ph.stage
          const paged = open && paginate(ph.list, phasePage, PHASE_PAGE_SIZE)
          return (
            <article key={ph.stage} className={`phase-card phase-${state}`}>
              <header>
                <span className="phase-stage">Stage {ph.stage}</span>
                <span className={`phase-tag tag-${state}`}>
                  {{ done: 'Complete', current: 'Current', upcoming: 'Upcoming' }[state]}
                </span>
              </header>
              <h3>{ph.title}</h3>
              <p className="muted small">{ph.goal}</p>
              <ul className="phase-focus">
                {ph.focus.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="phase-progress">
                <div className="progress-bar">
                  <div style={{ width: `${ph.list.length ? (ph.done / ph.list.length) * 100 : 0}%` }} />
                </div>
                <span className="mono small muted">
                  {ph.done}/{ph.list.length}
                </span>
              </div>
              <button className="btn btn-ghost phase-toggle" onClick={() => togglePhase(ph.stage)}>
                {open ? 'Hide problems' : `Show ${ph.list.length} problems`}
              </button>
              {open && (
                <ul className="phase-list">
                  {paged.items.map((p) => (
                    <li key={p.id}>
                      <Link to={`/${p.category}/${p.id}`}>
                        <span className="phase-list-title">{p.title}</span>
                        <span className="phase-list-meta">
                          <span className="muted small">{categoryBySlug.get(p.category).label}</span>
                          <LevelBadge level={p.level} />
                          <StatusBadge status={statusOf(progress[p.id])} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {open && (
                <Pagination
                  compact
                  page={paged.page}
                  pageCount={paged.pageCount}
                  total={ph.list.length}
                  start={paged.start}
                  shown={paged.items.length}
                  onPage={setPhasePage}
                />
              )}
            </article>
          )
        })}
      </section>

    </div>
  )
}

function Ring({ pct }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <svg width="132" height="132" viewBox="0 0 132 132">
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform="rotate(-90 66 66)"
      />
    </svg>
  )
}
