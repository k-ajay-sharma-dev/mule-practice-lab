// A Kafka UI for the clusters of the lab, in the style of the open source UI for Apache Kafka: brokers, topics with
// their partitions and messages, consumer groups with lag, and the Schema Registry.
import { useEffect, useMemo, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import {
  addPartitions, COMPATIBILITY, CONFIG_HELP, createTopic, deleteGroup, deleteRecords, endOf, kafkaView, lagOf, produceMessage, registerSchema, resetOffsets, setCompatibility, setTopicConfig, startBroker, startOf, stopBroker, TOPIC_DEFAULTS, topicCount, topicSize,
} from '../../lab/platform-kafka.js'
import { Modal } from './parts.jsx'

const NAV = [
  ['brokers', 'Brokers'],
  ['topics', 'Topics'],
  ['consumers', 'Consumers'],
  ['schemas', 'Schema Registry'],
  ['acls', 'ACLs'],
]
const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)
const pretty = (v) => {
  if (v === null) return 'null'
  try {
    return JSON.stringify(JSON.parse(v), null, 2)
  } catch {
    return v
  }
}
const lastOffset = (p) => (endOf(p) > startOf(p) ? endOf(p) - 1 : 'None')

function KfTable({ heads, children, empty = 'No data' }) {
  const rows = [children].flat(2).filter(Boolean)
  return (
    <div className="kf-table-box">
      <table className="kf-table">
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
              <td colSpan={heads.length} className="kf-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
const Btn = ({ kind = 'plain', ...props }) => <button type="button" className={`kf-btn kf-btn-${kind}`} {...props} />
const A = (props) => <button type="button" className="kf-a" {...props} />
const Tag = ({ kind, children }) => <span className={`kf-tag kf-tag-${kind}`}>{children}</span>
const STATE_KIND = { Stable: 'good', Empty: 'idle', PreparingRebalance: 'warn', CompletingRebalance: 'warn', Dead: 'bad' }
function Stats({ items }) {
  return (
    <div className="kf-stats">
      {items.map(([label, value, kind]) => (
        <div key={label} className={`kf-stat${kind ? ` kf-stat-${kind}` : ''}`}>
          <small>{label}</small>
          <b>{value}</b>
        </div>
      ))}
    </div>
  )
}
const KfTabs = ({ tabs, value, onChange }) => (
  <div className="kf-tabs" role="tablist">
    {tabs.map((t) => (
      <button key={t} type="button" role="tab" aria-selected={value === t} className={value === t ? 'on' : ''} onClick={() => onChange(t)}>
        {t}
      </button>
    ))}
  </div>
)
const Field = ({ label, children, hint }) => (
  <label className="kf-field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
)
const Err = ({ text }) =>
  text ? (
    <p className="kf-err" role="alert">
      {text}
    </p>
  ) : null

export default function KafkaUI({ state, update, place, go }) {
  const view = useMemo(() => kafkaView(state), [state])
  const names = Object.keys(view.clusters)
  const cluster = view.clusters[place.cluster] ?? view.clusters[names[0]]
  const section = place.view ?? 'brokers'
  const [error, setError] = useState('')
  const name = cluster?.name

  useEffect(() => {
    if (name) update((s) => mark(s, `kafka:${name}`))
  }, [name, update])
  useEffect(() => setError(''), [place])

  // runs an action on the current state; an error is shown and the state stays
  const run = (fn) => {
    const r = fn(state)
    if (!r.ok) {
      setError(r.text)
      return r
    }
    setError('')
    update((s) => fn(s).state)
    return r
  }
  const to = (next) => go({ cluster: name, ...next })

  if (!cluster)
    return (
      <main className="pc-main kf-main">
        <div className="kf kf-none">
          <p>No Kafka cluster is connected to this console.</p>
        </div>
      </main>
    )
  const topic = place.topic && cluster.topics[place.topic] ? place.topic : null
  const group = place.group && cluster.groups[place.group] ? place.group : null
  return (
    <main className="pc-main kf-main">
      <div className="kf">
        <header className="kf-head">
          <b className="kf-logo">UI for Apache Kafka</b>
          <label className="kf-cluster">
            <span>Cluster</span>
            <select value={name} onChange={(e) => go({ cluster: e.target.value })}>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <span className="kf-version">Kafka {cluster.version}</span>
        </header>
        <div className="kf-body">
          <nav className="kf-nav" aria-label="Kafka">
            <b>{name}</b>
            {NAV.map(([key, label]) => (
              <button key={key} type="button" className={section === key ? 'on' : ''} aria-current={section === key ? 'page' : undefined} onClick={() => to({ view: key })}>
                {label}
              </button>
            ))}
          </nav>
          <section className="kf-page">
            <Err text={error} />
            {section === 'brokers' && <Brokers cluster={cluster} run={run} />}
            {section === 'topics' && !topic && <Topics cluster={cluster} run={run} to={to} />}
            {section === 'topics' && topic && <Topic key={topic} cluster={cluster} name={topic} tab={place.tab ?? 'Overview'} run={run} to={to} update={update} />}
            {section === 'consumers' && !group && <Groups cluster={cluster} to={to} />}
            {section === 'consumers' && group && <Group key={group} cluster={cluster} id={group} run={run} to={to} update={update} />}
            {section === 'schemas' && <Schemas key={place.subject ?? ''} cluster={cluster} run={run} subject={place.subject} to={to} />}
            {section === 'acls' && <Acls cluster={cluster} />}
          </section>
        </div>
      </div>
    </main>
  )
}

// ---------- brokers ----------

function Brokers({ cluster, run }) {
  const parts = Object.values(cluster.topics).flatMap((t) => t.partitions)
  const under = parts.filter((p) => p.isr.length < p.replicas.length).length
  const offline = parts.filter((p) => p.leader === -1).length
  const up = cluster.brokers.filter((b) => b.up).length
  return (
    <>
      <h2>Brokers</h2>
      <Stats
        items={[
          ['Brokers online', `${up} of ${cluster.brokers.length}`, up < cluster.brokers.length ? 'warn' : 'good'],
          ['Partitions', parts.length],
          ['Online partitions', parts.length - offline, offline ? 'bad' : 'good'],
          ['Under replicated', under, under ? 'warn' : 'good'],
          ['Offline partitions', offline, offline ? 'bad' : 'good'],
        ]}
      />
      <KfTable heads={['Broker ID', 'Host', 'Status', 'Partitions', 'Leaders', 'Action']}>
        {cluster.brokers.map((b) => (
          <tr key={b.id}>
            <td>
              <b>{b.id}</b>
              {b.id === cluster.brokers.find((x) => x.up)?.id && <Tag kind="info">Controller</Tag>}
            </td>
            <td className="kf-mono">{b.host}</td>
            <td>{b.up ? <Tag kind="good">Online</Tag> : <Tag kind="bad">Offline</Tag>}</td>
            <td>{parts.filter((p) => p.replicas.includes(b.id)).length}</td>
            <td>{parts.filter((p) => p.leader === b.id).length}</td>
            <td>
              {b.up ? (
                <Btn kind="danger" onClick={() => run((s) => stopBroker(s, cluster.name, b.id))}>
                  Stop broker
                </Btn>
              ) : (
                <Btn onClick={() => run((s) => startBroker(s, cluster.name, b.id))}>Start broker</Btn>
              )}
            </td>
          </tr>
        ))}
      </KfTable>
      <p className="kf-dim">Stopping a broker is a lab action. The leaders of its partitions move to another replica in sync.</p>
    </>
  )
}

// ---------- topics ----------

function Topics({ cluster, run, to }) {
  const [find, setFind] = useState('')
  const [adding, setAdding] = useState(false)
  const list = Object.entries(cluster.topics)
    .filter(([n]) => n.toLowerCase().includes(find.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
  return (
    <>
      <div className="kf-title">
        <h2>Topics</h2>
        <Btn kind="primary" onClick={() => setAdding(true)}>
          Add a topic
        </Btn>
      </div>
      <input className="kf-input kf-search" placeholder="Search by topic name" aria-label="Search by topic name" value={find} onChange={(e) => setFind(e.target.value)} />
      <KfTable heads={['Topic name', 'Partitions', 'Out of sync replicas', 'Replication factor', 'Number of messages', 'Size']} empty="No topics found">
        {list.map(([n, t]) => (
          <tr key={n}>
            <td>
              <A onClick={() => to({ view: 'topics', topic: n })}>{n}</A>
              {String(t.config['cleanup.policy'] ?? '').includes('compact') && <Tag kind="info">compact</Tag>}
            </td>
            <td>{t.partitions.length}</td>
            <td>{t.partitions.reduce((k, p) => k + p.replicas.length - p.isr.length, 0)}</td>
            <td>{t.partitions[0]?.replicas.length}</td>
            <td>{topicCount(t)}</td>
            <td>{size(topicSize(t))}</td>
          </tr>
        ))}
      </KfTable>
      {adding && <AddTopic cluster={cluster} run={run} close={() => setAdding(false)} />}
    </>
  )
}

function AddTopic({ cluster, run, close }) {
  const [f, setF] = useState({ name: '', partitions: 3, replicationFactor: Math.min(3, cluster.brokers.length), minIsr: '1', policy: 'delete', retention: TOPIC_DEFAULTS['retention.ms'] })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = () => {
    const config = {}
    if (f.minIsr !== TOPIC_DEFAULTS['min.insync.replicas']) config['min.insync.replicas'] = String(f.minIsr)
    if (f.policy !== 'delete') config['cleanup.policy'] = f.policy
    if (String(f.retention) !== TOPIC_DEFAULTS['retention.ms']) config['retention.ms'] = String(f.retention)
    const r = run((s) => createTopic(s, cluster.name, { name: f.name.trim(), partitions: Number(f.partitions), replicationFactor: Number(f.replicationFactor), config }))
    if (r.ok) close()
    else setErr(r.text)
  }
  return (
    <Modal
      title="Create a topic"
      onClose={close}
      foot={
        <div className="kf-foot">
          <Btn onClick={close}>Cancel</Btn>
          <Btn kind="primary" onClick={save}>
            Create topic
          </Btn>
        </div>
      }
    >
      <div className="kf-form">
        <Field label="Topic name">
          <input className="kf-input" value={f.name} onChange={set('name')} placeholder="returns.v1" />
        </Field>
        <Field label="Number of partitions">
          <input className="kf-input" type="number" min="1" value={f.partitions} onChange={set('partitions')} />
        </Field>
        <Field label="Replication factor" hint={`The cluster has ${cluster.brokers.length} brokers.`}>
          <input className="kf-input" type="number" min="1" value={f.replicationFactor} onChange={set('replicationFactor')} />
        </Field>
        <Field label="Min in sync replicas">
          <input className="kf-input" type="number" min="1" value={f.minIsr} onChange={set('minIsr')} />
        </Field>
        <Field label="Cleanup policy">
          <select className="kf-input" value={f.policy} onChange={set('policy')}>
            <option value="delete">Delete</option>
            <option value="compact">Compact</option>
            <option value="compact,delete">Compact, delete</option>
          </select>
        </Field>
        <Field label="Time to retain data (ms)" hint="604800000 is 7 days. -1 keeps data forever.">
          <input className="kf-input" value={f.retention} onChange={set('retention')} />
        </Field>
      </div>
      <Err text={err} />
    </Modal>
  )
}

const groupsOf = (cluster, topic) => Object.entries(cluster.groups).filter(([, g]) => g.topics.includes(topic) || g.offsets[topic])

function Topic({ cluster, name, tab, run, to, update }) {
  const t = cluster.topics[name]
  const [producing, setProducing] = useState(false)
  const [clearing, setClearing] = useState(null)
  useEffect(() => update((s) => mark(s, `kafka-topic:${name}`)), [name, update])
  const isr = t.partitions.reduce((k, p) => k + p.isr.length, 0)
  const replicas = t.partitions.reduce((k, p) => k + p.replicas.length, 0)
  return (
    <>
      <div className="kf-crumbs">
        <A onClick={() => to({ view: 'topics' })}>Topics</A> <span aria-hidden="true">/</span> <span>{name}</span>
      </div>
      <div className="kf-title">
        <h2>{name}</h2>
        <Btn kind="primary" onClick={() => setProducing(true)}>
          Produce message
        </Btn>
      </div>
      <KfTabs tabs={['Overview', 'Messages', 'Consumers', 'Settings']} value={tab} onChange={(x) => to({ view: 'topics', topic: name, tab: x })} />
      {tab === 'Overview' && (
        <>
          <Stats
            items={[
              ['Partitions', t.partitions.length],
              ['Replication factor', t.partitions[0]?.replicas.length],
              ['In sync replicas', `${isr} of ${replicas}`, isr < replicas ? 'warn' : 'good'],
              ['Messages', topicCount(t)],
              ['Size', size(topicSize(t))],
              ['Cleanup policy', t.config['cleanup.policy'] ?? 'delete'],
            ]}
          />
          <KfTable heads={['Partition ID', 'Leader', 'Replicas', 'In sync replicas', 'First offset', 'Last offset', 'Messages', '']}>
            {t.partitions.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.leader === -1 ? <Tag kind="bad">No leader</Tag> : p.leader}</td>
                <td>
                  {p.replicas.map((r) => (
                    <span key={r} className={`kf-replica${r === p.leader ? ' lead' : ''}${p.isr.includes(r) ? '' : ' out'}`}>
                      {r}
                    </span>
                  ))}
                </td>
                <td>{p.isr.length ? p.isr.join(', ') : 'None'}</td>
                <td>{startOf(p)}</td>
                <td>{lastOffset(p)}</td>
                <td>{p.messages.length}</td>
                <td>
                  <Btn onClick={() => setClearing({ partition: p.id, offset: endOf(p) })}>Delete records</Btn>
                </td>
              </tr>
            ))}
          </KfTable>
        </>
      )}
      {tab === 'Messages' && <Messages t={t} />}
      {tab === 'Consumers' && (
        <KfTable heads={['Consumer group ID', 'State', 'Members', 'Consumer lag']} empty="No consumer groups read this topic">
          {groupsOf(cluster, name).map(([id, g]) => (
            <tr key={id}>
              <td>
                <A onClick={() => to({ view: 'consumers', group: id })}>{id}</A>
              </td>
              <td>
                <Tag kind={STATE_KIND[g.state] ?? 'idle'}>{g.state}</Tag>
              </td>
              <td>{g.members.length}</td>
              <td>{lagOf(cluster, name, id).total}</td>
            </tr>
          ))}
        </KfTable>
      )}
      {tab === 'Settings' && <Settings cluster={cluster} name={name} t={t} run={run} />}
      {producing && <Produce cluster={cluster} topic={name} run={run} close={() => setProducing(false)} />}
      {clearing && (
        <Modal
          title={`Delete records of ${name}, partition ${clearing.partition}`}
          onClose={() => setClearing(null)}
          foot={
            <div className="kf-foot">
              <Btn onClick={() => setClearing(null)}>Cancel</Btn>
              <Btn
                kind="danger"
                onClick={() => {
                  if (run((s) => deleteRecords(s, cluster.name, name, clearing.partition, clearing.offset)).ok) setClearing(null)
                }}
              >
                Delete records
              </Btn>
            </div>
          }
        >
          <Field label="Delete the records before this offset" hint="The log start moves to this offset. The records before it cannot come back.">
            <input className="kf-input" type="number" min="0" value={clearing.offset} onChange={(e) => setClearing({ ...clearing, offset: e.target.value })} />
          </Field>
        </Modal>
      )}
    </>
  )
}

function Messages({ t }) {
  const [partition, setPartition] = useState('all')
  const [seek, setSeek] = useState('oldest')
  const [from, setFrom] = useState(0)
  const [key, setKey] = useState('')
  const [open, setOpen] = useState(null)
  let list = t.partitions.filter((p) => partition === 'all' || p.id === Number(partition)).flatMap((p) => p.messages.map((m) => ({ ...m, partition: p.id })))
  if (seek === 'offset') list = list.filter((m) => m.offset >= Number(from))
  if (key) list = list.filter((m) => `${m.key ?? ''} ${m.value ?? ''}`.toLowerCase().includes(key.toLowerCase()))
  list.sort((a, b) => (seek === 'newest' ? b.t - a.t || b.offset - a.offset : a.t - b.t || a.offset - b.offset))
  list = list.slice(0, 100)
  return (
    <>
      <div className="kf-filters">
        <Field label="Partitions">
          <select className="kf-input" value={partition} onChange={(e) => setPartition(e.target.value)}>
            <option value="all">All partitions</option>
            {t.partitions.map((p) => (
              <option key={p.id} value={p.id}>
                Partition {p.id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Seek type">
          <select className="kf-input" value={seek} onChange={(e) => setSeek(e.target.value)}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="offset">From offset</option>
          </select>
        </Field>
        {seek === 'offset' && (
          <Field label="Offset">
            <input className="kf-input" type="number" min="0" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        )}
        <Field label="Search">
          <input className="kf-input" value={key} placeholder="Key or value" onChange={(e) => setKey(e.target.value)} />
        </Field>
      </div>
      <KfTable heads={['Offset', 'Partition', 'Timestamp', 'Key', 'Value']} empty="No messages found">
        {list.map((m) => {
          const id = `${m.partition}:${m.offset}`
          return [
            <tr key={id} className="kf-click" onClick={() => setOpen(open === id ? null : id)}>
              <td>
                <A aria-expanded={open === id}>{m.offset}</A>
              </td>
              <td>{m.partition}</td>
              <td className="kf-nowrap">{stamp(m.t)}</td>
              <td className="kf-mono">{m.key ?? 'null'}</td>
              <td className="kf-mono kf-clip">{m.value ?? 'null'}</td>
            </tr>,
            open === id && (
              <tr key={`${id}-open`} className="kf-open">
                <td colSpan={5}>
                  <div className="kf-detail">
                    <div>
                      <b>Value</b>
                      <pre>{pretty(m.value)}</pre>
                    </div>
                    <div>
                      <b>Headers</b>
                      <pre>{Object.keys(m.headers ?? {}).length ? JSON.stringify(m.headers, null, 2) : 'No headers'}</pre>
                      <b>Key</b>
                      <pre>{m.key ?? 'null'}</pre>
                      <b>Timestamp</b>
                      <pre>
                        {stamp(m.t)} (CreateTime){'\n'}Size {size(m.size ?? 0)}
                      </pre>
                    </div>
                  </div>
                </td>
              </tr>
            ),
          ]
        })}
      </KfTable>
      <p className="kf-dim">The browser shows up to 100 messages. Reading here does not commit any offset.</p>
    </>
  )
}

function Produce({ cluster, topic, run, close }) {
  const [f, setF] = useState({ key: '', value: '{\n  "orderId": "O-2001",\n  "customerId": "C-7",\n  "total": 18.5\n}', headers: '{\n  "source": "kafka-ui"\n}', partition: '', nullKey: false })
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)
  const send = () => {
    let headers = {}
    try {
      headers = f.headers.trim() ? JSON.parse(f.headers) : {}
    } catch {
      setErr('The headers are not valid JSON.')
      return
    }
    const record = { key: f.nullKey ? null : f.key, value: f.value, headers, partition: f.partition === '' ? undefined : Number(f.partition) }
    const r = run((s) => produceMessage(s, cluster.name, topic, record))
    if (r.ok) {
      setErr('')
      setDone(`Produced to partition ${r.partition} at offset ${r.offset}.`)
    } else setErr(r.text)
  }
  return (
    <Modal
      wide
      title={`Produce a message to ${topic}`}
      onClose={close}
      foot={
        <div className="kf-foot">
          <Btn onClick={close}>Close</Btn>
          <Btn kind="primary" onClick={send}>
            Produce message
          </Btn>
        </div>
      }
    >
      <div className="kf-form">
        <Field label="Partition">
          <select className="kf-input" value={f.partition} onChange={(e) => setF({ ...f, partition: e.target.value })}>
            <option value="">Chosen by the key</option>
            {cluster.topics[topic].partitions.map((p) => (
              <option key={p.id} value={p.id}>
                Partition {p.id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Key" hint="The same key always goes to the same partition.">
          <input className="kf-input" disabled={f.nullKey} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
        </Field>
        <label className="kf-checkline">
          <input type="checkbox" checked={f.nullKey} onChange={(e) => setF({ ...f, nullKey: e.target.checked })} /> Send a null key
        </label>
        <Field label="Value">
          <textarea className="kf-input kf-mono" rows={6} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        </Field>
        <Field label="Headers (JSON)">
          <textarea className="kf-input kf-mono" rows={3} value={f.headers} onChange={(e) => setF({ ...f, headers: e.target.value })} />
        </Field>
      </div>
      <Err text={err} />
      {done && !err && <p className="kf-ok">{done}</p>}
    </Modal>
  )
}

function Settings({ cluster, name, t, run }) {
  const [edit, setEdit] = useState(null)
  const [count, setCount] = useState(t.partitions.length + 1)
  return (
    <>
      <KfTable heads={['Key', 'Value', 'Default value', '']}>
        {Object.keys(TOPIC_DEFAULTS).map((k) => {
          const custom = k in t.config
          return (
            <tr key={k}>
              <td>
                <span className="kf-mono">{k}</span>
                <small className="kf-help">{CONFIG_HELP[k]}</small>
              </td>
              <td className={custom ? 'kf-custom' : ''}>
                {edit?.key === k ? (
                  <input className="kf-input" aria-label={k} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
                ) : (
                  <span className="kf-mono">{t.config[k] ?? TOPIC_DEFAULTS[k]}</span>
                )}
              </td>
              <td className="kf-mono kf-dim">{TOPIC_DEFAULTS[k]}</td>
              <td className="kf-nowrap">
                {edit?.key === k ? (
                  <>
                    <Btn
                      kind="primary"
                      onClick={() => {
                        if (run((s) => setTopicConfig(s, cluster.name, name, k, edit.value)).ok) setEdit(null)
                      }}
                    >
                      Save
                    </Btn>{' '}
                    <Btn onClick={() => setEdit(null)}>Cancel</Btn>
                  </>
                ) : (
                  <Btn onClick={() => setEdit({ key: k, value: t.config[k] ?? TOPIC_DEFAULTS[k] })}>Edit</Btn>
                )}
              </td>
            </tr>
          )
        })}
      </KfTable>
      <div className="kf-row">
        <Field label="Number of partitions" hint="Partitions can only grow. Keys then go to other partitions.">
          <input className="kf-input" type="number" min={t.partitions.length + 1} value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <Btn onClick={() => run((s) => addPartitions(s, cluster.name, name, count))}>Increase partitions</Btn>
      </div>
    </>
  )
}

// ---------- consumer groups ----------

function Groups({ cluster, to }) {
  const list = Object.entries(cluster.groups).sort(([a], [b]) => a.localeCompare(b))
  return (
    <>
      <h2>Consumers</h2>
      <KfTable heads={['Group ID', 'Members', 'Topics', 'Consumer lag', 'Coordinator', 'State']} empty="No consumer groups">
        {list.map(([id, g]) => {
          const topics = [...new Set([...g.topics, ...Object.keys(g.offsets)])]
          return (
            <tr key={id}>
              <td>
                <A onClick={() => to({ view: 'consumers', group: id })}>{id}</A>
              </td>
              <td>{g.members.length}</td>
              <td>{topics.join(', ') || 'None'}</td>
              <td>{topics.reduce((n, t) => n + (cluster.topics[t] ? lagOf(cluster, t, id).total : 0), 0)}</td>
              <td>{coordinator(cluster, id)}</td>
              <td>
                <Tag kind={STATE_KIND[g.state] ?? 'idle'}>{g.state}</Tag>
              </td>
            </tr>
          )
        })}
      </KfTable>
    </>
  )
}
// lab-made: the coordinator is a broker picked from the group name, like the partition of __consumer_offsets
const coordinator = (cluster, id) => {
  const live = cluster.brokers.filter((b) => b.up)
  return live.length ? live[[...id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % live.length].id : 'None'
}

function Group({ cluster, id, run, to, update }) {
  const g = cluster.groups[id]
  const [resetting, setResetting] = useState(false)
  useEffect(() => update((s) => mark(s, `kafka-group:${id}`)), [id, update])
  const topics = [...new Set([...g.topics, ...Object.keys(g.offsets)])].filter((t) => cluster.topics[t])
  const total = topics.reduce((n, t) => n + lagOf(cluster, t, id).total, 0)
  return (
    <>
      <div className="kf-crumbs">
        <A onClick={() => to({ view: 'consumers' })}>Consumers</A> <span aria-hidden="true">/</span> <span>{id}</span>
      </div>
      <div className="kf-title">
        <h2>{id}</h2>
        <Btn onClick={() => setResetting(true)}>Reset offsets</Btn>
        <Btn kind="danger" onClick={() => run((s) => deleteGroup(s, cluster.name, id)).ok && to({ view: 'consumers' })}>
          Delete group
        </Btn>
      </div>
      <Stats
        items={[
          ['State', g.state, STATE_KIND[g.state]],
          ['Members', g.members.length],
          ['Assigned topics', topics.length],
          ['Total lag', total, total ? 'warn' : 'good'],
          ['Generation', g.generation],
          ['Coordinator', coordinator(cluster, id)],
        ]}
      />
      <h3>Members</h3>
      <KfTable heads={['Consumer ID', 'Host', 'Assigned partitions']} empty="No active members. The group is empty.">
        {g.members.map((m) => (
          <tr key={m.client}>
            <td className="kf-mono">{m.client}</td>
            <td className="kf-mono">{m.host}</td>
            <td>{m.partitions.length ? m.partitions.map((x) => `${x.topic}-${x.partition}`).join(', ') : 'None (idle)'}</td>
          </tr>
        ))}
      </KfTable>
      {topics.map((t) => {
        const lag = lagOf(cluster, t, id)
        return (
          <div key={t}>
            <h3>
              <A onClick={() => to({ view: 'topics', topic: t })}>{t}</A> <span className="kf-dim">lag {lag.total}</span>
            </h3>
            <KfTable heads={['Partition', 'Consumer ID', 'Committed offset', 'End offset', 'Consumer lag']}>
              {lag.partitions.map((p) => (
                <tr key={p.partition}>
                  <td>{p.partition}</td>
                  <td className="kf-mono">{p.member ?? 'None'}</td>
                  <td>{p.committed ?? 'None'}</td>
                  <td>{p.end}</td>
                  <td className={p.lag ? 'kf-lag' : ''}>{p.lag ?? 'None'}</td>
                </tr>
              ))}
            </KfTable>
          </div>
        )
      })}
      {g.history.length > 0 && (
        <>
          <h3>Group events</h3>
          <ul className="kf-events">
            {[...g.history].reverse().map((h, i) => (
              <li key={i}>
                <span className="kf-nowrap kf-dim">{stamp(h.t)}</span> Generation {h.generation}. {h.why}
              </li>
            ))}
          </ul>
        </>
      )}
      {resetting && <ResetOffsets cluster={cluster} id={id} topics={topics} run={run} close={() => setResetting(false)} />}
    </>
  )
}

function ResetOffsets({ cluster, id, topics, run, close }) {
  const g = cluster.groups[id]
  const [f, setF] = useState({ topic: topics[0] ?? Object.keys(cluster.topics)[0], partition: '', type: 'earliest', offset: 0 })
  const [err, setErr] = useState('')
  const save = () => {
    const r = run((s) => resetOffsets(s, cluster.name, id, f.topic, f.type === 'offset' ? { offset: Number(f.offset) } : f.type, f.partition))
    if (r.ok) close()
    else setErr(r.text)
  }
  return (
    <Modal
      title={`Reset offsets of ${id}`}
      onClose={close}
      foot={
        <div className="kf-foot">
          <Btn onClick={close}>Cancel</Btn>
          <Btn kind="primary" onClick={save}>
            Reset offsets
          </Btn>
        </div>
      }
    >
      {g.members.length > 0 && <p className="kf-warn">The group has {g.members.length} active members. Kafka resets offsets only for a group with no active members. Stop the consumers first.</p>}
      <div className="kf-form">
        <Field label="Topic">
          <select className="kf-input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value, partition: '' })}>
            {Object.keys(cluster.topics).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Partitions">
          <select className="kf-input" value={f.partition} onChange={(e) => setF({ ...f, partition: e.target.value })}>
            <option value="">All partitions</option>
            {cluster.topics[f.topic]?.partitions.map((p) => (
              <option key={p.id} value={p.id}>
                Partition {p.id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reset type">
          <select className="kf-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="earliest">Earliest</option>
            <option value="latest">Latest</option>
            <option value="offset">Offset</option>
          </select>
        </Field>
        {f.type === 'offset' && (
          <Field label="Offset">
            <input className="kf-input" type="number" min="0" value={f.offset} onChange={(e) => setF({ ...f, offset: e.target.value })} />
          </Field>
        )}
      </div>
      <Err text={err} />
    </Modal>
  )
}

// ---------- Schema Registry ----------

function Schemas({ cluster, run, subject, to }) {
  const reg = cluster.schemaRegistry
  const sub = subject && reg.subjects[subject]
  const [draft, setDraft] = useState(null) // null until you edit, so the box can be emptied
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  if (sub) {
    const latest = sub.versions.at(-1)
    return (
      <>
        <div className="kf-crumbs">
          <A onClick={() => to({ view: 'schemas' })}>Schema Registry</A> <span aria-hidden="true">/</span> <span>{subject}</span>
        </div>
        <h2>{subject}</h2>
        <div className="kf-row">
          <Field label="Compatibility level">
            <select className="kf-input" value={sub.compatibility ?? reg.compatibility} onChange={(e) => run((s) => setCompatibility(s, cluster.name, subject, e.target.value))}>
              {COMPATIBILITY.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <KfTable heads={['Version', 'Schema ID', 'Type', 'Compatibility at registration']}>
          {[...sub.versions].reverse().map((v) => (
            <tr key={v.version}>
              <td>{v.version}</td>
              <td>{v.id}</td>
              <td>AVRO</td>
              <td>{v.compatibility}</td>
            </tr>
          ))}
        </KfTable>
        <div className="kf-detail">
          <div>
            <b>Latest schema, version {latest.version}</b>
            <pre>{pretty(latest.schema)}</pre>
          </div>
          <div>
            <b>Register a new version</b>
            <textarea className="kf-input kf-mono" rows={12} aria-label="New schema" value={draft ?? pretty(latest.schema)} onChange={(e) => setDraft(e.target.value)} />
            <Btn
              kind="primary"
              onClick={() => {
                const r = run((s) => registerSchema(s, cluster.name, subject, draft ?? latest.schema))
                if (r.ok) {
                  setErr('')
                  setDraft(null)
                  setOk(`Schema ID ${r.id}, version ${r.version}.`)
                } else {
                  setOk('')
                  setErr(r.text)
                }
              }}
            >
              Register schema
            </Btn>
            <Err text={err} />
            {ok && <p className="kf-ok">{ok}</p>}
          </div>
        </div>
      </>
    )
  }
  return (
    <>
      <h2>Schema Registry</h2>
      <div className="kf-row">
        <Field label="Global compatibility level">
          <select className="kf-input" value={reg.compatibility} onChange={(e) => run((s) => setCompatibility(s, cluster.name, null, e.target.value))}>
            {COMPATIBILITY.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <KfTable heads={['Subject', 'Latest version', 'Schema ID', 'Type', 'Compatibility']} empty="No subjects">
        {Object.entries(reg.subjects).map(([n, s]) => (
          <tr key={n}>
            <td>
              <A onClick={() => to({ view: 'schemas', subject: n })}>{n}</A>
            </td>
            <td>{s.versions.at(-1)?.version}</td>
            <td>{s.versions.at(-1)?.id}</td>
            <td>AVRO</td>
            <td>{s.compatibility ?? `${reg.compatibility} (global)`}</td>
          </tr>
        ))}
      </KfTable>
    </>
  )
}

function Acls({ cluster }) {
  return (
    <>
      <h2>Access Control List</h2>
      <KfTable heads={['Principal', 'Resource', 'Pattern', 'Host', 'Operation', 'Permission']} empty="No ACLs">
        {(cluster.acls ?? []).map((a, i) => (
          <tr key={i}>
            <td className="kf-mono">{a.principal}</td>
            <td>
              {a.resource} <span className="kf-mono">{a.name}</span>
            </td>
            <td>{a.pattern}</td>
            <td>{a.host}</td>
            <td>{a.operation}</td>
            <td>{a.permission === 'ALLOW' ? <Tag kind="good">ALLOW</Tag> : <Tag kind="bad">DENY</Tag>}</td>
          </tr>
        ))}
      </KfTable>
    </>
  )
}
