import { useMemo, useState } from 'react'
import CodeEditor from '../components/CodeEditor.jsx'
import FollowUps from '../components/FollowUps.jsx'
import Markdown from '../components/Markdown.jsx'
import { useSidebarRoom } from '../components/sidebar.js'
import { parseRaml, ramlChecks, ramlHint, runRamlChecks } from '../raml/checks.js'
import { updateEntry, useEntry, workedStatus } from '../store/progress.js'
import { rate } from '../store/rating.js'
import { useAutosave } from './useAutosave.js'

const TABS = ['scenario', 'checks', 'reference', 'notes']
const RATINGS = [
  { status: 'solved', label: 'Solved' },
  { status: 'attempted', label: 'Partial' },
  { status: 'revisit', label: 'Revisit' },
]
const BLANK = '#%RAML 1.0\ntitle: \n'

// guided adds the hints on failed checks. A mock interview turns them off.
export default function RamlWorkspace({ problem, guided = true }) {
  const entry = useEntry(problem.id)
  const starter = problem.starter ?? BLANK
  const [text, setText] = useState(() => (typeof entry.raml === 'string' ? entry.raml : starter))
  const [tab, setTab] = useState('scenario')
  const [results, setResults] = useState(null)
  const [checkedOn, setCheckedOn] = useState(null)

  useAutosave(text, (value) => updateEntry(problem.id, { raml: value, status: workedStatus(problem.id) }))
  useSidebarRoom()

  const checks = useMemo(() => ramlChecks(problem), [problem])
  const parsed = useMemo(() => parseRaml(text), [text])
  const hintSource = useMemo(() => (checkedOn === null ? null : parseRaml(checkedOn)), [checkedOn])
  const checked = Array.isArray(entry.checkedPoints) ? entry.checkedPoints : []

  function checkRaml() {
    const r = runRamlChecks(parsed, checks)
    setResults(r)
    setCheckedOn(text)
    setTab('checks')
    if (r.every((c) => c.pass)) updateEntry(problem.id, { raml: text, status: 'solved' }, { graded: true })
  }

  function togglePoint(i) {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i]
    updateEntry(problem.id, { checkedPoints: next })
  }

  const passed = results?.filter((r) => r.pass).length ?? 0

  return (
    <div className="workspace raml-workspace">
      <section className="panel left-panel">
        <div className="panel-tabs">
          {TABS.map((t) => (
            <button key={t} className={`panel-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'checks' ? `Checks (${checks.length})` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'scenario' && (
            <>
              <Markdown>{problem.description}</Markdown>
              <div className="reveal-gate">
                <p className="muted small">Write the RAML in the editor. It is checked against the requirements, and Ctrl+Enter runs the check.</p>
                <button className="btn btn-primary" onClick={checkRaml}>
                  Check RAML
                </button>
              </div>
            </>
          )}

          {tab === 'checks' && (
            <div className="stack">
              {results && (
                <div className={`match-banner ${passed === checks.length ? 'pass' : 'fail'}`}>
                  {passed} / {checks.length} requirements met{passed === checks.length && ' — solved!'}
                </div>
              )}
              <ul className="check-list">
                {checks.map((c, i) => {
                  const r = results?.[i]
                  return (
                    <li key={i} className={r ? (r.pass ? 'pass' : 'fail') : ''}>
                      <span className="mark">{r ? (r.pass ? '✓' : '✗') : '○'}</span>
                      <span>
                        {c.label}
                        {guided && r && !r.pass && hintSource && <span className="check-hint muted small">{ramlHint(hintSource, c.rule)}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <button className="btn btn-primary" onClick={checkRaml}>
                Check RAML
              </button>
            </div>
          )}

          {tab === 'reference' &&
            (!entry.revealed ? (
              <div className="reveal-gate">
                <p className="muted">Finish your RAML first. Revealing the reference is recorded on this problem.</p>
                <button className="btn btn-primary" onClick={() => updateEntry(problem.id, { revealed: true })}>
                  Reveal reference
                </button>
              </div>
            ) : (
              <div className="reference">
                <div className="section-title">Reference RAML</div>
                <div className="raml-reference">
                  <CodeEditor language="yaml" value={problem.referenceRaml} readOnly height="360px" />
                </div>
                {problem.keyPoints?.length > 0 && (
                  <div className="key-points">
                    <div className="section-title">
                      Key points{' '}
                      <span className="muted">
                        ({checked.length} / {problem.keyPoints.length} covered)
                      </span>
                    </div>
                    {problem.keyPoints.map((kp, i) => (
                      <label key={i} className="key-point">
                        <input type="checkbox" checked={checked.includes(i)} onChange={() => togglePoint(i)} />
                        <span>{kp}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="section-title">Reference answer</div>
                <Markdown>{problem.solution}</Markdown>
                <FollowUps items={problem.followUps} />
                <div className="section-title">How did you do?</div>
                <div className="rating">
                  {RATINGS.map((r) => (
                    <button
                      key={r.status}
                      className={`btn rating-btn rating-${r.status} ${entry.status === r.status ? 'active' : ''}`}
                      onClick={() => rate(problem.id, r.status)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {tab === 'notes' && (
            <textarea
              className="notes"
              placeholder="Your notes for this problem…"
              value={entry.notes || ''}
              onChange={(e) => updateEntry(problem.id, { notes: e.target.value })}
            />
          )}
        </div>
      </section>

      <section className="panel right-panel raml-editor-panel">
        <div className="raml-toolbar">
          <span className={`raml-status ${parsed.errors.length ? 'bad' : 'good'}`}>
            {parsed.errors.length ? `${parsed.errors.length} ${parsed.errors.length === 1 ? 'problem' : 'problems'} in the file` : 'No errors in the file'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => window.confirm('Start again from the starter file?') && setText(starter)}>
            Reset
          </button>
          <button className="btn btn-primary btn-sm" onClick={checkRaml}>
            Check RAML
          </button>
        </div>
        <div className="raml-editor">
          <CodeEditor language="yaml" value={text} onChange={setText} onRun={checkRaml} />
        </div>
        {parsed.errors.length > 0 && (
          <ul className="raml-errors small">
            {parsed.errors.slice(0, 5).map((e, i) => (
              <li key={i}>
                <span className="mono">Line {e.line}</span> {e.message}
              </li>
            ))}
            {parsed.errors.length > 5 && <li className="muted">And {parsed.errors.length - 5} more.</li>}
          </ul>
        )}
      </section>
    </div>
  )
}
