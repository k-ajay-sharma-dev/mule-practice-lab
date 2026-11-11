import { useMemo, useState } from 'react'
import ArchDesigner from '../components/arch/ArchDesigner.jsx'
import ExplainPanel from '../components/ExplainPanel.jsx'
import Markdown from '../components/Markdown.jsx'
import { useSidebarRoom } from '../components/sidebar.js'
import StepGuide from '../components/StepGuide.jsx'
import { diagramHint, runDiagramChecks } from '../arch/checks.js'
import { landscapeOf } from '../arch/landscape.js'
import { restoreDiagram } from '../arch/model.js'
import { updateEntry, useEntry, workedStatus } from '../store/progress.js'
import { diagramSteps } from '../study/steps.js'
import { useAutosave } from './useAutosave.js'
import { useUndo } from './useUndo.js'

const TABS = [
  ['scenario', 'Scenario'],
  ['checks', 'Checks'],
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
export default function ArchWorkspace({ problem, guided = true }) {
  const entry = useEntry(problem.id)
  const [diagram, setDiagram, history] = useUndo(() => restoreDiagram(entry.diagram))
  const [tab, setTab] = useState('scenario')
  const [results, setResults] = useState(null)
  const { checks, reference, task } = problem.diagram
  const steps = useMemo(() => diagramSteps(checks), [checks])
  const live = useMemo(() => runDiagramChecks(diagram, checks), [diagram, checks])

  useSidebarRoom()

  useAutosave(diagram, (value) => updateEntry(problem.id, { diagram: value, status: workedStatus(problem.id) }))

  function check() {
    const r = runDiagramChecks(diagram, checks)
    setResults(r)
    setTab('checks')
    if (r.every((c) => c.pass)) updateEntry(problem.id, { diagram, status: 'solved' }, { graded: true })
  }

  const passed = results?.filter((r) => r.pass).length ?? 0
  const checkButton = (
    <button className="btn btn-primary" onClick={check} disabled={!diagram.nodes.length}>
      Check architecture
    </button>
  )

  return (
    <div className="workspace flow-workspace">
      <section className="panel left-panel">
        <div className="panel-tabs">
          {TABS.map(([key, label]) => (
            <button key={key} className={`panel-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {key === 'checks' ? `${label} (${checks.length})` : label}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'scenario' && (
            <>
              <Markdown>{problem.description}</Markdown>
              <Landscape reference={reference} />
              <div className="reveal-gate">
                <p className="small">
                  <b>Your task:</b> {task ?? 'draw the architecture that meets these requirements.'}
                </p>
                <p className="muted small">
                  Add the components and connect them with sync calls or async messages. Name each one after the real
                  system or API in the scenario (e.g. sys-sap-order-api, SAP, order-events queue) — some checks look
                  for those names. The diagram is checked against the requirements.
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
              <ul className="check-list">
                {checks.map((c, i) => {
                  const r = results?.[i]
                  return (
                    <li key={i} className={r ? (r.pass ? 'pass' : 'fail') : ''}>
                      <span className="mark">{r ? (r.pass ? '✓' : '✗') : '○'}</span>
                      <span>
                        {c.label}
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

          {tab === 'explain' && (
            <ExplainPanel problem={problem}>
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
            hintFor={(i) => diagramHint(diagram, checks[i].rule)}
            finish={checkButton}
          />
        )}
        <ArchDesigner diagram={diagram} onChange={setDiagram} history={history} />
      </section>
    </div>
  )
}
