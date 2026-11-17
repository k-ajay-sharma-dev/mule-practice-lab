import { useEffect, useMemo, useState } from 'react'
import { simulate } from '../../sim/engine.js'
import { runClues, runTest } from '../../sim/tests.js'

// The Run tab of a flow problem: runs the learner's design against the problem's test cases and shows what
// happened at each step, the log lines, what was sent to other systems, and the answer.

const json = (v) => {
  if (v === undefined) return '(nothing)'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function triggerText(t = {}) {
  if (t.http) return `${t.http.method ?? 'GET'} ${t.http.path}`
  if (t.message) return `A message on ${t.message.kind} ${t.message.destination}`
  if (t.schedule !== undefined) return 'The Scheduler fires'
  if (t.file) return `A file arrives: ${t.file.path}`
  if (t.source) return `${t.source} receives an event`
  return 'Start'
}

function triggerBody(t = {}) {
  if (t.http) return t.http.body
  if (t.message) return t.message.payload
  if (t.file) return t.file.content
  return t.payload
}

function Step({ entry }) {
  const [open, setOpen] = useState(false)
  const hasData = entry.payload !== undefined || entry.vars !== undefined
  const cls = entry.kind === 'error' || entry.kind === 'flow-error' ? 'sim-step error' : entry.kind === 'handler' ? 'sim-step handler' : entry.kind.startsWith('flow') ? 'sim-step flow' : entry.kind === 'route' ? 'sim-step route' : 'sim-step'
  return (
    <li className={cls} style={{ paddingLeft: 8 + Math.min(entry.depth ?? 0, 8) * 14 }}>
      <button className="sim-step-head" onClick={() => hasData && setOpen(!open)} disabled={!hasData} aria-expanded={open}>
        <span className="sim-t">{entry.t} ms</span>
        <span className="sim-text">{entry.text}</span>
        {entry.error && <span className="sim-err">{entry.error.description}</span>}
      </button>
      {open && (
        <div className="sim-data">
          <div className="sim-data-col">
            <div className="sim-label">payload {entry.mime ? <span className="muted">({entry.mime})</span> : null}</div>
            <pre className="sim-json">{json(entry.payload)}</pre>
          </div>
          <div className="sim-data-col">
            <div className="sim-label">vars</div>
            <pre className="sim-json">{json(entry.vars)}</pre>
            <div className="sim-label">attributes</div>
            <pre className="sim-json">{json(entry.attributes)}</pre>
          </div>
        </div>
      )}
    </li>
  )
}

function Effects({ effects }) {
  const rows = []
  for (const c of effects.http) rows.push(`HTTP ${c.method} ${c.path} → ${c.status}`)
  for (const d of effects.db) rows.push(`Database: ${d.sql.replace(/\s+/g, ' ').slice(0, 90)} → ${d.result}`)
  for (const m of effects.sent) rows.push(`Sent to ${m.destination}: ${json(m.payload).replace(/\s+/g, ' ').slice(0, 90)}`)
  for (const e of effects.emails) rows.push(`Email to ${e.to}: ${e.subject}`)
  for (const c of effects.calls) rows.push(`${c.type} ${c.operation}`)
  for (const a of effects.acks.filter((x) => x.op === 'outcome')) rows.push(`Message on ${a.destination}: ${a.outcome}`)
  if (!rows.length) return <p className="muted small">Nothing was sent to another system.</p>
  return (
    <ul className="sim-effects">
      {rows.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
  )
}

function RunResult({ result, lines }) {
  const res = result.response
  return (
    <div className="sim-result">
      {lines && (
        <ul className="check-list">
          {lines.map((l, i) => (
            <li key={i} className={l.ok ? 'pass' : 'fail'}>
              <span className="mark">{l.ok ? '✓' : '✗'}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {lines && runClues(result, lines).map((c) => (
        <p key={c.text} className="run-clue small">
          <b>Where to look:</b> {c.text} The step is marked on the canvas.
        </p>
      ))}
      {result.limit && <p className="sim-limit">{result.limit}</p>}
      {res && (
        <>
          <div className="section-title">Answer sent back</div>
          <div className={`sim-status ${res.status >= 400 ? 'bad' : 'good'}`}>
            {res.status} {res.reason}
            {res.note && <span className="muted small"> {res.note}</span>}
          </div>
          <pre className="sim-json">{json(res.body)}</pre>
        </>
      )}
      {!res && result.error && (
        <>
          <div className="section-title">The flow ended with an error</div>
          <div className="sim-status bad">
            {result.error.type}: {result.error.description}
          </div>
        </>
      )}
      <div className="section-title">Steps</div>
      <p className="muted small">Select a step to see the payload, variables and attributes after it.</p>
      <ol className="sim-steps">
        {result.trace.map((e, i) => (
          <Step key={i} entry={e} />
        ))}
      </ol>
      <div className="section-title">Log</div>
      {result.logs.length ? (
        <pre className="sim-console">
          {result.logs.map((l, i) => (
            <div key={i} className={`sim-log ${l.level.toLowerCase()}`}>
              {String(l.t).padStart(5)} ms {l.level.padEnd(5)} [{l.flow}]{l.source === 'runtime' ? ' (Mule runtime)' : ''} {l.message}
            </div>
          ))}
        </pre>
      ) : (
        <p className="muted small">No log lines.</p>
      )}
      <div className="section-title">Calls to other systems</div>
      <Effects effects={result.effects} />
    </div>
  )
}

// What each component did in a run, for the marks on the canvas: { nodeId: { fail, text } }
export function traceMarks(trace = []) {
  const marks = {}
  for (const e of trace) {
    if (!e.id) continue
    if (e.kind === 'error') marks[e.id] = { fail: true, text: e.error?.description ? `${e.text}: ${e.error.description}` : e.text }
    else if (!marks[e.id]) marks[e.id] = { fail: false, text: e.text }
  }
  return marks
}

// onTrace(marks) hears which run is shown, so the canvas can mark each step of it
export default function RunPanel({ design, simulation, onTrace }) {
  const tests = simulation?.tests ?? []
  const [picked, setPicked] = useState(0)
  const [custom, setCustom] = useState(null) // { text, result, error }
  const outcomes = useMemo(() => tests.map((t) => runTest(design, simulation, t)), [design, simulation, tests])
  const shownResult = custom ? custom.result : outcomes[picked]?.result
  const shownLines = custom ? null : outcomes[picked]?.lines
  useEffect(() => {
    if (!shownResult) return onTrace?.(null)
    const marks = traceMarks(shownResult.trace)
    // the steps a failed test points at (the slow one, the one that raised the error) are marked too
    if (shownLines) for (const c of runClues(shownResult, shownLines)) for (const id of c.ids) marks[id] = { fail: true, text: c.text }
    onTrace?.(marks)
  }, [shownResult, shownLines, onTrace])
  useEffect(() => () => onTrace?.(null), [onTrace])

  if (!tests.length) {
    return <p className="muted">This problem has no test runs yet. Its design is checked against the requirements only.</p>
  }

  const test = tests[picked]
  const outcome = outcomes[picked]
  const passed = outcomes.filter((o) => o.pass).length

  function runCustom() {
    try {
      const body = custom.text.trim() ? JSON.parse(custom.text) : undefined
      const t = structuredClone(test.trigger ?? {})
      if (t.http) t.http.body = body
      else if (t.message) t.message.payload = body
      else if (t.file) t.file.content = body
      else t.payload = body
      const result = simulate(design, simulation, { ...test, trigger: t, triggers: undefined })
      setCustom({ ...custom, result, lines: null, error: null })
    } catch (e) {
      setCustom({ ...custom, error: `That is not valid JSON: ${e.message}` })
    }
  }

  return (
    <div className="run-panel">
      <p className="muted small">
        Your design runs here as Mule would run it. Each test sends a message into your flow. The systems around it answer as the scenario says, including when they fail.
      </p>
      <div className={`match-banner ${passed === tests.length ? 'pass' : 'fail'}`}>
        {passed} / {tests.length} test runs pass
      </div>
      <ul className="sim-tests">
        {tests.map((t, i) => (
          <li key={i}>
            <button className={`sim-test ${i === picked ? 'active' : ''} ${outcomes[i].pass ? 'pass' : 'fail'}`} onClick={() => (setPicked(i), setCustom(null))}>
              <span className="mark">{outcomes[i].pass ? '✓' : '✗'}</span>
              <span>{t.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sim-trigger">
        <div className="section-title">What this test sends</div>
        {test.about && <p className="small">{test.about}</p>}
        <code>{triggerText(test.trigger ?? test.triggers?.[0])}</code>
        {test.triggers?.length > 1 && <span className="muted small"> and {test.triggers.length - 1} more</span>}
        {triggerBody(test.trigger ?? test.triggers?.[0]) !== undefined && <pre className="sim-json">{json(triggerBody(test.trigger ?? test.triggers?.[0]))}</pre>}
        {test.trigger && (
          <button className="btn btn-ghost btn-sm" onClick={() => setCustom(custom ? null : { text: json(triggerBody(test.trigger)) === '(nothing)' ? '' : json(triggerBody(test.trigger)), result: null })}>
            {custom ? 'Back to the test' : 'Try your own message'}
          </button>
        )}
      </div>

      {custom ? (
        <div className="sim-custom">
          <p className="muted small">Change the message and run it. This run is not graded; the systems answer as in this test.</p>
          <textarea className="sim-input" rows={8} value={custom.text} onChange={(e) => setCustom({ ...custom, text: e.target.value })} spellCheck={false} />
          <button className="btn btn-primary btn-sm" onClick={runCustom}>
            Run
          </button>
          {custom.error && <p className="sim-limit">{custom.error}</p>}
          {custom.result && <RunResult result={custom.result} lines={null} />}
        </div>
      ) : (
        <RunResult result={outcome.result} lines={outcome.lines} />
      )}
    </div>
  )
}
