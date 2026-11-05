import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES } from '../data/categories.js'
import { problems, problemsFor } from '../data/problems.js'
import { trackProblems, TRACKS } from '../data/tracks.js'
import { readMocks } from '../data/weakAreas.js'
import { todayKey, useProgress, useReview } from '../store/progress.js'
import {
  ACCURACY_READY,
  areaReport,
  collectAnswers,
  COVERAGE_CLOSE,
  COVERAGE_READY,
  IN_TIME_READY,
  latestTimes,
  LEVELS,
  LOW_MARK,
  MAX_OVERDUE,
  MIN_ANSWERS,
  MIN_TIMED,
  MIN_TOPIC_TIMED,
  overview,
  sortAreas,
  topicSpeed,
} from '../study/readiness.js'

const SHOWN_TOPICS = 6

function readExams() {
  try {
    const list = JSON.parse(localStorage.getItem('pl.exam.history'))
    return Array.isArray(list) ? list.filter((e) => e && Array.isArray(e.results)) : []
  } catch {
    return []
  }
}

const gapLink = (gap, slug) => ({ accuracy: '/exam', overdue: '/review' })[gap.kind] ?? `/${slug}`

export default function ReadinessPage() {
  const progress = useProgress()
  const review = useReview()

  const report = useMemo(() => {
    const today = todayKey()
    const answers = collectAnswers(readExams(), readMocks())
    const times = latestTimes(progress)
    const areas = CATEGORIES.map((c) =>
      areaReport({ slug: c.slug, label: c.label, items: problemsFor(c.slug), progress, review, answers, times, today }),
    )
    const topics = TRACKS.map((t) => ({ slug: t.slug, title: t.title, ids: new Set(trackProblems(t).map((p) => p.id)) }))
    return { areas: sortAreas(areas), summary: overview(areas, answers, times), speed: topicSpeed(topics, times), timed: times.size }
  }, [progress, review])

  const { areas, summary, speed, timed } = report

  return (
    <div className="readiness-page">
      <p className="eyebrow">// readiness</p>
      <h1>Interview Readiness</h1>
      <p className="muted">
        What your work so far says about each area, across {problems.length} problems. An area only counts as ready with
        evidence: enough solved, enough exam answers and enough timed solves. This is the site's own estimate, not a
        prediction of any interview.
      </p>

      <section className="stat-row readiness-stats">
        <Stat label="Areas ready" value={`${summary.ready} / ${summary.total}`} />
        <Stat label="Exam accuracy" value={summary.accuracy === null ? '—' : `${summary.accuracy}%`} hint={summary.accuracy === null ? `needs ${MIN_ANSWERS} answers` : 'recent exams and mocks'} />
        <Stat label="Finished in time" value={summary.inTime === null ? '—' : `${summary.inTime}%`} hint={summary.inTime === null ? `needs ${MIN_TIMED} timed solves` : 'latest attempt per problem'} />
        <Stat label="Overdue reviews" value={summary.overdue} hint={summary.overdue ? 'waiting' : 'all clear'} />
      </section>

      <h2 className="section-heading">By area</h2>
      <p className="muted small">Furthest behind first. Each area shows the one thing that would help most.</p>
      <div className="readiness-areas">
        {areas.map((a) => (
          <article key={a.slug} className="readiness-area">
            <header>
              <Link to={`/${a.slug}`} className="readiness-name">
                {a.label}
              </Link>
              <span className={`readiness-level level-${a.level}`}>{LEVELS[a.level]}</span>
            </header>
            <div className="readiness-signals">
              <Signal label="Covered" value={a.coverage} target={COVERAGE_READY} detail={`${a.solved} of ${a.total}`} />
              <Signal
                label="Exams"
                value={a.accuracy}
                target={ACCURACY_READY}
                detail={a.examined ? `${a.answers} answers` : a.answers ? `${a.answers} from mocks` : 'no quizzes here'}
              />
              <Signal label="In time" value={a.inTime} target={IN_TIME_READY} detail={`${a.timed} timed`} />
            </div>
            {a.gaps.length > 0 ? (
              <Link className="readiness-next small" to={gapLink(a.gaps[0], a.slug)}>
                Next: {a.gaps[0].text} →
              </Link>
            ) : (
              <span className="readiness-next small ok-text">Nothing outstanding. Keep it fresh with reviews.</span>
            )}
          </article>
        ))}
      </div>

      <h2 className="section-heading">Pace by topic</h2>
      {speed.length ? (
        <>
          <p className="muted small">
            Slowest first, using your latest attempt at each problem and the total time, so resets don't help. 100% means
            exactly on target.
          </p>
          <ul className="exam-topics readiness-speed">
            {speed.slice(0, SHOWN_TOPICS).map((t) => (
              <li key={t.slug}>
                <Link to={`/tracks/${t.slug}`}>{t.title}</Link>
                <span className={`mono small ${t.pace > 100 ? 'err-text' : 'ok-text'}`}>{t.pace}% of target</span>
                <span className="mono small muted">{t.timed} timed</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty-row muted problem-table">
          {timed
            ? `Not enough timed solves in any one topic yet. A topic needs ${MIN_TOPIC_TIMED}.`
            : 'No timed solves yet. Solve a problem while its timer runs and your pace will show here.'}
        </div>
      )}

      <details className="readiness-rules">
        <summary className="small muted">How this is worked out</summary>
        <ul className="small muted">
          <li>
            <b>Ready:</b> {COVERAGE_READY}% solved, {ACCURACY_READY}% exam accuracy from at least {MIN_ANSWERS} answers (in
            areas with quizzes), {IN_TIME_READY}% finished in time from at least {MIN_TIMED} timed solves, and no more than{' '}
            {MAX_OVERDUE} overdue reviews.
          </li>
          <li>
            <b>Getting there:</b> {COVERAGE_CLOSE}% solved, with neither measured result under {LOW_MARK}%.
          </li>
          <li>
            A dash means too little evidence to give a figure. Accuracy uses your last 10 exams and mocks, and leaves out
            retakes of missed questions.
          </li>
          <li>
            Your weakest topics by misses are on <Link to="/weak-areas">Weak Areas</Link>.
          </li>
        </ul>
      </details>
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

function Signal({ label, value, target, detail }) {
  const measured = value !== null
  return (
    <div className="readiness-signal">
      <div className="readiness-signal-head small">
        <span className="muted">{label}</span>
        <span className={`mono ${!measured ? 'muted' : value >= target ? 'ok-text' : ''}`}>{measured ? `${value}%` : '—'}</span>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${value ?? 0}%` }} />
      </div>
      <span className="muted small">{detail}</span>
    </div>
  )
}
