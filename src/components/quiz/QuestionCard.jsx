import { useMemo } from 'react'
import Markdown from '../Markdown.jsx'
import { grade, permutation } from '../../quiz/quiz.js'

const TYPE_HINT = {
  single: 'Choose one',
  multi: 'Choose all that apply',
  order: 'Put in the right order',
  match: 'Match each item',
}

// Default response for a question nobody has touched yet (an order puzzle starts shuffled).
export function initialResponse(q, seed) {
  return q.type === 'order' ? permutation(q.items.length, seed) : q.type === 'multi' ? [] : q.type === 'match' ? {} : null
}

// A saved response only counts if it still fits the question — the content may have changed since it was saved.
export function fitsQuestion(q, r) {
  if (r == null) return false
  const n = (q.options ?? q.items ?? q.pairs ?? []).length
  const index = (v) => Number.isInteger(v) && v >= 0 && v < n
  switch (q.type) {
    case 'single':
      return index(r)
    case 'multi':
      return Array.isArray(r) && r.every(index)
    case 'order':
      return Array.isArray(r) && r.length === n && new Set(r).size === n && r.every(index)
    case 'match':
      return typeof r === 'object' && !Array.isArray(r)
    default:
      return false
  }
}

export default function QuestionCard({ q, number, seed, response, onChange, submitted }) {
  const order = useMemo(
    () => permutation(q.type === 'match' ? q.pairs.length : (q.options ?? q.items).length, seed),
    [q, seed],
  )
  const correct = submitted && grade(q, response)

  return (
    <div className={`question${submitted ? (correct ? ' correct' : ' wrong') : ''}`}>
      <div className="question-head">
        <span className="question-num mono">Q{number}</span>
        <span className="question-hint muted small">{TYPE_HINT[q.type]}</span>
        {submitted && <span className={`question-mark ${correct ? 'ok-text' : 'err-text'}`}>{correct ? '✓ Correct' : '✗ Not quite'}</span>}
      </div>
      <div className="question-prompt">
        <Markdown>{q.prompt}</Markdown>
      </div>

      {(q.type === 'single' || q.type === 'multi') && (
        <div className="options">
          {order.map((oi) => {
            const chosen = q.type === 'single' ? response === oi : response?.includes(oi)
            const isAnswer = q.type === 'single' ? q.answer === oi : q.answer.includes(oi)
            const state = submitted ? (isAnswer ? 'is-answer' : chosen ? 'is-wrong' : '') : ''
            return (
              <label key={oi} className={`option ${chosen ? 'chosen' : ''} ${state}`}>
                <input
                  type={q.type === 'single' ? 'radio' : 'checkbox'}
                  name={seed}
                  checked={Boolean(chosen)}
                  disabled={submitted}
                  onChange={() =>
                    onChange(
                      q.type === 'single'
                        ? oi
                        : chosen
                          ? response.filter((x) => x !== oi)
                          : [...(response ?? []), oi],
                    )
                  }
                />
                <span>{q.options[oi]}</span>
              </label>
            )
          })}
        </div>
      )}

      {q.type === 'order' && (
        <ol className="order-list">
          {response.map((ii, pos) => (
            <li key={ii} className={submitted ? (ii === pos ? 'is-answer' : 'is-wrong') : ''}>
              <span className="order-pos mono">{pos + 1}</span>
              <span className="order-text">{q.items[ii]}</span>
              {!submitted && (
                <span className="order-btns">
                  <button
                    className="icon-btn"
                    disabled={pos === 0}
                    onClick={() => onChange(swap(response, pos, pos - 1))}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="icon-btn"
                    disabled={pos === response.length - 1}
                    onClick={() => onChange(swap(response, pos, pos + 1))}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {q.type === 'match' && (
        <div className="match-list">
          {q.pairs.map(([left], li) => {
            const picked = response?.[li]
            const state = submitted ? (Number(picked) === li ? 'is-answer' : 'is-wrong') : ''
            return (
              <div key={li} className={`match-row ${state}`}>
                <span className="match-left">{left}</span>
                <select
                  className="input"
                  value={picked ?? ''}
                  disabled={submitted}
                  onChange={(e) => onChange({ ...response, [li]: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">Choose…</option>
                  {order.map((ri) => (
                    <option key={ri} value={ri}>
                      {q.pairs[ri][1]}
                    </option>
                  ))}
                </select>
                {submitted && Number(picked) !== li && <span className="match-fix small ok-text">→ {q.pairs[li][1]}</span>}
              </div>
            )
          })}
        </div>
      )}

      {submitted && (
        <div className="question-explain">
          {q.type === 'order' && !correct && (
            <p className="small">
              <b>Correct order:</b> {q.items.map((it, i) => `${i + 1}. ${it}`).join('  ·  ')}
            </p>
          )}
          <Markdown>{q.explain}</Markdown>
        </div>
      )}
    </div>
  )
}

function swap(list, a, b) {
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}
