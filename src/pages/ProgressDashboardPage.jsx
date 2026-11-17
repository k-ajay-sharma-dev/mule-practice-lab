import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES, categoryBySlug } from '../data/categories.js'
import { problemById, problems } from '../data/problems.js'
import { LevelBadge } from '../components/Badges.jsx'
import { statusOf, todayKey, useActivity, useProgress, useReview } from '../store/progress.js'
import { POINTS, usePoints } from '../store/points.js'
import { independence } from '../study/independence.js'
import { buckets, firstSolves, formatDuration, PERIODS, periodStart, periodSummary, solveEvents } from '../study/progressStats.js'

// One screen for how you are doing: what you solved today, this week, this month or in all, a chart of problems
// solved, the learning graph (problems solved at least once over time), progress per section and level, points,
// the activity heatmap and the problems solved in the period. The Learning Path page keeps the path itself.
const PERIOD_KEY = 'pl.dashboard.period'
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']
const LEVEL_LABEL = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced', EXPERT: 'Expert' }

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

  const data = useMemo(() => {
    const events = solveEvents(progress)
    const first = firstSolves(events)
    const solvedNow = problems.filter((p) => statusOf(progress[p.id]) === 'solved').length
    const base = Math.max(0, solvedNow - first.size)
    const from = periodStart(period)
    const sum = periodSummary({ events, activity, first, from })
    const chart = buckets({ period, events, activity, first, base })
    return { events, first, solvedNow, from, sum, chart }
  }, [progress, activity, period])

  const { sum, chart, from, solvedNow } = data
  const periodLabel = PERIODS.find((p) => p.key === period).label.toLowerCase()
  const today = todayKey()
  const due = Object.entries(review).filter(([id, r]) => r.due <= today && problemById.has(id)).length
  const unit = chart[0]?.unit ?? 'day'
  const inPeriod = (b) => !from || b.to >= from

  return (
    <div className="pd-page">
      <header className="pd-head">
        <div>
          <p className="eyebrow">// dashboard</p>
          <h1>Dashboard</h1>
          <p className="muted">What you solved, how much time it took, and how your learning is growing.</p>
        </div>
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
      </header>

      <section className="pd-kpis">
        <Kpi
          label={`Solved ${periodLabel}`}
          value={sum.solved}
          hint={sum.solved ? `${sum.firstTime} first time${sum.again ? `, ${sum.again} again` : ''}` : 'Nothing solved yet'}
        />
        <Kpi label="Time practised" value={formatDuration(sum.seconds)} hint={sum.avgSeconds ? `${formatDuration(sum.avgSeconds)} per solve` : 'Timed solves only'} />
        <Kpi label="Within estimate" value={sum.inTimePct === null ? '–' : `${sum.inTimePct}%`} hint="Solved inside the estimated time" />
        <Kpi label="Active days" value={sum.activeDays} hint={`${sum.actions} practice actions`} />
        <Kpi label="Day streak" value={streak(activity)} hint={`${Object.keys(activity).length} active days in all`} />
        <Kpi label="Total solved" value={`${solvedNow} / ${problems.length}`} hint={`${problems.length ? Math.round((solvedNow / problems.length) * 100) : 0}% of all problems`} />
      </section>

      <section className="pd-charts">
        <ChartCard
          title="Problems solved"
          sub={period === 'all' ? `Per ${unit}.` : `Per ${unit}. Bright bars are ${periodLabel}.`}
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

      <PointsCard />

      <OnYourOwn progress={progress} />

      <section className="pd-split">
        <div className="pd-card">
          <div className="pd-card-head">
            <h2>Solved {periodLabel}</h2>
            <span className="muted small">{sum.ids.size ? `${sum.ids.size} problems` : ''}</span>
          </div>
          <SolvedList events={sum.events} />
        </div>
        <div className="pd-card">
          <div className="pd-card-head">
            <h2>Activity</h2>
            <span className="muted small">Last 18 weeks</span>
          </div>
          <Heatmap activity={activity} />
        </div>
      </section>
    </div>
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

function Bars({ rows, width, value, strong, unit }) {
  const [hover, setHover] = useState(null)
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const top = niceMax(Math.max(0, ...rows.map(value)))
  const slot = innerW / rows.length
  const barW = Math.max(3, Math.min(28, slot - 2))
  const x = (i) => PAD.left + slot * i + slot / 2
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(innerW / 56))))
  const h = hover !== null ? rows[hover] : null
  return (
    <div className="pd-svg-wrap" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label="Bar chart of problems solved">
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
          <span>
            {value(h)} solved
          </span>
        </div>
      )}
    </div>
  )
}

function Line({ rows, width, value }) {
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
      <svg width={width} height={H} role="img" aria-label="Line chart of problems solved at least once" onMouseMove={move}>
        <Axes width={width} top={top} rows={rows} x={x} every={every} />
        <polygon points={area} className="pd-area" />
        <polyline points={pts} className="pd-line" />
        {h && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="pd-cross" />}
        <circle cx={x(hover ?? last)} cy={y(value(rows[hover ?? last]))} r="4.5" className="pd-dot" />
        {hover === null && (
          <text x={x(last) - 8} y={y(value(rows[last])) - 10} textAnchor="end" className="pd-end-label">
            {value(rows[last])}
          </text>
        )}
      </svg>
      {h && (
        <div className="pd-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: 4 }}>
          <b>{h.unit === 'week' ? `Week of ${h.label}` : h.label}</b>
          <span>{value(h)} solved at least once</span>
        </div>
      )}
    </div>
  )
}

// The problems solved in the period, latest first, once each
function SolvedList({ events }) {
  const latest = new Map()
  for (const e of events) latest.set(e.id, e)
  const list = [...latest.values()].sort((a, b) => b.at.localeCompare(a.at))
  if (!list.length) return <p className="muted small">Nothing solved in this period yet. Pick a problem and it shows up here.</p>
  return (
    <ul className="pd-solved">
      {list.slice(0, 12).map((e) => {
        const p = problemById.get(e.id)
        return (
          <li key={e.id}>
            <Link to={`/${p.category}/${p.id}`} className="pd-solved-title">
              {p.title}
            </Link>
            <span className="pd-solved-meta">
              <span className="muted small">{categoryBySlug.get(p.category)?.label}</span>
              <LevelBadge level={p.level} />
              {e.seconds > 0 && <span className="mono small muted">{formatDuration(e.seconds)}</span>}
              <span className="small muted">{new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </span>
          </li>
        )
      })}
      {list.length > 12 && <li className="muted small">+ {list.length - 12} more</li>}
    </ul>
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
