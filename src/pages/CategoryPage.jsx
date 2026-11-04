import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { categoryBySlug, LEVELS, STATUSES } from '../data/categories.js'
import { problemsFor } from '../data/problems.js'
import { statusOf, useProgress } from '../store/progress.js'
import { useState } from 'react'
import { LevelBadge, StatusBadge, Tags } from '../components/Badges.jsx'
import Pagination, { PAGE_SIZES, paginate } from '../components/Pagination.jsx'
import { EXERCISE_LABELS, exerciseOf } from '../data/exercises.js'
import NotFound from './NotFound.jsx'

const SIZE_KEY = 'pl.pageSize'

function loadPageSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return PAGE_SIZES.includes(n) ? n : 20
  } catch {
    return 20
  }
}

export default function CategoryPage() {
  const { category } = useParams()
  const [params, setParams] = useSearchParams()
  const progress = useProgress()
  const navigate = useNavigate()
  const [pageSize, setPageSize] = useState(loadPageSize)

  const cat = categoryBySlug.get(category)
  if (!cat) return <NotFound />

  const all = problemsFor(category)
  const q = params.get('q') || ''
  const level = params.get('level') || ''
  const status = params.get('status') || ''
  const tag = params.get('tag') || ''
  const mode = params.get('mode') || ''

  const allTags = [...new Set(all.flatMap((p) => p.tags))].sort()
  // exercise types present in this tab; only worth a filter when there is more than one
  const modes = [...new Set(all.map(exerciseOf))]
  const filtered = all.filter(
    (p) =>
      (!level || p.level === level) &&
      (!status || statusOf(progress[p.id]) === status) &&
      (!tag || p.tags.includes(tag)) &&
      (!mode || exerciseOf(p) === mode) &&
      (!q || `${p.title} ${p.id} ${p.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  )
  const solvedCount = all.filter((p) => statusOf(progress[p.id]) === 'solved').length
  const hasFilters = q || level || status || tag || mode
  const paged = paginate(filtered, Number(params.get('page')) || 1, pageSize)

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page') // a new filter starts again from page 1
    setParams(next, { replace: true })
  }

  function goToPage(page) {
    const next = new URLSearchParams(params)
    if (page > 1) next.set('page', String(page))
    else next.delete('page')
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  function changePageSize(size) {
    setPageSize(size)
    try {
      localStorage.setItem(SIZE_KEY, String(size))
    } catch {
      // storage unavailable: keep the size for this visit only
    }
    goToPage(1)
  }

  const pager = (
    <Pagination
      page={paged.page}
      pageCount={paged.pageCount}
      total={filtered.length}
      start={paged.start}
      shown={paged.items.length}
      onPage={goToPage}
      size={pageSize}
      onSize={changePageSize}
    />
  )

  function openRandomUnsolved() {
    const pool = all.filter((p) => statusOf(progress[p.id]) !== 'solved')
    if (pool.length) navigate(`/${category}/${pool[Math.floor(Math.random() * pool.length)].id}`)
  }

  return (
    <div className="category-page">
      <section className="category-head">
        <div>
          <p className="eyebrow">
            // {cat.eyebrow}
          </p>
          <h1>{cat.label}</h1>
          <p className="muted">{cat.blurb}</p>
        </div>
        <div className="progress-card">
          <div className="progress-num">
            {solvedCount}
            <span className="muted"> / {all.length}</span>
          </div>
          <div className="muted small">solved</div>
          <div className="progress-bar">
            <div style={{ width: `${all.length ? (solvedCount / all.length) * 100 : 0}%` }} />
          </div>
        </div>
      </section>

      <section className="filters">
        <input
          className="input search"
          type="search"
          placeholder="Search problems…"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
        />
        <select className="input" value={level} onChange={(e) => setParam('level', e.target.value)}>
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l[0] + l.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="input" value={tag} onChange={(e) => setParam('tag', e.target.value)}>
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        {modes.length > 1 && (
          <select className="input" value={mode} onChange={(e) => setParam('mode', e.target.value)}>
            <option value="">All exercise types</option>
            {modes.map((m) => (
              <option key={m} value={m}>
                {EXERCISE_LABELS[m]}
              </option>
            ))}
          </select>
        )}
        <button className="btn" onClick={openRandomUnsolved} disabled={solvedCount === all.length}>
          Random unsolved
        </button>
        {hasFilters && (
          <button className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>
            Clear
          </button>
        )}
      </section>

      <div className="problem-table" role="table">
        <div className="problem-row head" role="row">
          <span>#</span>
          <span>Problem</span>
          <span>Level</span>
          <span>Time</span>
          <span>Status</span>
        </div>
        {paged.items.map((p, i) => (
          <Link key={p.id} to={`/${category}/${p.id}`} className="problem-row" role="row">
            <span className="row-num">{String(paged.start + i + 1).padStart(2, '0')}</span>
            <span className="row-title">
              <span className="title">{p.title}</span>
              <span className="row-meta">
                <span className="mono muted">{p.id.toUpperCase()}</span>
                {cat.kind === 'self' && (
                  <span className={`mode-chip mode-${exerciseOf(p)}`}>{EXERCISE_LABELS[exerciseOf(p)]}</span>
                )}
                <Tags tags={p.tags} />
              </span>
            </span>
            <span>
              <LevelBadge level={p.level} />
            </span>
            <span className="mono muted">{p.estMinutes}m</span>
            <span>
              <StatusBadge status={statusOf(progress[p.id])} />
            </span>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="empty-row muted">{all.length ? 'No problems match these filters.' : 'No problems yet.'}</div>
        )}
      </div>
      {pager}
    </div>
  )
}
