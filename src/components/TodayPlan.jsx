import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { categoryBySlug } from '../data/categories.js'
import { problemById, problems } from '../data/problems.js'
import { PHASES, phaseProblems } from '../data/roadmap.js'
import { trackProblems } from '../data/tracks.js'
import { readMocks, weakAreaReport } from '../data/weakAreas.js'
import { loadBoxes } from '../store/flash.js'
import { beginFocus, readFocusGoal, readFocusHistory, saveFocusGoal, useFocusSession } from '../store/focus.js'
import { writeLocal } from '../store/local.js'
import { statusOf, todayKey, useProgress, useReview } from '../store/progress.js'
import { solvedByCategory } from './FocusSession.jsx'
import { FOCUS_GOALS, FOCUS_MINUTES, focusStreak, sessionsOn } from '../study/focus.js'
import { autoDone, buildPlan, currentMinutes, DEFAULT_MINUTES, interleave, itemDone, PLAN_MINUTES, planTime, validPlan } from '../study/plan.js'

// Today's work on the dashboard. The plan is saved when first built, so it stays put as you solve things during the day.
const PLAN_KEY = 'pl.plan'
const WEAK_TOPICS = 2
const WEAK_PER_TOPIC = 5
const EXTRA_MINUTES = 30
const KIND_LABELS = { review: 'Review', weak: 'Weak topic', new: 'New' }

function readPlan() {
  try {
    const plan = validPlan(JSON.parse(localStorage.getItem(PLAN_KEY)), (id) => problemById.has(id))
    return plan && { ...plan, items: currentMinutes(plan.items, (id) => problemById.get(id).estMinutes) }
  } catch {
    return null
  }
}

const dayOf = (iso) => todayKey(new Date(iso))

function dueNote(due, today) {
  const days = Math.round((new Date(`${today}T00:00:00`) - new Date(`${due}T00:00:00`)) / 86400000)
  return days > 0 ? `Overdue by ${days} ${days === 1 ? 'day' : 'days'}` : 'Due today'
}

function candidates({ progress, review, today }) {
  const candidate = (p, note) => ({ id: p.id, estMinutes: p.estMinutes, note })
  // anything on the review schedule comes back at its own time, so it isn't also offered as new work
  const open = (p) => statusOf(progress[p.id]) !== 'solved' && !review[p.id]

  const due = Object.entries(review)
    .filter(([id, r]) => r.due <= today && problemById.has(id))
    .sort(([, a], [, b]) => a.due.localeCompare(b.due))
    .map(([id, r]) => candidate(problemById.get(id), dueNote(r.due, today)))

  const report = weakAreaReport({ progress, review, boxes: loadBoxes(), mocks: readMocks() })
  const weak = report.weak
    .slice(0, WEAK_TOPICS)
    .flatMap((t) => trackProblems(t.track).filter(open).slice(0, WEAK_PER_TOPIC).map((p) => candidate(p, t.track.title)))

  // in stage order, so the earliest unfinished work always comes first
  const fresh = PHASES.flatMap((ph) =>
    interleave(phaseProblems(ph, problems).filter(open), (p) => p.category).map((p) => candidate(p, `Stage ${ph.stage}: ${ph.title}`)),
  )
  return { due, weak, fresh }
}

// Starts a session on what is left of the plan, and shows how today stands against the daily goal.
function FocusStart({ left, progress, today }) {
  const navigate = useNavigate()
  const session = useFocusSession()
  const [choosing, setChoosing] = useState(false)
  const [goal, setGoal] = useState(readFocusGoal)
  const history = readFocusHistory()
  const done = sessionsOn(history, today).length
  const days = focusStreak(history, goal, todayKey)

  function start(minutes) {
    const queue = left.map((i) => i.id)
    beginFocus({ minutes, queue, solved: solvedByCategory(progress) })
    const first = problemById.get(queue[0])
    navigate(`/${first.category}/${first.id}`)
  }

  function changeGoal(value) {
    setGoal(value)
    saveFocusGoal(value)
  }

  return (
    <div className="focus-start">
      {left.length > 0 && !session && (
        <div className="focus-start-actions">
          {choosing ? (
            <>
              {FOCUS_MINUTES.map((m) => (
                <button key={m} className="btn btn-sm btn-primary" onClick={() => start(m)}>
                  {m} min
                </button>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => setChoosing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => setChoosing(true)}>
              Start focus
            </button>
          )}
        </div>
      )}
      <span className="muted small">
        {done} of {goal} focus sessions today{days > 0 ? ` · ${days} day focus streak` : ''}
      </span>
      <label className="today-time small muted">
        Daily goal
        <select className="input" value={goal} onChange={(e) => changeGoal(Number(e.target.value))}>
          {FOCUS_GOALS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export default function TodayPlan() {
  const progress = useProgress()
  const review = useReview()
  const [plan, setPlan] = useState(readPlan)
  const today = todayKey()

  function save(next) {
    setPlan(next)
    writeLocal(PLAN_KEY, JSON.stringify(next))
  }

  const stale = !plan || plan.date !== today
  useEffect(() => {
    if (!stale) return
    const minutes = plan?.minutes ?? DEFAULT_MINUTES
    save({ date: today, minutes, ticked: [], items: buildPlan({ ...candidates({ progress, review, today }), minutes }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale])

  if (stale) return null

  const state = { ticked: plan.ticked, review, progress, today, dayOf }
  const isDone = (item) => itemDone(item, state)
  const done = plan.items.filter(isDone)
  const left = plan.items.filter((i) => !isDone(i))
  const finished = plan.items.length > 0 && left.length === 0

  // work already done stays on the list and uses up its share of the new time
  function changeMinutes(minutes) {
    const rest = buildPlan({
      ...candidates({ progress, review, today }),
      minutes: minutes - planTime(done),
      exclude: new Set(done.map((i) => i.id)),
    })
    save({ ...plan, minutes, items: [...done, ...rest] })
  }

  function addMore() {
    const extra = buildPlan({
      ...candidates({ progress, review, today }),
      minutes: EXTRA_MINUTES,
      exclude: new Set(plan.items.map((i) => i.id)),
    })
    save({ ...plan, items: [...plan.items, ...extra] })
  }

  const toggle = (id) =>
    save({ ...plan, ticked: plan.ticked.includes(id) ? plan.ticked.filter((x) => x !== id) : [...plan.ticked, id] })

  return (
    <section className="today-plan" aria-label="Today's plan">
      <div className="today-head">
        <div>
          <h2>Today's plan</h2>
          <span className="muted small">
            {!plan.items.length
              ? 'Nothing left to plan'
              : finished
                ? `All ${plan.items.length} done`
                : `${done.length} of ${plan.items.length} done · about ${planTime(left)} minutes left`}
          </span>
        </div>
        <label className="today-time small muted">
          Time today
          <select className="input" value={plan.minutes} onChange={(e) => changeMinutes(Number(e.target.value))}>
            {PLAN_MINUTES.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
      </div>

      {plan.items.length > 0 && (
        <div className="progress-bar today-progress">
          <div style={{ width: `${(done.length / plan.items.length) * 100}%` }} />
        </div>
      )}

      <FocusStart left={left} progress={progress} today={today} />

      {plan.items.length === 0 ? (
        <p className="muted small">
          You've solved everything on the roadmap and nothing is due. Try a <Link to="/exam">Practice Exam</Link> or a{' '}
          <Link to="/mock">Mock Interview</Link>.
        </p>
      ) : (
        <ul className="today-list">
          {plan.items.map((item) => {
            const p = problemById.get(item.id)
            const complete = isDone(item)
            const automatic = autoDone(item, state)
            return (
              <li key={item.id} className={complete ? 'done' : ''}>
                <label className="today-check">
                  <input
                    type="checkbox"
                    checked={complete}
                    disabled={automatic}
                    onChange={() => toggle(item.id)}
                    aria-label={`Mark ${p.title} as done`}
                  />
                </label>
                <div className="today-text">
                  <Link to={`/${p.category}/${p.id}`}>{p.title}</Link>
                  <span className="muted small">
                    <span className={`today-kind kind-${item.kind}`}>{KIND_LABELS[item.kind]}</span> {item.note} ·{' '}
                    {categoryBySlug.get(p.category)?.label}
                  </span>
                </div>
                <span className="mono small muted">{item.minutes}m</span>
              </li>
            )
          })}
        </ul>
      )}

      {finished && (
        <div className="today-finished">
          <span className="ok-text small">Plan finished for today.</span>
          <button className="btn btn-sm" onClick={addMore}>
            Add {EXTRA_MINUTES} more minutes
          </button>
        </div>
      )}
    </section>
  )
}
