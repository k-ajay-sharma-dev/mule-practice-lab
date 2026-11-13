import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from '../Markdown.jsx'
import { FAILS } from '../../quiz/output-question.js'
import { gradeWrite } from '../../logging/grade.js'
import { LEVELS } from '../../logging/rules.js'
import { grade, permutation } from '../../quiz/quiz.js'

const TYPE_HINT = {
  single: 'Choose one',
  multi: 'Choose all that apply',
  order: 'Put in the right order',
  match: 'Match each item',
  level: 'Pick the level',
  logger: 'Write the logger',
}

// Default response for a question nobody has touched yet (an order puzzle starts shuffled).
export function initialResponse(q, seed) {
  if (q.type === 'logger') return { level: '', message: '' }
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
    case 'level':
      return LEVELS.includes(r)
    case 'logger':
      return typeof r === 'object' && typeof r.level === 'string' && typeof r.message === 'string'
    default:
      return false
  }
}

export default function QuestionCard({ q, number, seed, response, onChange, submitted }) {
  const order = useMemo(
    () => permutation(q.type === 'match' ? q.pairs.length : (q.options ?? q.items ?? LEVELS).length, seed),
    [q, seed],
  )
  const correct = submitted && grade(q, response)

  return (
    <div className={`question${submitted ? (correct ? ' correct' : ' wrong') : ''}`}>
      <div className="question-head">
        <span className="question-num mono">Q{number}</span>
        <span className="question-hint muted small">{TYPE_HINT[q.type]}</span>
        {q.detail && <span className="question-detail small" title="An exact limit, default or name you learn by reading the docs">Detail</span>}
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
                {q.code && q.options[oi] !== FAILS ? <code className="option-code">{q.options[oi]}</code> : <span>{q.options[oi]}</span>}
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

      {q.type === 'level' && (
        <div className="level-picks">
          {LEVELS.map((l) => {
            const state = submitted ? (q.answer.includes(l) ? 'is-answer' : response === l ? 'is-wrong' : '') : ''
            return (
              <button key={l} className={`btn level-pick${response === l ? ' chosen' : ''} ${state}`} disabled={submitted} onClick={() => onChange(l)}>
                {l}
              </button>
            )
          })}
        </div>
      )}

      {q.type === 'logger' && <LoggerAnswer q={q} response={response} onChange={onChange} submitted={submitted} />}

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

// Write the logger: pick its level and write its message. After Submit, every rule shows as passed or what to change,
// with a good answer to compare.
function LoggerAnswer({ q, response, onChange, submitted }) {
  const saved = response ?? { level: '', message: '' }
  // the message is typed into local state and saved after a short pause, so a key press does not redraw the app
  const [message, setMessage] = useState(saved.message)
  const pending = useRef(null)
  useEffect(() => setMessage(saved.message), [saved.message])
  useEffect(() => () => pending.current?.(), [])
  function type(text) {
    setMessage(text)
    clearTimeout(pending.timer)
    const save = () => {
      pending.current = null
      onChange({ ...saved, message: text })
    }
    pending.current = save
    pending.timer = setTimeout(save, 400)
  }
  const answer = { ...saved, message }
  const result = submitted ? gradeWrite(q, answer) : null
  return (
    <div className="logger-answer">
      <div className="small muted logger-available">
        You can use:
        {q.available.map((a) => (
          <code key={a}>{a}</code>
        ))}
      </div>
      <div className="logger-field">
        <span className="small">Level</span>
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l} className={answer.level === l ? 'active' : ''} disabled={submitted} onClick={() => onChange({ ...answer, level: l })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <label className="logger-field">
        <span className="small">Message (the message attribute of the Logger)</span>
        <textarea
          className="input mono logger-message"
          rows={3}
          spellCheck={false}
          placeholder={'#["Order received orderId=$(vars.orderId) correlationId=$(correlationId)"]'}
          value={answer.message}
          readOnly={submitted}
          onChange={(e) => type(e.target.value)}
          onBlur={() => pending.current?.()}
        />
      </label>
      {result && (
        <>
          <ul className="logger-notes">
            {result.notes.map((n, i) => (
              <li key={i} className={n.ok ? 'ok-text' : 'err-text'}>
                {n.ok ? '✓' : '✗'} {n.text}
              </li>
            ))}
          </ul>
          <div className="small muted">A good answer ({q.model.level})</div>
          <pre className="code-block logger-model">{q.model.message}</pre>
        </>
      )}
    </div>
  )
}

function swap(list, a, b) {
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}
