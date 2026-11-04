import { Link, useParams, useSearchParams } from 'react-router-dom'
import { LEVELS } from '../data/categories.js'
import { trackBySlug, trackProblems, TRACKS } from '../data/tracks.js'
import { statusOf, useProgress } from '../store/progress.js'
import Pagination, { paginate } from '../components/Pagination.jsx'
import ProblemList from '../components/ProblemList.jsx'
import NotFound from './NotFound.jsx'

const PAGE_SIZE = 20

export default function TracksPage() {
  const { slug } = useParams()
  return slug ? <TrackDetail slug={slug} /> : <TrackIndex />
}

function TrackIndex() {
  const progress = useProgress()
  return (
    <div className="tracks-page">
      <p className="eyebrow">// topic tracks</p>
      <h1>Topic Tracks</h1>
      <p className="muted">
        One ordered path per topic through every tab — concepts, DataWeave, flows, architecture, scenarios, incidents and
        case studies — from beginner to expert.
      </p>
      <div className="track-grid">
        {TRACKS.map((t) => {
          const list = trackProblems(t)
          const solved = list.filter((p) => statusOf(progress[p.id]) === 'solved').length
          return (
            <Link key={t.slug} to={`/tracks/${t.slug}`} className="track-card">
              <h3>{t.title}</h3>
              <p className="muted small">{t.blurb}</p>
              <div className="phase-progress">
                <div className="progress-bar">
                  <div style={{ width: `${list.length ? (solved / list.length) * 100 : 0}%` }} />
                </div>
                <span className="mono small muted">
                  {solved}/{list.length}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function TrackDetail({ slug }) {
  const progress = useProgress()
  const [params, setParams] = useSearchParams()
  const track = trackBySlug.get(slug)
  if (!track) return <NotFound />

  const all = trackProblems(track)
  const level = params.get('level') || ''
  const hideSolved = params.get('open') === '1'
  const list = all.filter((p) => (!level || p.level === level) && (!hideSolved || statusOf(progress[p.id]) !== 'solved'))
  const paged = paginate(list, Number(params.get('page')) || 1, PAGE_SIZE)
  const solved = all.filter((p) => statusOf(progress[p.id]) === 'solved').length
  const next = all.find((p) => statusOf(progress[p.id]) !== 'solved')

  function set(patch, replace = true) {
    const nextParams = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? nextParams.set(k, v) : nextParams.delete(k)
    if (!('page' in patch)) nextParams.delete('page')
    setParams(nextParams, { replace })
  }

  return (
    <div className="tracks-page">
      <Link to="/tracks" className="back-link">
        ← Topic tracks
      </Link>
      <section className="category-head">
        <div>
          <p className="eyebrow">// track</p>
          <h1>{track.title}</h1>
          <p className="muted">{track.blurb}</p>
        </div>
        <div className="progress-card">
          <div className="progress-num">
            {solved}
            <span className="muted"> / {all.length}</span>
          </div>
          <div className="muted small">solved</div>
          <div className="progress-bar">
            <div style={{ width: `${all.length ? (solved / all.length) * 100 : 0}%` }} />
          </div>
        </div>
      </section>

      <section className="filters">
        {next && (
          <Link className="btn btn-primary" to={`/${next.category}/${next.id}`}>
            Continue: {next.title} →
          </Link>
        )}
        <select className="input" value={level} onChange={(e) => set({ level: e.target.value })}>
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l[0] + l.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <label className="check-inline small">
          <input type="checkbox" checked={hideSolved} onChange={(e) => set({ open: e.target.checked ? '1' : '' })} /> Hide
          solved
        </label>
      </section>

      <ProblemList items={paged.items} start={paged.start} numbered empty={hideSolved ? 'Nothing left to solve here with these filters.' : 'No problems at this level in this track.'} />
      <Pagination
        page={paged.page}
        pageCount={paged.pageCount}
        total={list.length}
        start={paged.start}
        shown={paged.items.length}
        onPage={(page) => {
          set({ page: page > 1 ? String(page) : '' }, false)
          window.scrollTo({ top: 0 })
        }}
      />
    </div>
  )
}
