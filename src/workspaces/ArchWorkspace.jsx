import { useEffect, useMemo, useState } from 'react'
import FindIt from '../components/FindIt.jsx'
import { archFindIt, archMetBy } from '../arch/findit.js'
import WhyPassed from '../components/WhyPassed.jsx'
import { recordMistake } from '../store/mistakes.js'
import CopyForAi from '../components/CopyForAi.jsx'
import { FullBar, isShiftKey, useRequirement } from '../components/designer/FullScreen.jsx'
import { FullScreenTimer } from '../components/ProblemTimer.jsx'
import ArchDesigner from '../components/arch/ArchDesigner.jsx'
import ArchRunPanel, { runOverlay } from '../components/arch/ArchRunPanel.jsx'
import ExplainPanel from '../components/ExplainPanel.jsx'
import Markdown from '../components/Markdown.jsx'
import { useSidebarRoom } from '../components/sidebar.js'
import StepGuide from '../components/StepGuide.jsx'
import SplitHandle, { useSplit } from '../components/SplitHandle.jsx'
import { archChecks, diagramHint, runDiagramChecks } from '../arch/checks.js'
import { runArchTest } from '../arch/tests.js'
import { landscapeOf } from '../arch/landscape.js'
import { emptyDiagram, restoreDiagram } from '../arch/model.js'
import { ladderFor, PlanBox, RebuildBanner, recordHint, recordHints, startRebuild } from '../components/PracticeAids.jsx'
import { updateEntry, useEntry, workedStatus } from '../store/progress.js'
import { diagramSteps } from '../study/steps.js'
import { useAutosave } from './useAutosave.js'
import NotesBox from './NotesBox.jsx'
import { useUndo } from './useUndo.js'

import { useProblemTab } from '../store/view.js'
const TABS = [
  ['scenario', 'Scenario'],
  ['checks', 'Checks'],
  ['run', 'Run'],
  ['explain', 'Explain it'],
  ['notes', 'Notes'],
]

// The users and systems the landscape already has, from the reference diagram (see arch/landscape.js).
function Landscape({ reference }) {
  const groups = useMemo(() => landscapeOf(reference), [reference])
  if (!groups.length) return null
  return (
    <div className="systems-list">
      <div className="section-title">Users and systems in this landscape</div>
      <p className="muted small">
        These already exist. What sits between them (API layers, queues, gateways) is your design.
      </p>
      <dl>
        {groups.map((g) => (
          <div key={g.title} className="systems-row">
            <dt>{g.title}</dt>
            <dd>
              {g.items.map((i) => (
                <code key={i.label} title={i.kind}>
                  {i.label}
                </code>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// Architecture problems with a `diagram` exercise: draw the solution on the Architecture Designer and
// check it against the rules in `diagram.checks`.
export default function ArchWorkspace({ problem, guided = true, clock }) {
  const entry = useEntry(problem.id)
  const [diagram, setDiagram, history] = useUndo(() => restoreDiagram(entry.diagram))
  const [tab, setTab] = useProblemTab(problem.id, 'scenario', TABS.map(([k]) => k))
  const [results, setResults] = useState(null)
  const [picked, setPicked] = useState(0)
  const [split, setSplit] = useSplit()
  const { reference, task, simulation } = problem.diagram
  const checks = useMemo(() => archChecks(problem), [problem])
  const hasRuns = Boolean(simulation?.tests?.length)
  // on the Run tab the boxes show how busy they were in the chosen test
  const overlay = useMemo(() => (tab === 'run' && hasRuns ? runOverlay(runArchTest(diagram, simulation, simulation.tests[picked] ?? simulation.tests[0]).result) : null), [tab, hasRuns, diagram, simulation, picked])
  const steps = useMemo(() => diagramSteps(checks), [checks])
  const live = useMemo(() => runDiagramChecks(diagram, checks), [diagram, checks])
  const [finding, setFinding] = useState(null) // the check whose Find it is open
  const findInfo = useMemo(
    () => (finding !== null && checks[finding] && !live[finding]?.pass ? archFindIt(diagram, reference, checks[finding]) : null),
    [finding, checks, live, diagram, reference],
  )
  const flags = useMemo(() => (findInfo ? Object.fromEntries(findInfo.mine.map((m) => [m.id, [checks[finding].label]])) : null), [findInfo, finding, checks])

  // full screen: the canvas takes the window, and the scenario and checks sit beside it when wanted
  const [full, setFull] = useState(false)
  const requirement = useRequirement()
  function toggleRequirement() {
    if (!requirement.open) setTab('scenario')
    requirement.toggle()
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (isShiftKey(e, 'f') && (full || window.innerWidth > 1000)) {
        e.preventDefault()
        toggleFull()
      } else if (isShiftKey(e, 'r') && full) {
        e.preventDefault()
        toggleRequirement()
      } else if (e.key === 'Escape' && full) {
        // inside the designer Esc cancels connecting, so it does not close the view
        if (!e.target.closest?.('.designer')) setFull(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  function showTab(key) {
    setTab(key)
    if (full) requirement.show()
  }
  function toggleFull() {
    if (!full) requirement.start()
    setFull(!full)
  }

  useSidebarRoom()

  useAutosave(diagram, (value) => updateEntry(problem.id, { diagram: value, status: workedStatus(problem.id) }))

  function check() {
    const r = runDiagramChecks(diagram, checks)
    setResults(r)
    showTab('checks')
    if (r.every((c) => c.pass)) updateEntry(problem.id, { diagram, status: 'solved', rebuilding: false }, { graded: true })
    else if (guided && reference) checks.forEach((c, i) => !r[i].pass && recordMistake(problem.id, c, archFindIt(diagram, reference, c)))
  }
  function openFind(i) {
    recordMistake(problem.id, checks[i], archFindIt(diagram, reference, checks[i]))
    setFinding(i)
    showTab('checks')
    recordHint(problem.id, entry, i, 3)
  }
  const ladder = useMemo(
    () => ladderFor(problem.description, problem.solution, checks, (i) => diagramHint(diagram, checks[i].rule)),
    [problem, checks, diagram],
  )

  const passed = results?.filter((r) => r.pass).length ?? 0
  const checkButton = (
    <button className="btn btn-primary" onClick={check} disabled={!diagram.nodes.length}>
      Check architecture
    </button>
  )

  return (
    <div className={`workspace flow-workspace arch-workspace${full ? ` work-full${requirement.open ? ' with-req' : ''}` : ''}`} style={split ? { '--left-w': `${split}%` } : undefined}>
      {full && (
        <FullBar
          problem={problem}
          open={requirement.open}
          onToggle={toggleRequirement}
          clock={clock ?? (guided && <FullScreenTimer id={problem.id} />)}
          onClose={toggleFull}
        >
          <button className="btn btn-sm btn-primary" onClick={check} disabled={!diagram.nodes.length}>
            Check
          </button>
          {guided && <CopyForAi id={problem.id} className="btn btn-sm" />}
        </FullBar>
      )}
      <section className="panel left-panel">
        <div className="panel-tabs">
          {TABS.filter(([key]) => key !== 'run' || hasRuns).map(([key, label]) => (
            <button key={key} className={`panel-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {key === 'checks' ? `${label} (${checks.length})` : label}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'scenario' && (
            <>
              {guided && <RebuildBanner entry={entry} onRebuild={() => startRebuild(problem.id, entry, () => setDiagram(emptyDiagram()))} />}
              <Markdown>{problem.description}</Markdown>
              {guided && <PlanBox key={problem.id} problemId={problem.id} kind="arch" saved={entry.plan} started={diagram.nodes.length > 0} />}
              <Landscape reference={reference} />
              <div className="reveal-gate">
                <p className="small">
                  <b>Your task:</b> {task ?? 'draw the architecture that meets these requirements.'}
                </p>
                <p className="muted small">
                  Add the components and connect them with sync calls or async messages. Name each one after the real
                  system or API in the scenario (e.g. sys-sap-order-api, SAP, order-events queue). Some checks look
                  for those names. The diagram is checked against the requirements.
                  {hasRuns && ' The Run tab also sends traffic through it and plays outages, so give the boxes settings (replicas, policies, timeouts) that carry the load.'}
                </p>
                {checkButton}
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
              {results && passed === checks.length && <WhyPassed checks={checks} metBy={(c) => archMetBy(diagram, c)} />}
              <ul className="check-list">
                {checks.map((c, i) => {
                  const r = results?.[i]
                  const failing = guided && diagram.nodes.length > 0 && !live[i]?.pass
                  return (
                    <li key={i} className={r ? (r.pass ? 'pass' : 'fail') : ''}>
                      <span className="mark">{r ? (r.pass ? '✓' : '✗') : '○'}</span>
                      <span className="check-body">
                        <span className="check-line">
                          {c.label}
                          {failing && reference && finding !== i && (
                            <button className="link-btn small find-it-btn" onClick={() => openFind(i)} title="Show what is wrong, where, and how the reference differs, for this check only">
                              🔎 Find it
                            </button>
                          )}
                        </span>
                        {finding === i && findInfo && <FindIt label={c.label} info={findInfo} onClose={() => setFinding(null)} />}
                        {r?.reversed && (
                          <span className="check-hint small warn-text">
                            Close — your arrow points the other way. Arrows go from the caller or sender to the receiver.
                          </span>
                        )}
                        {guided && r && !r.pass && !r.reversed && (
                          <span className="check-hint muted small">{diagramHint(diagram, c.rule)}</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {checkButton}
            </div>
          )}

          {tab === 'run' && <ArchRunPanel diagram={diagram} simulation={simulation} picked={picked} onPick={setPicked} />}

          {tab === 'explain' && (
            <ExplainPanel
              problem={problem}
              practice={guided}
              parts={guided ? { steps, checks, ladder, onPart: (items) => recordHints(problem.id, entry, items, 3) } : null}
            >
              {reference && (
                <>
                  <div className="section-title">Reference architecture</div>
                  <div className="reference-canvas arch-ref">
                    <ArchDesigner diagram={reference} readOnly />
                  </div>
                </>
              )}
            </ExplainPanel>
          )}

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
            hintFor={(i) => diagramHint(diagram, checks[i].rule)}
            ladder={ladder}
            onHint={(i, level) => recordHint(problem.id, entry, i, level)}
            onFind={reference ? openFind : null}
            finish={checkButton}
          />
        )}
        <ArchDesigner
          diagram={diagram}
          onChange={setDiagram}
          history={history}
          overlay={overlay}
          flags={flags}
          toolbarEnd={
            !full && (
              <button className="btn btn-sm arch-full-btn" onClick={toggleFull} title="Work on the diagram full screen (Shift+F)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
                Full screen
              </button>
            )
          }
        />
      </section>
    </div>
  )
}
