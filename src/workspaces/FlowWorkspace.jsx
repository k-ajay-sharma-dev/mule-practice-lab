import { useMemo, useState } from 'react'
import FlowDesigner from '../components/flow/FlowDesigner.jsx'
import FollowUps from '../components/FollowUps.jsx'
import Markdown from '../components/Markdown.jsx'
import { useSidebarRoom } from '../components/sidebar.js'
import StepGuide from '../components/StepGuide.jsx'
import { designChecks, missingHint, runChecks } from '../flow/checks.js'
import { compareDesigns } from '../flow/compare.js'
import { countComponents, restoreDesign } from '../flow/model.js'
import { updateEntry, useEntry, workedStatus } from '../store/progress.js'
import { rate } from '../store/rating.js'
import { flowSteps } from '../study/steps.js'
import { useAutosave } from './useAutosave.js'
import { useUndo } from './useUndo.js'

const TABS = ['scenario', 'checks', 'reference', 'notes']
const RATINGS = [
  { status: 'solved', label: 'Solved' },
  { status: 'attempted', label: 'Partial' },
  { status: 'revisit', label: 'Revisit' },
]

// Differences from the model answer, to read and think about. This is not scored.
function DesignCompare({ design, model }) {
  const { missing, extra, settings, moreSettings } = useMemo(() => compareDesigns(design, model), [design, model])
  const same = !missing.length && !extra.length && !settings.length
  const count = (c) => `${c.label} (yours ${c.yours}, model ${c.model})`
  return (
    <div className="design-compare">
      <div className="section-title">Your design and the model answer</div>
      <p className="muted small">This is not scored. A design can differ from the model answer and still be right, so ask why each difference exists.</p>
      {same && <p className="small">Your components and settings match the model answer.</p>}
      {missing.length > 0 && (
        <p className="small">
          <strong>More in the model answer:</strong> {missing.map(count).join(', ')}
        </p>
      )}
      {extra.length > 0 && (
        <p className="small">
          <strong>More in your design:</strong> {extra.map(count).join(', ')}
        </p>
      )}
      {settings.length > 0 && (
        <>
          <p className="small">
            <strong>Different settings:</strong>
          </p>
          <ul className="small">
            {settings.map((s, i) => (
              <li key={i}>
                {s.label}, {s.field}: yours {s.yours}, model {s.model}
              </li>
            ))}
          </ul>
          {moreSettings > 0 && <p className="muted small">And {moreSettings} more.</p>}
        </>
      )}
    </div>
  )
}

// guided adds the step guide and the hints on failed checks. A mock interview turns it off.
export default function FlowWorkspace({ problem, guided = true }) {
  const entry = useEntry(problem.id)
  const [design, setDesign, history] = useUndo(() => restoreDesign(entry.flow))
  const [tab, setTab] = useState('scenario')
  const [results, setResults] = useState(null)

  useAutosave(design, (value) => updateEntry(problem.id, { flow: value, status: workedStatus(problem.id) }))

  useSidebarRoom()

  const checks = useMemo(() => designChecks(problem), [problem])
  const steps = useMemo(() => flowSteps(checks), [checks])
  const live = useMemo(() => runChecks(design, checks), [design, checks])
  const checked = (Array.isArray(entry.checkedPoints) ? entry.checkedPoints : [])

  function checkDesign() {
    const r = runChecks(design, checks)
    setResults(r)
    setTab('checks')
    if (r.every((c) => c.pass)) updateEntry(problem.id, { flow: design, status: 'solved' }, { graded: true })
  }

  function togglePoint(i) {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i]
    updateEntry(problem.id, { checkedPoints: next })
  }

  const passed = results?.filter((r) => r.pass).length ?? 0

  return (
    <div className="workspace flow-workspace">
      <section className="panel left-panel">
        <div className="panel-tabs">
          {TABS.map((t) => (
            <button key={t} className={`panel-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'checks' && checks.length ? `Checks (${checks.length})` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'scenario' && (
            <>
              <Markdown>{problem.description}</Markdown>
              <div className="reveal-gate">
                <p className="muted small">
                  Design the flow on the canvas. It is not executed — the design is checked against the requirements.
                </p>
                {checks.length > 0 && (
                  <button className="btn btn-primary" onClick={checkDesign} disabled={!countComponents(design)}>
                    Check design
                  </button>
                )}
              </div>
            </>
          )}

          {tab === 'checks' &&
            (checks.length ? (
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
                          {guided && r && !r.pass && <span className="check-hint muted small">{missingHint(design, c.rule)}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <button className="btn btn-primary" onClick={checkDesign} disabled={!countComponents(design)}>
                  Check design
                </button>
              </div>
            ) : (
              <p className="muted">
                This problem is self-assessed: design your flow, then compare it with the reference answer.
              </p>
            ))}

          {tab === 'reference' &&
            (!entry.revealed ? (
              <div className="reveal-gate">
                <p className="muted">Finish your design first. Revealing the reference is recorded on this problem.</p>
                <button className="btn btn-primary" onClick={() => updateEntry(problem.id, { revealed: true })}>
                  Reveal reference
                </button>
              </div>
            ) : (
              <div className="reference">
                {problem.referenceFlow && (
                  <>
                    <div className="section-title">Reference design</div>
                    <div className="reference-canvas">
                      <FlowDesigner design={problem.referenceFlow} readOnly />
                    </div>
                    {countComponents(design) > 0 && <DesignCompare design={design} model={problem.referenceFlow} />}
                  </>
                )}
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

      <section className="panel right-panel">
        {guided && (
          <StepGuide
            steps={steps}
            checks={checks}
            results={live}
            hintFor={(i) => missingHint(design, checks[i].rule)}
            finish={
              <button className="btn btn-primary btn-sm" onClick={checkDesign}>
                Check design
              </button>
            }
          />
        )}
        <FlowDesigner design={design} onChange={setDesign} history={history} />
      </section>
    </div>
  )
}
