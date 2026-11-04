import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CATEGORIES } from '../data/categories.js'
import { searchProblems } from '../data/search.js'
import Pagination, { paginate } from '../components/Pagination.jsx'
import ProblemList from '../components/ProblemList.jsx'

const PAGE_SIZE = 20
const EXAMPLES = ['api-led', 'activemq', 'oracle stored procedure', 'timeout', 'groupBy', 'retail', 'dlq', 'salesforce']

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const cat = params.get('cat') || ''
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const all = searchProblems(q)
  const results = cat ? all.filter((p) => p.category === cat) : all
  const paged = paginate(results, Number(params.get('page')) || 1, PAGE_SIZE)
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.slug, all.filter((p) => p.category === c.slug).length]))

  function set(patch, replace = true) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace })
  }

  return (
    <div className="search-page">
      <p className="eyebrow">// search every tab</p>
      <h1>Search</h1>
      <input
        ref={inputRef}
        className="input search-big"
        type="search"
        placeholder="Search titles, tags, ids and descriptions…"
        value={q}
        onChange={(e) => set({ q: e.target.value, cat: '' })}
      />

      {!q && (
        <div className="search-examples">
          <span className="muted small">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip-btn" onClick={() => set({ q: ex })}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {q && (
        <>
          <div className="search-facets">
            <button className={`chip-btn ${!cat ? 'active' : ''}`} onClick={() => set({ cat: '' })}>
              All <span className="muted">{all.length}</span>
            </button>
            {CATEGORIES.filter((c) => counts[c.slug]).map((c) => (
              <button key={c.slug} className={`chip-btn ${cat === c.slug ? 'active' : ''}`} onClick={() => set({ cat: c.slug })}>
                {c.label} <span className="muted">{counts[c.slug]}</span>
              </button>
            ))}
          </div>
          <ProblemList items={paged.items} empty={`No problems match “${q}”.`} />
          <Pagination
            page={paged.page}
            pageCount={paged.pageCount}
            total={results.length}
            start={paged.start}
            shown={paged.items.length}
            onPage={(page) => {
              set({ page: page > 1 ? String(page) : '' }, false)
              window.scrollTo({ top: 0 })
            }}
          />
        </>
      )}
    </div>
  )
}
