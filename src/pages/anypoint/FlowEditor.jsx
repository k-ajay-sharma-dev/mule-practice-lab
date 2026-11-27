// Flow editor: the Mule configuration XML of an application, in the style of Anypoint Studio. The Configuration XML tab
// is a source editor with the Problems view under it, Message Flow draws the flows from the parse, Global Elements lists
// the configs, and Changes compares the draft with the deployed version. Deploy sends the draft to Runtime Manager.
// The rules live in lab/platform-xml.js. The draft is kept in state.xmlDrafts so it survives a change of screen.
import { useEffect, useMemo, useRef, useState } from 'react'
import { appNamed, deployXml, mark, propsOf, stamp } from '../../lab/platform.js'
import { deployProblems, diffLines, draftOf, parseMule, problemText, setDraft, XML_FILE } from '../../lab/platform-xml.js'
import { Btn, Select, Table, Tabs } from './parts.jsx'

const LABEL = {
  'http:listener': 'Listener', 'http:request': 'Request', 'db:select': 'Select', 'db:insert': 'Insert', 'db:update': 'Update', 'db:delete': 'Delete', 'db:bulk-insert': 'Bulk insert', 'db:stored-procedure': 'Stored procedure',
  scheduler: 'Scheduler', try: 'Try', 'until-successful': 'Until Successful', foreach: 'For Each', async: 'Async', choice: 'Choice', 'scatter-gather': 'Scatter-Gather', 'flow-ref': 'Flow Reference', 'set-variable': 'Set Variable',
  'remove-variable': 'Remove Variable', 'set-payload': 'Set Payload', logger: 'Logger', 'raise-error': 'Raise error', 'ee:transform': 'Transform Message', 'batch:job': 'Batch Job', 'jms:listener': 'On New Message', 'jms:publish': 'Publish',
  'jms:consume': 'Consume', 'on-error-continue': 'On Error Continue', 'on-error-propagate': 'On Error Propagate', 'http:listener-config': 'HTTP Listener config', 'http:request-config': 'HTTP Request configuration', 'db:config': 'Database Config',
  'jms:config': 'JMS Config', 'configuration-properties': 'Configuration properties', 'global-property': 'Global Property', configuration: 'Configuration', 'error-handler': 'Error Handler',
}
const TABS = ['Message Flow', 'Global Elements', 'Configuration XML', 'Changes']
const LINE = 18 // px, the same in the gutter and the text area
const family = (kind) => (kind.startsWith('http:') ? 'http' : kind.startsWith('db:') ? 'db' : kind.startsWith('ee:') ? 'ee' : kind.startsWith('batch:') ? 'batch' : kind.startsWith('jms:') ? 'jms' : 'core')
// the draft is stored only when it differs from the deployed version, and the state is kept when nothing changed
const keepDraft = (s, name, text) => {
  const want = text === appNamed(s, name)?.xml ? null : text
  return draftOf(s, name) === want ? s : setDraft(s, name, want)
}
const SCOPES = ['try', 'until-successful', 'foreach', 'async', 'choice', 'scatter-gather', 'batch:job']

// what a box shows under its name
function detail(step) {
  const a = step.attrs
  switch (step.kind) {
    case 'http:listener':
      return `${a.allowedMethods ?? 'ANY'} ${a.path ?? ''}`
    case 'http:request':
      return `${a.method ?? 'GET'} ${a.path ?? a.url ?? ''}`
    case 'try':
      return a.transactionalAction && a.transactionalAction !== 'INDIFFERENT' ? `${a.transactionalAction}${a.transactionType === 'XA' ? ', XA' : ''}` : 'no transaction'
    case 'until-successful':
      return `maxRetries ${a.maxRetries ?? 5}, every ${a.millisBetweenRetries ?? 60000} ms`
    case 'flow-ref':
      return a.name
    case 'set-variable':
      return a.variableName
    case 'raise-error':
      return a.type
    case 'batch:job':
      return `blockSize ${a.blockSize ?? 100}, maxFailedRecords ${a.maxFailedRecords ?? 0}`
    default:
      return a['config-ref'] ? `${a['config-ref']}${a.transactionalAction ? `, ${a.transactionalAction}` : ''}` : ''
  }
}

export default function FlowEditor({ state, update, place, go }) {
  const apps = state.apps.filter((a) => a.env === state.env && a.xml)
  const name = apps.some((a) => a.name === place.app) ? place.app : apps[0]?.name
  if (!apps.length)
    return (
      <main className="pc-main">
        <div className="pc-title">
          <h2>Flow editor</h2>
        </div>
        <p className="pc-empty pc-boxed">No application in {state.env} carries a Mule configuration in this lab.</p>
      </main>
    )
  return (
    <main className="pc-main fe">
      <div className="pc-title">
        <h2>Flow editor</h2>
        <span className="pc-grow" />
        <label className="fe-pick">
          <span className="pc-dim">Application</span>
          <Select value={name} onChange={(v) => go({ app: v })} options={apps.map((a) => a.name)} aria-label="Application" />
        </label>
      </div>
      <Editor key={`${state.env}|${name}`} state={state} update={update} name={name} first={TABS.includes(place.tab) ? place.tab : 'Configuration XML'} />
    </main>
  )
}

function Editor({ state, update, name, first }) {
  const app = appNamed(state, name)
  const deployed = app.xml
  const [text, setText] = useState(() => draftOf(state, name) ?? deployed)
  const [tab, setTab] = useState(first)
  const [result, setResult] = useState(null)
  const [jump, setJump] = useState(null)
  const area = useRef(null)
  const gutter = useRef(null)
  const latest = useRef(text)
  latest.current = text
  const model = useMemo(() => parseMule(text), [text])
  const lines = useMemo(() => text.split('\n'), [text])
  const bad = useMemo(() => new Map(model.problems.map((p) => [p.line, p.severity])), [model])
  const changed = text !== deployed

  useEffect(() => {
    update((s) => mark(s, `xml:${name}`))
  }, [name, update])
  // the draft is kept when the editor closes
  useEffect(
    () => () =>
      update((s) => keepDraft(s, name, latest.current)),
    [name, update],
  )
  useEffect(() => {
    if (jump === null || tab !== 'Configuration XML' || !area.current) return
    const start = lines.slice(0, jump - 1).reduce((n, l) => n + l.length + 1, 0)
    area.current.focus()
    area.current.setSelectionRange(start, start + (lines[jump - 1]?.length ?? 0))
    area.current.scrollTop = Math.max(0, (jump - 6) * LINE)
    if (gutter.current) gutter.current.scrollTop = area.current.scrollTop
    setJump(null)
  }, [jump, tab, lines])

  const save = () => update((s) => keepDraft(s, name, text))
  const goLine = (line) => {
    setTab('Configuration XML')
    setJump(line)
  }
  const deploy = () => {
    const problems = deployProblems(text, propsOf(app))
    update((s) => {
      const r = deployXml(mark(s, `xml-deploy:${name}`), name, text)
      return setDraft(r.state, name, r.errors.length ? text : null)
    })
    setResult(problems.length ? { ok: false, list: problems.map(problemText) } : { ok: true })
  }
  const discard = () => {
    setText(deployed)
    update((s) => setDraft(s, name, null))
    setResult(null)
  }
  const keys = (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: a, selectionEnd: b } = el
    setText(text.slice(0, a) + '  ' + text.slice(b))
    requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2))
  }
  const errors = model.problems.filter((p) => p.severity === 'error').length
  const warnings = model.problems.length - errors

  return (
    <>
      <div className="fe-head">
        <span>
          <b>{XML_FILE}</b> of {name}. Deployed: config {app.config}, {app.status}
          {app.updateFailed ? `. The update to config ${app.updateFailed.config} failed at ${stamp(app.updateFailed.t)}` : ''}.
        </span>
        <span className={changed ? 'fe-dirty' : 'pc-dim'}>{changed ? 'Draft with changes, not deployed' : 'Same as the deployed version'}</span>
        <span className="pc-grow" />
        <Btn onClick={discard} disabled={!changed}>
          Discard draft
        </Btn>
        <Btn kind="primary" onClick={deploy} disabled={!changed || app.status === 'Starting'}>
          Deploy to {state.env}
        </Btn>
      </div>
      {result && (
        <div className={`fe-result ${result.ok ? 'ok' : 'bad'}`} role="status">
          {result.ok ? (
            <p>Deployed as config {appNamed(state, name).config}. Status {appNamed(state, name).status}. The logs in Runtime Manager show the start.</p>
          ) : (
            <>
              <p>
                <b>Failed to deploy artifact [{name}].</b> The replicas of config {appNamed(state, name).config} keep running. The deploy log in Runtime Manager has the details.
              </p>
              <ul>
                {result.list.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <Tabs tabs={TABS} value={tab} onChange={(t) => (save(), setTab(t))} />
      {tab === 'Configuration XML' && (
        <div className="fe-code">
          <div className="fe-gutter" ref={gutter} aria-hidden="true">
            {lines.map((_, i) => (
              <span key={i} className={bad.get(i + 1) ?? ''}>
                {i + 1}
              </span>
            ))}
          </div>
          <textarea
            ref={area}
            className="fe-area"
            value={text}
            spellCheck={false}
            wrap="off"
            aria-label={`${XML_FILE} of ${name}`}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={keys}
            onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
          />
        </div>
      )}
      {tab === 'Message Flow' && <Diagram model={model} onPick={goLine} />}
      {tab === 'Global Elements' && (
        <Table
          heads={['Name', 'Type', 'Line']}
          empty="No global elements."
          rows={model.globals.map((g, i) => (
            <tr key={i}>
              <td>{g.name ?? g.attrs.file ?? g.attrs['doc:name'] ?? ''}</td>
              <td>{LABEL[g.type] ?? g.type}</td>
              <td>
                <button type="button" className="pc-link" onClick={() => goLine(g.line)}>
                  {g.line}
                </button>
              </td>
            </tr>
          ))}
        />
      )}
      {tab === 'Changes' && <Changes before={deployed} after={text} config={app.config} />}
      <section className="fe-problems" aria-label="Problems">
        <h3>
          Problems <span className="pc-dim">{errors} errors, {warnings} warnings</span>
        </h3>
        <Table
          heads={['', 'Description', 'Resource', 'Location']}
          empty="No problems."
          rows={model.problems.map((p, i) => (
            <tr key={i} className="fe-prow" onClick={() => goLine(p.line)}>
              <td>
                <span className={`fe-sev ${p.severity}`} title={p.severity === 'error' ? 'Error' : 'Warning'}>
                  {p.severity === 'error' ? '×' : '!'}
                </span>
              </td>
              <td>{p.message}</td>
              <td>{XML_FILE}</td>
              <td>
                <button type="button" className="pc-link" onClick={(e) => (e.stopPropagation(), goLine(p.line))}>
                  line {p.line}
                </button>
              </td>
            </tr>
          ))}
        />
        <p className="pc-dim fe-small">The Problems view checks the XML the way Studio does. At deploy time the runtime also needs a value for each $&#123;property&#125; in the properties of the app.</p>
      </section>
    </>
  )
}

// ---------- Message Flow ----------

function Diagram({ model, onPick }) {
  if (!model.root) return <p className="pc-empty pc-boxed">The XML cannot be read, so the flows cannot be drawn. Fix the first problem below.</p>
  if (!model.flowList.length) return <p className="pc-empty pc-boxed">This configuration has no flows.</p>
  return (
    <div className="fe-canvas">
      {model.flowList.map((f) => (
        <section key={f.name} className={`fe-flow ${f.kind}`}>
          <h4>
            <button type="button" className="pc-link" onClick={() => onPick(f.line)}>
              {f.name}
            </button>
            <small>{f.kind}</small>
          </h4>
          <div className="fe-lane">
            {f.source && <Box step={f.source} onPick={onPick} source />}
            {f.steps.map((s, i) => (
              <Node key={i} step={s} onPick={onPick} />
            ))}
            {!f.source && !f.steps.length && <span className="pc-dim">Empty</span>}
          </div>
          {f.errorHandler && <Handlers eh={f.errorHandler} onPick={onPick} />}
        </section>
      ))}
    </div>
  )
}

function Handlers({ eh, onPick }) {
  return (
    <div className="fe-eh">
      <b>Error handling</b>
      {eh.ref && <span className="pc-dim"> Reference to the global error handler {eh.ref}</span>}
      {eh.handlers.map((h, i) => (
        <div key={i} className={`fe-scope fe-h-${h.kind}`}>
          <button type="button" className="fe-scope-head" onClick={() => onPick(h.line)}>
            <b>{LABEL[h.element]}</b> <span>{h.typeText || (h.when ? `when ${h.when}` : 'every error')}</span>
            {!h.logException && <em> logException false</em>}
          </button>
          <div className="fe-lane">
            {h.steps.map((s, j) => (
              <Node key={j} step={s} onPick={onPick} />
            ))}
            {!h.steps.length && <span className="pc-dim">No steps</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Node({ step, onPick }) {
  if (!SCOPES.includes(step.kind)) return <Box step={step} onPick={onPick} />
  const lanes =
    step.kind === 'choice' || step.kind === 'scatter-gather'
      ? step.parts.map((p) => [p.kind === 'when' ? `when ${p.attrs.expression ?? ''}` : p.kind === 'otherwise' ? 'otherwise' : 'route', p.steps])
      : step.kind === 'batch:job'
        ? [
            ...(step.parts.find((p) => p.kind === 'batch:process-records')?.parts ?? []).map((p) => [`Batch Step ${p.attrs.name ?? ''}${p.attrs.acceptPolicy ? `, ${p.attrs.acceptPolicy}` : ''}`, p.steps]),
            ...step.parts.filter((p) => p.kind === 'batch:on-complete').map((p) => ['On Complete', p.steps]),
          ]
        : [[null, step.steps]]
  return (
    <div className={`fe-scope fe-${family(step.kind)}${step.kind === 'try' && detail(step) !== 'no transaction' ? ' fe-tx' : ''}`}>
      <button type="button" className="fe-scope-head" onClick={() => onPick(step.line)} title={`${XML_FILE}, line ${step.line}`}>
        <b>{step.attrs['doc:name'] ?? LABEL[step.kind]}</b> <span>{LABEL[step.kind]}</span> <small>{detail(step)}</small>
      </button>
      {lanes.map(([title, steps], i) => (
        <div key={i} className="fe-branch">
          {title && <small className="fe-branch-title">{title}</small>}
          <div className="fe-lane">
            {steps.map((s, j) => (
              <Node key={j} step={s} onPick={onPick} />
            ))}
            {!steps.length && <span className="pc-dim">Empty</span>}
          </div>
        </div>
      ))}
      {step.errorHandler && <Handlers eh={step.errorHandler} onPick={onPick} />}
    </div>
  )
}

function Box({ step, onPick, source }) {
  return (
    <button type="button" className={`fe-box fe-${family(step.kind)}${source ? ' fe-source' : ''}`} onClick={() => onPick(step.line)} title={`${step.kind}, ${XML_FILE} line ${step.line}`}>
      <i>{(LABEL[step.kind] ?? step.kind).slice(0, 1)}</i>
      <b>{step.attrs['doc:name'] ?? LABEL[step.kind] ?? step.kind}</b>
      <small>{LABEL[step.kind] ?? step.kind}</small>
      {detail(step) && <small className="fe-detail">{detail(step)}</small>}
    </button>
  )
}

// ---------- Changes ----------

function Changes({ before, after, config }) {
  const rows = useMemo(() => diffLines(before, after), [before, after])
  const changed = rows.some((r) => r.op !== ' ')
  if (!changed) return <p className="pc-empty pc-boxed">The draft is the same as config {config}, the deployed version.</p>
  // unchanged runs longer than 6 lines are folded, with 3 lines of context on each side
  const near = rows.map((_, i) => rows.slice(Math.max(0, i - 3), i + 4).some((r) => r.op !== ' '))
  const out = []
  rows.forEach((r, i) => {
    if (near[i]) out.push(r)
    else if (near[i - 1] !== false) out.push({ fold: true })
  })
  const added = rows.filter((r) => r.op === '+').length
  const removed = rows.filter((r) => r.op === '-').length
  return (
    <div className="fe-diff" aria-label="Changes against the deployed version">
      <p className="pc-dim">
        Config {config} (deployed) against the draft: {added} lines added, {removed} removed.
      </p>
      <pre>
        {out.map((r, i) =>
          r.fold ? (
            <span key={i} className="fe-fold">
              ⋯
            </span>
          ) : (
            <span key={i} className={r.op === '+' ? 'fe-add' : r.op === '-' ? 'fe-del' : ''}>
              <i>{r.a ?? ''}</i>
              <i>{r.b ?? ''}</i>
              {r.op} {r.text}
            </span>
          ),
        )}
      </pre>
    </div>
  )
}
