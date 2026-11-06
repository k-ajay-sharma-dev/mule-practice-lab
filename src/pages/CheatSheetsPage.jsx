import { useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { CHEATSHEETS } from '../data/cheatsheets.js'
import NotFound from './NotFound.jsx'

// `code` in a cell is the only markup the sheets use
function Cell({ text }) {
  return String(text)
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
        <code key={i} className={part.includes('\n') ? 'snippet' : undefined}>
          {part.slice(1, -1)}
        </code>
      ) : (
        part
      ),
    )
}

export default function CheatSheetsPage() {
  const { slug = CHEATSHEETS[0].slug } = useParams()
  const [query, setQuery] = useState('')
  const sheet = CHEATSHEETS.find((s) => s.slug === slug)
  if (!sheet) return <NotFound />

  const q = query.trim().toLowerCase()
  const sections = sheet.sections
    .map((s) => ({
      ...s,
      rows: q && !s.title.toLowerCase().includes(q) ? s.rows.filter((r) => r.slice(0, s.columns.length).join(' ').toLowerCase().includes(q)) : s.rows,
    }))
    .filter((s) => s.rows.length)

  return (
    <div className="sheet-page">
      <p className="eyebrow no-print">// cheat sheets</p>
      <h1>{sheet.title}</h1>
      <p className="muted">{sheet.blurb}</p>

      <div className="search-examples no-print">
        {CHEATSHEETS.map((s) => (
          <NavLink key={s.slug} to={`/cheatsheets/${s.slug}`} className={({ isActive }) => `chip-btn${isActive || s.slug === slug ? ' active' : ''}`}>
            {s.title}
          </NavLink>
        ))}
      </div>
      <div className="sheet-tools">
        <input className="input" type="search" placeholder="Filter this sheet" aria-label="Filter this sheet" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {sections.map((s) => (
        <section key={s.title} className="sheet-section">
          <h2>{s.title}</h2>
          {s.note && (
            <p className="muted small">
              <Cell text={s.note} />
            </p>
          )}
          <div className="sheet-scroll">
            <table className="sheet-table">
              <thead>
                <tr>
                  {s.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((row, i) => (
                  <tr key={i}>
                    {row.slice(0, s.columns.length).map((cell, j) => (
                      <td key={j}>
                        <Cell text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {sections.length === 0 && (
        <div className="empty-row muted problem-table">
          Nothing matches “{query}”. Try <Link to="/search">searching all problems</Link>.
        </div>
      )}
    </div>
  )
}
