// Splunk Enterprise in the style of Search and Reporting: the search bar with a time picker, events with their fields,
// statistics and a chart. Settings has Indexes and Data inputs, HTTP Event Collector. Alerts lists the saved alerts.
// The tab "In the Mule app" is a lab tool: the log4j2.xml in src/main/resources of each app and the Disable CloudHub
// logs checkbox of Runtime Manager, with a Redeploy, so the whole path from a Mule app to an index is on one screen.
import { useEffect, useMemo, useState } from 'react'
import { stamp } from '../../lab/platform.js'
import { change } from '../../lab/platform-kit.js'
import {
  addAlert, addIndex, addToken, ELK_SNIPPET, fieldsOf, HEC_URL, log4jTemplate, loggingOf, parseLog4j, rangeOf, rawOf, runSearch, runSpl, setAlert, setHecGlobal, setIndex, setToken, testAlert, TIME_RANGES, upgradeObservability, viewAlerts, viewHec,
} from '../../lab/platform-observability.js'
import { COLORS } from './charts.js'
import { Btn, Chart, Check, Errors, Field, Input, Note, Select, Table, Tabs } from './parts.jsx'

const PAGES = [['search', 'Search'], ['alerts', 'Alerts'], ['indexes', 'Settings: Indexes'], ['hec', 'Settings: HTTP Event Collector'], ['mule', 'In the Mule app']]
const PALETTE = [COLORS.green, COLORS.blue, COLORS.amber, COLORS.violet, COLORS.teal, COLORS.red]

export default function Splunk({ state, update }) {
  const o = state.observability
  const [page, setPage] = useState('search')
  const [query, setQuery] = useState('index=mule')
  // a save from before Splunk was built holds a placeholder: seed the Splunk server of Harbor
  useEffect(() => {
    if (o && !o.splunk) update((s) => ({ ...s, observability: upgradeObservability(structuredClone(s.observability), s.clock) }))
  }, [o, update])
  if (!o?.splunk)
    return (
      <main className="pc-main">
        <h2>Splunk</h2>
        <p className="pc-empty pc-boxed">{o ? 'Opening Splunk.' : 'This lab has no Splunk server.'}</p>
      </main>
    )
  const sp = o.splunk
  return (
    <main className="pc-main sk-app">
      <header className="sk-head">
        <b className="sk-logo">
          splunk<span>&gt;</span>enterprise
        </b>
        <nav className="sk-nav" aria-label="Splunk">
          {PAGES.map(([k, label]) => (
            <button key={k} type="button" className={page === k ? 'on' : ''} aria-current={page === k ? 'page' : undefined} onClick={() => setPage(k)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="sk-host">{sp.host}</span>
      </header>
      {page === 'search' && <Search state={state} update={update} query={query} setQuery={setQuery} />}
      {page === 'alerts' && <Alerts state={state} update={update} openSearch={(q) => (setQuery(q), setPage('search'))} />}
      {page === 'indexes' && <Indexes state={state} update={update} />}
      {page === 'hec' && <Hec state={state} update={update} />}
      {page === 'mule' && <InMule state={state} update={update} />}
    </main>
  )
}

// ---------- Search and Reporting ----------

function Search({ state, update, query, setQuery }) {
  const o = state.observability
  const [range, setRange] = useState('60m')
  const [ran, setRan] = useState(null)
  const [tab, setTab] = useState('Events')
  const [open, setOpen] = useState({})
  const result = useMemo(() => (ran ? runSpl(o, ran.q, ...rangeOf(ran.range, ran.at)) : null), [o, ran])
  const submit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setRan({ q: query, range, at: state.clock })
    setOpen({})
    setTab(/\|\s*(stats|timechart|table)/i.test(query) ? 'Statistics' : 'Events')
    update((s) => runSearch(s, query, range))
  }
  const fields = useMemo(() => {
    if (!result) return []
    const map = {}
    for (const e of result.events.slice(0, 200)) for (const [k, v] of Object.entries(fieldsOf(e))) (map[k] ??= new Map()).set(String(v), (map[k].get(String(v)) ?? 0) + 1)
    return Object.entries(map).map(([k, m]) => [k, m.size, [...m].sort((a, b) => b[1] - a[1]).slice(0, 3)])
  }, [result])

  return (
    <>
      <form className="sk-search" onSubmit={submit}>
        <textarea className="pc-input sk-q" value={query} onChange={(e) => setQuery(e.target.value)} rows={2} aria-label="Search" spellCheck="false" onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit(e)} />
        <Select value={range} onChange={setRange} options={TIME_RANGES.map(([k, label]) => [k, label])} aria-label="Time range" />
        <Btn kind="primary" type="submit">
          Search
        </Btn>
      </form>
      <p className="pc-dim">
        Terms: field=value, field!=value, a star as wildcard, &quot;quoted text&quot; and NOT. Commands after a pipe: stats count by field, timechart span=5m count by field, table, sort, head. Without index= the lab searches every index but _internal.
      </p>
      {result && (
        <>
          {result.error && <Errors list={[result.error]} />}
          <div className="sk-count">
            <b>{result.events.length}</b> events ({TIME_RANGES.find((r) => r[0] === ran.range)?.[1]}){result.kind === 'table' && `, ${result.rows.length} results`}
          </div>
          <Tabs tabs={['Events', 'Statistics', 'Visualization']} value={tab} onChange={setTab} />
          {tab === 'Events' && (
            <div className="sk-events">
              <aside className="sk-fields" aria-label="Fields">
                <b>Fields</b>
                {fields.map(([k, n, top]) => (
                  <div key={k} title={top.map(([v, c]) => `${v} (${c})`).join('\n')}>
                    <span>{k}</span> <small>{n}</small>
                  </div>
                ))}
              </aside>
              <ol className="sk-list">
                {result.events.slice(0, 100).map((e, i) => (
                  <li key={i}>
                    <button type="button" className="sk-toggle" aria-expanded={Boolean(open[i])} onClick={() => setOpen({ ...open, [i]: !open[i] })}>
                      {open[i] ? '▾' : '▸'}
                    </button>
                    <span className="sk-time">{stamp(e._time)}</span>
                    <div className="sk-raw">
                      <code>{rawOf(e)}</code>
                      <small>
                        host = {e.host} | source = {e.source} | sourcetype = {e.sourcetype}
                      </small>
                      {open[i] && (
                        <table className="sk-kv">
                          <tbody>
                            {Object.entries({ _time: stamp(e._time), ...fieldsOf(e) }).map(([k, v]) => (
                              <tr key={k}>
                                <th scope="row">{k}</th>
                                <td>{String(v)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </li>
                ))}
                {result.events.length === 0 && <li className="pc-empty">No results found.</li>}
                {result.events.length > 100 && <li className="pc-dim">The first 100 events are shown.</li>}
              </ol>
            </div>
          )}
          {tab === 'Statistics' &&
            (result.kind === 'table' ? (
              <Table heads={result.columns} rows={result.rows.slice(0, 200).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{result.time && j === 0 ? stamp(c) : String(c)}</td>)}</tr>)} empty="No results found." />
            ) : (
              <Note>Your search isn&apos;t generating any statistic or visualization results. Add a command such as | stats count by app or | timechart span=5m count.</Note>
            ))}
          {tab === 'Visualization' && <Visual result={result} />}
        </>
      )}
    </>
  )
}

function Visual({ result }) {
  if (result.kind !== 'table' || !result.rows.length || (!result.span && typeof result.rows[0].at(-1) !== 'number')) return <Note>Your search isn&apos;t generating any statistic or visualization results.</Note>
  if (result.span) {
    const labels = result.rows.map((r) => stamp(r[0]).slice(11, 16))
    return <Chart title="Count over time" labels={labels} series={result.columns.slice(1).map((c, i) => ({ name: c, color: PALETTE[i % PALETTE.length], points: result.rows.map((r) => r[i + 1]) }))} />
  }
  const top = Math.max(1, ...result.rows.map((r) => Number(r.at(-1)) || 0))
  return (
    <div className="sk-bars" role="img" aria-label="Bar chart of the results">
      {result.rows.slice(0, 20).map((r, i) => (
        <div key={i} className="sk-bar">
          <span>{r.slice(0, -1).join(', ') || 'all'}</span>
          <i style={{ width: `${(100 * (Number(r.at(-1)) || 0)) / top}%` }} />
          <b>{r.at(-1)}</b>
        </div>
      ))}
    </div>
  )
}

// ---------- alerts ----------

const BLANK_ALERT = { name: '', search: '', every: '5', window: '5', threshold: '0', to: 'ops@harbor.example' }
function Alerts({ state, update, openSearch }) {
  const sp = state.observability.splunk
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState([])
  useEffect(() => update(viewAlerts), [update])
  const set = (patch) => setForm({ ...form, ...patch })
  const save = () => {
    const r = addAlert(state, form)
    setErrors(r.errors)
    if (!r.errors.length) {
      update((s) => addAlert(s, form).state)
      setForm(null)
    }
  }
  return (
    <>
      <div className="pc-bar">
        <h3 className="pc-grow">Searches, reports, and alerts</h3>
        <Btn kind="primary" onClick={() => (setForm(BLANK_ALERT), setErrors([]))}>
          New Alert
        </Btn>
      </div>
      {form && (
        <div className="sk-form">
          <Field label="Title" required>
            <Input value={form.name} onChange={(name) => set({ name })} />
          </Field>
          <Field label="Search" required wide>
            <Input value={form.search} onChange={(search) => set({ search })} placeholder="index=mule level=ERROR" />
          </Field>
          <Field label="Run every (minutes)">
            <Input value={form.every} onChange={(every) => set({ every })} inputMode="numeric" />
          </Field>
          <Field label="Over the last (minutes)">
            <Input value={form.window} onChange={(window) => set({ window })} inputMode="numeric" />
          </Field>
          <Field label="Trigger when Number of Results is greater than">
            <Input value={form.threshold} onChange={(threshold) => set({ threshold })} inputMode="numeric" />
          </Field>
          <Field label="Send email to">
            <Input value={form.to} onChange={(to) => set({ to })} />
          </Field>
          <Errors list={errors} />
          <div className="pc-bar">
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn kind="primary" onClick={save}>
              Save
            </Btn>
          </div>
        </div>
      )}
      <Table
        heads={['Title', 'Search', 'Schedule', 'Trigger', 'Last run', 'Fired', 'Tested', 'Actions']}
        empty="No alerts yet."
        rows={sp.alerts.map((a) => (
          <tr key={a.name}>
            <td>{a.name}</td>
            <td>
              <code>{a.search}</code>
            </td>
            <td>
              Every {a.every} min over the last {a.window} min
            </td>
            <td>Results &gt; {a.threshold}, mail {a.to}</td>
            <td>{a.lastRun == null ? 'Never' : `${stamp(a.lastRun)}, ${a.lastCount} results`}</td>
            <td>{a.fired ? `${a.fired} times, last ${stamp(a.lastFired)}` : 'Never'}</td>
            <td>{a.tested ? `${stamp(a.tested.t)}: ${a.tested.n} results` : 'No'}</td>
            <td className="sk-actions">
              <Btn onClick={() => update((s) => testAlert(s, a.name))}>Run</Btn>
              <Btn onClick={() => openSearch(a.search)}>Open in Search</Btn>
              <Btn onClick={() => update((s) => setAlert(s, a.name, { enabled: !a.enabled }))}>{a.enabled ? 'Disable' : 'Enable'}</Btn>
            </td>
          </tr>
        ))}
      />
      <Note>A scheduled alert runs its search over its own window and mails when it finds more than the threshold. It mails at most once an hour (throttle).</Note>
    </>
  )
}

// ---------- settings ----------

function Indexes({ state, update }) {
  const sp = state.observability.splunk
  const [name, setName] = useState('')
  const [errors, setErrors] = useState([])
  const count = (n) => sp.events.filter((e) => e.index === n).length
  const create = (e) => {
    e.preventDefault()
    const r = addIndex(state, name)
    setErrors(r.errors)
    if (!r.errors.length) {
      update((s) => addIndex(s, name).state)
      setName('')
    }
  }
  return (
    <>
      <h3>Indexes</h3>
      <form className="pc-bar" onSubmit={create}>
        <Field label="Index Name">
          <Input value={name} onChange={setName} placeholder="mule" />
        </Field>
        <Btn kind="primary" type="submit">
          New Index
        </Btn>
      </form>
      <Errors list={errors} />
      <Table
        heads={['Name', 'Event Count', 'Status', 'Actions']}
        rows={sp.indexes.map((x) => (
          <tr key={x.name}>
            <td>{x.name}</td>
            <td>{count(x.name)}</td>
            <td>{x.enabled ? 'Enabled' : 'Disabled'}</td>
            <td>
              <Btn onClick={() => update((s) => setIndex(s, x.name, !x.enabled))}>{x.enabled ? 'Disable' : 'Enable'}</Btn>
            </td>
          </tr>
        ))}
      />
      <Note>HEC refuses events for a disabled index, or for an index the token does not allow, with 400 {'{"text":"Incorrect index","code":7}'}.</Note>
    </>
  )
}

function Hec({ state, update }) {
  const sp = state.observability.splunk
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState([])
  useEffect(() => update(viewHec), [update])
  const enabled = sp.indexes.filter((x) => x.enabled).map((x) => x.name)
  const save = () => {
    const r = addToken(state, form)
    setErrors(r.errors)
    if (!r.errors.length) {
      update((s) => addToken(s, form).state)
      setForm(null)
    }
  }
  return (
    <>
      <div className="pc-bar">
        <h3 className="pc-grow">HTTP Event Collector</h3>
        <Btn kind="primary" onClick={() => (setForm({ name: '', sourcetype: 'mule:app', indexes: [], index: '' }), setErrors([]))}>
          New Token
        </Btn>
      </div>
      <div className="sk-form">
        <b>Global Settings</b>
        <Field label="All Tokens">
          <Select value={sp.allTokens ? 'Enabled' : 'Disabled'} onChange={(v) => update((s) => setHecGlobal(s, { allTokens: v === 'Enabled' }))} options={['Enabled', 'Disabled']} />
        </Field>
        <Field label="HTTP Port Number">
          <Input value={String(sp.port)} onChange={() => {}} readOnly />
        </Field>
        <small className="pc-hint">Enable SSL is on. Apps send to {HEC_URL} with the header Authorization: Splunk &lt;token&gt;.</small>
      </div>
      {form && (
        <div className="sk-form">
          <Field label="Name" required>
            <Input value={form.name} onChange={(name) => setForm({ ...form, name })} />
          </Field>
          <Field label="Source type">
            <Input value={form.sourcetype} onChange={(sourcetype) => setForm({ ...form, sourcetype })} />
          </Field>
          <div className="pc-field">
            <span className="pc-label">Allowed Indexes</span>
            <div className="pc-levels">
              {enabled.map((n) => (
                <Check key={n} checked={form.indexes.includes(n)} onChange={(on) => setForm({ ...form, indexes: on ? [...form.indexes, n] : form.indexes.filter((x) => x !== n), index: on && !form.index ? n : form.index })}>
                  {n}
                </Check>
              ))}
            </div>
          </div>
          <Field label="Default Index">
            <Select value={form.index} onChange={(index) => setForm({ ...form, index })} options={form.indexes} placeholder="Choose" />
          </Field>
          <Errors list={errors} />
          <div className="pc-bar">
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn kind="primary" onClick={save}>
              Create
            </Btn>
          </div>
        </div>
      )}
      <Table
        heads={['Name', 'Token Value', 'Source Type', 'Index', 'Allowed Indexes', 'Status', 'Actions']}
        empty="No tokens yet."
        rows={sp.tokens.map((t) => (
          <tr key={t.name}>
            <td>{t.name}</td>
            <td>
              <code>{t.value}</code>
            </td>
            <td>{t.sourcetype || 'Automatic'}</td>
            <td>{t.index}</td>
            <td>{t.indexes.join(', ')}</td>
            <td>{t.enabled ? 'Enabled' : 'Disabled'}</td>
            <td>
              <Btn onClick={() => update((s) => setToken(s, t.name, { enabled: !t.enabled }))}>{t.enabled ? 'Disable' : 'Enable'}</Btn>
            </td>
          </tr>
        ))}
      />
      <h4>Recent requests</h4>
      <p className="pc-dim">Lab view of what HEC answered each app. In Splunk itself, search index=_internal sourcetype=splunkd HttpInputDataHandler.</p>
      <Table
        heads={['Time', 'App', 'Status', 'Answer', 'Events']}
        empty="No requests yet."
        rows={[...sp.hec].reverse().slice(0, 15).map((h, i) => (
          <tr key={i}>
            <td>{stamp(h.t)}</td>
            <td>{h.app}</td>
            <td>{h.status || 'none'}</td>
            <td>
              <code>{h.text}</code>
            </td>
            <td>{h.n}</td>
          </tr>
        ))}
      />
    </>
  )
}

// ---------- the lab tool: log4j2.xml of an app ----------

function InMule({ state, update }) {
  const apps = state.apps.filter((a) => a.env === state.env)
  const [name, setName] = useState(apps.find((a) => a.log4j)?.name ?? apps[0]?.name ?? '')
  const app = apps.find((a) => a.name === name)
  const [text, setText] = useState(app?.log4j ?? '')
  const [disable, setDisable] = useState(Boolean(app?.disableChLogs))
  useEffect(() => {
    setText(app?.log4j ?? '')
    setDisable(Boolean(app?.disableChLogs))
  }, [name]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!app) return <Note>There is no application in {state.env}.</Note>
  const cfg = text.trim() ? parseLog4j(text) : null
  const use = loggingOf({ ...app, log4j: text, disableChLogs: disable })
  const last = [...(state.observability.splunk.hec ?? [])].reverse().find((h) => h.app === app.name)
  const changed = text !== (app.log4j ?? '') || disable !== Boolean(app.disableChLogs)
  const insertElk = () => setText(text.includes('</Appenders>') ? text.replace('</Appenders>', `${ELK_SNIPPET}  </Appenders>`) : text)
  return (
    <>
      <div className="pc-bar">
        <Field label="Application">
          <Select value={name} onChange={setName} options={apps.map((a) => a.name)} />
        </Field>
        <span className="pc-grow" />
        <Btn onClick={() => setText(log4jTemplate())}>Insert template</Btn>
        <Btn onClick={insertElk} disabled={!text.includes('</Appenders>')}>
          Add ELK appender
        </Btn>
      </div>
      <p className="pc-dim">Lab tool. src/main/resources/log4j2.xml of {app.name}, and the Disable CloudHub logs setting of Runtime Manager. A redeploy is a new configuration of the app, as Apply Changes is.</p>
      <textarea className="pc-input sk-xml" value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck="false" aria-label="log4j2.xml" placeholder="No log4j2.xml: the app uses the CloudHub default." />
      <Check checked={disable} onChange={setDisable}>
        Disable CloudHub logs
      </Check>
      <small className="pc-hint">With the box clear, CloudHub uses its own Log4j configuration and ignores this file. With it ticked, this file is used, and Runtime Manager shows logs only through the Log4J2CloudhubLogAppender.</small>
      <div className="pc-bar">
        <span className="pc-grow" />
        <Btn kind="primary" disabled={!changed || app.status === 'Starting'} onClick={() => update((s) => change(s, app.name, { log4j: text, disableChLogs: disable }))}>
          Redeploy
        </Btn>
      </div>
      {cfg && (
        <dl className="pc-facts">
          <dt>File in use</dt>
          <dd>{use.custom ? 'Yes' : 'No, Disable CloudHub logs is clear'}</dd>
          <dt>Appenders</dt>
          <dd>{cfg.appenders.map((x) => `${x.name} (${x.type}${x.type === 'Async' ? ` to ${x.refs.join(', ')}` : ''})`).join(', ') || 'None'}</dd>
          <dt>Root logger</dt>
          <dd>
            {cfg.root ? `${cfg.root.tag} level ${cfg.root.level}: ${cfg.rootRefs.join(', ') || 'no AppenderRef'}` : 'None'}
          </dd>
          {cfg.errors.length > 0 && (
            <>
              <dt>Problems</dt>
              <dd>{cfg.errors.join(' ')}</dd>
            </>
          )}
          <dt>Last HEC answer</dt>
          <dd>{last ? `${stamp(last.t)}: ${last.status || ''} ${last.text}` : 'None yet'}</dd>
          <dt>Sent to ELK</dt>
          <dd>{state.observability.elk?.n ?? 0} events</dd>
        </dl>
      )}
    </>
  )
}
