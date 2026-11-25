import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES, categoryBySlug } from '../data/categories.js'
import { problemById, problems } from '../data/problems.js'
import { LevelBadge } from '../components/Badges.jsx'
import { statusOf, todayKey, useActivity, useProgress, useReview } from '../store/progress.js'
import { POINTS, usePoints } from '../store/points.js'
import { independence } from '../study/independence.js'
import {
  buckets,
  dayTotals,
  firstSolves,
  formatDuration,
  goalMet,
  goalStreak,
  hourBuckets,
  openAttempts,
  PERIODS,
  periodEnd,
  periodStart,
  periodSummary,
  solveEvents,
} from '../study/progressStats.js'

// One screen for how you are doing: what you solved today, this week, this month or in all, a chart of problems
// solved, the learning graph (problems solved at least once over time), progress per section and level, points,
// the activity heatmap and the problems solved in the period. The Learning Path page keeps the path itself.
const PERIOD_KEY = 'pl.dashboard.period'
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']
const LEVEL_LABEL = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced', EXPERT: 'Expert' }

const RANGE_KEY = 'pl.dashboard.range'

// the last 30 days, until a range is picked
function defaultRange() {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 29)
  return { from: from.toLocaleDateString('en-CA'), to: to.toLocaleDateString('en-CA') }
}
const DAY = /^\d{4}-\d{2}-\d{2}$/
const readRange = () => {
  try {
    const v = JSON.parse(localStorage.getItem(RANGE_KEY))
    return DAY.test(v?.from) && DAY.test(v?.to) ? v : defaultRange()
  } catch {
    return defaultRange()
  }
}
const shortDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// The daily goal: problems to solve and minutes to practise each day
const GOAL_KEY = 'pl.dashboard.goal'
const DEFAULT_GOAL = { solved: 5, minutes: 60 }
const readGoal = () => {
  try {
    const v = JSON.parse(localStorage.getItem(GOAL_KEY))
    return v?.solved > 0 && v?.minutes > 0 ? { solved: v.solved, minutes: v.minutes } : DEFAULT_GOAL
  } catch {
    return DEFAULT_GOAL
  }
}

const readPeriod = () => {
  try {
    const v = localStorage.getItem(PERIOD_KEY)
    return PERIODS.some((p) => p.key === v) ? v : 'week'
  } catch {
    return 'week'
  }
}

export default function ProgressDashboardPage() {
  const progress = useProgress()
  const activity = useActivity()
  const review = useReview()
  const [period, setPeriodState] = useState(readPeriod)
  const setPeriod = (p) => {
    setPeriodState(p)
    try {
      localStorage.setItem(PERIOD_KEY, p)
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  }

  const [range, setRangeState] = useState(readRange)
  // From after To swaps them, and no date goes past today
  const setRange = (next) => {
    const today = todayKey()
    let { from, to } = { ...range, ...next }
    if (!DAY.test(from) || !DAY.test(to)) return
    if (to > today) to = today
    if (from > today) from = today
    if (from > to) [from, to] = [to, from]
    setRangeState({ from, to })
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ from, to }))
    } catch {
      // storage blocked: the range lasts for this visit
    }
  }

  const data = useMemo(() => {
    const events = solveEvents(progress)
    const first = firstSolves(events)
    const solvedNow = problems.filter((p) => statusOf(progress[p.id]) === 'solved').length
    const base = Math.max(0, solvedNow - first.size)
    const custom = period === 'custom'
    const from = custom ? range.from : periodStart(period)
    const to = custom ? range.to : periodEnd(period)
    const sum = periodSummary({ events, activity, first, from, to })
    const chart = buckets({ period, events, activity, first, base, from, to })
    const hours = period === 'today' || period === 'yesterday' ? hourBuckets({ events, progress, day: from }) : null
    const totals = dayTotals({ events, activity, progress })
    const open = openAttempts(progress, from, to)
    const revisit = problems.filter((p) => statusOf(progress[p.id]) === 'revisit').length
    return { events, first, solvedNow, from, to, sum, chart, hours, totals, open, revisit }
  }, [progress, activity, period, range])

  const { sum, chart, hours, totals, from, to, solvedNow, open, revisit } = data
  const custom = period === 'custom'
  const periodLabel = custom ? 'in this range' : PERIODS.find((p) => p.key === period).label.toLowerCase()
  const today = todayKey()
  const due = Object.entries(review).filter(([id, r]) => r.due <= today && problemById.has(id)).length
  const unit = chart[0]?.unit ?? 'day'
  const inPeriod = (b) => (!from || b.to >= from) && (!to || b.from <= to)

  return (
    <div className="pd-page">
      <header className="pd-head">
        <div>
          <p className="eyebrow">// dashboard</p>
          <h1>Dashboard</h1>
          <p className="muted">What you solved, how much time it took, and how your learning is growing.</p>
        </div>
        <div className="pd-filter">
        <div className="pd-periods" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              className={`pd-period${period === p.key ? ' on' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {custom && (
          <div className="pd-range">
            <label>
              <span>From</span>
              <input type="date" value={range.from} max={todayKey()} onChange={(e) => setRange({ from: e.target.value })} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={range.to} max={todayKey()} onChange={(e) => setRange({ to: e.target.value })} />
            </label>
            <span className="muted small pd-range-days">
              {Math.round((new Date(`${range.to}T00:00:00`) - new Date(`${range.from}T00:00:00`)) / 86400000) + 1} days
            </span>
          </div>
        )}
        </div>
      </header>

      <section className="pd-kpis">
        <Kpi
          label={`Solved ${periodLabel}`}
          value={sum.solved}
          hint={sum.solved ? `${sum.firstTime} first time${sum.again ? `, ${sum.again} again` : ''}` : 'Nothing solved yet'}
        />
        <Kpi
          label="Time practised"
          value={formatDuration(sum.seconds + open.seconds)}
          hint={`${formatDuration(sum.seconds)} on solves${open.seconds ? `, ${formatDuration(open.seconds)} on ${open.count} not finished` : ''}`}
        />
        <Kpi label="Within estimate" value={sum.inTimePct === null ? '–' : `${sum.inTimePct}%`} hint="Solved inside the estimated time" />
        <Kpi label="Active days" value={sum.activeDays} hint={`${sum.actions} practice actions`} />
        <Kpi label="Day streak" value={streak(activity)} hint={`${Object.keys(activity).length} active days in all`} />
        <Kpi
          label="Total solved"
          value={`${solvedNow} / ${problems.length}`}
          hint={`${problems.length ? Math.round((solvedNow / problems.length) * 100) : 0}% of all problems${revisit ? `, ${revisit} marked Revisit` : ''}`}
        />
      </section>

      {period === 'today' && <GoalCard totals={totals} today={today} />}

      <p className="muted small pd-note">
        Time counts while a problem page is open and on screen, from opening it until it is solved. Leaving the page,
        switching to another tab or minimising the window pauses the clock. So does a minute without activity, and that
        minute is not counted.
        Review, mock interviews and flashcards are not timed, and solving an already solved problem is timed only with
        <i> Time it again</i>. The time for each problem is in the Solved table below.
      </p>

      <section className="pd-charts">
        {hours ? (
          <>
            <ChartCard
              title="Time by hour"
              sub={`Minutes practised in each hour ${period === 'today' ? 'today' : 'yesterday'}.`}
              rows={hours}
              value={(b) => `${minutes(b.seconds)} min, ${b.solved} solved`}
              tableHead="Practised"
            >
              {(w) => (
                <Bars
                  rows={hours}
                  width={w}
                  value={(b) => minutes(b.seconds)}
                  strong={() => true}
                  unit="hour"
                  max={60}
                  tip={(b) => `${formatDuration(b.seconds)} practised, ${b.solved} solved`}
                  label="Bar chart of minutes practised in each hour"
                />
              )}
            </ChartCard>
            <ChartCard
              title="Time graph"
              sub={period === 'today' ? 'Minutes practised so far today.' : 'Minutes practised through yesterday.'}
              rows={hours}
              value={(b) => formatDuration(b.runSeconds)}
              tableHead="By the end of the hour"
            >
              {(w) => (
                <Line
                  rows={hours}
                  width={w}
                  value={(b) => minutes(b.runSeconds)}
                  tip={(b) => `${formatDuration(b.runSeconds)} by the end of ${b.label}`}
                  end={(b) => formatDuration(b.runSeconds)}
                  label="Line chart of minutes practised through the day"
                />
              )}
            </ChartCard>
          </>
        ) : (
          <>
        <ChartCard
          title="Problems solved"
          sub={period === 'all' || custom ? `Per ${unit}${custom ? `, ${shortDate(range.from)} to ${shortDate(range.to)}` : ''}.` : `Per ${unit}. Bright bars are ${periodLabel}.`}
          rows={chart}
          value={(b) => b.solved}
          tableHead="Solved"
        >
          {(w) => <Bars rows={chart} width={w} value={(b) => b.solved} strong={inPeriod} unit={unit} />}
        </ChartCard>
        <ChartCard
          title="Learning graph"
          sub="Problems solved at least once."
          rows={chart}
          value={(b) => b.total}
          tableHead="Total solved"
        >
          {(w) => <Line rows={chart} width={w} value={(b) => b.total} />}
        </ChartCard>
          </>
        )}
      </section>

      <section className="pd-card">
        <div className="pd-card-head">
          <div>
            <h2>Solved {periodLabel}</h2>
            <span className="muted small">{sum.ids.size ? `${sum.ids.size} ${sum.ids.size === 1 ? 'problem' : 'problems'}, latest first` : 'Latest first'}</span>
          </div>
        </div>
        <SolvedTable events={sum.events} />
      </section>

      <section className="pd-split">
        <div className="pd-card">
          <div className="pd-card-head">
            <h2>By section</h2>
            <span className="muted small">{periodLabel} · overall</span>
          </div>
          <div className="pd-rows">
            {CATEGORIES.map((c) => {
              const list = problems.filter((p) => p.category === c.slug)
              const done = list.filter((p) => statusOf(progress[p.id]) === 'solved').length
              const now = [...sum.ids].filter((id) => problemById.get(id)?.category === c.slug).length
              return (
                <Link key={c.slug} to={`/${c.slug}`} className="pd-row">
                  <span className="pd-row-name">{c.label}</span>
                  <span className={`pd-row-now${now ? '' : ' zero'}`}>{now ? `+${now}` : '0'}</span>
                  <span className="pd-bar" aria-hidden="true">
                    <span style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
                  </span>
                  <span className="mono small muted pd-row-count">
                    {done}/{list.length}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
        <div className="pd-card">
          <div className="pd-card-head">
            <h2>By level</h2>
            <span className="muted small">{periodLabel} · overall</span>
          </div>
          <div className="pd-rows">
            {LEVELS.map((l) => {
              const list = problems.filter((p) => p.level === l)
              const done = list.filter((p) => statusOf(progress[p.id]) === 'solved').length
              const now = [...sum.ids].filter((id) => problemById.get(id)?.level === l).length
              return (
                <div key={l} className="pd-row">
                  <span className="pd-row-name">{LEVEL_LABEL[l]}</span>
                  <span className={`pd-row-now${now ? '' : ' zero'}`}>{now ? `+${now}` : '0'}</span>
                  <span className="pd-bar" aria-hidden="true">
                    <span style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
                  </span>
                  <span className="mono small muted pd-row-count">
                    {done}/{list.length}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="pd-review">
            <span className="stat-label">Due for review today</span>
            <span>
              <strong>{due}</strong> <span className="muted small">{due === 1 ? 'problem' : 'problems'}</span>
            </span>
            <Link to="/review" className="small">
              Open review →
            </Link>
          </div>
        </div>
      </section>

      <section className="pd-card pd-activity">
        <div className="pd-card-head">
          <div>
            <h2>Activity</h2>
            <span className="muted small">Each square is a day. Brighter means more solved.</span>
          </div>
        </div>
        <Activity activity={activity} />
      </section>

      <PointsCard />

      <OnYourOwn progress={progress} />
    </div>
  )
}

function Ring({ value, target, label, text }) {
  const pct = Math.min(1, target ? value / target : 0)
  const r = 26
  const c = 2 * Math.PI * r
  const done = value >= target
  return (
    <div className="pd-goal-item">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${label}: ${text}`}>
        <circle cx="32" cy="32" r={r} className="pd-ring-track" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className={`pd-ring${done ? ' done' : ''}`}
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="37" textAnchor="middle" className="pd-ring-pct">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div>
        <div className="stat-label">{label}</div>
        <div className="pd-goal-value">{text}</div>
        <div className={`small ${done ? 'pd-goal-done' : 'muted'}`}>{done ? '✓ Reached' : 'In progress'}</div>
      </div>
    </div>
  )
}

// Today against the daily goal, the days in a row it was met, and a form to change it
function GoalCard({ totals, today }) {
  const [goal, setGoalState] = useState(readGoal)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goal)
  const t = totals.get(today) ?? { solved: 0, seconds: 0 }
  const streak = goalStreak(totals, goal)
  const met = goalMet(t, goal)
  let best = 0
  for (const v of totals.values()) if (goalMet(v, goal)) best++
  function save(e) {
    e.preventDefault()
    const next = { solved: Math.max(1, Math.min(100, Math.round(Number(draft.solved) || 0))), minutes: Math.max(5, Math.min(720, Math.round(Number(draft.minutes) || 0))) }
    setGoalState(next)
    setEditing(false)
    try {
      localStorage.setItem(GOAL_KEY, JSON.stringify(next))
    } catch {
      // storage blocked: the goal lasts for this visit
    }
  }
  return (
    <section className="pd-card pd-goal">
      <div className="pd-card-head">
        <div>
          <h2>Daily goal</h2>
          <span className="muted small">
            {met ? 'Goal reached for today.' : `${goal.solved} ${goal.solved === 1 ? 'problem' : 'problems'} and ${formatDuration(goal.minutes * 60)} a day.`}
          </span>
        </div>
        {!editing && (
          <button
            className="pd-link-btn small"
            onClick={() => {
              setDraft(goal)
              setEditing(true)
            }}
          >
            Change goal
          </button>
        )}
      </div>
      {editing ? (
        <form className="pd-goal-form" onSubmit={save}>
          <label>
            <span>Problems a day</span>
            <input type="number" min="1" max="100" value={draft.solved} onChange={(e) => setDraft({ ...draft, solved: e.target.value })} />
          </label>
          <label>
            <span>Minutes a day</span>
            <input type="number" min="5" max="720" step="5" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm">
            Save
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="pd-goal-body">
          <Ring value={t.solved} target={goal.solved} label="Problems" text={`${t.solved} of ${goal.solved}`} />
          <Ring
            value={Math.floor(t.seconds / 60)}
            target={goal.minutes}
            label="Time"
            text={`${formatDuration(t.seconds)} of ${formatDuration(goal.minutes * 60)}`}
          />
          <div className="pd-goal-item pd-goal-stats">
            <div>
              <div className="stat-label">Goal streak</div>
              <div className="pd-goal-value">
                {streak} {streak === 1 ? 'day' : 'days'}
              </div>
              <div className="muted small">
                {best} {best === 1 ? 'day' : 'days'} met in all
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Kpi({ label, value, hint }) {
  return (
    <div className="stat pd-kpi">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  )
}

// The chart's width follows its card, so labels stay readable on a phone and on a wide screen.
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function ChartCard({ title, sub, rows, value, tableHead, children }) {
  const [ref, width] = useWidth()
  const [table, setTable] = useState(false)
  return (
    <div className="pd-card pd-chart-card">
      <div className="pd-card-head">
        <div>
          <h2>{title}</h2>
          <span className="muted small">{sub}</span>
        </div>
        <button className="pd-link-btn small" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <div ref={ref} className="pd-chart">
        {table ? (
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>{tableHead}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.from}>
                    <td>{b.label}</td>
                    <td className="mono">{value(b)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          width > 0 && children(width)
        )}
      </div>
    </div>
  )
}

const H = 200
const PAD = { top: 14, right: 10, bottom: 26, left: 32 }

// round numbers for the y axis: 0, a middle tick and the top
function niceMax(max) {
  if (max <= 4) return 4
  const step = Math.pow(10, Math.floor(Math.log10(max)))
  const m = Math.ceil(max / step)
  return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * step
}

function Axes({ width, top, rows, x, every }) {
  const innerH = H - PAD.top - PAD.bottom
  const ticks = [0, top / 2, top]
  return (
    <g>
      {ticks.map((t) => {
        const y = PAD.top + innerH - (t / top) * innerH
        return (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} className="pd-grid" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="pd-tick">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        )
      })}
      {rows.map((b, i) =>
        // counted back from the newest, so it always has a label and no two labels crowd together
        (rows.length - 1 - i) % every === 0 ? (
          <text key={b.from} x={x(i)} y={H - 8} textAnchor="middle" className="pd-tick">
            {b.label}
          </text>
        ) : null,
      )}
    </g>
  )
}

// a bar with 4px rounded top corners, sitting on the baseline
function barPath(x, y, w, h) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

const minutes = (sec) => Math.round(sec / 60)

function Bars({ rows, width, value, strong, unit, tip, max, label = 'Bar chart of problems solved' }) {
  const [hover, setHover] = useState(null)
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const top = max ?? niceMax(Math.max(0, ...rows.map(value)))
  const slot = innerW / rows.length
  const barW = Math.max(3, Math.min(28, slot - 2))
  const x = (i) => PAD.left + slot * i + slot / 2
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(innerW / 56))))
  const h = hover !== null ? rows[hover] : null
  return (
    <div className="pd-svg-wrap" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label={label}>
        <Axes width={width} top={top} rows={rows} x={x} every={every} />
        {rows.map((b, i) => {
          const v = value(b)
          const bh = (v / top) * innerH
          return (
            <g key={b.from}>
              <path d={barPath(x(i) - barW / 2, PAD.top + innerH - bh, barW, bh)} className={`pd-bar-mark${strong(b) ? '' : ' dim'}${hover === i ? ' hot' : ''}`} />
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={-1}
              />
            </g>
          )
        })}
      </svg>
      {h && (
        <div className="pd-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: 4 }}>
          <b>{unit === 'week' ? `Week of ${h.label}` : h.label}</b>
          <span>{tip ? tip(h) : `${value(h)} solved`}</span>
        </div>
      )}
    </div>
  )
}

function Line({ rows, width, value, tip, end, label = 'Line chart of problems solved at least once' }) {
  const [hover, setHover] = useState(null)
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const top = niceMax(Math.max(0, ...rows.map(value)))
  const step = rows.length > 1 ? innerW / (rows.length - 1) : 0
  const x = (i) => PAD.left + step * i
  const y = (v) => PAD.top + innerH - (v / top) * innerH
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(innerW / 56))))
  const pts = rows.map((b, i) => `${x(i)},${y(value(b))}`).join(' ')
  const area = `${PAD.left},${PAD.top + innerH} ${pts} ${x(rows.length - 1)},${PAD.top + innerH}`
  const last = rows.length - 1
  const h = hover !== null ? rows[hover] : null
  function move(e) {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.round((e.clientX - box.left - PAD.left) / (step || 1))
    setHover(Math.max(0, Math.min(last, i)))
  }
  return (
    <div className="pd-svg-wrap" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label={label} onMouseMove={move}>
        <Axes width={width} top={top} rows={rows} x={x} every={every} />
        <polygon points={area} className="pd-area" />
        <polyline points={pts} className="pd-line" />
        {h && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="pd-cross" />}
        <circle cx={x(hover ?? last)} cy={y(value(rows[hover ?? last]))} r="4.5" className="pd-dot" />
        {hover === null && (
          <text x={x(last) - 8} y={y(value(rows[last])) - 10} textAnchor="end" className="pd-end-label">
            {end ? end(rows[last]) : value(rows[last])}
          </text>
        )}
      </svg>
      {h && (
        <div className="pd-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: 4 }}>
          <b>{h.unit === 'week' ? `Week of ${h.label}` : h.label}</b>
          <span>{tip ? tip(h) : `${value(h)} solved at least once`}</span>
        </div>
      )}
    </div>
  )
}

// The problems solved in the period, latest first, once each, as a table with fixed columns
function SolvedTable({ events }) {
  const [all, setAll] = useState(false)
  const latest = new Map()
  for (const e of events) latest.set(e.id, e)
  const list = [...latest.values()].sort((a, b) => b.at.localeCompare(a.at))
  if (!list.length) return <p className="muted small pd-empty">Nothing solved in this period yet. Pick a problem and it shows up here.</p>
  const shown = all ? list : list.slice(0, 10)
  return (
    <div className="pd-solved" role="table" aria-label="Problems solved">
      <div className="pd-solved-row pd-solved-headrow" role="row">
        <span role="columnheader">Problem</span>
        <span role="columnheader" className="pd-col-section">Section</span>
        <span role="columnheader">Level</span>
        <span role="columnheader" className="pd-col-num">Time</span>
        <span role="columnheader" className="pd-col-num">Solved</span>
      </div>
      {shown.map((e) => {
        const p = problemById.get(e.id)
        const section = categoryBySlug.get(p.category)?.label
        return (
          <div key={e.id} className="pd-solved-row" role="row">
            <span role="cell" className="pd-solved-problem">
              <Link to={`/${p.category}/${p.id}`} title={p.title}>
                {p.title}
              </Link>
              <span className="muted small pd-solved-section-sm">{section}</span>
            </span>
            <span role="cell" className="muted pd-col-section">
              {section}
            </span>
            <span role="cell">
              <LevelBadge level={p.level} />
            </span>
            <span role="cell" className="mono muted pd-col-num">
              {e.seconds > 0 ? formatDuration(e.seconds) : '–'}
            </span>
            <span role="cell" className="muted pd-col-num">
              {new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
          </div>
        )
      })}
      {list.length > 10 && (
        <button className="pd-link-btn small pd-more" onClick={() => setAll(!all)}>
          {all ? 'Show the latest 10' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  )
}

// Points earned so far, the level they give, and how close the next level is.
function PointsCard() {
  const { total, level, name, into, need, solved } = usePoints()
  const pct = Math.round((into / need) * 100)
  return (
    <section className="points-card" id="points">
      <div className="points-card-level">
        <span className="points-badge">
          <span className="small">Level</span>
          <strong>{level}</strong>
        </span>
        <div>
          <div className="points-name">{name}</div>
          <div className="points-total">
            <span className="points-star">★</span> {total} points earned
          </div>
        </div>
      </div>
      <div className="points-card-next">
        <div className="points-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next level">
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="small muted">
          {need - into} points to Level {level + 1}. {solved} solved {solved === 1 ? 'problem' : 'problems'} so far.
        </div>
        <div className="small muted">
          A problem gives{' '}
          {Object.entries(POINTS)
            .map(([l, p]) => `${p} (${l.toLowerCase()})`)
            .join(', ')}
          .
        </div>
      </div>
      <Link to="/calm" className="btn btn-ghost btn-sm points-calm">
        Need a pause? Calm Corner
      </Link>
    </section>
  )
}

// Design problems solved without the reference and with at most two hints per check: the habit to grow.
function OnYourOwn({ progress }) {
  const stats = useMemo(() => independence(progress), [progress])
  const rows = [
    ['flow', 'Flow designs'],
    ['diagram', 'Architecture diagrams'],
  ].filter(([k]) => stats[k].solved > 0)
  if (!rows.length) return null
  return (
    <section className="own-card">
      <div className="practice-head">
        <span className="stat-label">Designed on your own</span>
        <span className="muted small">No reference, at most two hints per step</span>
      </div>
      {rows.map(([k, label]) => {
        const s = stats[k]
        const pct = Math.round((s.own / s.solved) * 100)
        return (
          <div key={k} className="own-row">
            <div className="own-line">
              <b>{label}</b>
              <span>
                {s.own} of {s.solved} solved <span className="muted">({pct}%)</span>
              </span>
            </div>
            <div className="own-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="muted small">
              {s.rebuilt} rebuilt from memory · {s.answer} seen the answer, not yet rebuilt · {s.hints} hint{s.hints === 1 ? '' : 's'} used
            </span>
          </div>
        )
      })}
    </section>
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

const GAP = 3
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']

// A year of days at most, Monday at the top, sized to the card: as many weeks as fit, and squares as large as fit.
// Beside it, the numbers for the same range.
function Activity({ activity }) {
  const [ref, width] = useWidth()
  const gridW = Math.max(0, width - 30)
  const weeks = Math.max(8, Math.min(53, Math.floor((gridW + GAP) / (11 + GAP))))
  const cell = Math.max(10, Math.min(16, Math.floor((gridW - (weeks - 1) * GAP) / weeks)))

  const today = new Date()
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
  const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (weeks - 1) * 7)
  const cols = []
  const months = []
  let lastMonth = -1
  let active = 0
  let solved = 0
  let best = null
  for (let w = 0; w < weeks; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      const key = todayKey(date)
      const a = activity[key]
      const future = date > today
      if (a && !future) {
        active++
        solved += a.solved || 0
        if (!best || (a.solved || 0) > best.solved) best = { key, solved: a.solved || 0 }
      }
      const level = !a ? 0 : a.solved >= 3 ? 4 : a.solved === 2 ? 3 : a.solved === 1 ? 2 : 1
      days.push({ key, level, future, a, date })
      if (d === 0 && date.getMonth() !== lastMonth) {
        months.push({ w, label: date.toLocaleDateString(undefined, { month: 'short' }) })
        lastMonth = date.getMonth()
      }
    }
    cols.push(days)
  }
  const step = cell + GAP

  return (
    <div className="pd-activity-body">
      <div ref={ref} className="pd-heat">
        {width > 0 && (
          <>
            <div className="pd-heat-months" style={{ marginLeft: 30, height: 16 }}>
              {months.map((m, i) =>
                // skip a label that would run into the next one
                i < months.length - 1 && (months[i + 1].w - m.w) * step < 28 ? null : (
                  <span key={m.w} style={{ left: m.w * step }}>
                    {m.label}
                  </span>
                ),
              )}
            </div>
            <div className="pd-heat-grid">
              <div className="pd-heat-days" style={{ gap: GAP }}>
                {DAY_LABELS.map((l, i) => (
                  <span key={i} style={{ height: cell, lineHeight: `${cell}px` }}>
                    {l}
                  </span>
                ))}
              </div>
              <div className="pd-heat-cols" style={{ gap: GAP }}>
                {cols.map((days, i) => (
                  <div key={i} className="pd-heat-col" style={{ gap: GAP }}>
                    {days.map((d) => (
                      <span
                        key={d.key}
                        className={`heat-cell heat-${d.future ? 'future' : d.level}`}
                        style={{ width: cell, height: cell }}
                        title={
                          d.future
                            ? ''
                            : `${d.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.a ? `${d.a.solved} solved, ${d.a.actions} actions` : 'no practice'}`
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="heat-legend muted small pd-heat-legend">
              Less <span className="heat-cell heat-0" /> <span className="heat-cell heat-1" /> <span className="heat-cell heat-2" />{' '}
              <span className="heat-cell heat-3" /> <span className="heat-cell heat-4" /> More
            </div>
          </>
        )}
      </div>
      <dl className="pd-activity-stats">
        <div>
          <dt>Active days</dt>
          <dd>{active}</dd>
        </div>
        <div>
          <dt>Solved in this range</dt>
          <dd>{solved}</dd>
        </div>
        <div>
          <dt>Current streak</dt>
          <dd>{streak(activity)} days</dd>
        </div>
        <div>
          <dt>Best day</dt>
          <dd>
            {best && best.solved ? (
              <>
                {best.solved} <span className="muted small">on {new Date(`${best.key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              </>
            ) : (
              '–'
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
