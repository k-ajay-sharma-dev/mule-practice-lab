import { useEffect, useMemo, useState } from 'react'
import FlowDesigner from '../components/flow/FlowDesigner.jsx'
import FollowUps from '../components/FollowUps.jsx'
import Markdown from '../components/Markdown.jsx'
import { useSidebarRoom } from '../components/sidebar.js'
import StepGuide from '../components/StepGuide.jsx'
import { designChecks, missingHint, runChecks } from '../flow/checks.js'
import { compareDesigns } from '../flow/compare.js'
import { countComponents, restoreDesign } from '../flow/model.js'
import { systemsIn } from '../flow/systems.js'
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

function FullIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
    </svg>
  )
}

function SideIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </svg>
  )
}

// The systems the scenario lets you call, grouped by kind. On a real project these come as API contracts and schemas.
function SystemsList({ design }) {
  const groups = useMemo(() => {
    const byKind = new Map()
    for (const s of systemsIn(design)) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s.name])
    return [...byKind]
  }, [design])
  if (!groups.length) return null
  return (
    <div className="systems-list">
      <div className="section-title">Systems you can call</div>
      <p className="muted small">
        These are the systems and their names, as their owners would hand them to you. Your design uses each of
        them. In what order and how is up to you.
      </p>
      <dl>
        {groups.map(([kind, names]) => (
          <div key={kind} className="systems-row">
            <dt>{kind}</dt>
            <dd>
              {names.map((n) => (
                <code key={n}>{n}</code>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// guided adds the step guide and the hints on failed checks. A mock interview turns it off.
export default function FlowWorkspace({ problem, guided = true }) {
  const entry = useEntry(problem.id)
  const [design, setDesign, history] = useUndo(() => restoreDesign(entry.flow))
  const [tab, setTab] = useState('scenario')
  const [results, setResults] = useState(null)
  // full screen: null, 'reference', 'mine', or 'both' (the reference on the left, your design on the right)
  const [full, setFull] = useState(null)
  const hasReference = Boolean(entry.revealed && problem.referenceFlow)

  useEffect(() => {
    if (!full) return
    // Esc inside a designer cancels placing or a selection there, so only Esc from elsewhere closes the view
    const onKey = (e) => e.key === 'Escape' && !e.target.closest?.('.designer, input, textarea, select') && setFull(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  const fullButton = (which, label) => (
    <button className="btn btn-ghost btn-sm full-btn" onClick={() => setFull(full === which ? null : which)} title={full === which ? 'Close full screen (Esc)' : label} aria-label={full === which ? 'Close full screen' : label}>
      <FullIcon open={full === which} />
      <span>{full === which ? 'Close' : 'Full screen'}</span>
    </button>
  )
  const sideButton = (
    <button className="btn btn-ghost btn-sm full-btn" onClick={() => setFull(full === 'both' ? null : 'both')} title={full === 'both' ? 'Close side by side (Esc)' : 'The reference and your design side by side'} aria-label={full === 'both' ? 'Close side by side' : 'Open the reference and your design side by side'}>
      {full === 'both' ? <FullIcon open /> : <SideIcon />}
      <span>{full === 'both' ? 'Close' : 'Side by side'}</span>
    </button>
  )

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
    <div className={`workspace flow-workspace${full ? ` full-${full}` : ''}`}>
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
              <SystemsList design={problem.referenceFlow} />
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
                    <div className="section-title reference-title">
                      <span>Reference design</span>
                      <span className="full-actions">
                        {fullButton('reference', 'Open the reference full screen')}
                        {sideButton}
                      </span>
                    </div>
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
        <FlowDesigner
          design={design}
          onChange={setDesign}
          history={history}
          toolbarEnd={
            <>
              {hasReference && sideButton}
              {full === 'both' ? null : fullButton('mine', 'Open your design full screen')}
            </>
          }
        />
      </section>

      {full && <div className="io-backdrop" onClick={() => setFull(null)} aria-hidden="true" />}
      {hasReference && (full === 'reference' || full === 'both') && (
        <section className="flow-full-ref" role="dialog" aria-label="Reference design">
          <div className="flow-full-label">
            <span>Reference design</span>
            <span className="muted small">Read only. Select a component to see its settings.</span>
          </div>
          <FlowDesigner
            design={problem.referenceFlow}
            readOnly
            settingsAside
            toolbarEnd={full === 'reference' ? <>{sideButton}{fullButton('reference', 'Close')}</> : null}
          />
        </section>
      )}
    </div>
  )
}
