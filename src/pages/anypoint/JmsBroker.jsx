// ActiveMQ: the two brokers of the lab. harbor-amq is ActiveMQ Classic, shown as its web console (/admin) with Home,
// Queues, Topics, Subscribers, Connections, Network, Scheduled and Send. harbor-artemis is ActiveMQ Artemis, shown as
// its management console with Status, Connections, Consumers, Addresses, Queues and Send. Users, Broker config and
// "In the Mule app" are lab pages: the real consoles have no page for them.
import { useEffect, useMemo, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import {
  addAuthEntry, addPolicyEntry, addUser, appsOn, ARTEMIS, authOf, boxOfConsumer, brokerOf, brokersOf, CLASSIC, configOf, connOfConsumer, consumersOf, createDestination, deleteDestination, deleteMessage, deleteSubscription, heldBy, inFlightOf, isDlq, liveConns, masterOf,
  messageView, moveAll, moveMessage, parseUrl, policyOf, purgeQueue, queueBytes, removeAuthEntry, removeUser, restartNode, retryMessage, sendTo, setConfig, sizeText, subActive, subQueueName, subsOf, upgradeJms, usageOf, usersOf,
} from '../../lab/platform-jms.js'
import { Note } from './parts.jsx'

const CLASSIC_NAV = [
  ['home', 'Home'],
  ['queues', 'Queues'],
  ['topics', 'Topics'],
  ['subscribers', 'Subscribers'],
  ['connections', 'Connections'],
  ['network', 'Network'],
  ['scheduled', 'Scheduled'],
  ['send', 'Send'],
]
const ARTEMIS_NAV = [
  ['status', 'Status'],
  ['connections', 'Connections'],
  ['consumers', 'Consumers'],
  ['addresses', 'Addresses'],
  ['queues', 'Queues'],
  ['send', 'Send message'],
  ['settings', 'Address settings'],
]
const LAB_NAV = [
  ['users', 'Users'],
  ['config', 'Broker config'],
  ['mule', 'In the Mule app'],
]
const DAY = 86400000

function T({ heads, children, empty = 'There is nothing to show.' }) {
  const rows = [children].flat(3).filter(Boolean)
  return (
    <div className="amq-table-box">
      <table className="amq-table">
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
          {rows.length === 0 && (
            <tr>
              <td colSpan={heads.length} className="amq-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
const A = (props) => <button type="button" className="amq-a" {...props} />
const B = ({ kind = '', ...props }) => <button type="button" className={`amq-btn ${kind}`} {...props} />
const Msg = ({ r }) => (r ? <p className={`amq-msg ${r.ok ? 'ok' : 'bad'}`} role={r.ok ? 'status' : 'alert'}>{r.text}</p> : null)
const uptime = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 1440)} days ${Math.floor((m % 1440) / 60)} hours ${m % 60} minutes`
}
const pretty = (v) => {
  try {
    return JSON.stringify(JSON.parse(v), null, 2)
  } catch {
    return v
  }
}

export default function JmsBroker({ state, update, place, go }) {
  const list = brokersOf(state)
  const b = brokerOf(state, place.broker) ?? list[0]
  const name = b?.name
  const [result, setResult] = useState(null)
  // a save from while the engine was a placeholder has only { created }: fill in the brokers of the lab
  const placeholder = Boolean(state.jms && !state.jms.brokers)
  useEffect(() => {
    if (placeholder) update((s) => upgradeJms({ ...s, jms: { ...s.jms } }))
  }, [placeholder, update])
  useEffect(() => {
    if (name) update((s) => mark(s, `jms:${name}`))
  }, [name, update])
  useEffect(() => setResult(null), [place])

  if (!b)
    return (
      <main className="pc-main amq-main">
        <p className="pc-empty pc-boxed">No ActiveMQ broker is connected to this console.</p>
      </main>
    )
  const run = (fn) => {
    const r = fn(state)
    setResult({ ok: r.ok, text: r.text })
    if (r.ok) update((s) => fn(s).state)
    return r
  }
  const to = (next) => go({ broker: name, ...next })
  const view = place.view ?? (b.kind === CLASSIC ? 'home' : 'status')
  return (
    <main className="pc-main amq-main">
      <div className="amq-pick">
        <label>
          <span>Broker</span>
          <select value={name} onChange={(e) => go({ broker: e.target.value })}>
            {list.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name} (ActiveMQ {x.kind === CLASSIC ? 'Classic' : 'Artemis'} {x.version})
              </option>
            ))}
          </select>
        </label>
        <span className="amq-dim">
          {b.kind === CLASSIC ? 'http://amq.harbor.lab:8161/admin' : 'http://artemis.harbor.lab:8161/console'} · {masterOf(b) ? `serving on ${masterOf(b).name}` : 'not running'}
        </span>
      </div>
      {b.kind === CLASSIC ? <Classic state={state} b={b} view={view} place={place} to={to} run={run} result={result} update={update} /> : <Artemis state={state} b={b} view={view} place={place} to={to} run={run} result={result} update={update} />}
    </main>
  )
}

// ---------- ActiveMQ Classic web console ----------

function Classic({ state, b, view, place, to, run, result, update }) {
  return (
    <div className="amq-c">
      <header className="amq-c-head">
        <b className="amq-c-logo">
          Active<i>MQ</i>
        </b>
        <small>The Apache Software Foundation</small>
      </header>
      <nav className="amq-c-nav" aria-label="ActiveMQ">
        {CLASSIC_NAV.map(([k, label]) => (
          <button key={k} type="button" className={view === k ? 'on' : ''} aria-current={view === k ? 'page' : undefined} onClick={() => to({ view: k })}>
            {label}
          </button>
        ))}
        <span className="amq-c-sep" aria-hidden="true" />
        {LAB_NAV.map(([k, label]) => (
          <button key={k} type="button" className={`lab${view === k ? ' on' : ''}`} title="Lab page" onClick={() => to({ view: k })}>
            {label}
          </button>
        ))}
      </nav>
      <section className="amq-c-page">
        <Msg r={result} />
        {view === 'home' && <CHome b={b} run={run} state={state} />}
        {view === 'queues' && <CQueues b={b} run={run} to={to} />}
        {view === 'browse' && b.queues[place.dest] && <CBrowse key={place.dest} b={b} q={place.dest} to={to} update={update} />}
        {view === 'message' && <CMessage b={b} q={place.dest} id={place.msg} run={run} to={to} />}
        {view === 'consumers' && b.queues[place.dest] && <CConsumers key={place.dest} b={b} q={place.dest} to={to} update={update} />}
        {view === 'topics' && <CTopics b={b} run={run} to={to} />}
        {view === 'subscribers' && <CSubscribers b={b} run={run} update={update} topic={place.dest} />}
        {view === 'connections' && <CConnections b={b} />}
        {view === 'network' && (
          <>
            <h2>Network Bridges</h2>
            <T heads={['Remote Broker', 'Remote Address', 'Created By Duplex', 'Messages Enqueued', 'Messages Dequeued']} empty="No network bridges. harbor-amq is a master/slave pair, not a network of brokers." />
          </>
        )}
        {view === 'scheduled' && (b.config.schedulerSupport ? <p>No scheduled messages.</p> : <p className="amq-warn">Scheduler not started!</p>)}
        {view === 'send' && <Send key={`${place.dest ?? ''}${place.type ?? ''}`} b={b} run={run} dest={place.dest} type={place.type} />}
        {view === 'users' && <Users b={b} run={run} />}
        {view === 'config' && <Config b={b} run={run} />}
        {view === 'mule' && <Mule state={state} b={b} />}
      </section>
    </div>
  )
}

function Nodes({ b, run }) {
  const [minutes, setMinutes] = useState(1)
  return (
    <>
      <h3>Nodes (lab)</h3>
      <T heads={['Node', 'Host', 'Role', 'Status', 'Since', 'Action']}>
        {b.nodes.map((n) => (
          <tr key={n.name}>
            <td>{n.name}</td>
            <td className="amq-mono">
              {n.host}:{n.port}
              {n.aliases.length > 0 && <small> also {n.aliases.join(', ')}</small>}
            </td>
            <td>{n.up ? (n.role === 'slave' ? 'slave (waits for the store lock)' : n.role) : 'stopped'}</td>
            <td>{n.up ? 'Running' : `Back at ${stamp(n.downUntil).slice(11, 16)}`}</td>
            <td>{stamp(n.since)}</td>
            <td>{n.up && <B onClick={() => run((s) => restartNode(s, b.name, n.name, minutes))}>Restart</B>}</td>
          </tr>
        ))}
      </T>
      <label className="amq-inline">
        Restart takes
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[1, 5, 10, 15].map((m) => (
            <option key={m} value={m}>
              {m} minute{m > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </label>
      <h3>Broker history (lab)</h3>
      <ul className="amq-hist">
        {b.history
          .slice(-10)
          .reverse()
          .map((h, i) => (
            <li key={i}>
              <span className="amq-mono">{stamp(h.t)}</span> {h.text}
            </li>
          ))}
      </ul>
    </>
  )
}

function CHome({ b, run, state }) {
  const u = usageOf(b)
  const m = masterOf(b)
  const rows = [
    ['Name', b.name],
    ['Version', b.version],
    ['ID', `ID:${m?.host ?? 'amq1.harbor.lab'}-46811-${b.epoch}-0:1`],
    ['Uptime', m ? uptime(state.clock - m.since) : 'not running'],
    ['Store percent used', u.storePct, u.storePct >= 90],
    ['Memory percent used', u.memoryPct, u.memoryPct >= 90],
    ['Temp percent used', u.tempPct],
  ]
  return (
    <>
      <h2>Welcome!</h2>
      <p>Welcome to the Apache ActiveMQ Console of {b.name}</p>
      <h3>Broker</h3>
      <table className="amq-kv">
        <tbody>
          {rows.map(([k, v, hot]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td className={hot ? 'amq-hot' : ''}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="amq-dim">
        Store {sizeText(u.store)} of {sizeText(u.storeLimit)}, memory {sizeText(u.memory)} of {sizeText(u.memoryLimit)} (lab sizes). Producers block at 100%{b.config.sendFailIfNoSpace ? ', or fail with sendFailIfNoSpace on, as now' : ''}.
      </p>
      <Nodes b={b} run={run} />
    </>
  )
}

function CQueues({ b, run, to }) {
  const [name, setName] = useState('')
  const [find, setFind] = useState('')
  const list = Object.values(b.queues)
    .filter((q) => q.name.toLowerCase().includes(find.toLowerCase()))
    .sort((x, y) => x.name.localeCompare(y.name))
  return (
    <>
      <div className="amq-forms">
        <label>
          Queue Name <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <B onClick={() => run((s) => createDestination(s, b.name, 'queue', name.trim()))}>Create</B>
        <label>
          Queue Name Filter <input value={find} onChange={(e) => setFind(e.target.value)} />
        </label>
      </div>
      <h2>Queues:</h2>
      <T heads={['Name', 'Number Of Pending Messages', 'Number Of Consumers', 'Messages Enqueued', 'Messages Dequeued', 'Views', 'Operations']}>
        {list.map((q) => (
          <tr key={q.name}>
            <td>
              <A onClick={() => to({ view: 'browse', dest: q.name })}>{q.name}</A>
            </td>
            <td>{q.messages.length}</td>
            <td>{consumersOf(b, `q:${q.name}`).length}</td>
            <td>{q.enqueued}</td>
            <td>{q.dequeued}</td>
            <td className="amq-ops">
              <A onClick={() => to({ view: 'browse', dest: q.name })}>Browse</A>
              <A onClick={() => to({ view: 'consumers', dest: q.name })}>Active Consumers</A>
            </td>
            <td className="amq-ops">
              <A onClick={() => to({ view: 'send', dest: q.name, type: 'queue' })}>Send To</A>
              <A onClick={() => run((s) => purgeQueue(s, b.name, q.name))}>Purge</A>
              <A onClick={() => run((s) => deleteDestination(s, b.name, 'queue', q.name))}>Delete</A>
            </td>
          </tr>
        ))}
      </T>
    </>
  )
}

function CBrowse({ b, q, to, update }) {
  useEffect(() => update((s) => mark(s, `jms-dest:${q}`)), [q, update])
  const box = b.queues[q]
  return (
    <>
      <h2>Browse {q}</h2>
      <p className="amq-dim">
        {box.messages.length} pending, {inFlightOf(box)} in flight to consumers, {sizeText(queueBytes(box))}. The browser shows the first 400 messages.
      </p>
      <T heads={['Message ID', 'Correlation ID', 'Persistence', 'Priority', 'Redelivered', 'Reply To', 'Timestamp', 'Type', 'Operations']} empty="No messages.">
        {box.messages.slice(0, 400).map((m) => (
          <tr key={m.id}>
            <td>
              <A onClick={() => to({ view: 'message', dest: q, msg: m.id })}>{m.id}</A>
            </td>
            <td>{m.correlationId}</td>
            <td>{m.persistent ? 'Persistent' : 'Non Persistent'}</td>
            <td>{m.priority}</td>
            <td>{String(m.redelivered)}</td>
            <td>{m.replyTo && `queue://${m.replyTo}`}</td>
            <td className="amq-mono">{stamp(m.ts)}</td>
            <td>{m.type}</td>
            <td>{m.held ? <span className="amq-dim">in flight</span> : <A onClick={() => to({ view: 'message', dest: q, msg: m.id })}>Details</A>}</td>
          </tr>
        ))}
      </T>
    </>
  )
}

function CMessage({ b, q, id, run, to }) {
  const m = b.queues[q]?.messages.find((x) => x.id === id)
  const [target, setTarget] = useState('')
  if (!m) return <p>The message {id} is no longer in {q}.</p>
  const v = messageView(m)
  const headers = [
    ['Message ID', v.id],
    ['Destination', v.destination],
    ['Correlation ID', v.correlationId],
    ['Group', ''],
    ['Sequence', '0'],
    ['Expiration', v.expiration ? stamp(v.expiration) : '0'],
    ['Persistence', v.deliveryMode === 'PERSISTENT' ? 'Persistent' : 'Non Persistent'],
    ['Priority', v.priority],
    ['Redelivered', String(v.redelivered)],
    ['Redelivery Count', m.redeliveries],
    ['Reply To', v.replyTo],
    ['Timestamp', stamp(v.timestamp)],
    ['Type', v.type],
    ['Size', sizeText(m.size)],
    ...(m.origin ? [['Original destination', m.origin]] : []),
  ]
  const queues = Object.keys(b.queues).filter((x) => x !== q)
  return (
    <>
      <h2>Message {id}</h2>
      <div className="amq-two">
        <table className="amq-kv">
          <caption>Headers</caption>
          <tbody>
            {headers.map(([k, val]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className="amq-mono">{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="amq-kv">
          <caption>Properties</caption>
          <tbody>
            {Object.entries(v.properties).map(([k, val]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className="amq-mono">{String(val)}</td>
              </tr>
            ))}
            {Object.keys(v.properties).length === 0 && (
              <tr>
                <td>none</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3>Message Details</h3>
      <pre className="amq-pre">{pretty(v.body)}</pre>
      {!m.held && (
        <div className="amq-forms">
          <B onClick={() => run((s) => deleteMessage(s, b.name, q, id)).ok && to({ view: 'browse', dest: q })}>Delete</B>
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Move to queue">
            <option value="">Choose a queue</option>
            {queues.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <B disabled={!target} onClick={() => run((s) => moveMessage(s, b.name, q, id, target)).ok && to({ view: 'browse', dest: q })}>
            Move
          </B>
          {isDlq(b, q) && m.origin?.startsWith('queue://') && <B onClick={() => run((s) => retryMessage(s, b.name, q, id)).ok && to({ view: 'browse', dest: q })}>Retry</B>}
        </div>
      )}
    </>
  )
}

function CConsumers({ b, q, to, update }) {
  useEffect(() => update((s) => mark(s, `jms-dest:${q}`)), [q, update])
  const box = b.queues[q]
  const list = consumersOf(b, `q:${q}`)
  return (
    <>
      <h2>Active Consumers for {q}</h2>
      <p className="amq-dim">
        Pending {box.messages.length}, Messages in flight {inFlightOf(box)}. <A onClick={() => to({ view: 'browse', dest: q })}>Browse</A>
      </p>
      <T heads={['Client ID', 'Connection ID', 'SessionId', 'Selector', 'Enqueues', 'Dequeues', 'Dispatched', 'Dispatched Queue', 'Prefetch', 'Max pending', 'Exclusive', 'Retroactive']} empty="No consumers.">
        {list.map((k, i) => {
          const c = connOfConsumer(b, k)
          const held = heldBy(b, k)
          return (
            <tr key={k.key}>
              <td>{c?.clientId || <span className="amq-dim">{c?.app} replica {c?.replica}</span>}</td>
              <td className="amq-mono">{c?.id}</td>
              <td>{i + 1}</td>
              <td />
              <td>{k.deliveredCount + held.filter((m) => !m.delivered).length}</td>
              <td>{k.acked}</td>
              <td>{k.deliveredCount}</td>
              <td className={held.length > 50 ? 'amq-hot' : ''}>{held.length}</td>
              <td>{k.prefetch}</td>
              <td>-1</td>
              <td>false</td>
              <td>false</td>
            </tr>
          )
        })}
      </T>
    </>
  )
}

function CTopics({ b, run, to }) {
  const [name, setName] = useState('')
  return (
    <>
      <div className="amq-forms">
        <label>
          Topic Name <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <B onClick={() => run((s) => createDestination(s, b.name, 'topic', name.trim()))}>Create</B>
      </div>
      <h2>Topics:</h2>
      <T heads={['Name', 'Number Of Consumers', 'Messages Enqueued', 'Messages Dequeued', 'Operations']}>
        {Object.values(b.topics)
          .sort((x, y) => x.name.localeCompare(y.name))
          .map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td>
              <td>{subsOf(b, t.name).filter((x) => subActive(b, x)).length}</td>
              <td>{t.enqueued}</td>
              <td>{t.dequeued}</td>
              <td className="amq-ops">
                <A onClick={() => to({ view: 'send', dest: t.name, type: 'topic' })}>Send To</A>
                <A onClick={() => to({ view: 'subscribers', dest: t.name })}>Active Subscribers</A>
                <A onClick={() => run((s) => deleteDestination(s, b.name, 'topic', t.name))}>Delete</A>
              </td>
            </tr>
          ))}
      </T>
    </>
  )
}

// called as a function, so the table T sees the rows themselves and shows its empty line when there are none
function subRows({ b, list, run, offline }) {
  return list.map((x) => {
    const k = consumersOf(b, `s:${x.key}`)[0]
    const c = k && connOfConsumer(b, k)
    return (
      <tr key={x.key}>
        <td>{x.clientId}</td>
        <td>{x.name || subQueueName(b, x)}</td>
        <td className="amq-mono">{c?.id ?? ''}</td>
        <td>{x.topic}</td>
        <td />
        <td>{x.messages.filter((m) => !m.held).length}</td>
        <td>{x.messages.filter((m) => m.held).length}</td>
        <td>{k?.deliveredCount ?? 0}</td>
        <td>{x.enqueued}</td>
        <td>{x.dequeued}</td>
        <td>{offline && <A onClick={() => run((s) => deleteSubscription(s, b.name, x.key))}>Delete</A>}</td>
      </tr>
    )
  })
}
function CSubscribers({ b, run, update, topic }) {
  useEffect(() => update((s) => mark(s, 'jms-subs')), [update])
  const all = subsOf(b, topic)
  const heads = ['Client ID', 'Subscription Name', 'Connection ID', 'Destination', 'Selector', 'Pending Queue Size', 'Dispatched Queue Size', 'Dispatched Counter', 'Enqueue Counter', 'Dequeue Counter', 'Operations']
  return (
    <>
      {topic && <p className="amq-dim">Subscribers of {topic}.</p>}
      <h2>Active Durable Topic Subscribers</h2>
      <T heads={heads}>
        {subRows({ b, run, list: all.filter((x) => x.durable && subActive(b, x)) })}
      </T>
      <h2>Offline Durable Topic Subscribers</h2>
      <T heads={heads}>
        {subRows({ b, run, offline: true, list: all.filter((x) => x.durable && !subActive(b, x)) })}
      </T>
      <h2>Active Non-Durable Topic Subscribers</h2>
      <T heads={heads}>
        {subRows({ b, run, list: all.filter((x) => !x.durable) })}
      </T>
      <p className="amq-dim">An offline durable subscriber keeps every message published to its topic until it comes back or is deleted.</p>
    </>
  )
}

function CConnections({ b }) {
  const list = liveConns(b)
  return (
    <>
      <h2>Connections</h2>
      <h3>Connector openwire</h3>
      <T heads={['Name', 'Remote Address', 'Active', 'Slow', 'User', 'From (lab)']} empty="No connections.">
        {list.map((c) => (
          <tr key={c.key}>
            <td className="amq-mono">{c.clientId || c.id}</td>
            <td className="amq-mono">{c.remote}</td>
            <td>true</td>
            <td>false</td>
            <td>{c.user}</td>
            <td>
              {c.app} replica {c.replica} on {c.node}
              {c.failover ? ', failover' : ''}
            </td>
          </tr>
        ))}
      </T>
      <h3>Refused connections (lab)</h3>
      <T heads={['Time', 'App', 'Reason']} empty="None.">
        {b.refused
          .slice(-8)
          .reverse()
          .map((r, i) => (
            <tr key={i}>
              <td className="amq-mono">{stamp(r.t)}</td>
              <td>{r.app}</td>
              <td className="amq-wrap">{r.text}</td>
            </tr>
          ))}
      </T>
    </>
  )
}

function Send({ b, run, dest, type }) {
  const [f, setF] = useState({ dest: dest ?? '', type: type ?? (b.kind === CLASSIC ? 'queue' : 'queue'), correlationId: '', persistent: true, replyTo: '', priority: 4, msgType: '', ttl: 0, count: 1, body: 'Enter some text here for the message body...', props: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const props = () =>
    Object.fromEntries(
      f.props
        .split(/[\n,]/)
        .map((x) => x.split('='))
        .filter(([k]) => k?.trim())
        .map(([k, v = '']) => [k.trim(), v.trim()]),
    )
  const artemis = b.kind === ARTEMIS
  return (
    <>
      <h2>{artemis ? 'Send message' : 'Send a JMS Message'}</h2>
      <div className="amq-send">
        <label>
          {artemis ? 'Address' : 'Destination'}
          <input value={f.dest} onChange={set('dest')} />
        </label>
        <label>
          {artemis ? 'Routing type' : 'Queue or Topic'}
          <select value={f.type} onChange={set('type')}>
            <option value="queue">{artemis ? 'ANYCAST' : 'Queue'}</option>
            <option value="topic">{artemis ? 'MULTICAST' : 'Topic'}</option>
          </select>
        </label>
        <label>
          Correlation ID
          <input value={f.correlationId} onChange={set('correlationId')} />
        </label>
        <label className="amq-check">
          <input type="checkbox" checked={f.persistent} onChange={set('persistent')} /> {artemis ? 'Durable' : 'Persistent Delivery'}
        </label>
        <label>
          Reply To
          <input value={f.replyTo} onChange={set('replyTo')} />
        </label>
        <label>
          Priority
          <input type="number" min="0" max="9" value={f.priority} onChange={set('priority')} />
        </label>
        <label>
          Type
          <input value={f.msgType} onChange={set('msgType')} />
        </label>
        <label>
          Time to live (ms)
          <input type="number" min="0" value={f.ttl} onChange={set('ttl')} />
        </label>
        <label>
          Number of messages to send
          <input type="number" min="1" max="500" value={f.count} onChange={set('count')} />
        </label>
        <label className="amq-wide">
          Properties (key=value, one per line)
          <textarea rows={2} value={f.props} onChange={set('props')} />
        </label>
        <label className="amq-wide">
          Message body
          <textarea rows={6} value={f.body} onChange={set('body')} />
        </label>
      </div>
      <B kind="primary" disabled={[f.priority, f.ttl, f.count].some((v) => String(v).trim() === '')} onClick={() => run((s) => sendTo(s, b.name, { ...f, ttl: Number(f.ttl), priority: Number(f.priority), count: Number(f.count), props: props() }))}>
        Send
      </B>
    </>
  )
}

// ---------- lab pages for both ----------

function Users({ b, run }) {
  const classic = b.kind === CLASSIC
  const users = usersOf(b)
  const auth = authOf(b)
  const waiting = Boolean(b.pending?.users || b.pending?.auth)
  const [u, setU] = useState({ name: '', password: '', groups: '' })
  const [e, setE] = useState({ type: 'queue', match: '', read: '', write: '', admin: '' })
  const setUser = (k) => (ev) => setU({ ...u, [k]: ev.target.value })
  const setEntry = (k) => (ev) => setE({ ...e, [k]: ev.target.value })
  return (
    <>
      <h2>Users and groups</h2>
      <p className="amq-dim">{classic ? 'The simpleAuthenticationPlugin and authorizationPlugin of activemq.xml.' : 'artemis-users.properties, artemis-roles.properties and the security-settings of broker.xml.'} Passwords are not shown.</p>
      {waiting && <p className="amq-warn">These lists include changes that wait for the next restart of the broker. Until then it uses the old ones.</p>}
      <T heads={['User', classic ? 'Groups' : 'Roles', '']}>
        {Object.entries(users).map(([name, x]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>{x.groups.join(', ')}</td>
            <td>{name !== 'admin' && <A onClick={() => run((s) => removeUser(s, b.name, name))}>Remove</A>}</td>
          </tr>
        ))}
      </T>
      <div className="amq-send">
        <label>
          User name <input value={u.name} onChange={setUser('name')} />
        </label>
        <label>
          Password <input type="password" value={u.password} onChange={setUser('password')} autoComplete="new-password" />
        </label>
        <label>
          {classic ? 'Groups' : 'Roles'} (comma separated) <input value={u.groups} onChange={setUser('groups')} />
        </label>
        <B kind="primary" onClick={() => run((s) => addUser(s, b.name, u)).ok && setU({ name: '', password: '', groups: '' })}>
          Add user
        </B>
      </div>
      <h3>{classic ? 'authorizationEntries' : 'security-settings'}</h3>
      <T heads={classic ? ['Type', 'Destination', 'read', 'write', 'admin', ''] : ['match', 'consume, browse', 'send', 'createAddress, createDurableQueue, deleteDurableQueue, createNonDurableQueue', '']}>
        {auth.map((x, i) =>
          classic ? (
            <tr key={i}>
              <td>{x.type}</td>
              <td className="amq-mono">{x.match}</td>
              <td>{x.read}</td>
              <td>{x.write}</td>
              <td>{x.admin}</td>
              <td>
                <A onClick={() => run((s) => removeAuthEntry(s, b.name, i))}>Remove</A>
              </td>
            </tr>
          ) : (
            <tr key={i}>
              <td className="amq-mono">{x.match}</td>
              <td>{x.read}</td>
              <td>{x.write}</td>
              <td>{x.admin}</td>
              <td>
                <A onClick={() => run((s) => removeAuthEntry(s, b.name, i))}>Remove</A>
              </td>
            </tr>
          ),
        )}
      </T>
      <div className="amq-send">
        {classic && (
          <label>
            Type
            <select value={e.type} onChange={setEntry('type')}>
              <option value="queue">queue</option>
              <option value="topic">topic</option>
            </select>
          </label>
        )}
        <label>
          {classic ? 'Destination' : 'match'} <input value={e.match} onChange={setEntry('match')} placeholder={classic ? 'ORDERS.IN' : 'ORDERS.#'} />
        </label>
        <label>
          read (groups) <input value={e.read} onChange={setEntry('read')} />
        </label>
        <label>
          write (groups) <input value={e.write} onChange={setEntry('write')} />
        </label>
        <label>
          admin (groups) <input value={e.admin} onChange={setEntry('admin')} />
        </label>
        <B kind="primary" onClick={() => run((s) => addAuthEntry(s, b.name, e)).ok && setE({ type: 'queue', match: '', read: '', write: '', admin: '' })}>
          Add entry
        </B>
      </div>
      <p className="amq-dim">{classic ? "Wildcards: '.' separates the parts, '*' is one part, '>' is the rest. A user may act when one of its groups is in a matching entry. Creating a destination on first use needs admin." : "Wildcards: '.' separates words, '*' is one word, '#' any number of words."}</p>
    </>
  )
}

const MB = 1024 * 1024
function Config({ b, run }) {
  const c = configOf(b)
  const classic = b.kind === CLASSIC
  const [f, setF] = useState({ storeMb: Math.round(c.storeLimit / MB), memoryMb: Math.round(c.memoryLimit / MB), sendFail: Boolean(c.sendFailIfNoSpace), dlqDays: Math.round((c.dlqExpiration ?? 0) / DAY), maxDel: c.addressSettings?.[0]?.maxDeliveryAttempts ?? 10 })
  const xml = classic
    ? `<broker xmlns="http://activemq.apache.org/schema/core" brokerName="${b.name}" schedulerSupport="${c.schedulerSupport}">
  <destinationPolicy>
    <policyMap>
      <policyEntries>
${(c.policies ?? [])
  .map((p) =>
    p.strategy === 'individual'
      ? `        <policyEntry queue="${p.match}"${p.memoryLimit ? ` memoryLimit="${p.memoryLimit}"` : ''}>
          <deadLetterStrategy>
            <individualDeadLetterStrategy queuePrefix="${p.queuePrefix}" useQueueForQueueMessages="true" processNonPersistent="${c.processNonPersistent}" processExpired="${c.processExpired}"${c.dlqExpiration ? ` expiration="${c.dlqExpiration}"` : ''} />
          </deadLetterStrategy>
        </policyEntry>`
      : `        <policyEntry queue="${p.match}"${p.memoryLimit ? ` memoryLimit="${p.memoryLimit}"` : ''}>
          <deadLetterStrategy>
            <sharedDeadLetterStrategy processNonPersistent="${c.processNonPersistent}" processExpired="${c.processExpired}"${c.dlqExpiration ? ` expiration="${c.dlqExpiration}"` : ''}>
              <deadLetterQueue><queue physicalName="${p.deadLetterQueue}" /></deadLetterQueue>
            </sharedDeadLetterStrategy>
          </deadLetterStrategy>
        </policyEntry>`,
  )
  .join('\n')}
        <policyEntry queue=">">
          <deadLetterStrategy>
            <sharedDeadLetterStrategy processNonPersistent="${c.processNonPersistent}"${c.dlqExpiration ? ` expiration="${c.dlqExpiration}"` : ''} />
          </deadLetterStrategy>
        </policyEntry>
      </policyEntries>
    </policyMap>
  </destinationPolicy>
  <persistenceAdapter>
    <kahaDB directory="\\\\nas01\\amq-store\\kahadb" lockKeepAlivePeriod="5000" />
  </persistenceAdapter>
  <systemUsage>
    <systemUsage sendFailIfNoSpace="${c.sendFailIfNoSpace}">
      <memoryUsage><memoryUsage limit="${Math.round(c.memoryLimit / MB)} mb" /></memoryUsage>
      <storeUsage><storeUsage limit="${Math.round(c.storeLimit / MB)} mb" /></storeUsage>
      <tempUsage><tempUsage limit="${Math.round(c.tempLimit / MB)} mb" /></tempUsage>
    </systemUsage>
  </systemUsage>
  <transportConnectors>
    <transportConnector name="openwire" uri="tcp://0.0.0.0:61616?maximumConnections=1000" />
  </transportConnectors>
</broker>`
    : `<address-settings>
${(c.addressSettings ?? [])
  .map(
    (a) => `  <address-setting match="${a.match}">
    <dead-letter-address>${a.deadLetterAddress}</dead-letter-address>
    <expiry-address>${a.expiryAddress}</expiry-address>
    <redelivery-delay>${a.redeliveryDelay}</redelivery-delay>
    <max-delivery-attempts>${a.maxDeliveryAttempts}</max-delivery-attempts>
    <address-full-policy>${a.addressFullPolicy}</address-full-policy>
    <auto-create-queues>${a.autoCreateQueues}</auto-create-queues>
    <auto-create-addresses>${a.autoCreateAddresses}</auto-create-addresses>
  </address-setting>`,
  )
  .join('\n')}
</address-settings>
<max-disk-usage>${c.maxDiskUsage}</max-disk-usage>`
  const save = () =>
    run((s) =>
      classic
        ? setConfig(s, b.name, { storeLimit: Math.max(1, Number(f.storeMb)) * MB, memoryLimit: Math.max(1, Number(f.memoryMb)) * MB, sendFailIfNoSpace: f.sendFail, dlqExpiration: Math.max(0, Number(f.dlqDays)) * DAY })
        : setConfig(s, b.name, { addressSettings: c.addressSettings.map((a, i) => (i === 0 ? { ...a, maxDeliveryAttempts: Number(f.maxDel) } : a)) }),
    )
  return (
    <>
      <h2>{classic ? 'activemq.xml' : 'broker.xml'} (lab)</h2>
      {b.pending && <p className="amq-warn">Saved changes wait for the next restart: {Object.keys(b.pending).join(', ')}.</p>}
      <div className="amq-send">
        {classic ? (
          <>
            <label>
              storeUsage limit (MB)
              <input type="number" min="1" value={f.storeMb} onChange={(e) => setF({ ...f, storeMb: e.target.value })} />
            </label>
            <label>
              memoryUsage limit (MB)
              <input type="number" min="1" value={f.memoryMb} onChange={(e) => setF({ ...f, memoryMb: e.target.value })} />
            </label>
            <label className="amq-check">
              <input type="checkbox" checked={f.sendFail} onChange={(e) => setF({ ...f, sendFail: e.target.checked })} /> sendFailIfNoSpace
            </label>
            <label>
              Dead letter expiration (days, 0 keeps them for ever)
              <input type="number" min="0" value={f.dlqDays} onChange={(e) => setF({ ...f, dlqDays: e.target.value })} />
            </label>
          </>
        ) : (
          <label>
            max-delivery-attempts for match #
            <input type="number" min="-1" value={f.maxDel} onChange={(e) => setF({ ...f, maxDel: e.target.value })} />
          </label>
        )}
      </div>
      <B kind="primary" onClick={save} disabled={(classic ? [f.storeMb, f.memoryMb, f.dlqDays] : [f.maxDel]).some((v) => String(v).trim() === '' || !Number.isFinite(Number(v)))}>
        Save
      </B>
      {classic && <PolicyForm b={b} run={run} />}
      <pre className="amq-pre">{xml}</pre>
      <p className="amq-dim">{classic ? 'Classic reads activemq.xml when it starts, so a change applies after a restart (Home, Nodes). Sizes are lab-made, far below a real broker.' : 'Artemis reloads address settings while it runs (configuration-file-refresh-period). The disk size is lab-made.'}</p>
    </>
  )
}

// a policyEntry for some queues, with its dead letter strategy
function PolicyForm({ b, run }) {
  const [f, setF] = useState({ match: '', strategy: 'individual', queuePrefix: 'DLQ.', deadLetterQueue: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <>
      <h3>Add a policyEntry</h3>
      <div className="amq-send">
        <label>
          queue <input value={f.match} onChange={set('match')} placeholder="ORDERS.>" />
        </label>
        <label>
          Dead letter strategy
          <select value={f.strategy} onChange={set('strategy')}>
            <option value="individual">individualDeadLetterStrategy, one DLQ per queue</option>
            <option value="shared">sharedDeadLetterStrategy, one DLQ for all</option>
          </select>
        </label>
        {f.strategy === 'individual' ? (
          <label>
            queuePrefix <input value={f.queuePrefix} onChange={set('queuePrefix')} placeholder="ActiveMQ.DLQ.Queue." />
          </label>
        ) : (
          <label>
            deadLetterQueue <input value={f.deadLetterQueue} onChange={set('deadLetterQueue')} placeholder="ActiveMQ.DLQ" />
          </label>
        )}
      </div>
      <B kind="primary" onClick={() => run((s) => addPolicyEntry(s, b.name, f))}>
        Add policyEntry
      </B>
      <p className="amq-dim">The most exact match wins. With individualDeadLetterStrategy a message that fails on ORDERS.IN goes to the queuePrefix and the queue name, for example DLQ.ORDERS.IN.</p>
    </>
  )
}

function Mule({ state, b }) {
  const classic = b.kind === CLASSIC
  const apps = appsOn(state, b)
  const xml = classic
    ? `<jms:config name="AMQ_Config">
  <jms:active-mq-connection username="\${jms.user}" password="\${secure::jms.password}"
      clientId="\${jms.clientId}" specification="JMS_1_1">
    <reconnection>
      <reconnect-forever frequency="5000" />
    </reconnection>
    <jms:factory-configuration brokerUrl="\${jms.url}" maxRedelivery="\${jms.maxRedelivery}" />
  </jms:active-mq-connection>
</jms:config>

<!-- jms.url=failover:(tcp://amq1.harbor.lab:61616,tcp://amq2.harbor.lab:61616)?randomize=false&jms.prefetchPolicy.queuePrefetch=1 -->

<flow name="order-ledger-flow">
  <jms:listener config-ref="AMQ_Config" destination="ORDERS.IN" ackMode="AUTO"
      transactionalAction="ALWAYS_BEGIN" transactionType="LOCAL" numberOfConsumers="4">
    <jms:consumer-type><jms:queue-consumer /></jms:consumer-type>
  </jms:listener>
  <!-- the publish on the same config joins the transaction (JOIN_IF_POSSIBLE) -->
  <jms:publish config-ref="AMQ_Config" destination="ORDERS.REPLY" />
</flow>`
    : `<!-- beans.xml, loaded with <spring:config name="springConfig" files="beans.xml" /> -->
<bean id="artemisFactory" class="org.apache.activemq.artemis.jms.client.ActiveMQConnectionFactory">
  <constructor-arg value="tcp://artemis.harbor.lab:61616" />
</bean>

<jms:config name="Artemis_Config">
  <jms:generic-connection connectionFactory="artemisFactory" specification="JMS_2_0"
      username="\${jms.user}" password="\${secure::jms.password}" clientId="\${jms.clientId}">
    <reconnection>
      <reconnect-forever frequency="5000" />
    </reconnection>
  </jms:generic-connection>
</jms:config>

<flow name="stock-sync-flow">
  <jms:listener config-ref="Artemis_Config" destination="STOCK.EVENTS">
    <jms:consumer-type>
      <jms:topic-consumer durable="true" shared="true" subscriptionName="stock-sync" />
    </jms:consumer-type>
  </jms:listener>
</flow>`
  const errors = [
    ['JMS:CONNECTIVITY', 'The broker cannot be reached, the client ID is in use, or a listener lost its connection.'],
    ['JMS:SECURITY', 'A wrong user or password, or no right to read, write or create the destination.'],
    ['JMS:DESTINATION_NOT_FOUND', 'The destination does not exist and is not created on first use.'],
    ['JMS:PUBLISHING', 'The send failed, for example a ResourceAllocationException with sendFailIfNoSpace.'],
    ['JMS:CONSUMING', 'The consumer cannot be made: a durable subscription in use, no client ID, or no shared subscriptions.'],
    ['JMS:ACK', 'An ack or recover on a session that is closed.'],
    ['JMS:TIMEOUT', 'jms:consume waited maximumWait and got no message.'],
  ]
  return (
    <>
      <h2>In the Mule app</h2>
      <p>{classic ? 'ActiveMQ Classic has its own connection type in the Mule JMS connector, active-mq-connection. The broker URL, the failover list and the prefetch policy go in brokerUrl.' : 'Artemis has no connection type of its own in the Mule JMS connector. Use generic-connection with an Artemis ActiveMQConnectionFactory bean, and JMS_2_0 for shared subscriptions.'}</p>
      <pre className="amq-pre">{xml}</pre>
      <Note>{classic ? 'Add activemq-client as a shared library of the Mule Maven plugin. maxRedelivery sets the RedeliveryPolicy of the client; the client default is 6, and -1 means no limit.' : 'Add artemis-jms-client as a shared library. Artemis counts deliveries on the broker: max-delivery-attempts in the address settings, 10 by default.'}</Note>
      <h3>Error types of the JMS connector</h3>
      <T heads={['Error type', 'When']}>
        {errors.map(([e, w]) => (
          <tr key={e}>
            <td className="amq-mono">{e}</td>
            <td>{w}</td>
          </tr>
        ))}
      </T>
      <h3>Apps of this console on {b.name}</h3>
      <T heads={['App', 'Status', 'jms.url', 'User', 'Client ID', 'Failover', 'Prefetch']} empty="No app of this console points at this broker.">
        {apps.map((a) => {
          const p = { ...a.props, ...a.secrets }
          const u = parseUrl(p['jms.url'])
          return (
            <tr key={`${a.env}${a.name}`}>
              <td>{a.name}</td>
              <td>{a.status}</td>
              <td className="amq-mono amq-wrap">{p['jms.url']}</td>
              <td>{p['jms.user']}</td>
              <td>{p['jms.clientId'] || ''}</td>
              <td>{u.failover ? 'yes' : 'no'}</td>
              <td>{u.params['jms.prefetchPolicy.queuePrefetch'] ?? u.params.consumerWindowSize ?? 'default'}</td>
            </tr>
          )
        })}
      </T>
    </>
  )
}

// ---------- ActiveMQ Artemis console ----------

function Artemis({ state, b, view, place, to, run, result, update }) {
  return (
    <div className="amq-x">
      <header className="amq-x-head">
        <b>Apache ActiveMQ Artemis</b>
        <span>
          {b.name} · {b.version}
        </span>
      </header>
      <nav className="amq-x-tabs" aria-label="Artemis">
        {[...ARTEMIS_NAV, ...LAB_NAV].map(([k, label]) => (
          <button key={k} type="button" className={view === k ? 'on' : ''} aria-current={view === k ? 'page' : undefined} onClick={() => to({ view: k })}>
            {label}
          </button>
        ))}
      </nav>
      <section className="amq-x-page">
        <Msg r={result} />
        {view === 'status' && <XStatus state={state} b={b} run={run} />}
        {view === 'connections' && <XConnections b={b} />}
        {view === 'consumers' && <XConsumers b={b} />}
        {view === 'addresses' && !place.dest && <XAddresses b={b} to={to} />}
        {view === 'addresses' && place.dest && <XAddress key={place.dest} b={b} name={place.dest} to={to} run={run} update={update} />}
        {view === 'queues' && <XQueues b={b} to={to} run={run} />}
        {view === 'browse' && <XBrowse key={place.dest} b={b} name={place.dest} run={run} update={update} />}
        {view === 'send' && <Send key={`${place.dest ?? ''}${place.type ?? ''}`} b={b} run={run} dest={place.dest} type={place.type} />}
        {view === 'settings' && <XSettings b={b} />}
        {view === 'users' && <Users b={b} run={run} />}
        {view === 'config' && <Config b={b} run={run} />}
        {view === 'mule' && <Mule state={state} b={b} />}
      </section>
    </div>
  )
}

function XStatus({ state, b, run }) {
  const u = usageOf(b)
  const m = masterOf(b)
  const diskPct = u.storePct
  return (
    <>
      <div className="amq-x-cards">
        <div>
          <small>Broker</small>
          <b>{m ? 'Live' : 'Stopped'}</b>
          <span>{m ? `Uptime ${uptime(state.clock - m.since)}` : 'Not running'}</span>
        </div>
        <div className={diskPct >= (b.config.maxDiskUsage ?? 90) ? 'hot' : ''}>
          <small>Disk usage</small>
          <b>{diskPct}%</b>
          <span>
            {sizeText(u.store)} of {sizeText(u.storeLimit)}, max-disk-usage {b.config.maxDiskUsage}%
          </span>
        </div>
        <div>
          <small>Address memory used</small>
          <b>{sizeText(u.memory)}</b>
          <span>global-max-size {sizeText(b.config.memoryLimit)}</span>
        </div>
        <div>
          <small>Connections</small>
          <b>{liveConns(b).length}</b>
          <span>{b.consumers.length} consumers</span>
        </div>
      </div>
      <Nodes b={b} run={run} />
    </>
  )
}

function XConnections({ b }) {
  return (
    <T heads={['Connection ID', 'Client ID', 'Users', 'Protocol', 'Session Count', 'Remote Address', 'Creation Time']} empty="No connections.">
      {liveConns(b).map((c) => (
        <tr key={c.key}>
          <td className="amq-mono">{c.id.slice(0, 13)}</td>
          <td>{c.clientId}</td>
          <td>{c.user}</td>
          <td>CORE</td>
          <td>{b.consumers.filter((k) => k.conn === c.key).length || 1}</td>
          <td className="amq-mono">{c.remote.replace('tcp://', '')}</td>
          <td className="amq-mono">{stamp(c.t)}</td>
        </tr>
      ))}
    </T>
  )
}

function XConsumers({ b }) {
  return (
    <T heads={['ID', 'Client ID', 'Validated User', 'Address', 'Queue', 'Protocol', 'Messages In Transit', 'Messages Acknowledged']} empty="No consumers.">
      {b.consumers.map((k, i) => {
        const c = connOfConsumer(b, k)
        const box = boxOfConsumer(b, k)
        const sub = k.box.startsWith('s:') ? box : null
        return (
          <tr key={k.key}>
            <td>{i}</td>
            <td>{c?.clientId}</td>
            <td>{c?.user}</td>
            <td>{sub ? sub.topic : box?.name}</td>
            <td className="amq-mono">{sub ? subQueueName(b, sub) : box?.name}</td>
            <td>CORE</td>
            <td>{heldBy(b, k).length}</td>
            <td>{k.acked}</td>
          </tr>
        )
      })}
    </T>
  )
}

// every queue Artemis shows: the ANYCAST queues and the subscription queues under MULTICAST addresses
const xQueues = (b) => [
  ...Object.values(b.queues).map((q) => ({ name: q.name, address: q.name, routing: 'ANYCAST', durable: true, consumers: consumersOf(b, `q:${q.name}`).length, count: q.messages.length, added: q.enqueued, acked: q.dequeued, delivering: inFlightOf(q), box: q })),
  ...b.subs.map((x) => ({ name: subQueueName(b, x), address: x.topic, routing: 'MULTICAST', durable: x.durable, consumers: consumersOf(b, `s:${x.key}`).length, count: x.messages.length, added: x.enqueued, acked: x.dequeued, delivering: x.messages.filter((m) => m.held).length, sub: x })),
]

function XAddresses({ b, to }) {
  const rows = [...Object.keys(b.queues).map((n) => [n, 'ANYCAST', 1]), ...Object.keys(b.topics).map((n) => [n, 'MULTICAST', subsOf(b, n).length])].sort((x, y) => x[0].localeCompare(y[0]))
  return (
    <T heads={['Name', 'Routing Types', 'Queue Count']}>
      {rows.map(([n, r, c]) => (
        <tr key={`${n}${r}`}>
          <td>
            <A onClick={() => to({ view: 'addresses', dest: n })}>{n}</A>
          </td>
          <td>{r}</td>
          <td>{c}</td>
        </tr>
      ))}
    </T>
  )
}

function XAddress({ b, name, to, run, update }) {
  const multicast = Boolean(b.topics[name])
  useEffect(() => update((s) => mark(mark(s, `jms-dest:${name}`), multicast ? 'jms-subs' : `jms-dest:${name}`)), [name, multicast, update])
  const rows = xQueues(b).filter((q) => q.address === name)
  return (
    <>
      <p>
        <A onClick={() => to({ view: 'addresses' })}>Addresses</A> / <b>{name}</b> · {multicast ? 'MULTICAST: each queue below is one subscription and gets its own copy' : 'ANYCAST: one queue, each message goes to one consumer'}
      </p>
      <QueueTable b={b} rows={rows} to={to} run={run} />
      {multicast && <p className="amq-dim">A non durable subscription queue has a random name and goes away with its consumer. A durable one is named clientId.subscriptionName, a shared one by its subscription name.</p>}
    </>
  )
}

function QueueTable({ b, rows, to, run }) {
  return (
    <T heads={['Name', 'Address', 'Routing Type', 'Durable', 'Consumer Count', 'Message Count', 'Messages Added', 'Messages Acknowledged', 'Delivering Count', 'Actions']}>
      {rows.map((q) => (
        <tr key={`${q.address}/${q.name}`}>
          <td className="amq-mono">{q.name}</td>
          <td>{q.address}</td>
          <td>{q.routing}</td>
          <td>{String(q.durable)}</td>
          <td>{q.consumers}</td>
          <td>{q.count}</td>
          <td>{q.added}</td>
          <td>{q.acked}</td>
          <td>{q.delivering}</td>
          <td className="amq-ops">
            {q.box && (
              <>
                <A onClick={() => to({ view: 'browse', dest: q.name })}>Browse</A>
                <A onClick={() => to({ view: 'send', dest: q.name, type: 'queue' })}>Send</A>
                <A onClick={() => run((s) => purgeQueue(s, b.name, q.name))}>Purge</A>
              </>
            )}
            {q.sub && q.durable && !q.consumers && <A onClick={() => run((s) => deleteSubscription(s, b.name, q.sub.key))}>Delete</A>}
          </td>
        </tr>
      ))}
    </T>
  )
}

function XQueues({ b, to, run }) {
  const [find, setFind] = useState('')
  const rows = useMemo(() => xQueues(b).filter((q) => q.name.toLowerCase().includes(find.toLowerCase())), [b, find])
  return (
    <>
      <input className="amq-find" placeholder="Filter by name" aria-label="Filter queues by name" value={find} onChange={(e) => setFind(e.target.value)} />
      <QueueTable b={b} rows={rows} to={to} run={run} />
    </>
  )
}

function XBrowse({ b, name, run, update }) {
  useEffect(() => update((s) => mark(s, `jms-dest:${name}`)), [name, update])
  const q = b.queues[name]
  const [target, setTarget] = useState('')
  const [open, setOpen] = useState(null)
  if (!q) return <p>No queue {name}.</p>
  const others = Object.keys(b.queues).filter((x) => x !== name)
  return (
    <>
      <h3>Browse {name}</h3>
      {isDlq(b, name) && (
        <div className="amq-forms">
          <B onClick={() => run((s) => moveAll(s, b.name, name, '(origin)'))}>Retry messages</B>
          <span className="amq-dim">sends every message back to its _AMQ_ORIG_ADDRESS</span>
        </div>
      )}
      <T heads={['Message ID', 'Type', 'Durable', 'Priority', 'Timestamp', 'Expires', 'Delivery Count', 'Size', 'Actions']} empty="No messages.">
        {q.messages.slice(0, 400).map((m) => (
          <tr key={m.id}>
            <td className="amq-mono">
              <A onClick={() => setOpen(open === m.id ? null : m.id)}>{m.id}</A>
            </td>
            <td>{m.type || 'TEXT'}</td>
            <td>{String(m.persistent)}</td>
            <td>{m.priority}</td>
            <td className="amq-mono">{stamp(m.ts)}</td>
            <td>{m.exp ? stamp(m.exp) : '0'}</td>
            <td>{m.redeliveries}</td>
            <td>{sizeText(m.size)}</td>
            <td className="amq-ops">
              {!m.held && (
                <>
                  <A onClick={() => run((s) => deleteMessage(s, b.name, name, m.id))}>Delete</A>
                  <A disabled={!target} onClick={() => run((s) => moveMessage(s, b.name, name, m.id, target))}>
                    Move
                  </A>
                </>
              )}
            </td>
          </tr>
        ))}
      </T>
      <label className="amq-inline">
        Move to
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose a queue</option>
          {others.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      {open && q.messages.find((m) => m.id === open) && (
        <>
          <h4>Properties</h4>
          <pre className="amq-pre">{JSON.stringify(q.messages.find((m) => m.id === open).props, null, 2)}</pre>
          <h4>Body</h4>
          <pre className="amq-pre">{pretty(q.messages.find((m) => m.id === open).body)}</pre>
        </>
      )}
    </>
  )
}

function XSettings({ b }) {
  return (
    <>
      <T heads={['match', 'dead-letter-address', 'expiry-address', 'max-delivery-attempts', 'redelivery-delay', 'address-full-policy', 'auto-create']}>
        {(b.config.addressSettings ?? []).map((a) => (
          <tr key={a.match}>
            <td className="amq-mono">{a.match}</td>
            <td>{a.deadLetterAddress}</td>
            <td>{a.expiryAddress}</td>
            <td>{a.maxDeliveryAttempts}</td>
            <td>{a.redeliveryDelay}</td>
            <td>{a.addressFullPolicy}</td>
            <td>{String(a.autoCreateQueues)}</td>
          </tr>
        ))}
      </T>
      <p className="amq-dim">
        The settings that apply to STOCK.EVENTS: dead-letter-address {policyOf(b, 'STOCK.EVENTS').deadLetterAddress}, max-delivery-attempts {policyOf(b, 'STOCK.EVENTS').maxDeliveryAttempts}. Change them on Broker config.
      </p>
    </>
  )
}
