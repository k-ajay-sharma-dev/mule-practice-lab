// Snowflake: a Snowsight style screen of account BRIGHTMART-DW. A worksheet runs SQL with a role, warehouse, database and
// schema context; Databases shows tables, views, stages with their files and load metadata, and file formats; Query
// History and Copy History show every statement and load with its error code; Admin has the warehouses (resume,
// suspend, edit), the resource monitors and the users, roles and logins. A lab tool: one person, BRIGHTMART_ADMIN, does
// everything. The dialogs run the same SQL that Snowsight runs, in the context of the worksheet.
import { useEffect, useState } from 'react'
import { mark } from '../../lab/platform.js'
import {
  ACCOUNT, ADMIN_USER, blockerOf, fingerprintOf, isFilled, META_DAYS, runWorksheet, setWorksheet, SF_HOST, SIZE_TEXT, SIZES, stagePath, tsText, upgradeSnowflake, uploadFile, userRoles,
} from '../../lab/platform-snowflake.js'
import { Modal } from './parts.jsx'

const NAV = [
  ['Projects', [['worksheets', 'Worksheets']]],
  ['Data', [['databases', 'Databases']]],
  ['Monitoring', [['queries', 'Query History'], ['copies', 'Copy History']]],
  ['Admin', [['warehouses', 'Warehouses'], ['monitors', 'Resource Monitors'], ['users', 'Users & Roles']]],
]
const SEEN = { worksheets: 'snf:worksheet', databases: 'snf:databases', queries: 'snf:query-history', copies: 'snf:copy-history', warehouses: 'snf:warehouses', monitors: 'snf:monitors', users: 'snf:users' }
const START_SQL = 'SELECT CURRENT_ROLE(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA();'
const SUSPEND_OPTIONS = [
  [0, 'Never'],
  [60, '1 minute'],
  [300, '5 minutes'],
  [600, '10 minutes'],
  [900, '15 minutes'],
  [1800, '30 minutes'],
  [3600, '1 hour'],
]
const suspendText = (sec) => SUSPEND_OPTIONS.find(([v]) => v === sec)?.[1] ?? (sec % 60 === 0 ? `${sec / 60} minutes` : `${sec} seconds`)
const time = (t) => (t === null || t === undefined ? '' : tsText(t))
const cell = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? String(v).toUpperCase() : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v))
const credits = (c) => (Math.round((c ?? 0) * 100) / 100).toFixed(2)
const Btn = ({ kind = 'plain', ...props }) => <button type="button" className={`snf-btn snf-btn-${kind}`} {...props} />
const Pill = ({ text }) => {
  const k = ['Started', 'Succeeded', 'Loaded', 'Active', 'Key pair'].includes(text) ? 'good' : ['Failed', 'Load failed', 'Quota reached'].includes(text) ? 'bad' : ['Partially loaded', 'Password'].includes(text) ? 'warn' : 'idle'
  return <span className={`snf-pill snf-${k}`}>{text}</span>
}

function Grid({ cols, rows, empty = 'No rows.', max = 200, onRow, picked }) {
  return (
    <div className="snf-grid-box">
      <table className="snf-grid">
        <thead>
          <tr>
            <th className="snf-rn" aria-label="Row" />
            {cols.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className={`${onRow ? 'snf-pick' : ''}${picked === i ? ' on' : ''}`} onClick={onRow ? () => onRow(i) : undefined}>
              <td className="snf-rn">{i + 1}</td>
              {r.map((v, j) => (
                <td key={j} className={v === null || v === undefined ? 'snf-null' : ''}>
                  {v !== null && typeof v === 'object' ? v : cell(v)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length + 1} className="snf-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > max && <p className="snf-note">Showing the first {max} of {rows.length} rows.</p>}
    </div>
  )
}

export default function Snowflake({ state, update, place, go }) {
  const y = state.snowflake
  const view = SEEN[place?.view] ? place.view : 'worksheets'
  const filled = isFilled(y)
  // a save from before Snowflake was built, or the open console, holds a placeholder: build the account on first open
  useEffect(() => {
    if (y && !filled) update((s) => upgradeSnowflake(s))
  }, [y, filled, update])
  useEffect(() => {
    if (filled) update((s) => mark(s, SEEN[view]))
  }, [view, filled, update])

  if (!y)
    return (
      <main className="pc-main">
        <h2>Snowflake</h2>
        <p className="pc-empty pc-boxed">This lab has no Snowflake account.</p>
      </main>
    )
  if (!filled) return <main className="pc-main">Opening Snowsight...</main>

  // runs SQL in the session of the worksheet and gives back its result
  const run = (sql) => {
    const r = runWorksheet(state, sql)
    update((s) => runWorksheet(s, sql).state)
    return r.result
  }
  const to = (v, extra = {}) => go({ view: v, ...extra })
  const props = { y, state, update, run, place, to }

  return (
    <main className="pc-main snf">
      <div className="snf-shell">
        <nav className="snf-nav" aria-label="Snowsight">
          <div className="snf-acct">
            <b>{ACCOUNT}</b>
            <small>{SF_HOST}</small>
            <small>
              {ADMIN_USER} · {y.ws.role}
            </small>
          </div>
          {NAV.map(([title, items]) => (
            <div key={title}>
              <h3>{title}</h3>
              {items.map(([k, label]) => (
                <button key={k} type="button" className={view === k ? 'on' : ''} aria-current={view === k ? 'page' : undefined} onClick={() => to(k)}>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="snf-page">
          {view === 'worksheets' && <Worksheet {...props} />}
          {view === 'databases' && <Databases {...props} />}
          {view === 'queries' && <QueryHistory {...props} />}
          {view === 'copies' && <CopyHistory {...props} />}
          {view === 'warehouses' && <Warehouses {...props} />}
          {view === 'monitors' && <Monitors {...props} />}
          {view === 'users' && <UsersRoles {...props} />}
        </section>
      </div>
    </main>
  )
}

// ---------- worksheet ----------

function Result({ out }) {
  if (!out) return <p className="snf-note">Run the worksheet to see results here. Ctrl+Enter runs it.</p>
  const last = out.results?.at(-1)
  return (
    <div className="snf-result">
      {out.results?.length > 1 && (
        <p className="snf-note">
          {out.results.length} statements ran{out.ok ? '' : ' before the error'}. {out.ok ? 'The result of the last one:' : ''}
        </p>
      )}
      {!out.ok && (
        <div className="snf-err" role="alert">
          <pre>{out.error.text}</pre>
          <small>Query ID {out.error.qid}</small>
        </div>
      )}
      {out.ok && last && (
        <>
          <p className="snf-meta">
            <b>{last.rows.length} {last.rows.length === 1 ? 'row' : 'rows'}</b>
            <span>Query ID {last.qid}</span>
            <span>{last.ms} ms</span>
          </p>
          <Grid cols={last.cols} rows={last.rows} empty="Query produced no results." />
        </>
      )}
    </div>
  )
}

function Worksheet({ y, state, update }) {
  const [text, setText] = useState(y.ws.text || START_SQL)
  const [out, setOut] = useState(null)
  const roles = userRoles(y, ADMIN_USER)
  const dbs = Object.keys(y.dbs)
  const schemas = Object.keys(y.dbs[y.ws.db]?.schemas ?? {})
  const execute = () => {
    const r = runWorksheet(state, text)
    update((s) => runWorksheet(s, text).state)
    setOut(r.result)
  }
  const set = (patch) => update((s) => setWorksheet(s, patch).state)
  return (
    <>
      <header className="snf-head">
        <h2>Worksheet</h2>
        <Btn kind="primary" onClick={execute} title="Run (Ctrl+Enter)">
          Run
        </Btn>
      </header>
      <div className="snf-ctx" role="group" aria-label="Context">
        <label>
          <span>Role</span>
          <select value={y.ws.role} onChange={(e) => set({ role: e.target.value })}>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Warehouse</span>
          <select value={y.ws.wh ?? ''} onChange={(e) => set({ wh: e.target.value || null })}>
            <option value="">No warehouse</option>
            {Object.keys(y.warehouses).map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Database</span>
          <select value={y.ws.db ?? ''} onChange={(e) => set({ db: e.target.value || null })}>
            <option value="">No database</option>
            {dbs.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Schema</span>
          <select value={y.ws.schema ?? ''} onChange={(e) => set({ schema: e.target.value || null })}>
            <option value="">No schema</option>
            {schemas.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="snf-editor"
        value={text}
        spellCheck={false}
        aria-label="SQL"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            execute()
          }
        }}
      />
      <Result out={out} />
      <p className="snf-note">The worksheet runs every statement in order and stops at the first error. USE ROLE, USE WAREHOUSE and USE DATABASE change the context above. PUT runs from SnowSQL or a driver; in Snowsight upload files with + Files on a stage.</p>
    </>
  )
}

// ---------- databases ----------

const KINDS = [
  ['tables', 'Tables', 'TABLE'],
  ['views', 'Views', 'VIEW'],
  ['stages', 'Stages', 'STAGE'],
  ['formats', 'File formats', 'FORMAT'],
]

function Databases({ y, state, update, place, to }) {
  const [obj, setObj] = useState(place?.obj ?? null)
  const [kind, fq] = obj ? obj.split(':') : [null, null]
  useEffect(() => {
    if (kind === 'TABLE' || kind === 'STAGE') update((s) => mark(s, `snf:${kind.toLowerCase()}:${fq}`))
  }, [kind, fq, update])
  const open = (k, name) => {
    setObj(`${k}:${name}`)
    to('databases', { obj: `${k}:${name}` })
  }
  const [d, sc, n] = fq ? fq.split('.') : []
  const sch = d && y.dbs[d]?.schemas[sc]
  return (
    <>
      <header className="snf-head">
        <h2>Databases</h2>
      </header>
      <div className="snf-split">
        <div className="snf-tree" role="tree" aria-label="Objects">
          {Object.entries(y.dbs).map(([db, x]) => (
            <details key={db} open>
              <summary>{db}</summary>
              {Object.entries(x.schemas).map(([s, so]) => (
                <details key={s} open={db === d && s === sc}>
                  <summary>{s}</summary>
                  {KINDS.map(([map, label, k]) =>
                    Object.keys(so[map]).length ? (
                      <div key={map} className="snf-tree-group">
                        <small>{label}</small>
                        {Object.keys(so[map]).map((name) => (
                          <button key={name} type="button" role="treeitem" className={obj === `${k}:${db}.${s}.${name}` ? 'on' : ''} onClick={() => open(k, `${db}.${s}.${name}`)}>
                            {name}
                          </button>
                        ))}
                      </div>
                    ) : null,
                  )}
                </details>
              ))}
            </details>
          ))}
          {!Object.keys(y.dbs).length && <p className="snf-note">No databases yet.</p>}
        </div>
        <div className="snf-detail">
          {!sch && <p className="snf-note">Pick a table, view, stage or file format on the left.</p>}
          {sch && kind === 'TABLE' && sch.tables[n] && <TableView y={y} fq={fq} t={sch.tables[n]} />}
          {sch && kind === 'VIEW' && sch.views[n] && (
            <>
              <h3>{fq}</h3>
              <p className="snf-meta">
                <span>View</span>
                <span>Owner {sch.views[n].owner}</span>
              </p>
              <pre className="snf-pre">{sch.views[n].sql}</pre>
            </>
          )}
          {sch && kind === 'STAGE' && sch.stages[n] && <StageView y={y} state={state} fq={fq} st={sch.stages[n]} update={update} />}
          {sch && kind === 'FORMAT' && sch.formats[n] && <FormatView fq={fq} f={sch.formats[n]} />}
        </div>
      </div>
    </>
  )
}

function TableView({ y, fq, t }) {
  const [tab, setTab] = useState('Columns')
  const loads = y.copies.filter((c) => c.table === fq).slice().reverse()
  return (
    <>
      <h3>{fq}</h3>
      <p className="snf-meta">
        <span>Table</span>
        <span>{t.rows.length} rows</span>
        <span>Owner {t.owner}</span>
      </p>
      <div className="snf-tabs" role="tablist">
        {['Columns', 'Data Preview', 'Copy History'].map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      {tab === 'Columns' && <Grid cols={['Name', 'Type', 'Nullable']} rows={t.cols.map((c) => [c.name, c.type, 'Y'])} />}
      {tab === 'Data Preview' && <Grid cols={t.cols.map((c) => c.name)} rows={t.rows} max={100} empty="The table is empty." />}
      {tab === 'Copy History' && <Grid cols={['Time', 'File', 'Status', 'Rows loaded', 'Errors', 'First error']} rows={loads.map((c) => [time(c.t), c.file, <Pill key="s" text={c.status} />, c.loaded, c.errors, c.first])} empty="No loads into this table." />}
    </>
  )
}

function StageView({ y, state, fq, st, update }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [said, setSaid] = useState(null)
  const loadedInto = (file) =>
    Object.entries(y.meta)
      .filter(([k]) => k.endsWith(`|${fq}|${file}`))
      .map(([k, m]) => `${k.split('|')[0].split('.').pop()} ${tsText(m.t).slice(0, 16)}`)
  const files = Object.entries(st.files).sort(([a], [b]) => (a < b ? -1 : 1))
  const upload = () => {
    const r = uploadFile(state, fq, name, content)
    setSaid(r.result)
    if (r.result.ok) {
      update((s) => uploadFile(s, fq, name, content).state)
      setAdding(false)
      setName('')
      setContent('')
    }
  }
  return (
    <>
      <header className="snf-subhead">
        <h3>{fq}</h3>
        {!st.url && (
          <Btn kind="primary" onClick={() => setAdding(true)}>
            + Files
          </Btn>
        )}
      </header>
      <p className="snf-meta">
        <span>{st.url ? 'External stage' : 'Internal stage'}</span>
        {st.url && <span>URL {st.url}</span>}
        {st.integration && <span>Storage integration {st.integration}</span>}
        <span>File format {st.format ?? (st.inline ? `TYPE = ${st.inline.type}` : 'CSV defaults')}</span>
      </p>
      {said && <p className={said.ok ? 'snf-ok' : 'snf-err'}>{said.text}</p>}
      <Grid
        cols={['Name', 'Size', 'MD5', 'Last modified', 'Loaded into (load metadata)']}
        rows={files.map(([f, x]) => [stagePath(fq, st, f), x.size, x.md5, time(x.t), loadedInto(f).join(', ') || 'Not loaded'])}
        empty="No files in this stage."
      />
      <p className="snf-note">
        Loaded into lists the tables whose load metadata has this file, with the time of the load. COPY skips such a file for {META_DAYS} days unless the file changes or FORCE = TRUE. TRUNCATE TABLE clears the metadata of the table.
      </p>
      {adding && (
        <Modal
          title={`Upload files to ${fq.split('.').pop()}`}
          onClose={() => setAdding(false)}
          wide
          foot={
            <>
              <Btn onClick={() => setAdding(false)}>Cancel</Btn>
              <Btn kind="primary" onClick={upload}>
                Upload
              </Btn>
            </>
          }
        >
          <div className="snf-form">
            <label>
              <span>File name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="orders_20261103.csv" />
            </label>
            <label>
              <span>Content</span>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} spellCheck={false} />
            </label>
          </div>
        </Modal>
      )}
    </>
  )
}

function FormatView({ fq, f }) {
  const rows = [
    ['TYPE', f.type],
    ['SKIP_HEADER', f.skipHeader ?? 0],
    ['FIELD_DELIMITER', f.delimiter ?? ','],
    ['FIELD_OPTIONALLY_ENCLOSED_BY', f.enclosedBy ?? 'NONE'],
    ['NULL_IF', JSON.stringify(f.nullIf ?? ['\\N'])],
    ['EMPTY_FIELD_AS_NULL', String(f.emptyAsNull ?? true).toUpperCase()],
    ['ERROR_ON_COLUMN_COUNT_MISMATCH', String(f.mismatch ?? true).toUpperCase()],
    ['TRIM_SPACE', String(Boolean(f.trim)).toUpperCase()],
  ]
  return (
    <>
      <h3>{fq}</h3>
      <p className="snf-meta">
        <span>File format</span>
        <span>Owner {f.owner}</span>
      </p>
      <Grid cols={['Property', 'Value']} rows={rows} />
    </>
  )
}

// ---------- history ----------

function QueryHistory({ y }) {
  const [user, setUser] = useState('')
  const [st, setSt] = useState('')
  const [picked, setPicked] = useState(null)
  const users = [...new Set(y.queries.map((q) => q.user))]
  const list = y.queries
    .filter((q) => (!user || q.user === user) && (!st || (st === 'Failed') === !q.ok))
    .slice()
    .reverse()
  const q = picked !== null ? list[picked] : null
  return (
    <>
      <header className="snf-head">
        <h2>Query History</h2>
      </header>
      <div className="snf-ctx">
        <label>
          <span>User</span>
          <select value={user} onChange={(e) => (setUser(e.target.value), setPicked(null))}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={st} onChange={(e) => (setSt(e.target.value), setPicked(null))}>
            <option value="">All</option>
            <option>Succeeded</option>
            <option>Failed</option>
          </select>
        </label>
      </div>
      <Grid
        cols={['Status', 'SQL text', 'User', 'Role', 'Warehouse', 'Duration', 'Rows', 'Start time', 'Client']}
        rows={list.map((x) => [<Pill key="s" text={x.ok ? 'Succeeded' : 'Failed'} />, x.sql.length > 70 ? `${x.sql.slice(0, 70)}...` : x.sql, x.user, x.role, x.wh, `${x.ms} ms`, x.rows, time(x.t), x.client])}
        onRow={setPicked}
        picked={picked}
        empty="No queries yet."
      />
      {q && (
        <div className="snf-card">
          <h3>Query details</h3>
          <p className="snf-meta">
            <span>Query ID {q.id}</span>
            <span>{q.user}</span>
            <span>{q.role}</span>
            <span>{q.wh ?? 'No warehouse'}</span>
            <span>{time(q.t)}</span>
          </p>
          <pre className="snf-pre">{q.sql}</pre>
          {!q.ok && (
            <div className="snf-err">
              <pre>{`${q.code} (${q.state}): ${q.error}`}</pre>
            </div>
          )}
        </div>
      )}
      <p className="snf-note">The lab keeps the last 80 queries of the account. Pick a row for the full text and the error.</p>
    </>
  )
}

function CopyHistory({ y }) {
  const [table, setTable] = useState('')
  const tables = [...new Set(y.copies.map((c) => c.table))]
  const list = y.copies.filter((c) => !table || c.table === table).slice().reverse()
  return (
    <>
      <header className="snf-head">
        <h2>Copy History</h2>
      </header>
      <div className="snf-ctx">
        <label>
          <span>Table</span>
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">All tables</option>
            {tables.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <Grid cols={['Time', 'Table', 'File', 'Status', 'Rows loaded', 'Rows parsed', 'Errors', 'First error', 'User']} rows={list.map((c) => [time(c.t), c.table.split('.').pop(), c.file, <Pill key="s" text={c.status} />, c.loaded, c.parsed, c.errors, c.first, c.user])} empty="No loads yet." />
      <p className="snf-note">A COPY that skipped every file because of the load metadata loaded nothing, so it is not here. Query History has it, with the result Copy executed with 0 files processed.</p>
    </>
  )
}

// ---------- admin ----------

function WarehouseForm({ w, name, monitors, onClose, onSave, creating }) {
  const [f, setF] = useState({ name: name ?? '', size: w?.size ?? 'XSMALL', autoSuspend: w?.autoSuspend ?? 60, autoResume: w?.autoResume ?? true, monitor: w?.monitor ?? '' })
  const opts = SUSPEND_OPTIONS.some(([v]) => v === f.autoSuspend) ? SUSPEND_OPTIONS : [...SUSPEND_OPTIONS, [f.autoSuspend, suspendText(f.autoSuspend)]]
  const sql = creating
    ? `CREATE WAREHOUSE ${f.name.trim().toUpperCase() || '<name>'} WITH WAREHOUSE_SIZE = '${f.size}' AUTO_SUSPEND = ${f.autoSuspend} AUTO_RESUME = ${f.autoResume ? 'TRUE' : 'FALSE'} INITIALLY_SUSPENDED = TRUE;`
    : (() => {
        const parts = []
        if (f.size !== w.size) parts.push(`WAREHOUSE_SIZE = '${f.size}'`)
        if (f.autoSuspend !== w.autoSuspend) parts.push(`AUTO_SUSPEND = ${f.autoSuspend}`)
        if (f.autoResume !== w.autoResume) parts.push(`AUTO_RESUME = ${f.autoResume ? 'TRUE' : 'FALSE'}`)
        if ((f.monitor || null) !== (w.monitor || null)) parts.push(`RESOURCE_MONITOR = ${f.monitor || 'NULL'}`)
        return parts.length ? `ALTER WAREHOUSE ${name} SET ${parts.join(' ')};` : ''
      })()
  return (
    <Modal
      title={creating ? 'New Warehouse' : `Edit ${name}`}
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!sql} onClick={() => onSave(sql)}>
            {creating ? 'Create Warehouse' : 'Save Warehouse'}
          </Btn>
        </>
      }
    >
      <div className="snf-form">
        {creating && (
          <label>
            <span>Name</span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="STOCK_WH" />
          </label>
        )}
        <label>
          <span>Size</span>
          <select value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })}>
            {Object.keys(SIZES).map((k) => (
              <option key={k} value={k}>
                {SIZE_TEXT[k]} ({SIZES[k]} credit{SIZES[k] > 1 ? 's' : ''} an hour)
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Auto suspend</span>
          <select value={f.autoSuspend} onChange={(e) => setF({ ...f, autoSuspend: Number(e.target.value) })}>
            {opts.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="snf-checkline">
          <input type="checkbox" checked={f.autoResume} onChange={(e) => setF({ ...f, autoResume: e.target.checked })} />
          <span>Auto resume</span>
        </label>
        {!creating && (
          <label>
            <span>Resource monitor</span>
            <select value={f.monitor} onChange={(e) => setF({ ...f, monitor: e.target.value })}>
              <option value="">None</option>
              {monitors.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
        <pre className="snf-pre">{sql || 'Nothing changed.'}</pre>
      </div>
    </Modal>
  )
}

function Warehouses({ y, run }) {
  const [editing, setEditing] = useState(null)
  const [said, setSaid] = useState(null)
  const act = (sql) => {
    const r = run(sql)
    setSaid(r.ok ? { ok: true, text: `${sql} ${r.message ?? ''}` } : { ok: false, text: r.error.text })
    return r.ok
  }
  return (
    <>
      <header className="snf-head">
        <h2>Warehouses</h2>
        <Btn kind="primary" onClick={() => setEditing({ creating: true })}>
          + Warehouse
        </Btn>
      </header>
      {said && (
        <div className={said.ok ? 'snf-ok' : 'snf-err'} role={said.ok ? 'status' : 'alert'}>
          <pre>{said.text}</pre>
        </div>
      )}
      <Grid
        cols={['Name', 'Status', 'Size', 'Auto suspend', 'Auto resume', 'Resource monitor', 'Credits used', 'Last event', '']}
        rows={Object.entries(y.warehouses).map(([n, w]) => [
          <b key="n">{n}</b>,
          <Pill key="s" text={w.state === 'STARTED' ? 'Started' : 'Suspended'} />,
          SIZE_TEXT[w.size],
          suspendText(w.autoSuspend),
          w.autoResume ? 'Yes' : 'No',
          w.monitor ? `${w.monitor}${blockerOf(y, n) ? ' (quota reached)' : ''}` : '',
          credits(w.credits),
          w.log.at(-1) ? `${tsText(w.log.at(-1).t).slice(5, 16)} ${w.log.at(-1).text}` : '',
          <span key="a" className="snf-actions">
            {w.state === 'STARTED' ? <Btn onClick={() => act(`ALTER WAREHOUSE ${n} SUSPEND;`)}>Suspend</Btn> : <Btn onClick={() => act(`ALTER WAREHOUSE ${n} RESUME;`)}>Resume</Btn>}
            <Btn onClick={() => setEditing({ name: n })}>Edit</Btn>
          </span>,
        ])}
      />
      <p className="snf-note">A started warehouse bills credits every second it runs, busy or idle, with 60 seconds as the minimum per resume (lab: one minute of credits per lab minute). Credits used is the total of the lab. The dialogs run their SQL with the role of the worksheet, {y.ws.role}.</p>
      {editing && (
        <WarehouseForm
          key={editing.name ?? 'new'}
          creating={editing.creating}
          name={editing.name}
          w={editing.name ? y.warehouses[editing.name] : null}
          monitors={Object.keys(y.monitors)}
          onClose={() => setEditing(null)}
          onSave={(sql) => act(sql) && setEditing(null)}
        />
      )}
    </>
  )
}

const triggerText = (m) => m.triggers.map((t) => `${t.pct}% ${t.action === 'SUSPEND_IMMEDIATE' ? 'Suspend immediately' : t.action === 'SUSPEND' ? 'Suspend' : 'Notify'}`).join(', ')
function Monitors({ y, run }) {
  const [editing, setEditing] = useState(null)
  const [quota, setQuota] = useState('')
  const [said, setSaid] = useState(null)
  const save = () => {
    const sql = `ALTER RESOURCE MONITOR ${editing} SET CREDIT_QUOTA = ${quota.trim() || 0};`
    const r = run(sql)
    setSaid(r.ok ? { ok: true, text: `${sql} ${r.message}` } : { ok: false, text: r.error.text })
    if (r.ok) setEditing(null)
  }
  return (
    <>
      <header className="snf-head">
        <h2>Resource Monitors</h2>
      </header>
      {said && (
        <div className={said.ok ? 'snf-ok' : 'snf-err'} role={said.ok ? 'status' : 'alert'}>
          <pre>{said.text}</pre>
        </div>
      )}
      <Grid
        cols={['Name', 'Credit quota', 'Used', 'Remaining', 'Use', 'Frequency', 'Triggers', 'Warehouses', 'Status', '']}
        rows={Object.entries(y.monitors).map(([n, m]) => {
          const whs = Object.entries(y.warehouses).filter(([, w]) => w.monitor === n).map(([x]) => x)
          const pct = m.quota ? Math.min(100, (m.used / m.quota) * 100) : 0
          const full = whs.some((x) => blockerOf(y, x))
          return [
            <b key="n">{n}</b>,
            m.quota,
            credits(m.used),
            credits(Math.max(0, m.quota - m.used)),
            <span key="b" className={`snf-bar${pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''}`} role="img" aria-label={`${Math.round(pct)} percent used`}>
              <i style={{ width: `${pct}%` }} />
            </span>,
            m.frequency,
            triggerText(m),
            whs.join(', '),
            <Pill key="s" text={full ? 'Quota reached' : 'Active'} />,
            <Btn
              key="e"
              onClick={() => {
                setEditing(n)
                setQuota(String(m.quota))
              }}
            >
              Edit
            </Btn>,
          ]
        })}
        empty="No resource monitors."
      />
      <p className="snf-note">Only ACCOUNTADMIN can create or change a resource monitor. When a SUSPEND trigger is reached the warehouses of the monitor are suspended and cannot resume until the quota is raised or the period starts again.</p>
      {editing && (
        <Modal
          title={`Edit ${editing}`}
          onClose={() => setEditing(null)}
          foot={
            <>
              <Btn onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn kind="primary" onClick={save}>
                Save
              </Btn>
            </>
          }
        >
          <div className="snf-form">
            <label>
              <span>Credit quota</span>
              <input inputMode="decimal" value={quota} onChange={(e) => setQuota(e.target.value)} />
            </label>
            <pre className="snf-pre">{`ALTER RESOURCE MONITOR ${editing} SET CREDIT_QUOTA = ${quota.trim() || 0};`}</pre>
          </div>
        </Modal>
      )}
    </>
  )
}

function UsersRoles({ y }) {
  const [tab, setTab] = useState('Users')
  const auth = (u) => (u.rsa ? 'Key pair' : u.password ? 'Password' : 'None')
  return (
    <>
      <header className="snf-head">
        <h2>Users & Roles</h2>
      </header>
      <div className="snf-tabs" role="tablist">
        {['Users', 'Roles', 'Login History'].map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      {tab === 'Users' && (
        <Grid
          cols={['Name', 'Type', 'Authentication', 'RSA_PUBLIC_KEY_FP', 'Default role', 'Default warehouse', 'Roles', 'Last login', 'Last failed login']}
          rows={Object.entries(y.users).map(([n, u]) => [<b key="n">{n}</b>, u.type, <Pill key="a" text={auth(u)} />, fingerprintOf(u.rsa), u.defaultRole, u.defaultWarehouse, u.roles.join(', '), u.lastLogin ? `${time(u.lastLogin.t)} ${u.lastLogin.client}` : '', u.lastFail ? `${time(u.lastFail.t)} ${u.lastFail.text}` : ''])}
        />
      )}
      {tab === 'Roles' && (
        <Grid
          cols={['Role', 'Granted roles', 'Users', 'Privileges']}
          rows={Object.entries(y.roles).map(([n, r]) => [
            <b key="n">{n}</b>,
            r.roles.join(', '),
            Object.entries(y.users)
              .filter(([, u]) => u.roles.includes(n))
              .map(([x]) => x)
              .join(', '),
            r.builtin && !r.grants.length ? (
              <span key="p" className="snf-dim">
                System role
              </span>
            ) : (
              <ul key="p" className="snf-grants">
                {r.grants.map((g, i) => (
                  <li key={i}>
                    {g.priv} on {g.kind} {g.name}
                  </li>
                ))}
              </ul>
            ),
          ])}
        />
      )}
      {tab === 'Login History' && <Grid cols={['Time', 'User', 'Client', 'Result']} rows={y.logins.slice().reverse().map((l) => [time(l.t), l.user, l.client, l.ok ? l.text : <span key="r" className="snf-bad">{l.text}</span>])} empty="No logins yet." />}
      <p className="snf-note">Create users and roles and grant privileges in a Worksheet, with the role USERADMIN, SECURITYADMIN or ACCOUNTADMIN. A user of TYPE = SERVICE logs on with its key pair only.</p>
    </>
  )
}
