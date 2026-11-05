import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES, categoryBySlug } from '../data/categories.js'
import { problemById, problems } from '../data/problems.js'
import { currentStage, PHASES, phaseProblems } from '../data/roadmap.js'
import { statusOf, todayKey, useActivity, useProgress, useReview } from '../store/progress.js'
import { LevelBadge, StatusBadge } from '../components/Badges.jsx'
import Pagination, { paginate } from '../components/Pagination.jsx'
import TodayPlan from '../components/TodayPlan.jsx'
import { signIn, useSyncStatus } from '../sync/status.js'

const PHASE_PAGE_SIZE = 10

export default function DashboardPage() {
  const progress = useProgress()
  const activity = useActivity()
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
                Continue: {nextUp.title} →
              </Link>
            )}
            <Link className="btn btn-ghost" to="/readiness">
              Check readiness
            </Link>
          </div>
        </div>
        <div className="hero-ring" aria-label={`${pct}% complete`}>
          <Ring pct={pct} />
          <div className="ring-label">
            <strong>{pct}%</strong>
            <span className="muted small">
              {solved} / {problems.length} solved
            </span>
          </div>
        </div>
      </section>

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

      <section className="stat-row">
        <Stat label="Current stage" value={activePhase ? `Stage ${activePhase.stage}` : 'Complete'} hint={activePhase?.title} />
        <Stat label="Solved" value={solved} hint="problems" />
        <Stat label="In progress" value={count('attempted')} hint="attempted" />
        <Stat label="To revisit" value={count('revisit')} hint="flagged" />
        <Stat label="Day streak" value={streak(activity)} hint={`${Object.keys(activity).length} active days`} />
      </section>

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

      <div className="dash-columns">
        <section>
          <h2 className="section-heading">Tracks</h2>
          <div className="track-list">
            {CATEGORIES.map((c) => {
              const list = problems.filter((p) => p.category === c.slug)
              const done = list.filter(isSolved).length
              return (
                <Link key={c.slug} to={`/${c.slug}`} className="track-row">
                  <span className="track-name">{c.label}</span>
                  <div className="progress-bar">
                    <div style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
                  </div>
                  <span className="mono small muted">
                    {done}/{list.length}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="section-heading">Activity</h2>
          <Heatmap activity={activity} />
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
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

// Consecutive active days ending today (or yesterday, so the streak survives until you practise today).
function streak(activity) {
  const day = new Date()
  if (!activity[todayKey(day)]) day.setDate(day.getDate() - 1)
  let n = 0
  while (activity[todayKey(day)]) {
    n++
    day.setDate(day.getDate() - 1)
  }
  return n
}

const WEEKS = 18

function Heatmap({ activity }) {
  const end = new Date()
  const startDay = new Date(end)
  startDay.setDate(end.getDate() - end.getDay() - (WEEKS - 1) * 7) // start on a Sunday

  const weeks = []
  for (let w = 0; w < WEEKS; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDay)
      date.setDate(startDay.getDate() + w * 7 + d)
      const key = todayKey(date)
      const a = activity[key]
      const level = !a ? 0 : a.solved >= 2 ? 4 : a.solved === 1 ? 3 : a.actions >= 20 ? 2 : 1
      days.push({ key, level, future: date > end, a })
    }
    weeks.push(days)
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap">
        {weeks.map((days, i) => (
          <div key={i} className="heat-col">
            {days.map((d) => (
              <span
                key={d.key}
                className={`heat-cell heat-${d.future ? 'future' : d.level}`}
                title={d.a ? `${d.key}: ${d.a.solved} solved, ${d.a.actions} actions` : d.key}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heat-legend muted small">
        Less <span className="heat-cell heat-0" /> <span className="heat-cell heat-1" /> <span className="heat-cell heat-2" />{' '}
        <span className="heat-cell heat-3" /> <span className="heat-cell heat-4" /> More
      </div>
    </div>
  )
}
