import { useEffect, useMemo, useState } from 'react'
import CopyForAi from '../components/CopyForAi.jsx'
import { FullBar, isShiftKey, useRequirement } from '../components/designer/FullScreen.jsx'
import { FullScreenTimer } from '../components/ProblemTimer.jsx'
import FlowDesigner from '../components/flow/FlowDesigner.jsx'
import RunPanel from '../components/flow/RunPanel.jsx'
import FollowUps from '../components/FollowUps.jsx'
import Markdown from '../components/Markdown.jsx'
import { ladderFor, PlanBox, RebuildBanner, recordHint, recordHints, revealReference, RevealGate, startRebuild } from '../components/PracticeAids.jsx'
import { useSidebarRoom } from '../components/sidebar.js'
import StepGuide from '../components/StepGuide.jsx'
import SplitHandle, { useSplit } from '../components/SplitHandle.jsx'
import { designChecks, findIt, metBy, missingHint, ruleNodes, runChecks } from '../flow/checks.js'
import WhyPassed from '../components/WhyPassed.jsx'
import FindIt from '../components/FindIt.jsx'
import { recordMistake } from '../store/mistakes.js'
import { compareDesigns } from '../flow/compare.js'
import { countComponents, emptyDesign, restoreDesign } from '../flow/model.js'
import { systemsIn } from '../flow/systems.js'
import { updateEntry, useEntry, workedStatus } from '../store/progress.js'
import { rate } from '../store/rating.js'
import { flowSteps } from '../study/steps.js'
import { useAutosave } from './useAutosave.js'
import NotesBox from './NotesBox.jsx'
import { useUndo } from './useUndo.js'

import { useProblemTab } from '../store/view.js'
const TABS = ['scenario', 'checks', 'run', 'reference', 'notes']
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
export default function FlowWorkspace({ problem, guided = true, clock }) {
  const entry = useEntry(problem.id)
  const [design, setDesign, history] = useUndo(() => restoreDesign(entry.flow))
  const [tab, setTab] = useProblemTab(problem.id, 'scenario', TABS)
  const [results, setResults] = useState(null)
  // full screen: null, 'reference', 'mine', or 'both' (the reference on the left, your design on the right)
  const [full, setFull] = useState(null)
  const hasReference = Boolean(entry.revealed && problem.referenceFlow)
  const hasTests = Boolean(problem.simulation?.tests?.length)
  const [runOpen, setRunOpen] = useState(false)
  const [split, setSplit] = useSplit()
  const [runMarks, setRunMarks] = useState(null)
  const [finding, setFinding] = useState(null) // the check whose Find it is open

  // in full screen the scenario and the checks sit beside the canvas when wanted
  const requirement = useRequirement()
  function toggleRequirement() {
    if (!requirement.open) setTab('scenario')
    requirement.toggle()
  }
  function openMine() {
    requirement.start()
    setFull('mine')
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (isShiftKey(e, 'f')) {
        e.preventDefault()
        if (full) setFull(null)
        else openMine()
      } else if (isShiftKey(e, 'r') && full === 'mine') {
        e.preventDefault()
        toggleRequirement()
      } else if (e.key === 'Escape' && full) {
        // inside a designer Esc cancels placing or a selection, so it does not close the view
        if (!e.target.closest?.('.designer')) setFull(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // in full screen the checks open beside the canvas
  function showTab(key) {
    setTab(key)
    if (full === 'mine') requirement.show()
  }

  const fullButton = (which, label) => (
    <button className="btn btn-ghost btn-sm full-btn" onClick={() => (full === which ? setFull(null) : which === 'mine' ? openMine() : setFull(which))} title={full === which ? 'Close full screen (Esc or Shift+F)' : label} aria-label={full === which ? 'Close full screen' : label}>
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
  // after Check design, the components a failed check is about are marked on the canvas until it passes
  const findInfo = useMemo(
    () => (finding !== null && checks[finding] && !live[finding]?.pass ? findIt(design, problem.referenceFlow, checks[finding]) : null),
    [finding, checks, live, design, problem],
  )
  function openFind(i) {
    recordMistake(problem.id, checks[i], findIt(design, problem.referenceFlow, checks[i]))
    setFinding(i)
    showTab('checks')
    recordHint(problem.id, entry, i, 3)
  }
  const flags = useMemo(() => {
    // Find it outlines only the parts of the one check it is open for
    if (findInfo) return Object.fromEntries(findInfo.mine.concat(findInfo.pairs).map((m) => [m.id, [checks[finding].label]]))
    if (!results || !guided) return null
    const out = {}
    checks.forEach((c, i) => {
      if (live[i]?.pass) return
      for (const id of ruleNodes(design, c.rule)) (out[id] ??= []).push(c.label)
    })
    return Object.keys(out).length ? out : null
  }, [findInfo, finding, results, guided, checks, live, design])

  function checkDesign() {
    const r = runChecks(design, checks)
    setResults(r)
    showTab('checks')
    if (r.every((c) => c.pass)) updateEntry(problem.id, { flow: design, status: 'solved', rebuilding: false }, { graded: true })
    // what failed is kept for the Mistakes page (practice rounds only, and only with a reference to compare to)
    else if (guided && problem.referenceFlow) checks.forEach((c, i) => !r[i].pass && recordMistake(problem.id, c, findIt(design, problem.referenceFlow, c)))
  }
  const ladder = useMemo(
    () => ladderFor(problem.description, problem.solution, checks, (i) => missingHint(design, checks[i].rule)),
    [problem, checks, design],
  )

  function togglePoint(i) {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i]
    updateEntry(problem.id, { checkedPoints: next })
  }

  // The Checks tab follows the design: what is met turns green at once, and the rest turn red after the first Check.
  // Nothing is recorded and the problem is not solved until Check is pressed. A mock interview shows only what Check found.
  const shown = !guided ? results : results || countComponents(design) > 0 ? live : null
  const passed = shown?.filter((r) => r.pass).length ?? 0
  const solvedNow = passed === checks.length && (results ? results.every((r) => r.pass) : entry.status === 'solved' && !entry.rebuilding)

  return (
    <div className={`workspace flow-workspace${full ? ` full-${full}` : ''}${full === 'mine' ? ` work-full${requirement.open ? ' with-req' : ''}` : ''}`} style={split ? { '--left-w': `${split}%` } : undefined}>
      {full === 'mine' && (
        <FullBar
          problem={problem}
          open={requirement.open}
          onToggle={toggleRequirement}
          clock={clock ?? (guided && <FullScreenTimer id={problem.id} />)}
          onClose={() => setFull(null)}
        >
          {checks.length > 0 && (
            <button className="btn btn-sm btn-primary" onClick={checkDesign} disabled={!countComponents(design)}>
              Check
            </button>
          )}
          {guided && <CopyForAi id={problem.id} className="btn btn-sm" />}
        </FullBar>
      )}
      <section className="panel left-panel">
        <div className="panel-tabs">
          {TABS.filter((t) => t !== 'run' || problem.simulation?.tests?.length).map((t) => (
            <button key={t} className={`panel-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'checks' && checks.length ? `Checks (${checks.length})` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'scenario' && (
            <>
              {guided && <RebuildBanner entry={entry} onRebuild={() => startRebuild(problem.id, entry, () => (setDesign(emptyDesign()), setResults(null)))} />}
              <Markdown>{problem.description}</Markdown>
              {guided && <PlanBox key={problem.id} problemId={problem.id} kind="flow" saved={entry.plan} started={countComponents(design) > 0} />}
              <SystemsList design={problem.referenceFlow} />
              <div className="reveal-gate">
                <p className="muted small">
                  {problem.simulation?.tests?.length
                    ? 'Design the flow on the canvas. It is checked against the requirements, and the Run tab runs it against test messages, including ones where a system fails.'
                    : 'Design the flow on the canvas. It is not executed. The design is checked against the requirements.'}
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
                {shown && (
                  <div className={`match-banner ${passed === checks.length ? 'pass' : results ? 'fail' : ''}`} role="status">
                    {passed} / {checks.length} requirements met
                    {solvedNow ? ': solved!' : passed === checks.length ? '. Press Check to finish.' : guided && <span className="muted small"> · follows your changes</span>}
                  </div>
                )}
                {solvedNow && <WhyPassed checks={checks} metBy={(c) => metBy(design, c)} />}
                <ul className="check-list">
                  {checks.map((c, i) => {
                    const r = shown?.[i]
                    const failing = guided && countComponents(design) > 0 && !live[i]?.pass
                    return (
                      <li key={i} className={r?.pass ? 'pass' : r && results ? 'fail' : ''}>
                        <span className="mark">{r?.pass ? '✓' : r && results ? '✗' : '○'}</span>
                        <span className="check-body">
                          <span className="check-line">
                            {c.label}
                            {failing && problem.referenceFlow && finding !== i && (
                              <button className="link-btn small find-it-btn" onClick={() => openFind(i)} title="Show what is wrong, where, and how the reference differs, for this check only">
                                🔎 Find it
                              </button>
                            )}
                          </span>
                          {guided && results && r && !r.pass && finding !== i && <span className="check-hint muted small">{missingHint(design, c.rule)}</span>}
                          {finding === i && findInfo && <FindIt label={c.label} info={findInfo} onClose={() => setFinding(null)} />}
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
              <RevealGate
                entry={entry}
                onReveal={() => revealReference(problem.id, entry)}
                parts={guided ? { steps, checks, ladder, onPart: (items) => recordHints(problem.id, entry, items, 3) } : null}
              >
                <p className="muted">Finish your design first. Revealing the reference is recorded on this problem.</p>
              </RevealGate>
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

          {tab === 'run' && <RunPanel design={design} simulation={problem.simulation} onTrace={setRunMarks} />}

          {tab === 'notes' && (
            <NotesBox problemId={problem.id} />
          )}
        </div>
      </section>

      <section className="panel right-panel">
        <SplitHandle onChange={setSplit} />
        {guided && (
          <StepGuide
            steps={steps}
            checks={checks}
            results={live}
            hintFor={(i) => missingHint(design, checks[i].rule)}
            ladder={ladder}
            onHint={(i, level) => recordHint(problem.id, entry, i, level)}
            onFind={problem.referenceFlow ? openFind : null}
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
          flags={flags}
          runMarks={runMarks}
          toolbarEnd={
            <>
              {hasTests && (
                <button
                  className={`btn btn-sm run-toggle${runOpen ? ' active' : ''}`}
                  onClick={() => setRunOpen(!runOpen)}
                  title="Run the test messages and see the results under the canvas"
                >
                  ▶ Run tests
                </button>
              )}
              {full === 'both' && guided && <CopyForAi id={problem.id} className="btn btn-sm" />}
              {hasReference && sideButton}
              {full === 'both' || full === 'mine' ? null : fullButton('mine', 'Open your design full screen (Shift+F)')}
            </>
          }
        />
        {hasTests && runOpen && (
          <div className="run-drawer">
            <div className="run-drawer-head">
              <b className="small">Test run</b>
              <span className="muted small">Runs your design as it is now. Change it and run again.</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setRunOpen(false)} aria-label="Close the test run">
                ✕
              </button>
            </div>
            <div className="run-drawer-body">
              <RunPanel design={design} simulation={problem.simulation} onTrace={setRunMarks} />
            </div>
          </div>
        )}
      </section>

      {full && full !== 'mine' && <div className="io-backdrop" onClick={() => setFull(null)} aria-hidden="true" />}
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
