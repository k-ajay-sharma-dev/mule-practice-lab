// HL7 interfaces: an integration engine view of Bayview Health. The outbound interfaces of Epic with their MLLP
// connection, queue and ACK counts; the MLLP listeners of the Mule apps; the message log with a search by MRN, visit or
// control ID, the raw MLLP frame and the parsed tree, and Resend; the Bayview LIS that receives the messages; and the
// error store. The rules live in lab/platform-hl7.js.
import { Fragment, useEffect, useState } from 'react'
import { mark, stamp, timeText } from '../../lab/platform.js'
import {
  ACK_CODES, ackCounts, ADT_EVENTS, createInterface, entryOf, ERR_CODES, EVENTS, ifaceOf, interfaceProblems, isFilled, MULE_HOST, PATIENT_CLASS, readAck, releaseHold, resend, searchLog, sendTest, startInterface, stopInterface, TEST_KINDS, treeOf,
  updateInterface, upgradeHl7,
} from '../../lab/platform-hl7.js'
import { Btn, Check, Errors, Field, Input, Link, Note, Select, Table, Tabs } from './parts.jsx'

const VIEWS = ['Interfaces', 'Message log', 'Bayview LIS', 'Error store']
const SEEN = { Interfaces: 'hl7:interfaces', 'Message log': 'hl7:log', 'Bayview LIS': 'hl7:lis', 'Error store': 'hl7:errors' }
const ACK_FILTERS = [['', 'All'], ['AA', 'AA'], ['AE', 'AE'], ['AR', 'AR'], ['timeout', 'No ACK in time']]
// an HL7 DTM value as a date and time to read
const when = (v) => (/^\d{12}/.test(v ?? '') ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(8, 10)}:${v.slice(10, 12)}` : /^\d{8}$/.test(v ?? '') ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v || '')
const person = (n) => String(n ?? '').split('^').filter(Boolean).join(', ')
const legName = (leg) => (leg === 'LIS' ? 'Bayview LIS' : leg)

const AckTag = ({ e }) =>
  e.status === 'timeout' ? <span className="h7-tag h7-late">No ACK in time</span> : e.ack ? <span className={`h7-tag h7-${e.ack.toLowerCase()}`} title={ACK_CODES[e.ack]}>{e.ack}</span> : <span className="h7-tag">Waiting</span>

export default function Hl7Engine({ state, update, place, go }) {
  const h = state.hl7
  const view = VIEWS.includes(place?.view) ? place.view : 'Interfaces'
  // a save from before HL7 was built, or the open console, holds a placeholder: build the system on first open
  useEffect(() => {
    if (h && !isFilled(h)) update((s) => upgradeHl7(s))
  }, [h, update])
  useEffect(() => {
    if (isFilled(h)) update((s) => mark(s, SEEN[view]))
  }, [view, Boolean(isFilled(h))]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!h)
    return (
      <main className="pc-main">
        <h2>HL7 interfaces</h2>
        <p className="pc-empty pc-boxed">This lab has no HL7 interfaces.</p>
      </main>
    )
  if (!isFilled(h)) return <main className="pc-main">Opening the HL7 interfaces...</main>

  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    return r.result
  }
  const n = ackCounts(h)
  const props = { state, h, update, act, place, go }
  return (
    <main className="pc-main h7">
      <div className="pc-title">
        <h2>HL7 interfaces</h2>
        <span className="pc-dim">Bayview Health, HL7 v2.5.1 over MLLP</span>
      </div>
      <div className="h7-tiles" aria-label="ACK counts">
        <div>
          <small>ACK AA</small>
          <b className="h7-good">{n.AA}</b>
        </div>
        <div>
          <small>NACK AE</small>
          <b className={n.AE ? 'h7-bad' : ''}>{n.AE}</b>
        </div>
        <div>
          <small>NACK AR</small>
          <b className={n.AR ? 'h7-bad' : ''}>{n.AR}</b>
        </div>
        <div>
          <small>ACK timeouts</small>
          <b className={n.timeout ? 'h7-warn' : ''}>{n.timeout}</b>
        </div>
        <div>
          <small>Queued in Epic</small>
          <b>{n.queued}</b>
        </div>
      </div>
      <Tabs tabs={VIEWS} value={view} onChange={(v) => go({ view: v })} />
      {view === 'Interfaces' && <Interfaces {...props} />}
      {view === 'Message log' && (place?.msg && entryOf(h, place.msg) ? <Message key={place.msg} {...props} e={entryOf(h, place.msg)} /> : <MessageLog {...props} />)}
      {view === 'Bayview LIS' && <Lis {...props} />}
      {view === 'Error store' && <ErrorStore {...props} />}
    </main>
  )
}

// ---------- interfaces ----------

const blank = { id: '', name: '', type: 'ADT', events: [], host: '', port: '', tls: false, ackTimeout: '30', onAe: 'Continue' }
const formOf = (i) => ({ id: i.id, name: i.name, type: i.type, events: [...i.events], host: i.host, port: String(i.port), tls: i.tls, ackTimeout: String(i.ackTimeout), onAe: i.onAe })

function InterfaceForm({ h, form, setForm, editing, onSave, onCancel }) {
  const [tried, setTried] = useState(false)
  const errs = interfaceProblems(h, form, editing)
  const set = (k) => (v) => setForm({ ...form, [k]: v })
  const events = form.type === 'ORU' ? ['R01'] : ADT_EVENTS
  const toggle = (e, on) => setForm({ ...form, events: on ? [...form.events, e] : form.events.filter((x) => x !== e) })
  return (
    <section className="h7-card">
      <h3>{editing ? `Edit ${form.id}` : 'New interface'}</h3>
      <p className="pc-dim">An outbound interface of Epic Bridges: Epic opens an MLLP connection to the destination, sends one message, and waits for its ACK before the next.</p>
      <div className="h7-grid">
        <Field label="Interface ID" required hint="Letters, digits and _">
          <Input value={form.id} onChange={set('id')} disabled={editing} aria-label="Interface ID" />
        </Field>
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} aria-label="Name" />
        </Field>
        <Field label="Message type" required>
          <Select value={form.type} onChange={(v) => setForm({ ...form, type: v, events: [] })} options={[['ADT', 'ADT, patient administration'], ['ORU', 'ORU, observation results']]} aria-label="Message type" />
        </Field>
        <Field label="Destination host" required hint="The MLLP listener Epic connects to">
          <Input value={form.host} onChange={set('host')} aria-label="Destination host" />
        </Field>
        <Field label="Port" required>
          <Input value={form.port} onChange={set('port')} inputMode="numeric" aria-label="Port" />
        </Field>
        <Field label="ACK timeout (s)" required hint="How long Epic waits for an ACK before it reconnects and sends again">
          <Input value={form.ackTimeout} onChange={set('ackTimeout')} inputMode="numeric" aria-label="ACK timeout (s)" />
        </Field>
        <Field label="On AE" hint="Continue logs the error and sends the next message; Hold stops the queue">
          <Select value={form.onAe} onChange={set('onAe')} options={['Continue', 'Hold']} aria-label="On AE" />
        </Field>
      </div>
      <fieldset className="h7-events">
        <legend>Events</legend>
        {events.map((e) => (
          <Check key={e} checked={form.events.includes(e)} onChange={(on) => toggle(e, on)}>
            {e} {EVENTS[e]}
          </Check>
        ))}
      </fieldset>
      <Check checked={form.tls} onChange={set('tls')}>
        TLS (MLLP over TLS)
      </Check>
      {tried && <Errors list={errs} />}
      <div className="h7-actions">
        <Btn
          kind="primary"
          onClick={() => {
            setTried(true)
            if (!errs.length) onSave()
          }}
        >
          {editing ? 'Save' : 'Create'}
        </Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </section>
  )
}

function Interfaces({ state, h, act, place }) {
  const [open, setOpen] = useState(place?.iface ?? null)
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(false)
  const [kind, setKind] = useState('A04')
  const [msg, setMsg] = useState(null)
  const i = open && ifaceOf(h, open)
  const conn = (x) => (x.status !== 'Running' ? 'Stopped' : x.held ? 'Held' : x.connected ? 'Connected' : 'Not connected')
  const rows = h.interfaces.map((x) => (
    <tr key={x.id} className={open === x.id ? 'h7-on' : ''}>
      <td>
        <Link onClick={() => (setOpen(open === x.id ? null : x.id), setForm(null), setMsg(null))}>{x.id}</Link>
        <div className="pc-dim h7-small">{x.name}</div>
      </td>
      <td>
        {x.type} {x.events.join(' ')}
      </td>
      <td className="h7-mono">
        {x.host}:{x.port}
      </td>
      <td>{x.tls ? 'TLS' : 'None'}</td>
      <td>
        <span className={`h7-tag h7-${conn(x).toLowerCase().replace(/ /g, '')}`}>{conn(x)}</span>
        {x.lastError && <div className="h7-err h7-small">{x.lastError}</div>}
      </td>
      <td>{x.queue.length}</td>
      <td>{x.n.sent}</td>
      <td>{x.n.AA}</td>
      <td>{x.n.AE}</td>
      <td>{x.n.AR}</td>
      <td>{x.n.timeout}</td>
      <td>{x.reconnects}</td>
    </tr>
  ))
  const listeners = Object.values(h.listeners).map((l) => (
    <tr key={l.port}>
      <td>{l.port}</td>
      <td className="h7-mono">{l.host}</td>
      <td>{l.app}</td>
      <td>{l.tls ? 'TLS' : 'None'}</td>
      <td>{timeText(l.since)}</td>
      <td>{timeText(l.t)}</td>
    </tr>
  ))
  return (
    <>
      <div className="h7-head">
        <h3>Outbound interfaces of Epic</h3>
        {!form && (
          <Btn kind="primary" onClick={() => (setForm({ ...blank }), setEditing(false), setOpen(null))}>
            New interface
          </Btn>
        )}
      </div>
      {form && (
        <InterfaceForm
          h={h}
          form={form}
          setForm={setForm}
          editing={editing}
          onCancel={() => setForm(null)}
          onSave={() => {
            const r = act((s) => (editing ? updateInterface(s, form.id, form) : createInterface(s, form)))
            if (r.ok) {
              setOpen(editing ? form.id : r.id)
              setForm(null)
            }
          }}
        />
      )}
      <Table heads={['Interface', 'Messages', 'Destination', 'TLS', 'Status', 'Queued', 'Sent', 'AA', 'AE', 'AR', 'ACK timeouts', 'Reconnects']} rows={rows} empty="No outbound interfaces yet." />
      {i && !form && (
        <section className="h7-card" aria-label={`Interface ${i.id}`}>
          <h3>
            {i.id} <span className="pc-dim">{i.name}</span>
          </h3>
          <dl className="h7-dl">
            <dt>Status</dt>
            <dd>
              {i.status}, {conn(i)}
              {i.connected && i.since !== null ? ` since ${timeText(i.since)}` : ''}
            </dd>
            <dt>Destination</dt>
            <dd className="h7-mono">
              {i.host}:{i.port} {i.tls ? 'over TLS' : 'plain TCP'}
            </dd>
            <dt>Events</dt>
            <dd>{i.events.map((e) => `${e} ${EVENTS[e] ?? ''}`).join(', ')}</dd>
            <dt>ACK timeout</dt>
            <dd>{i.ackTimeout} s</dd>
            <dt>On AE</dt>
            <dd>{i.onAe}</dd>
            <dt>Next in queue</dt>
            <dd className="h7-mono">{i.queue[0] ? `${i.queue[0].ctl}${i.queue[0].tries ? `, try ${i.queue[0].tries + 1}` : ''}` : 'Empty'}</dd>
          </dl>
          <div className="h7-actions">
            {i.status === 'Running' ? <Btn onClick={() => act((s) => stopInterface(s, i.id))}>Stop</Btn> : <Btn kind="primary" onClick={() => act((s) => startInterface(s, i.id))}>Start</Btn>}
            <Btn onClick={() => (setForm(formOf(i)), setEditing(true))}>Edit</Btn>
            {i.held && <Btn onClick={() => act((s) => releaseHold(s, i.id))}>Release hold</Btn>}
          </div>
          <div className="h7-actions">
            <Field label="Test message">
              <Select value={kind} onChange={setKind} options={Object.entries(TEST_KINDS)} aria-label="Test message" />
            </Field>
            <Btn onClick={() => setMsg(act((s) => sendTest(s, i.id, kind)))}>Send test message</Btn>
          </div>
          {msg && <p className={msg.ok ? 'pc-dim' : 'h7-err'}>{msg.text} {msg.ok ? 'It goes out when the interface is connected. Move the clock a minute.' : ''}</p>}
        </section>
      )}
      <h3 className="h7-sub">MLLP listeners</h3>
      <Table heads={['Port', 'Host', 'Application', 'TLS', 'Listening since', 'Last poll']} rows={listeners} empty={`No Mule app listens. Epic interfaces to ${MULE_HOST} get Connection refused.`} />
      <h3 className="h7-sub">Receiving systems</h3>
      <Table
        heads={['System', 'Address', 'Status', 'AA', 'AE', 'AR']}
        rows={[
          <tr key="lis">
            <td>{h.lis.name}</td>
            <td className="h7-mono">
              {h.lis.host}:{h.lis.port}
            </td>
            <td>
              <span className="h7-tag h7-connected">Listening</span>
            </td>
            <td>{h.lis.n.AA}</td>
            <td>{h.lis.n.AE}</td>
            <td>{h.lis.n.AR}</td>
          </tr>,
        ]}
      />
      <Note>Lab clock {stamp(state.clock)}. Epic sends each message over MLLP framed as 0x0B, the message, 0x1C 0x0D, and waits for the ACK. The name {MULE_HOST} reaches the listener of any running app in the lab.</Note>
    </>
  )
}

// ---------- message log ----------

function MessageLog({ h, act, go }) {
  const [text, setText] = useState('')
  const [leg, setLeg] = useState('')
  const [ack, setAck] = useState('')
  const [picked, setPicked] = useState([])
  const [done, setDone] = useState(null)
  const list = searchLog(h, { text, leg, ack })
  const legs = [['', 'All'], ...h.interfaces.map((i) => [i.id, i.id]), ['LIS', 'Bayview LIS']]
  const rows = list.map((e) => (
    <tr key={e.id}>
      <td>{e.leg !== 'LIS' && ifaceOf(h, e.leg) && <input type="checkbox" checked={picked.includes(e.id)} onChange={(x) => setPicked(x.target.checked ? [...picked, e.id] : picked.filter((y) => y !== e.id))} aria-label={`Select ${e.ctl}`} />}</td>
      <td>{timeText(e.t)}</td>
      <td>{legName(e.leg)}</td>
      <td>{e.leg === 'LIS' ? 'Mule to LIS' : 'Epic to Mule'}</td>
      <td className="h7-mono">{e.type}</td>
      <td>
        <Link onClick={() => go({ view: 'Message log', msg: e.id })}>{e.ctl}</Link>
      </td>
      <td className="h7-mono">{e.mrn}</td>
      <td>{e.tries}</td>
      <td>
        <AckTag e={e} />
      </td>
    </tr>
  ))
  return (
    <>
      <div className="h7-filters">
        <Field label="Search by MRN or control ID" hint="An MRN, a visit number or MSH-10">
          <Input value={text} onChange={setText} aria-label="Search by MRN or control ID" />
        </Field>
        <Field label="Interface">
          <Select value={leg} onChange={setLeg} options={legs} aria-label="Interface" />
        </Field>
        <Field label="ACK">
          <Select value={ack} onChange={setAck} options={ACK_FILTERS} aria-label="ACK" />
        </Field>
      </div>
      <div className="h7-actions">
        <Btn
          disabled={!picked.length}
          onClick={() => {
            setDone(act((s) => resend(s, picked)))
            setPicked([])
          }}
        >
          Resend selected
        </Btn>
        {done !== null && <span className="pc-dim">{done} message{done === 1 ? '' : 's'} back in the queue of Epic. Move the clock a minute.</span>}
      </div>
      <Table heads={['', 'Time', 'Interface', 'Direction', 'Message', 'Control ID', 'MRN', 'Try', 'ACK']} rows={rows} empty="No message matches." />
      <Note>The newest message is first. Resend works on messages that Epic sent: Epic puts the same message, with the same MSH-10, at the end of the queue of its interface.</Note>
    </>
  )
}

function Raw({ text }) {
  const lines = String(text ?? '').split(/\r\n|\r|\n/).filter(Boolean)
  return (
    <pre className="h7-raw" aria-label="Raw message">
      <i>{'<VT>'}</i>
      {lines.map((l, k) => (
        <Fragment key={k}>
          {k > 0 && '\n'}
          <b>{l.slice(0, 3)}</b>
          {l.slice(3)}
          <i>{'<CR>'}</i>
        </Fragment>
      ))}
      {'\n'}
      <i>{'<FS><CR>'}</i>
    </pre>
  )
}

function Parsed({ text }) {
  const tree = treeOf(text)
  if (!tree.ok) return <p className="h7-err">{tree.error}</p>
  return (
    <div className="h7-tree" aria-label="Parsed message">
      {tree.segments.map((seg, k) => (
        <details key={k} open className="h7-seg">
          <summary>
            <b>{seg.name}</b> {seg.k > 1 ? seg.k : ''}
          </summary>
          <dl className="h7-fields">
            {seg.fields.map((f) => (
              <Fragment key={f.n}>
                <dt>
                  <span className="h7-mono">
                    {seg.name}-{f.n}
                  </span>{' '}
                  {f.name}
                </dt>
                <dd>
                  {f.reps.length === 1 && f.reps[0].length === 1 ? (
                    <span className="h7-mono">{f.reps[0][0]}</span>
                  ) : (
                    <ol className="h7-reps">
                      {f.reps.map((r, ri) => (
                        <li key={ri}>
                          {f.reps.length > 1 && <span className="pc-dim">Repetition {ri + 1}</span>}
                          <ul>
                            {r.map((c, ci) =>
                              c === '' ? null : (
                                <li key={ci}>
                                  <span className="h7-mono">
                                    .{ci + 1}
                                  </span>{' '}
                                  {f.comps[ci] ?? ''} <span className="h7-mono h7-val">{c}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </li>
                      ))}
                    </ol>
                  )}
                  {f.escaped && <div className="pc-dim h7-small">Decoded from escape sequences: {f.raw}</div>}
                </dd>
              </Fragment>
            ))}
          </dl>
        </details>
      ))}
    </div>
  )
}

function Message({ h, e, update, act, go, place }) {
  const [tab, setTab] = useState(place?.tab === 'Parsed' ? 'Parsed' : 'Raw')
  const [done, setDone] = useState(null)
  useEffect(() => {
    update((s) => {
      const t = mark(s, `hl7-msg:${e.ctl}`)
      return e.tries > 1 || e.status === 'timeout' ? mark(t, 'hl7:retry') : t
    })
  }, [e.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'Parsed') update((s) => mark(s, 'hl7:parsed'))
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const a = e.ackRaw ? readAck(e.ackRaw) : null
  const same = h.log.filter((x) => x.ctl === e.ctl && x.id !== e.id)
  const canResend = e.leg !== 'LIS' && Boolean(ifaceOf(h, e.leg))
  return (
    <section className="h7-card">
      <p className="pc-dim">
        <Link onClick={() => go({ view: 'Message log' })}>Message log</Link> / {e.ctl}
      </p>
      <h3>
        {e.type} {e.ctl} <AckTag e={e} />
      </h3>
      <dl className="h7-dl">
        <dt>Time</dt>
        <dd>{stamp(e.t)}</dd>
        <dt>Interface</dt>
        <dd>
          {legName(e.leg)}, {e.leg === 'LIS' ? `${e.app} to the LIS` : `Epic to ${e.app}`}
        </dd>
        <dt>Try</dt>
        <dd>{e.tries}</dd>
        <dt>MRN</dt>
        <dd className="h7-mono">{e.mrn || 'None'}</dd>
        {e.note && (
          <>
            <dt>Note</dt>
            <dd>{e.note}</dd>
          </>
        )}
      </dl>
      <div className="h7-actions">
        {canResend && (
          <Btn kind="primary" onClick={() => setDone(act((s) => resend(s, [e.id])))}>
            Resend
          </Btn>
        )}
        {done !== null && <span className="pc-dim">Back in the queue of {e.leg}. Move the clock a minute.</span>}
      </div>
      <Tabs tabs={['Raw', 'Parsed']} value={tab} onChange={setTab} />
      {tab === 'Raw' ? <Raw text={e.raw} /> : <Parsed text={e.raw} />}
      <h3 className="h7-sub">ACK</h3>
      {a ? (
        <>
          <p>
            MSA-1 <b>{a.code}</b> {ACK_CODES[a.code]}, MSA-2 {a.controlId}
            {a.errCode ? (
              <>
                . ERR-3 <b>{a.errCode}</b> {ERR_CODES[a.errCode]} at {a.errLoc || 'no location'}: {a.text}
              </>
            ) : null}
          </p>
          {tab === 'Raw' ? <Raw text={e.ackRaw} /> : <Parsed text={e.ackRaw} />}
        </>
      ) : (
        <p className="pc-dim">No ACK reached the sender.</p>
      )}
      {same.length > 0 && (
        <>
          <h3 className="h7-sub">Same control ID</h3>
          <ul className="h7-list">
            {same.map((x) => (
              <li key={x.id}>
                <Link onClick={() => go({ view: 'Message log', msg: x.id })}>
                  {timeText(x.t)} {legName(x.leg)}, try {x.tries}
                </Link>{' '}
                <AckTag e={x} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ---------- the LIS ----------

function Lis({ h }) {
  const enc = h.lis.encounters
  const patients = Object.entries(h.lis.patients).map(([mrn, p]) => (
    <tr key={mrn}>
      <td className="h7-mono">{mrn}</td>
      <td>{person(p.name)}</td>
      <td>{when(p.dob).slice(0, 10)}</td>
      <td>{p.sex}</td>
      <td>{p.mergedInto ? <span className="h7-tag">Merged into {p.mergedInto}</span> : ''}</td>
    </tr>
  ))
  const encounters = [...enc.entries()].reverse().map(([k, e]) => {
    const dup = enc.slice(0, k).some((o) => o.visit === e.visit && o.mrn === e.mrn)
    return (
      <tr key={k}>
        <td className="h7-mono">
          {e.visit} {dup && <span className="h7-tag h7-ae">Duplicate</span>}
        </td>
        <td className="h7-mono">{e.mrn}</td>
        <td>{PATIENT_CLASS[e.cls] ?? e.cls}</td>
        <td>{e.loc}</td>
        <td>{e.status}</td>
        <td>{when(e.admit)}</td>
        <td>{when(e.discharge)}</td>
        <td>{timeText(e.t)}</td>
      </tr>
    )
  })
  const results = [...h.lis.results].reverse().map((r, k) => (
    <tr key={k}>
      <td className="h7-mono">{r.mrn}</td>
      <td>{r.panel}</td>
      <td>
        {r.text} <span className="pc-dim h7-mono">{r.code}</span>
      </td>
      <td>
        {r.value} {r.units}
      </td>
      <td>{r.flag}</td>
      <td>{timeText(r.t)}</td>
    </tr>
  ))
  return (
    <>
      <p className="pc-dim">
        The laboratory system that receives ADT and results from the Mule apps on {h.lis.host} port {h.lis.port}. It answers each message with an ACK. It reads the first repetition of PID-3 and takes only Bayview MRNs, assigning authority BVH.
      </p>
      <h3 className="h7-sub">Patients</h3>
      <Table heads={['MRN', 'Name', 'Date of birth', 'Sex', 'Merged into']} rows={patients} empty="No patients." />
      <h3 className="h7-sub">Encounters</h3>
      <Table heads={['Visit', 'MRN', 'Class', 'Location', 'Status', 'Admit', 'Discharge', 'Changed']} rows={encounters} empty="No encounters." />
      <h3 className="h7-sub">Results</h3>
      <Table heads={['MRN', 'Panel', 'Test', 'Value', 'Flag', 'Received']} rows={results} empty="No results." />
    </>
  )
}

// ---------- error store ----------

function ErrorStore({ h }) {
  const [open, setOpen] = useState(null)
  const list = [...h.errors].reverse()
  const rows = list.map((x, k) => (
    <tr key={k}>
      <td>{timeText(x.t)}</td>
      <td>{x.app}</td>
      <td>
        <Link onClick={() => setOpen(open === k ? null : k)}>{x.ctl || '(none)'}</Link>
      </td>
      <td className="h7-mono">{x.type}</td>
      <td className="h7-mono">{x.mrn}</td>
      <td>{x.reason}</td>
    </tr>
  ))
  return (
    <>
      <p className="pc-dim">Messages that an app could not process, kept with the reason so a person can fix and replay them.</p>
      <Table heads={['Time', 'Application', 'Control ID', 'Message', 'MRN', 'Reason']} rows={rows} empty="The error store is empty." />
      {open !== null && list[open] && <Raw text={list[open].raw} />}
    </>
  )
}
