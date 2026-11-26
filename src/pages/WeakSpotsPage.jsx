import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ProblemList from '../components/ProblemList.jsx'
import QuestionCard from '../components/quiz/QuestionCard.jsx'
import { categoryBySlug } from '../data/categories.js'
import { loadProblem, problemById } from '../data/problems.js'
import { readMocks, weakAreaReport } from '../data/weakAreas.js'
import { grade, initialResponse, isAnswered } from '../quiz/quiz.js'
import { loadBoxes } from '../store/flash.js'
import { clearMistakes, useMistakes } from '../store/mistakes.js'
import { scheduleReview, statusOf, useProgress, useReview } from '../store/progress.js'
import { forgetWrong, promptText, rankWrong, recordAnswers, RIGHT_DAYS_TO_CLEAR, sameQuestion, useWrong } from '../store/wrong.js'

// One place for everything you keep getting wrong: quiz questions to retry here, weak topics, and the slips on
// flow and architecture designs. The Learning Path and the sidebar point here when there is something to fix.
const FIX_NEXT = 3
const WRONG_SHOWN = 10
const TOPICS_SHOWN = 6
const PER_TOPIC = 5
const REVIEW_SET = 10

const keyOf = (w) => `${w.pid}:${w.qi}`
const questionsOf = (p) => p?.investigation?.questions ?? p?.quiz ?? []

// One wrong question: a short line, and the question itself once you open it
function WrongItem({ item, cleared, open, onToggle }) {
  const meta = problemById.get(item.pid)
  const [q, setQ] = useState(undefined) // undefined while loading, null when the question has changed
  const [response, setResponse] = useState(null)
  const [checked, setChecked] = useState(false)
  const seed = `${keyOf(item)}:retry:${item.misses}`

  useEffect(() => {
    if (!open || q !== undefined) return
    let live = true
    loadProblem(item.pid).then(
      (p) => {
        if (!live) return
        const found = questionsOf(p)[item.qi]
        const fits = sameQuestion(item, found)
        setQ(fits ? found : null)
        if (fits) setResponse(initialResponse(found, seed))
      },
      () => live && setQ(null),
    )
    return () => {
      live = false
    }
  }, [open, q, item, seed])

  function check() {
    setChecked(true)
    recordAnswers([{ pid: item.pid, qi: item.qi, q, ok: grade(q, response) }])
  }

  function again() {
    setChecked(false)
    setResponse(initialResponse(q, `${seed}:again`))
  }

  const rightDays = item.right?.length ?? 0
  return (
    <li className={`wrong-item${open ? ' open' : ''}${cleared ? ' cleared' : ''}`}>
      <button className="wrong-row" onClick={onToggle} aria-expanded={open}>
        <span className="wrong-text">
          <span className="wrong-prompt">{promptText(item.p)}</span>
          <span className="muted small">
            {meta?.title ?? item.pid} · {categoryBySlug.get(meta?.category)?.label}
          </span>
        </span>
        <span className="wrong-meta small">
          {cleared ? (
            <span className="ok-text">Cleared</span>
          ) : (
            <>
              <span className="wrong-misses">
                {item.misses} {item.misses === 1 ? 'miss' : 'misses'}
              </span>
              <span className="wrong-dots" title={`Right on ${rightDays} of ${RIGHT_DAYS_TO_CLEAR} days needed to clear it`}>
                {Array.from({ length: RIGHT_DAYS_TO_CLEAR }, (_, i) => (
                  <i key={i} className={i < rightDays ? 'on' : ''} />
                ))}
              </span>
            </>
          )}
          <span className="wrong-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>

      {open && (
        <div className="wrong-body">
          {q === undefined && <p className="muted small">Loading the question…</p>}
          {q === null && (
            <p className="muted small">
              This question has changed since you missed it.{' '}
              <button className="link-btn" onClick={() => forgetWrong(item.pid, item.qi)}>
                Remove it
              </button>
            </p>
          )}
          {q && (
            <>
              <QuestionCard q={q} number={item.qi + 1} seed={seed} response={response} submitted={checked} onChange={setResponse} />
              <div className="wrong-actions">
                {checked ? (
                  <>
                    <span className={grade(q, response) ? 'ok-text small' : 'err-text small'}>
                      {grade(q, response)
                        ? cleared
                          ? 'Right. It is cleared from your list.'
                          : 'Right. Get it right on another day to clear it.'
                        : 'Still wrong. Read the explanation, then try again later.'}
                    </span>
                    <button className="btn btn-sm btn-ghost" onClick={again}>
                      Try again
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={check} disabled={!isAnswered(q, response)}>
                    Check
                  </button>
                )}
                <Link className="btn btn-sm btn-ghost" to={`/${meta?.category}/${item.pid}`}>
                  Open the problem
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function WrongQuestions({ wrong, openKeys, setOpenKeys }) {
  const [all, setAll] = useState(false)
  // The order is kept while you are on the page, so a question you just answered stays where it was
  const [order, setOrder] = useState(() => rankWrong(wrong).map(keyOf))
  const seen = useRef(new Map())
  for (const w of wrong) seen.current.set(keyOf(w), w)
  useEffect(() => {
    const fresh = rankWrong(wrong).map(keyOf).filter((k) => !order.includes(k))
    if (fresh.length) setOrder([...order, ...fresh])
  }, [wrong, order])

  const live = new Map(wrong.map((w) => [keyOf(w), w]))
  const rows = order.map((k) => ({ key: k, item: live.get(k) ?? seen.current.get(k), cleared: !live.has(k) })).filter((r) => r.item)
  const shown = all ? rows : rows.slice(0, WRONG_SHOWN)
  const toggle = (k) => setOpenKeys(openKeys.includes(k) ? openKeys.filter((x) => x !== k) : [...openKeys, k])

  return (
    <section className="spots-section" id="wrong-questions">
      <div className="spots-head">
        <h2>
          Questions you got wrong <span className="muted">({wrong.length})</span>
        </h2>
        <span className="muted small">Open one to retry it here. Right on {RIGHT_DAYS_TO_CLEAR} different days clears it.</span>
      </div>
      {rows.length === 0 ? (
        <p className="spots-empty muted small">No wrong quiz answers saved. When you miss a quiz or exam question, it comes here.</p>
      ) : (
        <>
          <ul className="wrong-list">
            {shown.map((r) => (
              <WrongItem key={r.key} item={r.item} cleared={r.cleared} open={openKeys.includes(r.key)} onToggle={() => toggle(r.key)} />
            ))}
          </ul>
          {rows.length > WRONG_SHOWN && (
            <button className="btn btn-sm btn-ghost" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function WeakTopics({ report, review }) {
  const [openTopic, setOpenTopic] = useState(null)
  const [added, setAdded] = useState(null)
  const max = report.weak[0]?.weight ?? 1

  function addToReview(list) {
    const fresh = list.filter((p) => !review[p.id])
    fresh.forEach((p) => scheduleReview(p.id))
    setAdded(fresh.length)
  }
  const reasons = (p) => <span className="muted small">{[...report.signals.get(p.id).reasons].join(' · ')}</span>

  return (
    <section className="spots-section">
      <div className="spots-head">
        <h2>
          Weak topics <span className="muted">({report.weak.length})</span>
        </h2>
        {report.needWork.length > 0 && (
          <button className="btn btn-sm" onClick={() => addToReview(report.needWork.slice(0, REVIEW_SET))}>
            {report.needWork.length === 1
              ? 'Add my weakest problem to Review'
              : `Add my ${Math.min(REVIEW_SET, report.needWork.length)} weakest problems to Review`}
          </button>
        )}
      </div>
      {added !== null && (
        <p className="muted small">{added ? `${added} added. They are due tomorrow on the Review page.` : 'Those are already on your review schedule.'}</p>
      )}
      {report.weak.length === 0 ? (
        <p className="spots-empty muted small">No weak topics yet. Misses in quizzes, mocks, flashcards and Revisit marks build this list.</p>
      ) : (
        <ul className="topic-list">
          {report.weak.slice(0, TOPICS_SHOWN).map((t) => {
            const open = openTopic === t.track.slug
            return (
              <li key={t.track.slug} className={open ? 'open' : ''}>
                <button className="topic-row" onClick={() => setOpenTopic(open ? null : t.track.slug)} aria-expanded={open}>
                  <span className="topic-name">{t.track.title}</span>
                  <span className="topic-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, (t.weight / max) * 100)}%` }} />
                  </span>
                  <span className="muted small topic-count">
                    {t.problems.length} need work · {t.solved}/{t.total} solved
                  </span>
                  <span className="wrong-chevron" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                </button>
                {open && (
                  <div className="topic-body">
                    <ProblemList items={t.problems.slice(0, PER_TOPIC)} extra={reasons} />
                    <div className="wrong-actions">
                      <button className="btn btn-sm" onClick={() => addToReview(t.problems.slice(0, PER_TOPIC))}>
                        Add these to Review
                      </button>
                      <Link className="btn btn-sm btn-ghost" to={`/tracks/${t.track.slug}`}>
                        Open the track
                      </Link>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// The settings and parts that keep going wrong on flow and architecture designs (from Check design and Find it)
function designSlips(mistakes) {
  const settings = new Map()
  const parts = new Map()
  const byProblem = new Map()
  for (const m of mistakes) {
    for (const f of m.fields ?? []) {
      const key = `${f.part} · ${f.field}`
      const s = settings.get(key) ?? { part: f.part, field: f.field, count: 0, problems: new Set(), last: f }
      s.count++
      s.problems.add(m.id)
      settings.set(key, s)
    }
    for (const p of m.parts ?? []) {
      const s = parts.get(p) ?? { part: p, count: 0, problems: new Set() }
      s.count++
      s.problems.add(m.id)
      parts.set(p, s)
    }
    const b = byProblem.get(m.id) ?? { id: m.id, checks: new Set(), last: m.at }
    b.checks.add(m.check)
    byProblem.set(m.id, b)
  }
  const top = (map) => [...map.values()].sort((a, b) => b.problems.size - a.problems.size || b.count - a.count)
  return {
    settings: top(settings).slice(0, 8),
    parts: top(parts).slice(0, 12),
    retry: [...byProblem.values()]
      .filter((b) => problemById.has(b.id))
      .sort((a, b) => b.checks.size - a.checks.size || b.last.localeCompare(a.last))
      .slice(0, 8),
  }
}

function DesignSlips({ mistakes, progress }) {
  const { settings, parts, retry } = useMemo(() => designSlips(mistakes), [mistakes])
  return (
    <section className="spots-section">
      <div className="spots-head">
        <h2>
          Design slips <span className="muted">({retry.length} problems)</span>
        </h2>
        <span className="muted small">From Check design and Find it on flow and architecture problems.</span>
      </div>
      {settings.length > 0 && (
        <ul className="mistakes-list">
          {settings.map((s) => (
            <li key={`${s.part}-${s.field}`}>
              <span>
                <b>{s.field}</b> <span className="muted">on {s.part}</span>
              </span>
              <span className="muted small">
                yours <span className="mono err-text">{s.last.mine || '(empty)'}</span>, reference{' '}
                <span className="mono ok-text">{s.last.ref || '(empty)'}</span>
              </span>
              <span className="mistakes-count small">
                {s.problems.size} problem{s.problems.size === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {parts.length > 0 && (
        <div className="mistakes-chips">
          {parts.map((p) => (
            <span key={p.part} className="mistakes-chip" title={`${p.count} failed checks across ${p.problems.size} problems`}>
              {p.part} <b>{p.problems.size}</b>
            </span>
          ))}
        </div>
      )}
      <ul className="mistakes-list">
        {retry.map((b) => {
          const p = problemById.get(b.id)
          return (
            <li key={b.id}>
              <span>
                <Link to={`/${p.category}/${p.id}`}>{p.title}</Link>
              </span>
              <span className="muted small">
                {categoryBySlug.get(p.category)?.label} · {b.checks.size} check{b.checks.size === 1 ? '' : 's'} went wrong
                {statusOf(progress[b.id]) === 'solved' && ' · solved since'}
              </span>
              <Link className="btn btn-ghost btn-sm" to={`/${p.category}/${p.id}`}>
                Practise
              </Link>
            </li>
          )
        })}
      </ul>
      <button className="btn btn-ghost btn-sm spots-clear" onClick={() => confirm('Clear the design slips? This cannot be undone.') && clearMistakes()}>
        Clear design slips
      </button>
    </section>
  )
}

export default function WeakSpotsPage() {
  const progress = useProgress()
  const review = useReview()
  const wrong = useWrong()
  const mistakes = useMistakes()
  const [openKeys, setOpenKeys] = useState([])
  const report = useMemo(
    () => weakAreaReport({ progress, review, boxes: loadBoxes(), mocks: readMocks(), wrong }),
    [progress, review, wrong],
  )

  const ranked = rankWrong(wrong)
  const fixNext = ranked.slice(0, FIX_NEXT)
  const slipProblems = new Set(mistakes.map((m) => m.id)).size
  const nothing = !wrong.length && !report.weak.length && !mistakes.length

  function retryTop() {
    setOpenKeys(fixNext.map(keyOf))
    document.getElementById('wrong-questions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="spots-page">
      <p className="eyebrow">// weak spots</p>
      <h1>Weak Spots</h1>
      <p className="muted">What you keep getting wrong, in one place. Fix a few each day and the list gets shorter.</p>

      <section className="spots-summary">
        <a className="spots-stat" href="#wrong-questions" onClick={(e) => (e.preventDefault(), retryTop())}>
          <span className="stat-label">Wrong answers</span>
          <strong>{wrong.length}</strong>
          <span className="muted small">to retry</span>
        </a>
        <div className="spots-stat">
          <span className="stat-label">Weak topics</span>
          <strong>{report.weak.length}</strong>
          <span className="muted small">
            {report.needWork.length} {report.needWork.length === 1 ? 'problem needs' : 'problems need'} work
          </span>
        </div>
        <div className="spots-stat">
          <span className="stat-label">Design slips</span>
          <strong>{slipProblems}</strong>
          <span className="muted small">problems with failed checks</span>
        </div>
      </section>

      {nothing ? (
        <div className="spots-empty-card">
          <strong>Nothing to fix yet.</strong>
          <span className="muted">
            Do some quizzes, a <Link to="/exam">Practice Exam</Link> or a <Link to="/mock">Mock Interview</Link>. Every wrong
            answer lands here, and the Learning Path tells you when there is something to retry.
          </span>
        </div>
      ) : (
        fixNext.length > 0 && (
          <section className="spots-fix">
            <div>
              <span className="stat-label">Fix next</span>
              <ol>
                {fixNext.map((w) => (
                  <li key={keyOf(w)}>
                    <span className="wrong-prompt">{promptText(w.p)}</span>
                    <span className="muted small">
                      {problemById.get(w.pid)?.title} · {w.misses} {w.misses === 1 ? 'miss' : 'misses'}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <button className="btn btn-primary" onClick={retryTop}>
              Retry {fixNext.length === 1 ? 'it' : `these ${fixNext.length}`} →
            </button>
          </section>
        )
      )}

      {!nothing && <WrongQuestions wrong={wrong} openKeys={openKeys} setOpenKeys={setOpenKeys} />}
      {!nothing && <WeakTopics report={report} review={review} />}
      {mistakes.length > 0 && <DesignSlips mistakes={mistakes} progress={progress} />}

      {report.untouched.length > 0 && (
        <section className="spots-section">
          <div className="spots-head">
            <h2>
              Not practised yet <span className="muted">({report.untouched.length})</span>
            </h2>
          </div>
          <div className="search-examples">
            {report.untouched.map((t) => (
              <Link key={t.track.slug} className="chip-btn" to={`/tracks/${t.track.slug}`}>
                {t.track.title} <span className="muted">{t.total}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
