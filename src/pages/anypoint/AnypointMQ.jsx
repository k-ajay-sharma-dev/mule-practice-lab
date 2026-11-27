// Anypoint MQ of the practice console: Destinations, Client Apps and Usage, a queue page with its details, the message
// browser and the message sender, and message exchanges with their bindings. The rules live in lab/platform-mq.js.
import { Fragment, useEffect, useRef, useState } from 'react'
import { mark, purge, sendMessage, stamp, viewMessages } from '../../lab/platform.js'
import {
  ackMessage, addClientApp, attemptsOf, bindingErrors, bindQueue, browse, BROWSE_MAX, BROWSE_MAX_FIFO, clientApps, createExchange, createQueue, DEFAULT_ATTEMPTS, DEFAULT_LOCK_TTL, DEFAULT_TTL,
  deleteClientApp, deleteExchange, deleteQueue, destinationsOf, durationText, exchangeErrors, exchangeOf, exchangesFor, exchangesOf, groupOf, inFlight, isDlq, isFifo, lockTtlOf, moveBack, queueErrors,
  ready, regenerateSecret, release, setQueue, sourcesOf, tagSent, targetsOf, TIME_UNITS, ttlOf, unbindQueue, usage,
} from '../../lab/platform-mq.js'
import { Btn, Chart, Check, Copy, Field, Input, Link, Modal, Note, Radios, Select, SideNav, Table } from './parts.jsx'

// The lab has one region. The queues are the same in each environment of the lab (lab choice).
const REGION = 'US East (Ohio)'
const SAMPLE = '{ "order": "O-2001", "total": 10 }'

export default function AnypointMQ({ state, update, place, go, openEnv }) {
  const queue = state.queues.find((q) => q.name === place.queue)
  const exchange = exchangeOf(state, place.exchange)
  const section = place.section ?? 'Destinations'
  if (queue) return <QueuePage key={queue.name} state={state} queue={queue} tab={place.tab ?? 'Details'} update={update} go={go} openEnv={openEnv} />
  if (exchange) return <ExchangePage key={exchange.name} state={state} exchange={exchange} tab={place.tab ?? 'Details'} update={update} go={go} openEnv={openEnv} />
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} items={[['Destinations', 'Destinations'], ['Client Apps', 'Client Apps'], ['Usage', 'Usage']]} value={section} onPick={(s) => go({ section: s })} />
      <main className="pc-main">
        {section === 'Destinations' && <Destinations state={state} update={update} go={go} />}
        {section === 'Client Apps' && <ClientApps state={state} update={update} />}
        {section === 'Usage' && <Usage state={state} update={update} />}
      </main>
    </>
  )
}

const Region = ({ env }) => (
  <p className="pc-dim mq-where">
    Region <b>{REGION}</b>, environment <b>{env}</b>
  </p>
)

// ---------- Destinations ----------

function Destinations({ state, update, go }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(null)
  const [find, setFind] = useState('')
  const now = state.clock
  const hit = (name) => name.toLowerCase().includes(find.trim().toLowerCase())
  const rows = [
    ...state.queues.filter((q) => hit(q.name)).map((q) => (
      <tr key={`q-${q.name}`}>
        <td>
          <Link onClick={() => go({ queue: q.name, tab: 'Details' })}>{q.name}</Link>
          {isDlq(state, q.name) && <span className="mq-tag mq-tag-dlq" title={`Dead letter queue of ${sourcesOf(state, q.name).join(', ')}`}>DLQ</span>}
          {q.encrypted && <span className="mq-tag">Encrypted</span>}
        </td>
        <td>{isFifo(q) ? 'FIFO queue' : 'Queue'}</td>
        <td>{inFlight(q, now).length}</td>
        <td>{ready(q, now).length}</td>
        <td>{durationText(ttlOf(q))}</td>
      </tr>
    )),
    ...exchangesOf(state).filter((x) => hit(x.name)).map((x) => (
      <tr key={`x-${x.name}`}>
        <td>
          <Link onClick={() => go({ exchange: x.name, tab: 'Details' })}>{x.name}</Link>
          {x.fifo && <span className="mq-tag">FIFO</span>}
        </td>
        <td>Message exchange</td>
        <td colSpan={3} className="pc-dim">
          {x.bindings.length === 0 ? 'No bound queues' : `Bound to ${x.bindings.join(', ')}`}
        </td>
      </tr>
    )),
  ]
  return (
    <>
      <div className="pc-title">
        <h2>Destinations</h2>
        <span className="pc-grow" />
        <div className="mq-add">
          <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            + Add
          </Btn>
          {adding && (
            <div className="mq-menu" role="menu">
              {[['Queue', { kind: 'queue', fifo: false }], ['FIFO Queue', { kind: 'queue', fifo: true }], ['Message Exchange', { kind: 'exchange', fifo: false }]].map(([label, f]) => (
                <button key={label} type="button" role="menuitem" onClick={() => { setAdding(false); setForm(f) }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <Region env={state.env} />
      <div className="pc-bar">
        <Input value={find} onChange={setFind} placeholder="Search destinations" aria-label="Search destinations" />
      </div>
      <Table heads={['Name', 'Type', 'Messages in flight', 'Messages ready', 'TTL']} empty="No destinations in this environment." rows={rows} />
      <p className="pc-dim mq-small">In flight: taken by a client and not acknowledged yet. Ready: waiting for a consumer.</p>
      {form?.kind === 'queue' && <QueueForm state={state} fifo={form.fifo} onClose={() => setForm(null)} onSave={(f) => { update((s) => createQueue(s, f)); setForm(null); go({ queue: f.name, tab: 'Details' }) }} />}
      {form?.kind === 'exchange' && <ExchangeForm state={state} onClose={() => setForm(null)} onSave={(f) => { update((s) => createExchange(s, f)); setForm(null); go({ exchange: f.name, tab: 'Details' }) }} />}
    </>
  )
}

// A time as a number and a unit, kept as ms
function Duration({ label, hint, value, onChange }) {
  const unit = Object.entries(TIME_UNITS).reverse().find(([, size]) => value >= size && value % size === 0)?.[0] ?? 'seconds'
  const [shown, setShown] = useState(unit)
  const [text, setText] = useState(null) // what is typed, so the field can be empty while you type
  const size = TIME_UNITS[shown]
  return (
    <Field label={label} required hint={hint}>
      <span className="mq-duration">
        <input
          className="pc-input"
          type="number"
          min="1"
          aria-label={`${label}, number`}
          value={text ?? Math.round((value / size) * 1000) / 1000}
          onChange={(e) => {
            setText(e.target.value)
            onChange(e.target.value === '' ? NaN : Number(e.target.value) * size)
          }}
          onBlur={() => Number.isFinite(value) && setText(null)}
        />
        <Select aria-label={`${label}, unit`} value={shown} onChange={(u) => { setShown(u); setText(null) }} options={Object.keys(TIME_UNITS)} />
      </span>
    </Field>
  )
}

// Create Queue, Create FIFO Queue, or the settings of a queue when `queue` is given
function QueueForm({ state, fifo, queue, onClose, onSave }) {
  const [f, setF] = useState(() =>
    queue
      ? { name: queue.name, fifo: isFifo(queue), ttl: ttlOf(queue), lockTtl: lockTtlOf(queue), encrypted: Boolean(queue.encrypted), useDlq: Boolean(queue.dlq), dlq: queue.dlq ?? '', attempts: attemptsOf(queue) }
      : { name: '', fifo, ttl: DEFAULT_TTL, lockTtl: DEFAULT_LOCK_TTL, encrypted: false, useDlq: false, dlq: '', attempts: DEFAULT_ATTEMPTS },
  )
  const [tried, setTried] = useState(false)
  const set = (patch) => setF({ ...f, ...patch })
  const sent = { ...f, dlq: f.useDlq ? f.dlq : '', attempts: String(f.attempts).trim() === '' ? NaN : Number(f.attempts) }
  const errors = queueErrors(state, sent, Boolean(queue))
  const dlqs = state.queues.filter((q) => q.name !== f.name && isFifo(q) === f.fifo).map((q) => q.name)
  const title = queue ? `Settings of ${queue.name}` : f.fifo ? 'Create FIFO Queue' : 'Create Queue'
  return (
    <Modal
      title={title}
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={() => (errors.length ? setTried(true) : onSave(sent))}>
            {queue ? 'Save Changes' : 'Create Queue'}
          </Btn>
        </>
      }
    >
      {!queue && (
        <Field label="ID" required hint="The name of the queue. Up to 127 characters.">
          <Input value={f.name} onChange={(name) => set({ name })} placeholder={f.fifo ? 'shipment-steps.fifo' : 'order-events'} />
        </Field>
      )}
      {!queue && (
        <Field label="Type">
          <Radios name="mq-type" value={f.fifo ? 'fifo' : 'standard'} onChange={(v) => set({ fifo: v === 'fifo', dlq: '' })} options={[['standard', 'Standard queue', 'High throughput. At least once delivery, no order.'], ['fifo', 'FIFO queue', 'Order kept inside a message group. Exactly once delivery, up to 300 transactions a second.']]} />
        </Field>
      )}
      <div className="pc-pair">
        <Duration label="Message TTL" hint="How long a message stays in the queue. At most 14 days. A change applies to the messages already there." value={f.ttl} onChange={(ttl) => set({ ttl })} />
        <Duration label="Default Acknowledgment Timeout" hint="The lock TTL. A taken message stays invisible this long unless it is acknowledged. At most 12 hours." value={f.lockTtl} onChange={(lockTtl) => set({ lockTtl })} />
      </div>
      <Check checked={f.encrypted} onChange={(encrypted) => set({ encrypted })}>
        Encrypt messages. Every message in the queue is encrypted at rest.
      </Check>
      <Check checked={f.useDlq} onChange={(useDlq) => set({ useDlq })}>
        Assign a Dead Letter Queue
      </Check>
      {f.useDlq && (
        <div className="pc-pair">
          <Field label="Dead Letter Queue Name" required hint={`A ${f.fifo ? 'FIFO' : 'standard'} queue, same type as this one.`}>
            <Select value={f.dlq} onChange={(dlq) => set({ dlq })} placeholder="Choose a queue" options={dlqs} />
          </Field>
          <Field label="Delivery attempts before reroute" required hint="From 1 to 1000. Default 10.">
            <input className="pc-input" type="number" min="1" max="1000" value={f.attempts} onChange={(e) => set({ attempts: e.target.value })} />
          </Field>
        </div>
      )}
      {tried && errors.length > 0 && (
        <ul className="pc-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function ExchangeForm({ state, onClose, onSave }) {
  const [f, setF] = useState({ name: '', fifo: false, encrypted: false, bindings: [] })
  const [tried, setTried] = useState(false)
  const set = (patch) => setF({ ...f, ...patch })
  const errors = exchangeErrors(state, f)
  const fits = state.queues.filter((q) => isFifo(q) === f.fifo)
  return (
    <Modal
      title="Create Message Exchange"
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={() => (errors.length ? setTried(true) : onSave(f))}>
            Create Exchange
          </Btn>
        </>
      }
    >
      <Field label="ID" required hint="A message sent to the exchange is copied to every bound queue.">
        <Input value={f.name} onChange={(name) => set({ name })} placeholder="order-events-x" />
      </Field>
      <Check checked={f.fifo} onChange={(fifo) => set({ fifo, bindings: [] })}>
        FIFO exchange. It binds FIFO queues only. A standard exchange binds standard queues only.
      </Check>
      <Check checked={f.encrypted} onChange={(encrypted) => set({ encrypted })}>
        Encrypt messages
      </Check>
      <h3 className="pc-h3">Bindings</h3>
      {fits.length === 0 && <Note>No {f.fifo ? 'FIFO' : 'standard'} queue to bind yet. You can bind queues later.</Note>}
      <div className="mq-binds">
        {fits.map((q) => (
          <Check key={q.name} checked={f.bindings.includes(q.name)} onChange={(on) => set({ bindings: on ? [...f.bindings, q.name] : f.bindings.filter((b) => b !== q.name) })}>
            {q.name}
          </Check>
        ))}
      </div>
      {tried && errors.length > 0 && (
        <ul className="pc-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// ---------- a queue ----------

function QueuePage({ state, queue, tab, update, go, openEnv }) {
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} back={['Destinations', () => go({})]} items={[{ title: queue.name }, ['Details', 'Details'], ['Message Browser', 'Message Browser'], ['Message Sender', 'Message Sender']]} value={tab} onPick={(t) => go({ queue: queue.name, tab: t })} />
      <main className="pc-main">
        <div className="pc-title">
          <h2 className="mq-name">{queue.name}</h2>
          <span className="mq-tag">{isFifo(queue) ? 'FIFO queue' : 'Queue'}</span>
          {isDlq(state, queue.name) && <span className="mq-tag mq-tag-dlq">Dead letter queue</span>}
        </div>
        <Region env={state.env} />
        {tab === 'Details' && <QueueDetails state={state} queue={queue} update={update} go={go} />}
        {tab === 'Message Browser' && <Browser state={state} queue={queue} update={update} />}
        {tab === 'Message Sender' && <Sender state={state} fifo={isFifo(queue)} onSend={(body, extra) => update((s) => tagSent(s, sendMessage(s, queue.name, body), extra))} />}
      </main>
    </>
  )
}

function QueueDetails({ state, queue, update, go }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const now = state.clock
  const users = state.apps.filter((a) => destinationsOf(state, a).some((d) => d.name === queue.name))
  const via = exchangesFor(state, queue.name)
  const sources = sourcesOf(state, queue.name)
  return (
    <>
      <dl className="pc-facts mq-facts">
        <dt>Type</dt>
        <dd>{isFifo(queue) ? 'FIFO queue' : 'Standard queue'}</dd>
        <dt>Messages in flight</dt>
        <dd>{inFlight(queue, now).length}</dd>
        <dt>Messages ready</dt>
        <dd>{ready(queue, now).length}</dd>
        <dt>Message TTL</dt>
        <dd>{durationText(ttlOf(queue))}</dd>
        <dt>Default Acknowledgment Timeout</dt>
        <dd>{durationText(lockTtlOf(queue))}</dd>
        <dt>Encryption</dt>
        <dd>{queue.encrypted ? 'On' : 'Off'}</dd>
        <dt>Dead Letter Queue</dt>
        <dd>{queue.dlq ? <Link onClick={() => go({ queue: queue.dlq, tab: 'Details' })}>{queue.dlq}</Link> : 'Not assigned'}</dd>
        <dt>Delivery attempts before reroute</dt>
        <dd>{queue.dlq ? attemptsOf(queue) : 'Not used'}</dd>
        {sources.length > 0 && (
          <>
            <dt>Dead letter queue of</dt>
            <dd>{sources.join(', ')}</dd>
          </>
        )}
        <dt>Bound to exchanges</dt>
        <dd>{via.join(', ') || 'None'}</dd>
        <dt>Used by</dt>
        <dd>{users.map((a) => `${a.name} (${a.env})`).join(', ') || 'No application names it'}</dd>
      </dl>
      <div className="pc-bar">
        <Btn onClick={() => setEditing(true)}>Edit settings</Btn>
        <Btn kind="danger" onClick={() => setDeleting(true)}>
          Delete queue
        </Btn>
      </div>
      {editing && (
        <QueueForm
          state={state}
          queue={queue}
          onClose={() => setEditing(false)}
          onSave={(f) => {
            update((s) => setQueue(s, queue.name, { ttl: f.ttl, lockTtl: f.lockTtl, encrypted: f.encrypted, dlq: f.dlq, attempts: f.dlq ? f.attempts : attemptsOf(queue) }))
            setEditing(false)
          }}
        />
      )}
      {deleting && (
        <Modal
          title={`Delete ${queue.name}`}
          onClose={() => setDeleting(false)}
          foot={
            <>
              <Btn onClick={() => setDeleting(false)}>Cancel</Btn>
              <Btn kind="danger" onClick={() => { update((s) => deleteQueue(s, queue.name)); go({}) }}>
                Delete
              </Btn>
            </>
          }
        >
          <p>The queue and its {queue.messages.length} messages are deleted. Applications that use it fail until it exists again.</p>
        </Modal>
      )}
    </>
  )
}

// The message browser. Get Messages locks what it shows for the lock TTL, as the real browser does, so a consumer or a
// second Get does not see those messages until the lock ends. Leaving the page returns them, like the real one.
function Browser({ state, queue, update }) {
  const fifo = isFifo(queue)
  const max = fifo ? BROWSE_MAX_FIFO : BROWSE_MAX
  const [count, setCount] = useState(10)
  const [ids, setIds] = useState(null)
  const [got, setGot] = useState(null)
  const [open, setOpen] = useState(null)
  const [purging, setPurging] = useState(false)
  const [sure, setSure] = useState(false)
  const [target, setTarget] = useState('')
  const held = useRef(null)
  const later = useRef(update)
  held.current = ids
  later.current = update
  // leaving the page returns the messages
  useEffect(() => {
    const name = queue.name
    return () => {
      const back = held.current
      if (back?.length) later.current((s) => release(s, name, back))
    }
  }, [queue.name])

  const now = state.clock
  const shown = ids ? queue.messages.filter((m) => ids.includes(m.id)) : []
  const lockedTill = shown.find((m) => (m.lockedUntil ?? 0) > now)?.lockedUntil
  const lockOver = ids && ids.length > 0 && !lockedTill
  const message = shown.find((m) => m.id === open)
  const sources = sourcesOf(state, queue.name)
  const back = target || sources[0] || ''

  function get() {
    const r = browse(viewMessages(state, queue.name), queue.name, Math.max(1, Math.min(max, Math.floor(Number(count)) || 1)))
    update(() => r.state)
    // the messages of an earlier Get stay locked and shown until their lock ends
    const still = (ids ?? []).filter((id) => queue.messages.some((m) => m.id === id && (m.lockedUntil ?? 0) > state.clock))
    setIds([...still, ...r.ids])
    setGot(r.ids.length)
    setOpen(null)
  }
  function giveBack() {
    update((s) => release(s, queue.name, ids))
    setIds(null)
    setGot(null)
    setOpen(null)
  }

  return (
    <>
      <div className="pc-bar">
        <Field label={`Number of messages (1 to ${max})`}>
          <input className="pc-input" type="number" min="1" max={max} value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <Btn kind="primary" onClick={get}>
          Get Messages
        </Btn>
        <Btn disabled={!ids?.length} onClick={giveBack}>
          Return Messages
        </Btn>
        <Btn kind="danger" disabled={queue.messages.length === 0} onClick={() => { setSure(false); setPurging(true) }}>
          Purge Messages
        </Btn>
      </div>
      <Note>
        Messages you get here are locked for the Default Acknowledgment Timeout of the queue, {durationText(lockTtlOf(queue))}. While locked they are in flight: no consumer and no other Get sees them. Each Get counts as a delivery, so a message
        you look at often can reach the dead letter queue. Return Messages, or leaving this page, puts them back at once.{fifo && ' In a FIFO queue a locked message holds back the rest of its message group, and the browser gets 10 messages at most.'}
      </Note>
      <p className="pc-dim mq-small">
        {inFlight(queue, now).length} in flight, {ready(queue, now).length} ready.
      </p>
      {got === 0 && <p className="pc-empty pc-boxed">No ready messages. The queue is empty or every message is in flight.</p>}
      {lockOver && <p className="pc-dim">The lock has ended. These messages are ready again and a consumer can take them.</p>}
      {lockedTill && <p className="pc-dim">Locked until {stamp(lockedTill)}.</p>}
      {shown.length > 0 && (
        <Table
          heads={['Message ID', ...(fifo ? ['Message group'] : []), 'Deliveries', 'Received', 'Properties', ...(sources.length ? ['From'] : [])]}
          rows={shown.map((m) => (
            <tr key={m.id} className={open === m.id ? 'on' : ''}>
              <td>
                <Link onClick={() => setOpen(open === m.id ? null : m.id)}>{m.id}</Link>
              </td>
              {fifo && <td>{groupOf(m)}</td>}
              <td>{m.deliveries}</td>
              <td>{stamp(m.t)}</td>
              <td>{Object.keys(m.props ?? {}).length || ''}</td>
              {sources.length > 0 && <td>{m.from ?? ''}</td>}
            </tr>
          ))}
        />
      )}
      {message && (
        <div className="pc-sheet mq-message">
          <h3>Message {message.id}</h3>
          <pre className="pc-pre">{message.body}</pre>
          <dl className="pc-facts mq-facts">
            <dt>messageId</dt>
            <dd className="pc-mono">{message.id}</dd>
            <dt>deliveryCount</dt>
            <dd>{message.deliveries}</dd>
            {message.group !== undefined && (
              <>
                <dt>messageGroupId</dt>
                <dd>{groupOf(message)}</dd>
              </>
            )}
            {message.exchange && (
              <>
                <dt>Sent through</dt>
                <dd>{message.exchange}</dd>
              </>
            )}
            {Object.entries(message.props ?? {}).map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
          <div className="pc-bar">
            <Btn kind="danger" onClick={() => { update((s) => ackMessage(s, queue.name, message.id)); setIds(ids.filter((i) => i !== message.id)); setOpen(null) }}>
              Delete message
            </Btn>
          </div>
          <p className="pc-dim mq-small">Delete acknowledges the message. It is gone for good and no longer counts toward the delivery attempts.</p>
        </div>
      )}
      {sources.length > 0 && (
        <section className="pc-sheet mq-redrive">
          <h3>Move messages back</h3>
          <p>This is the dead letter queue of {sources.join(', ')}. Fix the cause first, then move the messages back to their source queue. Each starts again with 0 deliveries, and a running consumer takes it when the lab clock moves.</p>
          <div className="pc-bar">
            <Field label="Source queue">
              <Select value={back} onChange={setTarget} options={sources} />
            </Field>
            <Btn kind="primary" disabled={queue.messages.length === 0} onClick={() => { update((s) => moveBack(release(s, queue.name), queue.name, back)); setIds(null); setGot(null); setOpen(null) }}>
              Move all {queue.messages.length}
            </Btn>
            <Btn disabled={!shown.length} onClick={() => { update((s) => moveBack(release(s, queue.name, ids), queue.name, back, ids)); setIds(null); setGot(null); setOpen(null) }}>
              Move the {shown.length} shown
            </Btn>
          </div>
          <p className="pc-dim mq-small">Lab tool. The real console has no move button. Teams use a replay flow in a Mule application or the Anypoint MQ Broker API.</p>
        </section>
      )}
      {purging && (
        <Modal
          title={`Purge ${queue.name}`}
          onClose={() => setPurging(false)}
          foot={
            <>
              <Btn onClick={() => setPurging(false)}>Cancel</Btn>
              <Btn kind="danger" disabled={!sure} onClick={() => { update((s) => purge(s, queue.name)); setPurging(false); setIds(null); setGot(null); setOpen(null) }}>
                Delete Messages
              </Btn>
            </>
          }
        >
          <p>Purge deletes all {queue.messages.length} messages in the queue, in flight ones too. They cannot be brought back.</p>
          <Check checked={sure} onChange={setSure}>
            I understand that the messages are deleted for good.
          </Check>
        </Modal>
      )}
    </>
  )
}

function Sender({ state, fifo, onSend, to }) {
  const [body, setBody] = useState(SAMPLE)
  const [group, setGroup] = useState('')
  const [props, setProps] = useState([['contentType', 'application/json']])
  const [sent, setSent] = useState(null)
  const setProp = (i, at, v) => setProps(props.map((p, j) => (j === i ? (at === 0 ? [v, p[1]] : [p[0], v]) : p)))
  function send() {
    const extra = { props: Object.fromEntries(props.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])), group: fifo ? group : '' }
    onSend(body, extra)
    setSent(state.clock)
  }
  return (
    <>
      <h3 className="pc-h3">Send a message{to ? ` to ${to}` : ''}</h3>
      {fifo && (
        <Field label="Message Group ID" hint="Messages of one group are delivered in order, one consumer at a time. Without a group the message goes to the default group.">
          <Input value={group} onChange={setGroup} placeholder="customer-7781" />
        </Field>
      )}
      <Field label="Payload">
        <textarea className="pc-input pc-mono" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <h3 className="pc-h3">Properties</h3>
      <div className="mq-props">
        {props.map(([k, v], i) => (
          <div key={i} className="mq-prop-row">
            <Input value={k} onChange={(x) => setProp(i, 0, x)} placeholder="Name" aria-label={`Property ${i + 1} name`} />
            <Input value={v} onChange={(x) => setProp(i, 1, x)} placeholder="Value" aria-label={`Property ${i + 1} value`} />
            <Btn aria-label={`Remove property ${i + 1}`} onClick={() => setProps(props.filter((_, j) => j !== i))}>
              Remove
            </Btn>
          </div>
        ))}
        <Btn onClick={() => setProps([...props, ['', '']])}>Add property</Btn>
      </div>
      <div className="pc-bar mq-send">
        <Btn kind="primary" disabled={!body.trim()} onClick={send}>
          Send
        </Btn>
        {sent !== null && <span className="pc-good">Message sent at {stamp(sent)}. A running consumer takes it at once.</span>}
      </div>
    </>
  )
}

// ---------- a message exchange ----------

function ExchangePage({ state, exchange, tab, update, go, openEnv }) {
  const [adding, setAdding] = useState('')
  const [deleting, setDeleting] = useState(false)
  const free = state.queues.filter((q) => isFifo(q) === exchange.fifo && !exchange.bindings.includes(q.name)).map((q) => q.name)
  const errors = adding ? bindingErrors(state, exchange, [adding]) : []
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} back={['Destinations', () => go({})]} items={[{ title: exchange.name }, ['Details', 'Details'], ['Message Sender', 'Message Sender']]} value={tab} onPick={(t) => go({ exchange: exchange.name, tab: t })} />
      <main className="pc-main">
        <div className="pc-title">
          <h2 className="mq-name">{exchange.name}</h2>
          <span className="mq-tag">{exchange.fifo ? 'FIFO message exchange' : 'Message exchange'}</span>
        </div>
        <Region env={state.env} />
        {tab === 'Details' && (
          <>
            <p>A message sent to this exchange is copied to each bound queue. An exchange has no message browser: open a bound queue to see its messages. With no binding a message is accepted and lost.</p>
            <h3 className="pc-h3">Bindings</h3>
            <Table
              heads={['Queue', 'Messages ready', '']}
              empty="No queue is bound."
              rows={exchange.bindings.map((b) => {
                const q = state.queues.find((x) => x.name === b)
                return (
                  <tr key={b}>
                    <td>
                      <Link onClick={() => go({ queue: b, tab: 'Message Browser' })}>{b}</Link>
                    </td>
                    <td>{q ? ready(q, state.clock).length : 'Deleted'}</td>
                    <td>
                      <Btn onClick={() => update((s) => unbindQueue(s, exchange.name, b))}>Unbind</Btn>
                    </td>
                  </tr>
                )
              })}
            />
            <div className="pc-bar">
              <Field label={`Bind a ${exchange.fifo ? 'FIFO' : 'standard'} queue`}>
                <Select value={adding} onChange={setAdding} placeholder="Choose a queue" options={free} />
              </Field>
              <Btn kind="primary" disabled={!adding || errors.length > 0} onClick={() => { update((s) => bindQueue(s, exchange.name, adding)); setAdding('') }}>
                Bind
              </Btn>
              <Btn kind="danger" onClick={() => setDeleting(true)}>
                Delete exchange
              </Btn>
            </div>
          </>
        )}
        {tab === 'Message Sender' && (
          <Sender
            state={state}
            fifo={exchange.fifo}
            to={`${targetsOf(state, exchange.name).length} bound queues`}
            onSend={(body, extra) =>
              update((s) => {
                let next = s
                for (const q of targetsOf(s, exchange.name)) next = sendMessage(next, q, body)
                return tagSent(s, next, { ...extra, exchange: exchange.name })
              })
            }
          />
        )}
        {deleting && (
          <Modal
            title={`Delete ${exchange.name}`}
            onClose={() => setDeleting(false)}
            foot={
              <>
                <Btn onClick={() => setDeleting(false)}>Cancel</Btn>
                <Btn kind="danger" onClick={() => { update((s) => deleteExchange(s, exchange.name)); go({}) }}>
                  Delete
                </Btn>
              </>
            }
          >
            <p>The exchange and its bindings are deleted. The bound queues and their messages stay.</p>
          </Modal>
        )}
      </main>
    </>
  )
}

// ---------- Client Apps ----------

function ClientApps({ state, update }) {
  useEffect(() => update((s) => mark(s, 'mq-clients')), [update])
  const [shown, setShown] = useState({})
  const [making, setMaking] = useState(null)
  const list = clientApps(state, state.env)
  const appOf = (name) => state.apps.find((a) => a.name === name && a.env === state.env)
  return (
    <>
      <div className="pc-title">
        <h2>Client Apps</h2>
        <span className="pc-grow" />
        <Btn kind="primary" onClick={() => setMaking('')}>
          + Add
        </Btn>
      </div>
      <Region env={state.env} />
      <p className="pc-dim">A client app has a client ID and secret for one environment. A Mule application puts them in its Anypoint MQ configuration to publish and consume. Give each application its own pair. MuleSoft now recommends connected apps for new work.</p>
      <Table
        heads={['Name', 'Client ID', 'Client Secret', 'Uses', '']}
        empty={`No client apps in ${state.env}.`}
        rows={list.map((c) => {
          const uses = appOf(c.name) ? destinationsOf(state, appOf(c.name)) : []
          return (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td className="pc-mono">
                {c.clientId}
                <Copy text={c.clientId} />
              </td>
              <td className="pc-mono">
                {shown[c.name] ? c.clientSecret : '••••••••••••'} <Link onClick={() => setShown({ ...shown, [c.name]: !shown[c.name] })}>{shown[c.name] ? 'Hide' : 'Show'}</Link>
              </td>
              <td>{uses.map((u) => `${u.name} (${u.key})`).join(', ') || 'No queue in its properties'}</td>
              <td className="mq-actions">
                <Btn onClick={() => update((s) => regenerateSecret(s, state.env, c.name))}>Regenerate Secret</Btn>
                {!c.auto && (
                  <Btn kind="danger" onClick={() => update((s) => deleteClientApp(s, state.env, c.name))}>
                    Delete
                  </Btn>
                )}
              </td>
            </tr>
          )
        })}
      />
      <p className="pc-dim mq-small">The lab makes a client app for each application that names a queue or exchange in its properties. A new secret means every application with the old one loses access until it gets the new one.</p>
      {making !== null && (
        <Modal
          title="Create Client App"
          onClose={() => setMaking(null)}
          foot={
            <>
              <Btn onClick={() => setMaking(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!making.trim() || list.some((c) => c.name === making.trim())} onClick={() => { update((s) => addClientApp(s, state.env, making.trim())); setMaking(null) }}>
                Save
              </Btn>
            </>
          }
        >
          <Field label="App Name" required hint={`For the environment ${state.env}. The app does not have to exist yet.`}>
            <Input value={making} onChange={setMaking} placeholder="shipment-publisher" />
          </Field>
        </Modal>
      )}
    </>
  )
}

// ---------- Usage ----------

function Usage({ state, update }) {
  useEffect(() => update((s) => mark(s, 'mq-usage')), [update])
  const u = usage(state, state.env)
  const labels = u.ok.map((_, i) => stamp(u.start + i * 3600000).slice(11, 16))
  const total = u.ok.reduce((a, b) => a + b, 0)
  const failed = u.failed.reduce((a, b) => a + b, 0)
  return (
    <>
      <h2>Usage</h2>
      <Region env={state.env} />
      <p className="pc-dim">Messages taken by consumers in the last 24 hours, per hour. The real page counts API requests and the size of the messages for billing.</p>
      <Chart title="Messages consumed" labels={labels} series={[{ name: 'Acknowledged', color: '#0176d3', points: u.ok }, { name: 'Failed delivery', color: '#ba0517', points: u.failed }]} />
      <p>
        {total} acknowledged and {failed} failed deliveries in 24 hours.
      </p>
      <Table
        heads={['Queue', 'In flight', 'Ready']}
        empty="No queues."
        rows={state.queues.map((q) => (
          <tr key={q.name}>
            <td>{q.name}</td>
            <td>{inFlight(q, state.clock).length}</td>
            <td>{ready(q, state.clock).length}</td>
          </tr>
        ))}
      />
    </>
  )
}
