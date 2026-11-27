// Change and release: the change board (lab-made, generic) with tickets, approvals, windows and configuration items, and
// the Releases page with the blue/green and canary plans behind the lab-made router. The rules live in lab/platform-release.js.
import { useEffect, useState } from 'react'
import { mark, MINUTE, stamp } from '../../lab/platform.js'
import {
  addWorkNote, canaryWeight, CHANGE_STATES, CHANGE_TYPES, CLOSE_CODES, closeTicket, coveringChange, HOLD_MINUTES, holdError, newTicket, parseWhen, playApprovers, promote, rateText, releaseOf, requestApproval,
  RISKS, rollback, rollbackWindow, setCanaryWeight, setTicket, startImplement, statsOf, toReview, whenText,
} from '../../lab/platform-release.js'
import { Btn, Errors, Field, Input, Link, Note, Select, SideNav, Table } from './parts.jsx'

const PAGES = [['Change board', 'Change board'], ['Releases', 'Releases']]

export default function ReleaseBoard({ state, update, place, go }) {
  const page = place.page ?? 'Change board'
  const view = { ...state, release: releaseOf(state) }
  return (
    <>
      <SideNav items={PAGES} value={page} onPick={(p) => go({ page: p })} />
      <main className="pc-main">
        {page === 'Releases' ? (
          place.router && view.release.routers.some((r) => r.id === place.router) ? <RouterPage key={place.router} state={view} id={place.router} update={update} go={go} /> : <RouterList state={view} update={update} go={go} />
        ) : place.ticket && view.release.tickets.some((t) => t.id === place.ticket) ? (
          <TicketPage key={place.ticket} state={view} id={place.ticket} update={update} go={go} />
        ) : (
          <Board state={view} update={update} go={go} />
        )}
      </main>
    </>
  )
}

const StateTag = ({ value }) => {
  const kind = ['Scheduled', 'Implement', 'Approved', 'Closed', 'Successful'].includes(value) ? 'rb-good' : ['Rejected', 'Unsuccessful'].includes(value) ? 'rb-bad' : 'rb-idle'
  return <span className={`rb-tag ${kind}`}>{value}</span>
}

// ---------- change board ----------

function Board({ state, update, go }) {
  useEffect(() => update((s) => mark(s, 'release:board')), [update])
  const r = state.release
  const create = () => {
    const out = newTicket(state, {})
    update(() => out.state)
    go({ page: 'Change board', ticket: out.id })
  }
  const rows = [...r.tickets].reverse().map((t) => (
    <tr key={t.id}>
      <td>
        <Link onClick={() => go({ page: 'Change board', ticket: t.id })}>{t.id}</Link>
      </td>
      <td>{t.short || <span className="pc-dim">No description</span>}</td>
      <td>{t.type}</td>
      <td>{t.risk}</td>
      <td>
        <StateTag value={t.state} />
      </td>
      <td>{whenText(t.start) || 'Not set'}</td>
      <td>{whenText(t.end) || 'Not set'}</td>
      <td className="pc-mono">{t.cis.join(', ')}</td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Change board</h2>
        <Btn kind="primary" onClick={create}>
          New change
        </Btn>
      </div>
      <p className="pc-dim">Every change to Production has a ticket: what you do, how you test it, how you go back, and when. The CAB and the service owner approve it. {r.gate ? 'The release gate is on: a Production deploy needs an approved change whose window is open and that names the app.' : 'The release gate is off in this lab.'}</p>
      <ol className="rb-flow" aria-label="Change states">
        {CHANGE_STATES.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <Table heads={['Number', 'Short description', 'Type', 'Risk', 'State', 'Planned start', 'Planned end', 'Configuration items']} rows={rows} empty="No change tickets yet." />
    </>
  )
}

const draftOf = (t) => ({ type: t.type, short: t.short, risk: t.risk, impl: t.impl, test: t.test, backout: t.backout, start: whenText(t.start), end: whenText(t.end), rollbackMinutes: t.rollbackMinutes ?? '', cis: t.cis.join(', ') })

function TicketPage({ state, id, update, go }) {
  const t = state.release.tickets.find((x) => x.id === id)
  useEffect(() => update((s) => mark(s, `release:ticket:${id}`)), [id, update])
  const [d, setD] = useState(() => draftOf(t))
  const [errors, setErrors] = useState([])
  const [said, setSaid] = useState('')
  const [close, setClose] = useState({ code: t.closeCode || '', notes: t.closeNotes || '' })
  const [workNote, setWorkNote] = useState('')
  const set = (patch) => setD((x) => ({ ...x, ...patch }))
  const editable = t.state === 'New'
  // the draft follows the ticket when its state changes, for example after a rejection
  useEffect(() => setD(draftOf(t)), [t.state]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (fn, done) => {
    const out = fn(state)
    setErrors(out.errors ?? [])
    if (out.errors?.length) return false
    update(() => out.state)
    setSaid(done)
    return true
  }
  const patchOf = () => {
    const bad = []
    const start = d.start.trim() ? parseWhen(d.start) : null
    const end = d.end.trim() ? parseWhen(d.end) : null
    if (d.start.trim() && start === null) bad.push('Planned start: write it as 2026-11-03 22:00.')
    if (d.end.trim() && end === null) bad.push('Planned end: write it as 2026-11-03 23:30.')
    const minutes = String(d.rollbackMinutes).trim()
    if (minutes && !(Number(minutes) > 0)) bad.push('Rollback window: a number of minutes above 0.')
    return { bad, patch: { type: d.type, short: d.short, risk: d.risk, impl: d.impl, test: d.test, backout: d.backout, start, end, rollbackMinutes: minutes ? Number(minutes) : null, cis: d.cis.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) } }
  }
  const save = () => {
    const { bad, patch } = patchOf()
    if (bad.length) return setErrors(bad)
    run((s) => setTicket(s, id, patch), 'Saved.')
  }
  const askApproval = () => {
    const { bad, patch } = patchOf()
    if (bad.length) return setErrors(bad)
    run((s) => {
      const saved = setTicket(s, id, patch)
      return saved.errors.length ? saved : requestApproval(saved.state, id)
    }, t.type === 'Standard' ? 'A Standard change is pre-approved. It is Scheduled.' : 'Approval requested. The change manager assesses it, then the CAB and the service owner decide.')
  }
  const apps = [...new Set(state.apps.filter((a) => a.env === t.env).map((a) => a.name))]
  const open = t.start !== null && t.end !== null && state.clock >= t.start && state.clock <= t.end
  const area = (key, label, hint) => (
    <Field label={label} wide hint={hint}>
      <textarea className="pc-input rb-text" rows={3} value={d[key]} disabled={!editable} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  )
  return (
    <>
      <p className="pc-dim">
        <Link onClick={() => go({ page: 'Change board', ticket: null })}>Change board</Link> / {t.id}
      </p>
      <div className="pc-title">
        <h2>{t.id}</h2>
        <StateTag value={t.state} />
      </div>
      <ol className="rb-flow" aria-label="State of this change">
        {CHANGE_STATES.map((x) => (
          <li key={x} className={x === t.state ? 'on' : CHANGE_STATES.indexOf(x) < CHANGE_STATES.indexOf(t.state) ? 'past' : ''}>
            {x}
          </li>
        ))}
      </ol>
      {!editable && <Note>The plans were sent for approval as they are, so they cannot change now. Open a new change for a different plan.</Note>}
      <div className="pc-pair">
        <Field label="Type">
          <Select value={d.type} disabled={!editable} onChange={(type) => set({ type })} options={CHANGE_TYPES} />
        </Field>
        <Field label="Risk">
          <Select value={d.risk} disabled={!editable} onChange={(risk) => set({ risk })} options={RISKS} />
        </Field>
        <Field label="Environment">
          <Input value={t.env} disabled onChange={() => {}} />
        </Field>
      </div>
      <Field label="Short description" wide>
        <Input value={d.short} disabled={!editable} onChange={(short) => set({ short })} />
      </Field>
      {area('impl', 'Implementation plan')}
      {area('test', 'Test plan')}
      {area('backout', 'Backout plan', 'How you go back, and how long it takes. The CAB rejects a change without one.')}
      <h3>Window</h3>
      <div className="pc-pair">
        <Field label="Planned start" hint="2026-11-03 22:00">
          <Input value={d.start} disabled={!editable} onChange={(start) => set({ start })} placeholder="YYYY-MM-DD HH:MM" />
        </Field>
        <Field label="Planned end" hint="2026-11-03 23:30">
          <Input value={d.end} disabled={!editable} onChange={(end) => set({ end })} placeholder="YYYY-MM-DD HH:MM" />
        </Field>
        <Field label="Rollback window (minutes)" hint="The time in which the backout must finish after go live.">
          <Input value={d.rollbackMinutes} disabled={!editable} inputMode="numeric" onChange={(rollbackMinutes) => set({ rollbackMinutes })} />
        </Field>
      </div>
      <p className="pc-dim">
        {t.start === null ? 'No window yet.' : open ? `The window is open until ${whenText(t.end)}.` : state.clock < t.start ? `The window opens at ${whenText(t.start)}.` : `The window closed at ${whenText(t.end)}.`}
      </p>
      <h3>Configuration items</h3>
      <Field label="Configuration items" wide hint={`The apps this change touches, separated by commas. Apps in ${t.env} now: ${apps.join(', ') || 'none'}.`}>
        <Input value={d.cis} disabled={!editable} onChange={(cis) => set({ cis })} />
      </Field>
      <Errors list={errors} />
      <div className="pc-foot rb-actions">
        <span className="pc-dim pc-grow" aria-live="polite">
          {said}
        </span>
        {editable && <Btn onClick={save}>Save</Btn>}
        {editable && (
          <Btn kind="primary" onClick={askApproval}>
            Request approval
          </Btn>
        )}
        <Btn disabled={!['Assess', 'Authorize'].includes(t.state)} title="Lab action: plays the change manager, the CAB and the service owner" onClick={() => run((s) => playApprovers(s), 'The approvers have decided. Read the approvals.')}>
          Run the approvers (lab)
        </Btn>
        {t.state === 'Scheduled' && <Btn onClick={() => run((s) => startImplement(s, id), 'Implementation started.')}>Start implementation</Btn>}
        {['Scheduled', 'Implement'].includes(t.state) && <Btn onClick={() => run((s) => toReview(s, id), 'In Review. Write the outcome and close the change.')}>Move to Review</Btn>}
      </div>
      <h3>Approvals</h3>
      <Table
        heads={['Group', 'Approver', 'State', 'Comment', 'Updated']}
        empty={t.type === 'Standard' ? 'A Standard change is pre-approved from the catalog.' : 'No approvers.'}
        rows={t.approvals.map((a) => (
          <tr key={a.group}>
            <td>{a.group}</td>
            <td>{a.who}</td>
            <td>
              <StateTag value={a.state} />
            </td>
            <td>{a.comment ?? ''}</td>
            <td>{a.t !== undefined ? stamp(a.t) : ''}</td>
          </tr>
        ))}
      />
      {(t.state === 'Review' || t.state === 'Closed') && (
        <>
          <h3>Close</h3>
          <div className="pc-pair">
            <Field label="Close code">
              <Select value={close.code} disabled={t.state === 'Closed'} onChange={(code) => setClose({ ...close, code })} placeholder="Choose a close code" options={CLOSE_CODES} />
            </Field>
          </div>
          <Field label="Close notes" wide>
            <textarea className="pc-input rb-text" rows={3} value={close.notes} disabled={t.state === 'Closed'} onChange={(e) => setClose({ ...close, notes: e.target.value })} />
          </Field>
          {t.state === 'Review' && (
            <div className="pc-foot">
              <Btn kind="primary" onClick={() => run((s) => closeTicket(s, id, close.code, close.notes), 'The change is closed.')}>
                Close change
              </Btn>
            </div>
          )}
        </>
      )}
      <h3>Work notes</h3>
      <div className="pc-bar">
        <Input value={workNote} onChange={setWorkNote} aria-label="Work note" placeholder="Work note" />
        <Btn disabled={!workNote.trim()} onClick={() => { update((s) => addWorkNote(s, id, workNote)); setWorkNote('') }}>
          Post
        </Btn>
      </div>
      <ul className="rb-notes">
        {[...t.notes].reverse().map((n, i) => (
          <li key={i}>
            <time>{stamp(n.t)}</time> <b>{n.who}</b> {n.text}
          </li>
        ))}
      </ul>
    </>
  )
}

// ---------- releases ----------

const KIND = { 'blue-green': 'Blue/green', canary: 'Canary' }
const weightsText = (r) => r.targets.map((t) => `${t.role} ${t.weight}%`).join(', ')

function RouterList({ state, go }) {
  const rows = state.release.routers.map((r) => (
    <tr key={r.id}>
      <td>
        <Link onClick={() => go({ page: 'Releases', router: r.id })}>{r.id}</Link>
      </td>
      <td>{KIND[r.kind]}</td>
      <td>{r.env}</td>
      <td className="pc-mono">{r.targets.map((t) => t.app).join(', ')}</td>
      <td>{weightsText(r)}</td>
    </tr>
  ))
  return (
    <>
      <h2>Releases</h2>
      <p className="pc-dim">A release plan puts a router in front of two CloudHub 2.0 apps. Blue/green moves all traffic at once; a canary moves it in steps. In the lab the router is a weighted load balancer.</p>
      <Table heads={['Release', 'Plan', 'Environment', 'Apps', 'Weights']} rows={rows} empty="No release plans in this lab." />
    </>
  )
}

const WINDOW = 15

function RouterPage({ state, id, update, go }) {
  const r = state.release.routers.find((x) => x.id === id)
  useEffect(() => update((s) => mark(s, r.kind === 'canary' ? 'release:canary' : `release:router:${id}`)), [id, r.kind, update])
  const [errors, setErrors] = useState([])
  const [said, setSaid] = useState('')
  const [w, setW] = useState(String(canaryWeight(r)))
  useEffect(() => setW(String(canaryWeight(r))), [r.since]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = (fn, done) => {
    const out = fn(state)
    setErrors(out.errors ?? [])
    if (out.errors?.length) return
    update(() => out.state)
    setSaid(done)
  }
  const appOf = (name) => state.apps.find((a) => a.name === name && a.env === r.env)
  const win = rollbackWindow(state, r)
  const hold = r.kind === 'canary' ? holdError(state, r) : null
  const heldFor = Math.floor((state.clock - r.since) / MINUTE)
  const cover = r.targets.map((t) => coveringChange(state, t.app, r.env)).find(Boolean)
  const canNext = r.kind === 'canary' ? r.plan.find((x) => x > canaryWeight(r)) : null
  return (
    <>
      <p className="pc-dim">
        <Link onClick={() => go({ page: 'Releases', router: null })}>Releases</Link> / {r.id}
      </p>
      <div className="pc-title">
        <h2>{r.id}</h2>
        <span className="rb-tag rb-idle">{KIND[r.kind]}</span>
      </div>
      <p className="pc-dim">
        {r.env}. {state.release.gate ? (cover ? `Covered by ${cover.id}, window until ${whenText(cover.end)}.` : 'No approved change covers this release now, so the router refuses a raise or a switch.') : 'The release gate is off.'}
      </p>
      <Table
        heads={['App', 'Role', 'Application file', 'Status', 'Weight', `Requests, ${WINDOW} min`, `Errors, ${WINDOW} min`, 'Error rate', 'This step']}
        rows={r.targets.map((t) => {
          const a = appOf(t.app)
          const last = statsOf(state, r.env, t.app, state.clock - WINDOW * MINUTE)
          const step = statsOf(state, r.env, t.app, r.since)
          return (
            <tr key={t.role}>
              <td className="pc-mono">{t.app}</td>
              <td>
                <span className={`rb-role rb-${t.role}`}>{t.role}</span>
              </td>
              <td className="pc-mono">{a?.jar ?? 'Not deployed'}</td>
              <td>{a?.status ?? 'Not deployed'}</td>
              <td>
                <b>{t.weight}%</b>
              </td>
              <td>{last.requests}</td>
              <td>{last.errors}</td>
              <td className={last.rate >= (r.threshold ?? 1) ? 'rb-hot' : ''}>{rateText(last.rate)}</td>
              <td>
                {step.requests} req, {rateText(step.rate)}
              </td>
            </tr>
          )
        })}
      />
      <div className="rb-bars" aria-hidden="true">
        {r.targets.map((t) => t.weight > 0 && <span key={t.role} className={`rb-${t.role}`} style={{ width: `${t.weight}%` }}>{t.role} {t.weight}%</span>)}
      </div>
      {r.kind === 'blue-green' ? (
        <div className="pc-split">
          <b>Live</b>
          <span>
            {r.live}, {r.targets.find((t) => t.role === r.live).app}, since {stamp(r.since)}
          </span>
          <b>Rollback window</b>
          <span>{win ? (state.clock <= win.until ? `Until ${whenText(win.until)}, ${Math.ceil((win.until - state.clock) / MINUTE)} minutes left (${win.minutes} minutes${win.ticket ? ` from ${win.ticket}` : ''}).` : `Ended at ${whenText(win.until)}. A rollback now is outside the window of the change.`) : 'Starts when the idle color takes the traffic.'}</span>
          <b>Promote</b>
          <span className="pc-dim">Switches all traffic to the idle color, {r.targets.find((t) => t.role !== r.live).app}. Roll back switches it back. Neither undeploys an app.</span>
        </div>
      ) : (
        <div className="pc-split">
          <b>Plan</b>
          <span>
            {r.plan.map((x) => `${x}%`).join(', then ')}. Each step holds at least {HOLD_MINUTES} minutes with the canary error rate under {rateText(r.threshold)}.
          </span>
          <b>This step</b>
          <span>
            Canary {canaryWeight(r)}% since {stamp(r.since)}, {heldFor} minutes. {canaryWeight(r) === 0 ? 'The canary takes no traffic.' : hold ? hold : canNext ? `It may go to ${canNext}%.` : 'The canary takes all the traffic.'}
          </span>
          <b>Canary weight</b>
          <div className="rb-weight">
            <input type="range" min="0" max="100" step="5" value={Number(w) || 0} aria-label="Canary weight slider" onChange={(e) => setW(e.target.value)} />
            <Field label="Canary weight (%)">
              <Input value={w} inputMode="numeric" onChange={setW} />
            </Field>
            <Btn onClick={() => run((s) => setCanaryWeight(s, id, w.trim() === '' ? NaN : Number(w)), `Canary weight set to ${w}%.`)}>Set weight</Btn>
          </div>
        </div>
      )}
      <Errors list={errors} />
      <div className="pc-foot">
        <span className="pc-dim pc-grow" aria-live="polite">
          {said}
        </span>
        <Btn kind="danger" onClick={() => run((s) => rollback(s, id), r.kind === 'canary' ? 'Rolled back: the canary weight is 0.' : 'Rolled back: all traffic is on the previous color.')}>
          Roll back
        </Btn>
        <Btn kind="primary" onClick={() => run((s) => promote(s, id), r.kind === 'canary' ? 'Promoted to the next weight.' : 'Promoted: all traffic is on the new color.')}>
          Promote
        </Btn>
      </div>
      <h3>Failing requests, last {WINDOW} minutes</h3>
      <Table
        heads={['App', 'Request', 'Errors']}
        empty="No failing requests."
        rows={r.targets.flatMap((t) =>
          statsOf(state, r.env, t.app, state.clock - WINDOW * MINUTE).failing.map(([req, n]) => (
            <tr key={t.app + req}>
              <td className="pc-mono">{t.app}</td>
              <td className="pc-mono">{req}</td>
              <td>{n}</td>
            </tr>
          )),
        )}
      />
      {r.kind === 'canary' && (
        <>
          <h3>Steps</h3>
          <Table
            heads={['Canary weight', 'From', 'To', 'Canary requests', 'Errors', 'Error rate']}
            rows={[...(r.steps ?? [])].reverse().map((x, i) => {
              const st = x.to === undefined ? statsOf(state, r.env, x.app, x.from) : { requests: x.requests, errors: x.errors, rate: x.requests ? (x.errors * 100) / x.requests : 0 }
              return (
                <tr key={i}>
                  <td>{x.w}%</td>
                  <td>{stamp(x.from)}</td>
                  <td>{x.to === undefined ? 'Now' : stamp(x.to)}</td>
                  <td>{st.requests}</td>
                  <td>{st.errors}</td>
                  <td>{rateText(st.rate)}</td>
                </tr>
              )
            })}
          />
        </>
      )}
      <h3>History</h3>
      <ul className="rb-notes">
        {[...r.history].reverse().map((h, i) => (
          <li key={i}>
            <time>{stamp(h.t)}</time> {h.text}
          </li>
        ))}
        {[...(r.rollbacks ?? [])].reverse().map((x, i) => (
          <li key={`rb${i}`}>
            <time>{stamp(x.t)}</time> Rollback {x.from} to {x.to}, {x.minutes} minutes after go live, {x.within ? 'inside' : 'outside'} the rollback window.
          </li>
        ))}
      </ul>
      {r.history.length === 0 && <p className="pc-dim">No traffic change yet.</p>}
    </>
  )
}
