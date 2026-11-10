import { useMemo, useState } from 'react'
import { questionsIn, splitSections } from '../study/project-notes.js'
import Markdown from './Markdown.jsx'

// The notes as sections you can fold, with a contents list that jumps to each one.
export function NotesView({ body }) {
  const { intro, sections } = useMemo(() => splitSections(body), [body])
  const [closed, setClosed] = useState(() => new Set())
  const allClosed = sections.length > 0 && closed.size === sections.length

  function jump(id) {
    setClosed((c) => {
      const next = new Set(c)
      next.delete(id)
      return next
    })
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function toggle(id) {
    setClosed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={sections.length > 1 ? 'notes-layout' : undefined}>
      {sections.length > 1 && (
        <nav className="notes-toc" aria-label="Contents">
          <div className="notes-toc-head">
            <span className="side-group-title">Contents</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setClosed(allClosed ? new Set() : new Set(sections.map((s) => s.id)))}>
              {allClosed ? 'Open all' : 'Fold all'}
            </button>
          </div>
          {sections.map((s) => (
            <button key={s.id} className="notes-toc-link" onClick={() => jump(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
      )}
      <div className="notes-body">
        {intro && (
          <div className="project-notes">
            <Markdown>{intro}</Markdown>
          </div>
        )}
        {sections.map((s) => {
          const open = !closed.has(s.id)
          return (
            <section key={s.id} id={s.id} className="project-notes notes-section">
              <button className="notes-section-head" onClick={() => toggle(s.id)} aria-expanded={open}>
                <span className={`notes-chevron${open ? ' open' : ''}`} aria-hidden="true">
                  ▸
                </span>
                <h2>{s.title}</h2>
              </button>
              {open && s.text && <Markdown>{s.text}</Markdown>}
            </section>
          )
        })}
        {!intro && !sections.length && <p className="muted">No notes yet. Use Edit to write some.</p>}
      </div>
    </div>
  )
}

// The questions written in the notes, to answer out loud before you look.
export function PracticeView({ body }) {
  const questions = useMemo(() => questionsIn(body), [body])
  const [order, setOrder] = useState(null) // shuffled positions, or null for the notes' order
  const [shown, setShown] = useState(() => new Set())

  if (!questions.length) {
    return (
      <div className="arch-empty">
        <p>No practice questions in these notes yet.</p>
        <p className="muted small">
          Start a paragraph with a bold question, like <code>**Why not API-led?** One source and one target…</code>, and it
          appears here as a card. Paragraphs after it count as the answer until the next question or heading.
        </p>
      </div>
    )
  }

  const list = (order ?? questions.map((_, i) => i)).map((i) => ({ ...questions[i], i }))
  const flip = (i) =>
    setShown((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="practice-view">
      <div className="settings-actions">
        <span className="muted small">
          {questions.length} questions · answer out loud first, then check
        </span>
        <button
          className="btn btn-sm"
          onClick={() => {
            setOrder(questions.map((_, i) => i).sort(() => Math.random() - 0.5))
            setShown(new Set())
          }}
        >
          Shuffle
        </button>
        <button className="btn btn-sm" onClick={() => setShown(shown.size ? new Set() : new Set(questions.map((_, i) => i)))}>
          {shown.size ? 'Hide all answers' : 'Show all answers'}
        </button>
      </div>
      <ol className="practice-list">
        {list.map(({ q, a, i }) => (
          <li key={i} className="practice-card">
            <div className="practice-q">
              <strong>{q}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => flip(i)} aria-expanded={shown.has(i)}>
                {shown.has(i) ? 'Hide answer' : 'Show answer'}
              </button>
            </div>
            {shown.has(i) && <Markdown>{a}</Markdown>}
          </li>
        ))}
      </ol>
    </div>
  )
}
