// Databases: SQL Server in the style of SQL Server Management Studio and Oracle in the style of Oracle SQL Developer.
// Object Explorer, a query window with results and messages, Activity Monitor with blocking and Kill Process, the
// execution plan, the deadlock graph of system_health, logins and users, and how the Mule Database config maps.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { mark } from '../../lab/platform.js'
import { activityOf, deadlockXml, indexList, killSession, loginsOf, msText, ORACLE, poolsOf, runSql, showPlan, sqlTime, tablesOf, upgradeDatabases, usersOf } from '../../lab/platform-db.js'
import { Modal } from './parts.jsx'

const SQL_VIEWS = [
  ['query', 'Query'],
  ['activity', 'Activity Monitor'],
  ['plan', 'Execution plan'],
  ['deadlocks', 'Deadlocks'],
  ['security', 'Logins and users'],
  ['mule', 'Mule config'],
]
const ORA_VIEWS = [
  ['query', 'Worksheet'],
  ['activity', 'Sessions'],
  ['plan', 'Explain Plan'],
  ['deadlocks', 'Deadlocks'],
  ['security', 'Users'],
  ['mule', 'Mule config'],
]
const START_SQL = {
  sqlserver: "SELECT TOP 10 order_id, customer_id, status, total\nFROM dbo.orders\nWHERE status = 'PAID'\nORDER BY order_id;",
  oracle: "SELECT SHIPMENT_ID, ORDER_ID, STATUS, CREATED_AT\nFROM BRIGHTMART.SHIPMENTS\nWHERE STATUS = 'BOOKED'\nORDER BY SHIPMENT_ID\nFETCH FIRST 10 ROWS ONLY;",
}
const n = (x) => Math.round(x).toLocaleString('en-US')
const cell = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : String(v))
const Btn = ({ kind = 'plain', ...props }) => <button type="button" className={`db-btn db-btn-${kind}`} {...props} />

function Grid({ heads, rows, empty = 'No rows.', onRow, picked }) {
  return (
    <div className="db-grid-box">
      <table className="db-grid">
        <thead>
          <tr>
            <th className="db-rn" aria-label="Row" />
            {heads.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`${onRow ? 'db-pick' : ''}${picked === i ? ' on' : ''}`} onClick={onRow ? () => onRow(i) : undefined}>
              <td className="db-rn">{i + 1}</td>
              {r.map((v, j) => (
                <td key={j} className={v === null || v === undefined ? 'db-null' : ''}>
                  {typeof v === 'object' && v !== null ? v : cell(v)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={heads.length + 1} className="db-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
const Tabs = ({ tabs, value, onChange }) => (
  <div className="db-tabs" role="tablist">
    {tabs.map(([k, label]) => (
      <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
        {label}
      </button>
    ))}
  </div>
)

export default function DbConsole({ state, update, place, go }) {
  const servers = state.databases?.servers ?? {}
  const names = Object.keys(servers)
  const name = servers[place.db] ? place.db : names[0]
  const srv = servers[name]
  const view = place.view ?? 'query'
  const [texts, setTexts] = useState({})
  const [outs, setOuts] = useState({})
  const [error, setError] = useState('')

  // a save from while the engine was a placeholder has only { created }: fill in the servers of the lab
  const placeholder = Boolean(state.databases && !state.databases.servers)
  useEffect(() => {
    if (placeholder) update((s) => upgradeDatabases({ ...s, databases: { ...s.databases } }))
  }, [placeholder, update])
  useEffect(() => {
    if (name) update((s) => mark(s, `db:${name}`))
  }, [name, update])
  useEffect(() => {
    if (name && view === 'activity') update((s) => mark(s, `db-activity:${name}`))
    if (name && view === 'deadlocks') update((s) => mark(s, `db-deadlock:${name}`))
  }, [name, view, update])
  useEffect(() => setError(''), [place])

  if (!srv)
    return (
      <main className="pc-main db-main">
        <p className="pc-empty pc-boxed">No database server is connected to this console.</p>
      </main>
    )
  const ora = srv.vendor === ORACLE
  const to = (next) => go({ db: name, ...next })
  const text = texts[name] ?? START_SQL[srv.vendor]
  const setText = (v) => setTexts((t) => ({ ...t, [name]: v }))
  const out = outs[name]
  const setOut = (o) => setOuts((x) => ({ ...x, [name]: o }))

  const execute = (actualPlan) => {
    const r = runSql(state, name, text, { actualPlan })
    update((s) => runSql(s, name, text, { actualPlan }).state)
    setOut({ ...r.out, tab: r.out.grids.length ? 'results' : 'messages', at: state.clock })
  }
  const estimated = () => {
    const r = showPlan(state, name, text)
    if (!r.ok) {
      setOut({ grids: [], messages: [r.text], plans: [], error: true, tab: 'messages', at: state.clock })
      return
    }
    update((s) => mark(showPlan(s, name, text).state, `db-plan:${name}`))
    to({ view: 'plan', plan: null })
  }
  const kill = (id) => {
    const r = killSession(state, name, id)
    if (!r.ok) {
      setError(r.text)
      return
    }
    setError('')
    update((s) => killSession(s, name, id).state)
  }
  const openTable = (tk) => {
    to({ view: 'table', table: tk })
  }
  const views = ora ? ORA_VIEWS : SQL_VIEWS
  const me = srv.sessions.find((x) => x.id === srv.console)

  return (
    <main className="pc-main db-main">
      <div className={`db ${ora ? 'db-ora' : 'db-sql'}`}>
        <header className="db-title">
          <b>{ora ? 'Oracle SQL Developer' : 'Microsoft SQL Server Management Studio'}</b>
          <label>
            <span>{ora ? 'Connection' : 'Server'}</span>
            <select value={name} onChange={(e) => go({ db: e.target.value, view: 'query' })}>
              {names.map((x) => (
                <option key={x} value={x}>
                  {x} ({servers[x].vendor === ORACLE ? 'Oracle' : 'SQL Server'})
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="db-toolbar" role="toolbar" aria-label="Query">
          <Btn onClick={() => to({ view: 'query' })}>{ora ? 'SQL Worksheet' : 'New Query'}</Btn>
          <Btn kind="go" onClick={() => { to({ view: 'query' }); execute(false) }} title={ora ? 'Run Script (F5)' : 'Execute (F5)'}>
            {ora ? 'Run Script' : 'Execute'}
          </Btn>
          <Btn onClick={estimated} title={ora ? 'Explain Plan (F10)' : 'Display Estimated Execution Plan (Ctrl+L)'}>
            {ora ? 'Explain Plan' : 'Display Estimated Execution Plan'}
          </Btn>
          {!ora && (
            <Btn onClick={() => { to({ view: 'query' }); execute(true) }} title="Include Actual Execution Plan (Ctrl+M), then execute">
              Execute with actual plan
            </Btn>
          )}
          <Btn onClick={() => to({ view: 'activity' })}>{ora ? 'Sessions' : 'Activity Monitor'}</Btn>
          <span className="db-grow" />
          {me?.openTran > 0 && <span className="db-warn-chip">{ora ? 'Uncommitted changes in this worksheet' : `Open transaction in this window (@@TRANCOUNT ${me.openTran})`}</span>}
        </div>
        <div className="db-body">
          <Explorer srv={srv} name={name} to={to} openTable={openTable} place={place} />
          <section className="db-page">
            <Tabs tabs={views} value={view === 'table' ? '' : view} onChange={(v) => to({ view: v })} />
            {error && (
              <p className="db-err" role="alert">
                {error}
              </p>
            )}
            {view === 'query' && <Query srv={srv} text={text} setText={setText} out={out} setOut={setOut} me={me} execute={execute} name={name} update={update} />}
            {view === 'activity' && <Activity srv={srv} now={state.clock} kill={kill} />}
            {view === 'plan' && <Plans key={name} srv={srv} picked={place.plan} to={to} name={name} update={update} />}
            {view === 'deadlocks' && <Deadlocks srv={srv} picked={place.deadlock} to={to} />}
            {view === 'security' && <Security srv={srv} />}
            {view === 'mule' && <MuleConfig srv={srv} />}
            {view === 'table' && tablesOf(srv)[place.table] && <TableView srv={srv} tk={place.table} setText={setText} to={to} />}
          </section>
        </div>
        <footer className="db-status">
          <span>{srv.host}{ora ? `:${srv.port}/${srv.service}` : ` (${srv.version.match(/\d+\.\d+\.\d+\.\d+/)?.[0] ?? ''})`}</span>
          <span>{ora ? me?.login ?? 'BRIGHTMART_DBA' : `${me?.login ?? 'BRIGHTMART\\dba'} (${me?.id ?? '-'})`}</span>
          <span>{srv.database}</span>
          <span>{sqlTime(state.clock).slice(0, 19)}</span>
        </footer>
      </div>
    </main>
  )
}

// ---------- Object Explorer ----------

function Explorer({ srv, name, to, openTable, place }) {
  const ora = srv.vendor === ORACLE
  const [open, setOpen] = useState({ tables: true, security: false, xe: true })
  const flip = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const Node = ({ k, label, children }) => (
    <li>
      <button type="button" className="db-node" aria-expanded={Boolean(open[k])} onClick={() => flip(k)}>
        <i>{open[k] ? '▾' : '▸'}</i> {label}
      </button>
      {open[k] && <ul>{children}</ul>}
    </li>
  )
  const Leaf = ({ label, onClick, on }) => (
    <li>
      <button type="button" className={`db-leaf${on ? ' on' : ''}`} onClick={onClick}>
        {label}
      </button>
    </li>
  )
  return (
    <nav className="db-explorer" aria-label={ora ? 'Connections' : 'Object Explorer'}>
      <b className="db-explorer-head">{ora ? 'Connections' : 'Object Explorer'}</b>
      <ul>
        <li>
          <span className="db-server">
            {ora ? `${name} (${srv.service})` : `${srv.host} (SQL Server 16.0, BRIGHTMART\\dba)`}
          </span>
          <ul>
            <Node k="tables" label={ora ? 'Tables (BRIGHTMART)' : `Databases, ${srv.database}, Tables`}>
              {Object.keys(tablesOf(srv)).map((tk) => (
                <Leaf key={tk} label={tk} on={place.view === 'table' && place.table === tk} onClick={() => openTable(tk)} />
              ))}
            </Node>
            <Node k="security" label={ora ? 'Other Users' : 'Security, Logins'}>
              {loginsOf(srv).map((l) => (
                <Leaf key={l.name} label={`${l.name}${l.disabled || l.status === 'LOCKED' ? ' (disabled)' : ''}`} onClick={() => to({ view: 'security' })} />
              ))}
            </Node>
            <Node k="xe" label={ora ? 'Diagnostics' : 'Management'}>
              <Leaf label={ora ? 'Sessions (v$session)' : 'Activity Monitor'} on={place.view === 'activity'} onClick={() => to({ view: 'activity' })} />
              <Leaf label={ora ? 'Deadlock trace files' : 'Extended Events, system_health'} on={place.view === 'deadlocks'} onClick={() => to({ view: 'deadlocks' })} />
              <Leaf label="Mule Database config" on={place.view === 'mule'} onClick={() => to({ view: 'mule' })} />
            </Node>
          </ul>
        </li>
      </ul>
    </nav>
  )
}

// ---------- query window ----------

function Query({ srv, text, setText, out, setOut, me, execute }) {
  const ora = srv.vendor === ORACLE
  const tab = out?.tab ?? 'results'
  const key = (e) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) {
      e.preventDefault()
      execute(false)
    }
  }
  return (
    <div className="db-query">
      <textarea className="db-editor" aria-label={ora ? 'SQL Worksheet' : 'Query editor'} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} />
      <p className="db-hint">
        {ora
          ? 'Run Script runs each statement. Autocommit is off, as in SQL Developer: changes stay uncommitted until COMMIT or ROLLBACK.'
          : 'Execute runs the batch. Without BEGIN TRAN each statement commits on its own. The lab sets LOCK_TIMEOUT 5000 for this window, so a blocked statement stops after 5 seconds.'}
      </p>
      {out && (
        <>
          <Tabs
            tabs={[...(out.grids.length ? [['results', ora ? 'Query Result' : 'Results']] : []), ['messages', ora ? 'Script Output' : 'Messages'], ...(out.plans?.length ? [['plan', 'Execution plan']] : [])]}
            value={tab}
            onChange={(t) => setOut({ ...out, tab: t })}
          />
          {tab === 'results' &&
            out.grids.map((g, i) => (
              <Grid key={i} heads={g.columns.map((c) => c || '(No column name)')} rows={g.rows} />
            ))}
          {tab === 'messages' && <pre className={`db-messages${out.error ? ' bad' : ''}`}>{out.messages.join('\n')}</pre>}
          {tab === 'plan' && out.plans?.length > 0 && <PlanView srv={srv} plan={out.plans.at(-1)} />}
          <p className={`db-done${out.error ? ' bad' : ''}`}>{out.error ? 'Query completed with errors.' : 'Query executed successfully.'} {out.grids.reduce((x, g) => x + g.rows.length, 0)} rows. Session {me?.id}.</p>
        </>
      )}
    </div>
  )
}

// ---------- Activity Monitor ----------

function Activity({ srv, now, kill }) {
  const ora = srv.vendor === ORACLE
  const list = useMemo(() => activityOf(srv, now), [srv, now])
  const pools = poolsOf(srv)
  const [pick, setPick] = useState(null)
  const [ask, setAsk] = useState(null)
  const sel = list.find((x) => x.id === pick)
  const waiting = list.filter((x) => x.wait).length
  const heads = list.filter((x) => x.headBlocker).length
  const rows = list.map((x) =>
    ora
      ? [x.id, x.serial, x.login, x.status === 'suspended' || x.status === 'running' ? 'ACTIVE' : 'INACTIVE', x.host, x.program, x.wait ? x.wait.type : 'SQL*Net message from client', Math.round((x.wait ? x.waitMs : now - x.lastBatch) / 1000), x.blockedBy ?? null, x.openTran ? 'YES' : 'NO', x.headBlocker ? <b className="db-head">Blocker</b> : '']
      : [x.id, x.kind === 'console' ? 'User process' : 'User process', x.login, srv.database, x.status === 'suspended' ? 'SUSPENDED' : x.status === 'running' ? 'RUNNING' : '', x.pending ? x.pending.kind.toUpperCase() : x.status === 'sleeping' ? '' : 'SELECT', x.program, x.waitMs, x.wait?.type ?? '', x.wait?.resource ?? '', x.blockedBy ?? '', x.headBlocker ? <b className="db-head">1</b> : '', x.openTran, x.host],
  )
  return (
    <div className="db-activity">
      <div className="db-tiles">
        <div><small>{ora ? 'User sessions' : 'Processes'}</small><b>{list.length}</b></div>
        <div className={waiting ? 'warn' : ''}><small>Waiting tasks</small><b>{waiting}</b></div>
        <div className={heads ? 'bad' : ''}><small>Head blockers</small><b>{heads}</b></div>
        <div><small>Open transactions</small><b>{list.filter((x) => x.openTran).length}</b></div>
        <div><small>Deadlocks (system_health)</small><b>{srv.deadlocks.length}</b></div>
      </div>
      <h3>{ora ? 'Sessions (v$session)' : 'Processes'}</h3>
      <Grid
        heads={ora ? ['SID', 'SERIAL#', 'USERNAME', 'STATUS', 'MACHINE', 'PROGRAM', 'EVENT', 'SECONDS_IN_WAIT', 'BLOCKING_SESSION', 'IN TRANSACTION', ''] : ['Session ID', 'User Process', 'Login', 'Database', 'Task State', 'Command', 'Application', 'Wait Time (ms)', 'Wait Type', 'Wait Resource', 'Blocked By', 'Head Blocker', 'Open Transactions', 'Host Name']}
        rows={rows}
        onRow={(i) => setPick(list[i].id)}
        picked={list.findIndex((x) => x.id === pick)}
      />
      {sel && (
        <div className="db-detail">
          <h4>
            Session {sel.id}
            {ora && `, SERIAL# ${sel.serial}`} ({sel.program})
          </h4>
          <dl>
            <dt>Login</dt>
            <dd>{sel.login}</dd>
            <dt>Host</dt>
            <dd>{sel.host}</dd>
            <dt>Last batch</dt>
            <dd>{sqlTime(sel.lastBatch).slice(0, 19)}</dd>
            <dt>Transaction</dt>
            <dd>{sel.openTran ? `open for ${msText(sel.tranMs)}${sel.hold ? `. ${sel.hold.reason}` : ''}` : 'none'}</dd>
            <dt>Isolation</dt>
            <dd>{sel.isolation}</dd>
            <dt>Locks held</dt>
            <dd>{sel.locks.length ? sel.locks.map((l) => `${l.m} on ${l.t} (${l.k})`).join(', ') : 'none'}</dd>
            {sel.wait && (
              <>
                <dt>Waits for</dt>
                <dd>{`${sel.wait.mode} on ${sel.wait.t} (${sel.wait.k}), held by session ${sel.blockedBy}, for ${msText(sel.waitMs)}`}</dd>
              </>
            )}
          </dl>
          <pre className="db-sqltext">{(sel.pending?.text ?? sel.sql) || '(no statement yet)'}</pre>
          {sel.kind !== 'console' && (
            <Btn kind="danger" onClick={() => setAsk(sel)}>
              {ora ? 'Kill Session' : 'Kill Process'}
            </Btn>
          )}
        </div>
      )}
      <h3>Connections by application</h3>
      <p className="db-hint">Grouped by program and host, as sys.dm_exec_sessions shows them. The pool size comes from the Mule config of each app (lab-made: a real server does not know the pool of the client).</p>
      <Grid
        heads={['Application', 'Environment', 'Login', 'maxPoolSize', 'Open', 'In use', 'Idle', 'Waiting on a lock', 'In a held transaction', 'Pool timeouts', 'Last error']}
        rows={pools.map((p) => [p.app, p.env, p.cfg?.user ?? '', p.max, p.open, <b key="u" className={p.inUse >= p.max ? 'db-bad' : ''}>{p.inUse}</b>, p.idle, p.waiting, p.held, p.timeouts, p.lastError ? `${sqlTime(p.lastError.t).slice(11, 19)} ${p.lastError.text.slice(0, 120)}` : ''])}
        empty="No app has connected yet."
      />
      {srv.kills.length > 0 && (
        <>
          <h3>Ended sessions</h3>
          <Grid heads={['Time', 'Session', 'Application', 'Login', 'Ended by', 'Open transaction', 'Rows rolled back', 'Sessions it blocked']} rows={srv.kills.map((k) => [sqlTime(k.t).slice(11, 19), k.id, k.app ?? '', k.login, k.by === 'restart' ? 'The app restarted' : ora ? 'ALTER SYSTEM KILL SESSION' : 'KILL', k.openTran ? 'yes' : 'no', k.undo, k.blocked])} />
        </>
      )}
      {ask && (
        <Modal
          title={ora ? 'Kill Session' : 'Kill Process'}
          onClose={() => setAsk(null)}
          foot={
            <>
              <Btn onClick={() => setAsk(null)}>{ora ? 'Cancel' : 'No'}</Btn>
              <Btn kind="danger" onClick={() => { kill(ask.id); setAsk(null); setPick(null) }}>
                {ora ? 'Apply' : 'Yes'}
              </Btn>
            </>
          }
        >
          <p>{ora ? `ALTER SYSTEM KILL SESSION '${ask.id},${ask.serial}' IMMEDIATE` : `Are you sure you want to kill process ${ask.id}?`}</p>
          {ask.openTran > 0 && <p className="db-hint">The session has an open transaction. The server rolls back {ask.undo.length} change{ask.undo.length === 1 ? '' : 's'} and frees its locks.</p>}
        </Modal>
      )}
    </div>
  )
}

// ---------- execution plans ----------

function Plans({ srv, picked, to, name, update }) {
  const list = srv.plans
  const i = picked !== null && picked !== undefined && list[picked] ? picked : list.length - 1
  const plan = list[i]
  useEffect(() => {
    if (plan) update((s) => mark(s, `db-plan:${name}`))
  }, [plan, name, update])
  if (!plan) return <p className="db-empty db-boxed">No plan yet. Write a SELECT, UPDATE or DELETE in the query window and choose {srv.vendor === ORACLE ? 'Explain Plan' : 'Display Estimated Execution Plan'}.</p>
  return (
    <div>
      <label className="db-pickplan">
        <span>Plan</span>
        <select value={i} onChange={(e) => to({ view: 'plan', plan: Number(e.target.value) })}>
          {list.map((p, k) => (
            <option key={k} value={k}>
              {sqlTime(p.t).slice(11, 19)} {p.actual ? 'actual' : 'estimated'}: {p.sql.slice(0, 80)}
            </option>
          ))}
        </select>
      </label>
      <PlanView srv={srv} plan={plan} />
    </div>
  )
}

function PlanView({ srv, plan }) {
  const ora = srv.vendor === ORACLE
  const [op, setOp] = useState(null)
  const total = Math.max(1, plan.ms)
  // the cost of each operator: the access does nearly all the work
  const cost = (k) => (k === plan.ops.length - 1 || (plan.access.lookup && k >= plan.ops.length - 2) ? (plan.access.lookup ? (k === plan.ops.length - 1 ? 0.55 : 0.43) : 0.96) : plan.ops.length > 1 ? 0.04 / Math.max(1, plan.ops.length - (plan.access.lookup ? 2 : 1)) : 1)
  if (ora)
    return (
      <div className="db-xplan">
        <p className="db-hint">{plan.sql}</p>
        <Grid
          heads={['OPERATION', 'OBJECT_NAME', 'CARDINALITY', 'COST', 'ACCESS_PREDICATES', 'FILTER_PREDICATES']}
          rows={plan.ops.map((o, k) => [<span key="o" style={{ paddingLeft: `${k * 12}px` }}>{o.op}</span>, o.object ?? '', o.rows ?? 1, Math.max(1, Math.round((total / 10) * cost(k))), o.access ?? '', o.predicate ?? ''])}
        />
        <Facts plan={plan} />
      </div>
    )
  const sel = op ?? plan.ops.length - 1
  const o = plan.ops[sel]
  return (
    <div className="db-plan">
      <p className="db-plan-sql">
        Query 1: Query cost (relative to the batch): 100%
        <br />
        <code>{plan.sql}</code>
      </p>
      {plan.missing && (
        <p className="db-missing">
          Missing Index (Impact {plan.missing.impact}): CREATE NONCLUSTERED INDEX [&lt;Name of Missing Index, sysname,&gt;] ON [{plan.missing.table.split('.')[0]}].[{plan.missing.table.split('.')[1]}] ({plan.missing.columns.map((c) => `[${c}]`).join(', ')}){plan.missing.include.length ? ` INCLUDE (${plan.missing.include.map((c) => `[${c}]`).join(', ')})` : ''}
        </p>
      )}
      <div className="db-ops" role="list">
        {plan.ops.map((x, k) => (
          <Fragment key={k}>
            {k > 0 && <span className="db-arrow" aria-hidden="true">←</span>}
            <button type="button" role="listitem" className={`db-op${sel === k ? ' on' : ''}${x.warn ? ' warn' : ''}${/Scan/.test(x.op) ? ' scan' : /Seek/.test(x.op) ? ' seek' : ''}`} onClick={() => setOp(k)}>
              <b>{x.op}</b>
              {x.note && <small>({x.note})</small>}
              {x.object && <small>{x.object}</small>}
              <small>Cost: {Math.round(cost(k) * 100)} %</small>
              <small>{n(x.rows ?? 1)} rows (estimated)</small>
            </button>
          </Fragment>
        ))}
      </div>
      <div className="db-props">
        <h4>Properties: {o.op}</h4>
        <dl>
          <dt>Physical Operation</dt>
          <dd>{o.op}</dd>
          {o.object && (
            <>
              <dt>Object</dt>
              <dd>{o.object}</dd>
            </>
          )}
          <dt>Estimated Number of Rows</dt>
          <dd>{n(o.rows ?? 1)}</dd>
          {o.read !== undefined && (
            <>
              <dt>Estimated Number of Rows to be Read</dt>
              <dd>{n(o.read)}</dd>
            </>
          )}
          {o.execs !== undefined && (
            <>
              <dt>Estimated Number of Executions</dt>
              <dd>{n(o.execs)}</dd>
            </>
          )}
          {o.seek && (
            <>
              <dt>Seek Predicates</dt>
              <dd>{o.seek}</dd>
            </>
          )}
          {o.predicate && (
            <>
              <dt>Predicate</dt>
              <dd>{o.predicate}</dd>
            </>
          )}
          <dt>Estimated Subtree Cost</dt>
          <dd>{((total / 1000) * 0.9 * (sel === 0 ? 1 : cost(sel) + 0.01)).toFixed(4)}</dd>
        </dl>
      </div>
      <Facts plan={plan} />
    </div>
  )
}
function Facts({ plan }) {
  return (
    <ul className="db-facts">
      <li>
        Access: <b>{plan.access.kind === 'seek' ? `seek on ${plan.access.index}` : `full scan${plan.access.index ? ` of ${plan.access.index}` : ''}`}</b>, {n(plan.access.rowsRead)} rows read for about {n(plan.est)} rows returned.
      </li>
      <li>Estimated time in the lab: {msText(plan.ms)}.</li>
      {plan.nonSargable.length > 0 && <li className="db-bad">Not sargable: {plan.nonSargable.join(', ')}. A function on the column means the server cannot seek an index on it.</li>}
      {plan.access.lookup && <li>Key Lookup: the index does not hold every column the query needs, so each row is fetched again from the clustered index. INCLUDE columns remove it.</li>}
    </ul>
  )
}

// ---------- deadlocks ----------

function Deadlocks({ srv, picked, to }) {
  const ora = srv.vendor === ORACLE
  const list = srv.deadlocks
  const d = list.find((x) => x.id === picked) ?? list.at(-1)
  const [tab, setTab] = useState('graph')
  if (!d) return <p className="db-empty db-boxed">{ora ? 'No ORA-00060 trace file yet.' : 'The system_health session has no xml_deadlock_report event yet.'}</p>
  return (
    <div>
      <h3>{ora ? 'Trace files with ORA-00060' : 'system_health, event_file: xml_deadlock_report'}</h3>
      <Grid
        heads={['Time', 'Victim', 'Sessions', 'Applications']}
        rows={list.map((x) => [sqlTime(x.t).slice(0, 19), x.victim, x.processes.map((p) => p.spid).join(', '), x.processes.map((p) => p.app ?? p.program).join(', ')])}
        onRow={(i) => to({ view: 'deadlocks', deadlock: list[i].id })}
        picked={list.indexOf(d)}
      />
      <Tabs tabs={[['graph', ora ? 'Deadlock graph' : 'Deadlock'], ['xml', ora ? 'Trace file' : 'XML']]} value={tab} onChange={setTab} />
      {tab === 'graph' ? <Graph srv={srv} d={d} /> : <pre className="db-xml">{deadlockXml(srv, d)}</pre>}
    </div>
  )
}
function Graph({ srv, d }) {
  const ps = d.processes
  const res = ps.filter((p) => p.owns).map((p) => ({ ...p.owns, owner: p.spid, waiter: ps.find((q) => q.spid !== p.spid && q.waits?.t === p.owns.t && q.waits?.k === p.owns.k) }))
  const H = Math.max(ps.length, res.length) * 150 + 20
  const py = (i) => 80 + i * 150
  const px = 120
  const rx = 470
  const at = (spid) => ps.findIndex((p) => p.spid === spid)
  const t = (tk) => tablesOf(srv)[tk]
  return (
    <svg className="db-graph" viewBox={`0 0 640 ${H}`} role="img" aria-label={`Deadlock between sessions ${ps.map((p) => p.spid).join(' and ')}. Victim ${d.victim}.`}>
      <defs>
        <marker id="db-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="db-g-arrow" />
        </marker>
      </defs>
      {res.map((r, i) => (
        <g key={`e${i}`}>
          <line x1={rx - 80} y1={py(i)} x2={px + 85} y2={py(at(r.owner))} className="db-g-edge" markerEnd="url(#db-arr)" />
          <text x={(rx + px) / 2} y={(py(i) + py(at(r.owner))) / 2 - 6} className="db-g-label">Owner Mode: {r.mode}</text>
          {r.waiter && (
            <>
              <line x1={px + 85} y1={py(at(r.waiter.spid)) + 10} x2={rx - 80} y2={py(i) + 10} className="db-g-edge dash" markerEnd="url(#db-arr)" />
              <text x={(rx + px) / 2} y={(py(i) + py(at(r.waiter.spid))) / 2 + 22} className="db-g-label">Request Mode: {r.waiter.waits.mode}</text>
            </>
          )}
        </g>
      ))}
      {ps.map((p, i) => (
        <g key={p.spid}>
          <ellipse cx={px} cy={py(i)} rx="88" ry="46" className={`db-g-proc${p.spid === d.victim ? ' victim' : ''}`} />
          {p.spid === d.victim && <path d={`M${px - 62} ${py(i) - 32}L${px + 62} ${py(i) + 32}M${px + 62} ${py(i) - 32}L${px - 62} ${py(i) + 32}`} className="db-g-x" />}
          <text x={px} y={py(i) - 10} className="db-g-title">Process ID {p.spid}</text>
          <text x={px} y={py(i) + 8} className="db-g-small">{(p.app ?? p.program).slice(0, 26)}</text>
          <text x={px} y={py(i) + 24} className="db-g-small">Log Used: {p.logused}</text>
        </g>
      ))}
      {res.map((r, i) => (
        <g key={`r${i}`}>
          <rect x={rx - 80} y={py(i) - 34} width="160" height="68" rx="3" className="db-g-res" />
          <text x={rx} y={py(i) - 12} className="db-g-title">Key Lock</text>
          <text x={rx} y={py(i) + 6} className="db-g-small">{r.t}</text>
          <text x={rx} y={py(i) + 22} className="db-g-small">{t(r.t)?.pkName ?? ''} ({String(r.k).slice(0, 14)})</text>
        </g>
      ))}
    </svg>
  )
}

// ---------- logins, users, tables, Mule ----------

const grantText = (u) =>
  Object.entries(u.grants ?? {})
    .map(([tk, ps]) => `${ps.join(', ')} on ${tk === '*' ? 'the whole database' : tk}`)
    .join('; ')
function Security({ srv }) {
  const ora = srv.vendor === ORACLE
  return (
    <div>
      <h3>{ora ? 'DBA_USERS' : 'Security, Logins'}</h3>
      <Grid
        heads={ora ? ['USERNAME', 'ACCOUNT_STATUS', 'PROFILE', 'Kind', 'Failed logins'] : ['Login name', 'Type', 'Default database', 'Disabled', 'Enforce password policy', 'Failed logins']}
        rows={loginsOf(srv).map((l) => (ora ? [l.name, l.status, l.profile, l.type, l.failed] : [l.name, l.type, l.defaultDb, l.disabled ? 'Yes' : 'No', l.policy ? 'Yes' : 'No', l.failed]))}
      />
      <h3>{ora ? 'Granted roles and privileges (DBA_ROLE_PRIVS, DBA_SYS_PRIVS, DBA_TAB_PRIVS)' : `${srv.database}, Security, Users`}</h3>
      <Grid
        heads={ora ? ['GRANTEE', 'GRANTED_ROLE', 'System privileges', 'Object privileges', 'DEFAULT_SCHEMA'] : ['User', 'Login', 'Default schema', 'Database roles', 'Permissions']}
        rows={usersOf(srv).map((u) => {
          const objects = grantText(u)
          const sys = (loginsOf(srv).find((l) => l.name === u.login)?.privs ?? []).join(', ')
          return ora ? [u.name, u.roles.join(', '), sys, objects, u.schema] : [u.name, u.login, u.schema, u.roles.join(', '), objects]
        })}
      />
      <p className="db-hint">
        {ora
          ? 'CREATE USER name IDENTIFIED BY "password" PROFILE APP_USERS makes a user. GRANT CREATE SESSION TO name lets it log in, and GRANT SELECT, INSERT ON BRIGHTMART.TABLE TO name gives it one table. ALTER USER name ACCOUNT UNLOCK opens a locked account.'
          : 'CREATE LOGIN name WITH PASSWORD = \'...\' makes a server login, CREATE USER name FOR LOGIN name maps it into the database, and GRANT SELECT, INSERT ON dbo.table TO name gives it one table. ALTER LOGIN name ENABLE turns a disabled login on.'}
      </p>
      {srv.errorlog.length > 0 && (
        <>
          <h3>{ora ? 'Alert log' : 'SQL Server error log'}</h3>
          <Grid heads={['Date', 'Message']} rows={[...srv.errorlog].reverse().map((e) => [sqlTime(e.t).slice(0, 19), e.text])} />
        </>
      )}
    </div>
  )
}

function TableView({ srv, tk, setText, to }) {
  const t = tablesOf(srv)[tk]
  const ora = srv.vendor === ORACLE
  const top = ora ? `SELECT * FROM ${tk}\nFETCH FIRST 100 ROWS ONLY;` : `SELECT TOP (100) * FROM ${tk};`
  return (
    <div>
      <h3>
        {tk} <small className="db-dim">about {n(t.count)} rows</small>
      </h3>
      <Btn onClick={() => { setText(top); to({ view: 'query' }) }}>{ora ? 'Open in worksheet' : 'Select Top 100 Rows'}</Btn>
      <h4>Columns</h4>
      <Grid heads={['Column', 'Type', 'Allow nulls', 'Key']} rows={t.columns.map((c) => [c.name, c.type, c.nullable ? 'Yes' : 'No', t.pk.includes(c.name) ? `PK (${t.pkName})` : t.fks.find((f) => f.column === c.name) ? `FK to ${t.fks.find((f) => f.column === c.name).table}` : ''])} />
      <h4>Indexes</h4>
      <Grid heads={['Name', 'Kind', 'Key columns', 'Included columns', 'Unique']} rows={indexList(t).map((x) => [x.name, x.pk ? (ora ? 'NORMAL (primary key)' : t.clustered ? 'Clustered' : 'Nonclustered') : ora ? 'NORMAL' : 'Nonclustered', x.columns.join(', '), x.include.join(', '), x.unique ? 'Yes' : 'No'])} />
      {t.fks.length > 0 && (
        <>
          <h4>Foreign keys</h4>
          <Grid heads={['Name', 'Column', 'References']} rows={t.fks.map((f) => [f.name, f.column, `${f.table} (${f.ref})`])} />
        </>
      )}
      <h4>Rows the lab keeps</h4>
      <Grid heads={t.columns.map((c) => c.name)} rows={t.rows.map((r) => t.columns.map((c) => r[c.name]))} />
    </div>
  )
}

const MAPPING = [
  ['host, port', 'The server and its port', 'Wrong host: DB:CONNECTIVITY, the TCP/IP connection failed'],
  ['user, password', 'A login (SQL Server) or a user (Oracle)', 'SQL Server error 18456, ORA-01017. Ten wrong passwords lock an Oracle account: ORA-28000'],
  ['databaseName / serviceName', 'The database on SQL Server, the service of the listener on Oracle', 'Error 4060, ORA-12514'],
  ['transactionIsolation', 'SET TRANSACTION ISOLATION LEVEL on the connection', 'NOT_CONFIGURED keeps the server default, READ COMMITTED'],
  ['pooling-profile maxPoolSize', 'How many sessions the app opens at most (default 5)', 'Each waiting statement keeps one'],
  ['pooling-profile maxWait', 'Seconds a flow waits for a free connection (0: no limit)', 'Could not obtain connection from data source: DB:CONNECTIVITY'],
  ['queryTimeout (operation)', 'Seconds before the driver cancels a statement (0: none)', 'The query has timed out, ORA-01013: DB:QUERY_EXECUTION'],
  ['fetchSize (operation)', 'Rows per round trip (Oracle JDBC default 10)', 'A small value makes large reads slow'],
  ['Try scope, transactionalAction', 'One transaction for the operations inside the Try', 'Locks stay to the end of the scope'],
]
function MuleConfig({ srv }) {
  const ora = srv.vendor === ORACLE
  const pools = poolsOf(srv)
  const cfg = pools[0]?.cfg
  const xml = ora
    ? `<db:config name="Oracle_Config">\n  <db:oracle-connection host="${srv.host}" port="${srv.port}"\n      user="\${db.user}" password="\${secure::db.password}"\n      serviceName="${srv.service}" transactionIsolation="READ_COMMITTED">\n    <db:pooling-profile maxPoolSize="${cfg?.maxPoolSize ?? 5}" minPoolSize="0" maxWait="${cfg?.maxWait ?? 0}" maxWaitUnit="SECONDS" />\n  </db:oracle-connection>\n</db:config>\n\n<db:select config-ref="Oracle_Config" queryTimeout="\${db.queryTimeout}" fetchSize="1000">\n  <db:sql>SELECT STATUS FROM BRIGHTMART.SHIPMENTS WHERE SHIPMENT_ID = :id</db:sql>\n  <db:input-parameters>#[{ id: attributes.uriParams.id }]</db:input-parameters>\n</db:select>`
    : `<db:config name="SqlServer_Config">\n  <db:mssql-connection host="${srv.host}" port="${srv.port}"\n      user="\${db.user}" password="\${secure::db.password}"\n      databaseName="${srv.database}" transactionIsolation="NOT_CONFIGURED">\n    <db:pooling-profile maxPoolSize="${cfg?.maxPoolSize ?? 5}" minPoolSize="0" maxWait="${cfg?.maxWait ?? 0}" maxWaitUnit="SECONDS" />\n  </db:mssql-connection>\n</db:config>\n\n<try transactionalAction="ALWAYS_BEGIN" transactionType="LOCAL">\n  <db:update config-ref="SqlServer_Config" queryTimeout="\${db.queryTimeout}">\n    <db:sql>UPDATE dbo.orders SET status = 'REFUND_PENDING' WHERE order_id = :id</db:sql>\n    <db:input-parameters>#[{ id: attributes.uriParams.orderId }]</db:input-parameters>\n  </db:update>\n</try>`
  return (
    <div>
      <h3>How the Mule Database config maps to {ora ? 'Oracle' : 'SQL Server'}</h3>
      <pre className="db-xml">{xml}</pre>
      <Grid heads={['Connector field', 'On the server', 'When it is wrong']} rows={MAPPING} />
      <h3>What each app uses now</h3>
      <Grid
        heads={['Application', 'user', 'maxPoolSize', 'maxWait (s)', 'queryTimeout (s)', 'fetchSize', 'transactionIsolation', 'Transaction timeout (s)']}
        rows={pools.map((p) => [p.app, p.cfg?.user ?? '', p.cfg?.maxPoolSize ?? '', p.cfg?.maxWait ?? '', p.cfg?.queryTimeout || '0 (none)', p.cfg?.fetchSize ?? '', p.cfg?.isolation ?? '', p.cfg?.transactionTimeout || 'none'])}
        empty="No app has connected yet."
      />
    </div>
  )
}
