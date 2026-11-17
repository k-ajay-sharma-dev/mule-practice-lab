import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { categoryBySlug } from '../data/categories.js'
import { problemById } from '../data/problems.js'
import { clearMistakes, useMistakes } from '../store/mistakes.js'
import { statusOf, useProgress } from '../store/progress.js'

// The mistakes that keep coming back on flow and architecture designs: the settings you set differently from the
// reference, the parts failed checks were about, and the problems to practise again. Built from Check design and
// Find it (see store/mistakes.js).
export default function MistakesPage() {
  const mistakes = useMistakes()
  const progress = useProgress()

  const { settings, parts, retry } = useMemo(() => {
    const settings = new Map() // "HTTP Request · Response timeout (ms)" → { count, problems, last }
    const parts = new Map() // "On Error Continue" → { count, problems }
    const byProblem = new Map() // id → { count, checks, last }
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
      const b = byProblem.get(m.id) ?? { id: m.id, count: 0, checks: new Set(), last: m.at }
      b.count++
      b.checks.add(m.check)
      byProblem.set(m.id, b)
    }
    const top = (map) => [...map.values()].sort((a, b) => b.problems.size - a.problems.size || b.count - a.count)
    return {
      settings: top(settings).slice(0, 12),
      parts: top(parts).slice(0, 12),
      retry: [...byProblem.values()].filter((b) => problemById.has(b.id)).sort((a, b) => b.checks.size - a.checks.size || b.last.localeCompare(a.last)).slice(0, 15),
    }
  }, [mistakes])

  const link = (id) => {
    const p = problemById.get(id)
    return p ? `/${p.category}/${p.id}` : '/'
  }

  return (
    <div className="mistakes-page">
      <p className="eyebrow">// mistakes</p>
      <h1>Mistakes I keep making</h1>
      <p className="muted">
        What went wrong on your flow and architecture designs, gathered from Check design and Find it. The ones at the top
        come back across the most problems, so they are worth practising on purpose.
      </p>

      {mistakes.length === 0 ? (
        <div className="empty-row muted">
          Nothing yet. When Check design finds a failing check on a flow or architecture problem, or you open Find it, it
          shows up here.
        </div>
      ) : (
        <>
          {settings.length > 0 && (
            <section className="mistakes-section">
              <h2>Settings you set differently from the reference</h2>
              <ul className="mistakes-list">
                {settings.map((s) => (
                  <li key={`${s.part}-${s.field}`}>
                    <span>
                      <b>{s.field}</b> <span className="muted">on {s.part}</span>
                    </span>
                    <span className="muted small">
                      last time yours <span className="mono err-text">{s.last.mine || '(empty)'}</span>, reference{' '}
                      <span className="mono ok-text">{s.last.ref || '(empty)'}</span>
                    </span>
                    <span className="mistakes-count small">
                      {s.problems.size} problem{s.problems.size === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {parts.length > 0 && (
            <section className="mistakes-section">
              <h2>Parts your failed checks were about</h2>
              <div className="mistakes-chips">
                {parts.map((p) => (
                  <span key={p.part} className="mistakes-chip" title={`${p.count} failed checks across ${p.problems.size} problems`}>
                    {p.part} <b>{p.problems.size}</b>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="mistakes-section">
            <h2>Practise these again</h2>
            <ul className="mistakes-list">
              {retry.map((b) => {
                const p = problemById.get(b.id)
                const solved = statusOf(progress[b.id]) === 'solved'
                return (
                  <li key={b.id}>
                    <span>
                      <Link to={link(b.id)}>{p.title}</Link> <span className="mono muted small">{p.id.toUpperCase()}</span>
                    </span>
                    <span className="muted small">
                      {categoryBySlug.get(p.category)?.label} · {b.checks.size} check{b.checks.size === 1 ? '' : 's'} went wrong
                      {solved && ' · solved since'}
                    </span>
                    <Link className="btn btn-ghost btn-sm" to={link(b.id)}>
                      Practise
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <button className="btn btn-ghost btn-sm" onClick={() => confirm('Clear the mistakes list? This cannot be undone.') && clearMistakes()}>
            Clear the list
          </button>
        </>
      )}
    </div>
  )
}
