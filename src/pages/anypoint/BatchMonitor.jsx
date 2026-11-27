// Batch jobs of the practice console, in the style of the batch view of Runtime Manager and Monitoring: the job instances of
// an application with their status and counts, and an instance page with its progress, its steps, the failed records
// grouped by error type and its timings. The rules live in lab/platform-batch.js; stopBatch is in lab/platform.js.
import { useEffect } from 'react'
import { mark, stamp, stopBatch } from '../../lab/platform.js'
import { durationText, errorGroupsOf, isExecuting, liveOf, percent } from '../../lab/platform-batch.js'
import { Btn, Link, Note, Table } from './parts.jsx'

const number = (n) => Number(n ?? 0).toLocaleString('en-US')
const STATUS_TEXT = { EXECUTING: 'Executing', SUCCESSFUL: 'Successful', FAILED_PROCESS_RECORDS: 'Failed process records', STOPPED: 'Stopped', FAILED_INPUT: 'Failed input' }
const STATUS_KIND = { EXECUTING: 'run', SUCCESSFUL: 'good', FAILED_PROCESS_RECORDS: 'bad', STOPPED: 'idle', FAILED_INPUT: 'bad' }

const Status = ({ status }) => (
  <span className={`bm-status bm-${STATUS_KIND[status] ?? 'idle'}`} title={status}>
    <i />
    {STATUS_TEXT[status] ?? status}
  </span>
)

export default function BatchMonitor({ state, update, place, go }) {
  const env = state.env
  const apps = state.apps.filter((a) => a.env === env && a.batches?.length)
  const current = apps.find((a) => a.name === place.app) ?? apps[0]
  const name = current?.name
  const inst = current?.batches.find((x) => x.id === place.instance)
  const id = inst?.id

  useEffect(() => {
    if (name) update((s) => mark(s, `batch:${name}`))
  }, [name, update])
  useEffect(() => {
    if (id) update((s) => mark(s, `batch-instance:${id}`))
  }, [id, update])

  return (
    <main className="pc-main bm">
      <div className="pc-title">
        <h2>Batch jobs</h2>
        <span className="pc-grow" />
        <label className="bm-pick">
          <span>Application</span>
          <select className="pc-input" value={name ?? ''} disabled={!apps.length} onChange={(e) => go({ app: e.target.value })}>
            {apps.length === 0 && <option value="">No application</option>}
            {apps.map((a) => (
              <option key={a.name}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="pc-dim bm-where">
        Environment <b>{env}</b>. The last 20 job instances of each application are kept.
      </p>
      {!current && <p className="pc-empty pc-boxed">No batch job has run in {env} yet. A job instance shows here once a flow with a Batch Job runs.</p>}
      {current && !inst && <Instances state={state} app={current} go={go} update={update} />}
      {current && inst && <Instance state={state} app={current} inst={inst} go={go} update={update} />}
    </main>
  )
}

function Instances({ state, app, go, update }) {
  const now = state.clock
  const rows = app.batches.map((stored) => {
    const x = liveOf(stored, now)
    return (
      <tr key={x.id}>
        <td>
          <Link onClick={() => go({ app: app.name, instance: x.id })}>
            <span className="pc-mono">{x.id}</span>
          </Link>
        </td>
        <td>{x.job}</td>
        <td>
          <Status status={x.status} />
        </td>
        <td>{stamp(x.start)}</td>
        <td>{durationText((isExecuting(stored, now) ? now : x.end) - x.start)}</td>
        <td className="bm-num">
          {number(x.processed)} / {number(x.total)}
        </td>
        <td className="bm-num">{number(x.successful)}</td>
        <td className={`bm-num${x.failed ? ' pc-bad' : ''}`}>{number(x.failed)}</td>
        <td>{isExecuting(stored, now) && <StopButton app={app} inst={stored} update={update} />}</td>
      </tr>
    )
  })
  return (
    <>
      <h3 className="bm-h">Job instances of {app.name}</h3>
      <Table heads={['Instance ID', 'Job', 'Status', 'Created', 'Duration', 'Processed / Total', 'Successful', 'Failed', '']} rows={rows} />
      <p className="pc-dim bm-small">An instance that finished within maxFailedRecords is Successful, even with failed records. Open it to see the steps and the errors.</p>
    </>
  )
}

function StopButton({ app, inst, update }) {
  return (
    <Btn kind="danger" onClick={() => update((s) => stopBatch(s, { name: app.name, env: app.env }, inst.id))}>
      Stop
    </Btn>
  )
}

function Instance({ state, app, inst, go, update }) {
  const now = state.clock
  const x = liveOf(inst, now)
  const running = isExecuting(inst, now)
  const groups = errorGroupsOf(x)
  const done = percent(x.processed, x.total)
  const ok = percent(x.successful, x.total)
  const bad = percent(x.failed, x.total)
  const stats = [
    ['Total records', number(x.total)],
    ['Processed', number(x.processed)],
    ['Successful', number(x.successful), 'good'],
    ['Failed', number(x.failed), x.failed ? 'bad' : ''],
    ['Block size', number(x.blockSize)],
    ['Max failed records', x.maxFailedRecords === -1 ? '-1 (no limit)' : number(x.maxFailedRecords)],
  ]
  return (
    <>
      <p className="bm-crumb">
        <Link onClick={() => go({ app: app.name })}>← Job instances of {app.name}</Link>
      </p>
      <div className="bm-head">
        <div>
          <h3 className="bm-h">
            {x.job} <span className="pc-mono pc-dim">{x.id}</span>
          </h3>
          <Status status={x.status} />
          {running && <span className="pc-dim bm-phase">Phase: {x.phase}</span>}
        </div>
        <span className="pc-grow" />
        {running && <StopButton app={app} inst={inst} update={update} />}
      </div>

      <div className="bm-progress" role="img" aria-label={`${done}% processed: ${ok}% successful, ${bad}% failed`}>
        <span className="bm-bar-ok" style={{ width: `${ok}%` }} />
        <span className="bm-bar-bad" style={{ width: `${bad}%` }} />
      </div>
      <p className="pc-dim bm-small">
        {number(x.processed)} of {number(x.total)} records processed ({done}%). {number(x.successful)} successful, {number(x.failed)} failed ({bad}%).
        {x.status === 'STOPPED' && ` Stopped during ${x.stoppedIn ?? 'processing'}: ${number(x.total - x.processed)} records were not processed.`}
        {x.status === 'FAILED_PROCESS_RECORDS' && ` The instance went over maxFailedRecords and stopped: ${number(x.total - x.processed)} records were never processed.`}
      </p>
      {x.message && <Note>{x.message}</Note>}

      <div className="bm-stats">
        {stats.map(([label, value, kind]) => (
          <div key={label} className={`bm-stat${kind ? ` bm-stat-${kind}` : ''}`}>
            <small>{label}</small>
            <b>{value}</b>
          </div>
        ))}
      </div>

      <h4 className="bm-h4">Steps</h4>
      <Table
        heads={['Step', 'Accept policy', 'Processed', 'Failed', 'Error types']}
        empty="This job did not report its steps."
        rows={x.steps.map((step) => (
          <tr key={step.name}>
            <td>{step.name}</td>
            <td>
              <span className="bm-policy">{step.accept}</span>
            </td>
            <td className="bm-num">{number(step.processed)}</td>
            <td className={`bm-num${step.failed ? ' pc-bad' : ''}`}>{number(step.failed)}</td>
            <td className="bm-types">{step.errors.length ? step.errors.map((e) => e.type).join(', ') : <span className="pc-dim">None</span>}</td>
          </tr>
        ))}
      />

      <h4 className="bm-h4">Failed records by error type</h4>
      {groups.length === 0 ? (
        <p className="pc-dim bm-small">No failed records{running ? ' so far' : ''}.</p>
      ) : (
        <div className="bm-groups">
          {groups.map((g) => (
            <section key={g.type} className="bm-group" aria-label={`${g.type}, ${g.count} records`}>
              <header>
                <b className="pc-mono">{g.type}</b>
                <span className="bm-count">
                  {number(g.count)} records, {percent(g.count, x.total)}% of the job
                </span>
              </header>
              <p className="bm-steps">In step {g.steps.map((y) => `${y.step} (${number(y.count)})`).join(', ')}</p>
              <p className="bm-msg">{g.message}</p>
              {g.record && (
                <>
                  <small className="pc-dim">First record with this error</small>
                  <pre className="bm-record">{g.record}</pre>
                </>
              )}
            </section>
          ))}
          <p className="pc-dim bm-small">The engine keeps the first record of each error type in each step. The other records with the same error are counted only.</p>
        </div>
      )}

      <h4 className="bm-h4">Timings</h4>
      <dl className="bm-times">
        <dt>Created</dt>
        <dd>{stamp(x.start)}</dd>
        <dt>Loading finished</dt>
        <dd>{now >= x.loaded || !running ? `${stamp(x.loaded)} (${durationText(x.loaded - x.start)})` : 'Loading'}</dd>
        <dt>{running ? 'Expected end' : 'Ended'}</dt>
        <dd>{stamp(x.end)}</dd>
        <dt>Elapsed</dt>
        <dd>{durationText((running ? now : x.end) - x.start)}</dd>
        <dt>Flow</dt>
        <dd className="pc-mono">{x.flow}</dd>
      </dl>
    </>
  )
}
