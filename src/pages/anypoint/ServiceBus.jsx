// Azure Service Bus in the style of the Azure portal: the namespace, queues, topics and subscriptions, the entity
// pages with their counts and Service Bus Explorer, and shared access policies. On the lab engine of
// platform-servicebus.js. A lab tool with fictional resources of Brightmart. The shell and grid are copied from
// AzurePortal.jsx (which does not export them) and use its sy-az styles.
import { useEffect, useState } from 'react'
import { dateText, mark, timeText } from '../../lab/platform.js'
import {
  addEntityPolicy, addPolicy, CLAIMS, connectionString, countsOf, entityConnectionString, entityPoliciesOf, entityPolicyErrors, regenerateEntityKey, removeEntityPolicy, createQueue, createSubscription, createTopic, deleteEntity, deleteRule, DLQ, durationText, entityErrors, explorerReceive, explorerSend, explorerSettle,
  filterError, hostOf, keysOf, MAX_LOCK, namespacesOf, peekMessages, policyErrors, purgeDeadLetters, regenerateKey, removePolicy, resendDeadLetters, resolve, setPolicyClaims, setRule, SIZES_MB, topicCounts, updateEntity, upgradeServiceBus,
} from '../../lab/platform-servicebus.js'
import { Check, Copy, Input, Select } from './parts.jsx'

const SEC = 1000
const MIN = 60 * SEC
const DAY = 24 * 60 * MIN
const azTime = (t) => {
  const [y, m, d] = dateText(t).split('-').map(Number)
  const [h, mi, s] = timeText(t).split(':').map(Number)
  return `${m}/${d}/${y}, ${h % 12 || 12}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(2)} KB` : `${n} B`)
const gb = (mb) => `${mb / 1024} GB`

// ---------- the portal shell (copied from AzurePortal.jsx) ----------

function Shell({ crumbs, children }) {
  return (
    <main className="pc-main sy-az">
      <div className="sy-az-top">
        <b>Microsoft Azure</b>
        <span className="sy-az-lab">Lab copy</span>
        <input className="sy-az-search" placeholder="Search resources, services, and docs (G+/)" aria-label="Search" />
        <span className="sy-az-user">you@brightmart.lab</span>
      </div>
      <nav className="sy-az-crumbs" aria-label="Breadcrumb">
        {crumbs.map(([label, onClick], i) => (
          <span key={i}>
            {i > 0 && <i aria-hidden="true"> › </i>}
            {onClick ? (
              <button type="button" onClick={onClick}>
                {label}
              </button>
            ) : (
              <b>{label}</b>
            )}
          </span>
        ))}
      </nav>
      {children}
    </main>
  )
}
function Resource({ icon, name, kind, menu, blade, onBlade, children }) {
  return (
    <div className="sy-az-res">
      <header className="sy-az-title">
        <span className="sy-az-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2>
            {name}
            {blade !== 'Overview' && <span> | {blade}</span>}
          </h2>
          <small>{kind}</small>
        </div>
      </header>
      <div className="sy-az-body">
        <nav className="sy-az-menu" aria-label={`${name} menu`}>
          {menu.map((item) =>
            typeof item === 'string' ? (
              <button key={item} type="button" className={item === blade ? 'on' : ''} aria-current={item === blade ? 'page' : undefined} onClick={() => onBlade(item)}>
                {item}
              </button>
            ) : (
              <b key={item.title}>{item.title}</b>
            ),
          )}
        </nav>
        <section className="sy-az-blade">{children}</section>
      </div>
    </div>
  )
}
const Cmd = ({ children }) => <div className="sy-az-cmd">{children}</div>
const CBtn = ({ icon, children, ...props }) => (
  <button type="button" className="sy-az-cbtn" {...props}>
    {icon && <span aria-hidden="true">{icon}</span>}
    {children}
  </button>
)
const ABtn = ({ primary, ...props }) => <button type="button" className={`sy-az-btn${primary ? ' primary' : ''}`} {...props} />
function Grid({ heads, rows, empty = 'No items to show.' }) {
  return (
    <div className="sy-az-grid">
      <table>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
          {rows.length === 0 && (
            <tr>
              <td colSpan={heads.length} className="sy-az-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
function Pane({ title, sub, onClose, children, foot }) {
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <div className="sy-az-paneback" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sy-az-pane" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sy-az-panehead">
          <div>
            <h3>{title}</h3>
            {sub && <small>{sub}</small>}
          </div>
          <button type="button" className="sy-az-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sy-az-panebody">{children}</div>
        {foot && <div className="sy-az-panefoot">{foot}</div>}
      </aside>
    </div>
  )
}
const Row = ({ label, group, children }) =>
  group ? (
    <div className="sy-az-row" role="group" aria-label={label}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  ) : (
    <label className="sy-az-row">
      <span>{label}</span>
      <div>{children}</div>
    </label>
  )
const Info = ({ children, kind = 'info' }) => <p className={`sy-az-info ${kind}`}>{children}</p>
function Masked({ value, label = 'Show' }) {
  const [show, setShow] = useState(false)
  return (
    <span className="sy-az-masked">
      <code>{show ? value : '•'.repeat(Math.min(24, Math.max(8, String(value).length)))}</code>
      <ABtn onClick={() => setShow(!show)}>{show ? 'Hide' : label}</ABtn>
      <Copy text={value} />
    </span>
  )
}
function Essentials({ items }) {
  return (
    <dl className="sy-az-ess">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
const Errors = ({ list }) => list.map((e) => <Info key={e} kind="bad">{e}</Info>)

// A number box that can be cleared while typing: the shared Input with type=number turns an empty box into 0.
// It reports a number only when the text is one, and an empty box goes back to the last value on blur.
function Num({ value, onChange, ...props }) {
  const [text, setText] = useState(String(value ?? ''))
  useEffect(() => {
    setText((t) => (t.trim() !== '' && Number(t) === value ? t : String(value ?? '')))
  }, [value])
  return (
    <input
      className="pc-input"
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value))
      }}
      onBlur={() => setText(String(value ?? ''))}
      {...props}
    />
  )
}

// a time span as a number and a unit, as the portal asks for TTL and lock duration
const UNITS = [['Days', DAY], ['Hours', 60 * MIN], ['Minutes', MIN], ['Seconds', SEC]]
function Duration({ label, value, onChange, units = UNITS }) {
  const start = units.find(([, size]) => value >= size && value % size === 0) ?? units.at(-1)
  const [unit, setUnit] = useState(start[0])
  const size = units.find(([u]) => u === unit)[1]
  return (
    <Row label={label} group>
      <Num min="1" aria-label={`${label} value`} value={Math.round((value / size) * 1000) / 1000} onChange={(n) => onChange(Math.round(n * size))} style={{ maxWidth: 120 }} />
      <Select aria-label={`${label} unit`} value={unit} onChange={setUnit} options={units.map(([u]) => u)} />
    </Row>
  )
}

// ---------- the page ----------

const NS_MENU = ['Overview', 'Activity log', { title: 'Settings' }, 'Shared access policies', 'Properties', { title: 'Entities' }, 'Queues', 'Topics']

export default function ServiceBus({ state, update }) {
  const list = namespacesOf(state)
  const [name, setName] = useState(list.length === 1 ? list[0].name : null)
  const [blade, setBlade] = useState('Overview')
  const [path, setPath] = useState(null) // an entity path: a queue, a topic, or topic/subscriptions/name
  const ns = list.find((n) => n.name === name)
  // a save from while the engine was a placeholder has only { created }: fill in the namespace of the lab
  const placeholder = Boolean(state.serviceBus && !state.serviceBus.namespaces)
  useEffect(() => {
    if (placeholder) update((s) => upgradeServiceBus({ ...s, serviceBus: { ...s.serviceBus } }))
  }, [placeholder, update])
  useEffect(() => {
    if (ns) update((s) => mark(s, `sb:${ns.name}`))
  }, [ns?.name, update]) // eslint-disable-line react-hooks/exhaustive-deps
  const home = () => { setName(null); setPath(null) }
  const pick = (b) => { setBlade(b); setPath(null) }
  if (!ns)
    return (
      <Shell crumbs={[['Home', home], ['Service Bus']]}>
        <div className="sy-az-page">
          <h2 className="sy-az-h2">Service Bus</h2>
          <Cmd>
            <CBtn icon="+" disabled title="Not part of the lab">
              Create
            </CBtn>
          </Cmd>
          <Grid
            heads={['Name', 'Status', 'Pricing tier', 'Resource group', 'Location']}
            empty="No Service Bus namespaces in this lab. The labs that use Service Bus add one."
            rows={list.map((n) => (
              <tr key={n.name}>
                <td>
                  <button type="button" className="sy-az-link" onClick={() => setName(n.name)}>
                    {n.name}
                  </button>
                </td>
                <td>Active</td>
                <td>{n.tier}</td>
                <td>{n.resourceGroup}</td>
                <td>{n.location}</td>
              </tr>
            ))}
          />
        </div>
      </Shell>
    )
  const r = path && resolve(ns, path)
  const crumbs = [['Home', home], ['Service Bus', home], [ns.name, () => pick('Overview')]]
  if (r) {
    crumbs.push([blade, () => setPath(null)])
    if (r.kind === 'subscription') crumbs.push([r.topic.name, () => setPath(r.topic.name)])
    crumbs.push([r.entity.name])
  } else crumbs.push([blade])
  return (
    <Shell crumbs={crumbs}>
      {r ? (
        <Entity key={r.path} state={state} update={update} ns={ns} r={r} open={setPath} />
      ) : (
        <Resource icon="⇄" name={ns.name} kind="Service Bus Namespace" menu={NS_MENU} blade={blade} onBlade={pick}>
          {blade === 'Overview' && <NsOverview ns={ns} open={(p, b) => { setBlade(b); setPath(p) }} />}
          {blade === 'Activity log' && <ActivityLog log={ns.log} />}
          {blade === 'Shared access policies' && <Policies state={state} update={update} ns={ns} />}
          {blade === 'Properties' && <NsProperties ns={ns} />}
          {blade === 'Queues' && <Queues state={state} update={update} ns={ns} open={setPath} />}
          {blade === 'Topics' && <Topics state={state} update={update} ns={ns} open={setPath} />}
        </Resource>
      )}
    </Shell>
  )
}

function NsOverview({ ns, open }) {
  const queues = Object.values(ns.queues)
  const topics = Object.values(ns.topics)
  const all = [...queues.map(countsOf), ...topics.map(topicCounts)]
  const sum = (k) => all.reduce((n, c) => n + c[k], 0)
  const req = ns.requests.slice().reverse().slice(0, 40)
  return (
    <>
      <Essentials
        items={[
          ['Resource group', ns.resourceGroup], ['Status', 'Active'], ['Location', ns.location], ['Subscription', ns.subscription], ['Host name', hostOf(ns.name)], ['Pricing tier', ns.tier],
          ['Created', azTime(ns.created)], ['Local Authentication', 'Enabled'],
        ]}
      />
      <div className="sy-az-tiles">
        <div>
          <b>{queues.length}</b> queues
        </div>
        <div>
          <b>{topics.length}</b> topics, {topics.reduce((n, t) => n + Object.keys(t.subscriptions).length, 0)} subscriptions
        </div>
        <div>
          <b>{sum('active')}</b> active messages
        </div>
        <div>
          <b className={sum('deadLetter') ? 'sb-bad' : ''}>{sum('deadLetter')}</b> dead-lettered messages
        </div>
      </div>
      <b className="sy-az-h3">Queues</b>
      <EntityRows ns={ns} list={queues} onOpen={(n) => open(n, 'Queues')} />
      <b className="sy-az-h3">Requests (lab)</b>
      <Grid
        heads={['Time', 'Operation', 'Entity', 'Caller', 'Result']}
        empty="No requests yet."
        rows={req.map((x, i) => (
          <tr key={i}>
            <td>{azTime(x.t)}</td>
            <td>{x.op}</td>
            <td className="pc-mono">{x.path}</td>
            <td>{x.who ?? ''}</td>
            <td className={x.ok ? 'sy-ok' : 'sy-bad'}>{x.ok ? 'Success' : x.reason}</td>
          </tr>
        ))}
      />
      <Info>The portal shows these as metrics: Incoming requests, Successful requests, User errors. The lab lists the last requests one by one.</Info>
    </>
  )
}
function ActivityLog({ log }) {
  return (
    <Grid
      heads={['Time', 'Operation name', 'Status', 'Event initiated by', 'Resource']}
      empty="No events yet."
      rows={log
        .slice()
        .reverse()
        .map((l, i) => (
          <tr key={i}>
            <td>{azTime(l.t)}</td>
            <td>{l.op}</td>
            <td className={l.ok ? 'sy-ok' : 'sy-bad'}>{l.ok ? 'Succeeded' : 'Failed'}</td>
            <td>{l.who}</td>
            <td className="pc-mono">{l.text}</td>
          </tr>
        ))}
    />
  )
}
function NsProperties({ ns }) {
  return (
    <Essentials
      items={[
        ['Name', ns.name], ['Pricing tier', ns.tier], ['Host name', hostOf(ns.name)], ['Service Bus endpoint', `https://${hostOf(ns.name)}:443/`], ['Location', ns.location], ['Resource group', ns.resourceGroup],
        ['Resource ID', `/subscriptions/lab/resourceGroups/${ns.resourceGroup}/providers/Microsoft.ServiceBus/namespaces/${ns.name}`], ['Minimum TLS version', '1.2'],
      ]}
    />
  )
}

// ---------- queues and topics ----------

function EntityRows({ list, onOpen, topic }) {
  return (
    <Grid
      heads={['Name', 'Status', topic ? 'Max delivery count' : 'Max size', 'Active messages', 'Dead-letter messages', 'Scheduled messages', 'Sessions']}
      empty={topic ? 'No subscriptions yet.' : 'No queues yet.'}
      rows={list.map((e) => {
        const c = countsOf(e)
        return (
          <tr key={e.name}>
            <td>
              <button type="button" className="sy-az-link" onClick={() => onOpen(e.name)}>
                {e.name}
              </button>
            </td>
            <td>{e.status}</td>
            <td>{topic ? e.maxDelivery : gb(e.maxSizeMb)}</td>
            <td>{c.active}</td>
            <td className={c.deadLetter ? 'sb-bad' : ''}>{c.deadLetter}</td>
            <td>{c.scheduled}</td>
            <td>{e.sessions ? 'Enabled' : 'Disabled'}</td>
          </tr>
        )
      })}
    />
  )
}

const blank = (kind) => ({ name: '', maxSizeMb: 1024, maxDelivery: 10, ttlMs: 14 * DAY, lockMs: 30 * SEC, dlOnExpire: false, sessions: false, dupDetect: false, dupWindowMs: 10 * MIN, sql: '', kind })

function Queues({ state, update, ns, open }) {
  const [form, setForm] = useState(null)
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setForm(blank('queue'))}>
          Queue
        </CBtn>
      </Cmd>
      <EntityRows list={Object.values(ns.queues)} onOpen={open} />
      {form && <CreatePane state={state} ns={ns} form={form} setForm={setForm} onCreate={(f) => update((s) => createQueue(s, ns.name, f))} />}
    </>
  )
}
function Topics({ state, update, ns, open }) {
  const [form, setForm] = useState(null)
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setForm(blank('topic'))}>
          Topic
        </CBtn>
      </Cmd>
      <Grid
        heads={['Name', 'Status', 'Max size', 'Subscriptions', 'Active messages', 'Dead-letter messages']}
        empty="No topics yet."
        rows={Object.values(ns.topics).map((t) => {
          const c = topicCounts(t)
          return (
            <tr key={t.name}>
              <td>
                <button type="button" className="sy-az-link" onClick={() => open(t.name)}>
                  {t.name}
                </button>
              </td>
              <td>{t.status}</td>
              <td>{gb(t.maxSizeMb)}</td>
              <td>{Object.keys(t.subscriptions).length}</td>
              <td>{c.active}</td>
              <td className={c.deadLetter ? 'sb-bad' : ''}>{c.deadLetter}</td>
            </tr>
          )
        })}
      />
      {form && <CreatePane state={state} ns={ns} form={form} setForm={setForm} onCreate={(f) => update((s) => createTopic(s, ns.name, f))} />}
    </>
  )
}

// The Create queue, Create topic and Create subscription panes
function CreatePane({ state, ns, form, setForm, onCreate, topic }) {
  const kind = form.kind
  const errors = form.tried ? entityErrors(state, ns.name, form, { kind, topic }) : []
  const sqlError = kind === 'subscription' && form.useFilter && form.tried ? filterError(form.sql) : null
  const set = (patch) => setForm({ ...form, ...patch })
  const title = { queue: 'Create queue', topic: 'Create topic', subscription: 'Create subscription' }[kind]
  return (
    <Pane
      title={title}
      sub={kind === 'subscription' ? `${ns.name}/${topic}` : `Service Bus Namespace ${ns.name}`}
      onClose={() => setForm(null)}
      foot={
        <ABtn
          primary
          onClick={() => {
            const f = { ...form, maxDelivery: Number(form.maxDelivery), maxSizeMb: Number(form.maxSizeMb), sql: form.useFilter ? form.sql : '' }
            if (entityErrors(state, ns.name, f, { kind, topic }).length || (f.sql && filterError(f.sql))) return set({ tried: true })
            onCreate(f)
            setForm(null)
          }}
        >
          Create
        </ABtn>
      }
    >
      <Row label="Name">
        <Input value={form.name} onChange={(v) => set({ name: v })} />
      </Row>
      {kind !== 'subscription' && (
        <Row label="Max size">
          <Select value={String(form.maxSizeMb)} onChange={(v) => set({ maxSizeMb: Number(v) })} options={SIZES_MB.map((mb) => [String(mb), gb(mb)])} />
        </Row>
      )}
      {kind !== 'topic' && (
        <Row label="Max delivery count">
          <Num min="1" max="2000" value={form.maxDelivery} onChange={(v) => set({ maxDelivery: v })} />
        </Row>
      )}
      <Duration label="Message time to live" value={form.ttlMs} onChange={(v) => set({ ttlMs: v })} />
      {kind !== 'topic' && <Duration label="Lock duration" value={form.lockMs} onChange={(v) => set({ lockMs: v })} units={UNITS.slice(2)} />}
      {kind !== 'subscription' && (
        <Check checked={form.dupDetect} onChange={(v) => set({ dupDetect: v })}>
          Enable duplicate detection
        </Check>
      )}
      {form.dupDetect && <Duration label="Duplicate detection window" value={form.dupWindowMs} onChange={(v) => set({ dupWindowMs: v })} />}
      {kind !== 'topic' && (
        <>
          <Check checked={form.dlOnExpire} onChange={(v) => set({ dlOnExpire: v })}>
            Enable dead lettering on message expiration
          </Check>
          <Check checked={form.sessions} onChange={(v) => set({ sessions: v })}>
            Enable sessions
          </Check>
        </>
      )}
      {kind === 'subscription' && (
        <>
          <Check checked={form.useFilter} onChange={(v) => set({ useFilter: v })}>
            Add a SQL filter (otherwise the $Default rule 1=1 takes every message)
          </Check>
          {form.useFilter && (
            <Row label="SQL filter">
              <textarea className="pc-input pc-mono" rows={3} value={form.sql} onChange={(e) => set({ sql: e.target.value })} placeholder="region = 'north' AND priority > 3" />
            </Row>
          )}
        </>
      )}
      <Info>Sessions{kind !== 'subscription' ? ', duplicate detection' : ''} and partitioning are set now and cannot be changed after the {kind} is created.</Info>
      <Errors list={[...errors, ...(sqlError ? [sqlError] : [])]} />
    </Pane>
  )
}

// ---------- an entity: queue, topic or subscription ----------

const QUEUE_MENU = ['Overview', 'Service Bus Explorer', { title: 'Settings' }, 'Shared access policies', 'Properties']
const TOPIC_MENU = ['Overview', 'Service Bus Explorer', { title: 'Entities' }, 'Subscriptions', { title: 'Settings' }, 'Shared access policies', 'Properties']
const SUB_MENU = ['Overview', 'Service Bus Explorer', { title: 'Settings' }, 'Properties', 'Rules']

function Entity({ state, update, ns, r, open }) {
  const [blade, setBlade] = useState('Overview')
  const seenKey = r.kind === 'subscription' ? r.path : r.entity.name
  useEffect(() => {
    update((s) => mark(s, `sb-entity:${seenKey}`))
  }, [seenKey, update])
  const kind = { queue: 'Service Bus Queue', topic: 'Service Bus Topic', subscription: 'Service Bus Subscription' }[r.kind]
  const menu = { queue: QUEUE_MENU, topic: TOPIC_MENU, subscription: SUB_MENU }[r.kind]
  return (
    <Resource icon={r.kind === 'topic' ? '⋔' : '▤'} name={r.entity.name} kind={kind} menu={menu} blade={blade} onBlade={setBlade}>
      {blade === 'Overview' && <EntityOverview update={update} ns={ns} r={r} />}
      {blade === 'Service Bus Explorer' && <Explorer state={state} update={update} ns={ns} r={r} seenKey={seenKey} />}
      {blade === 'Properties' && <Properties key={r.path} update={update} ns={ns} r={r} />}
      {blade === 'Subscriptions' && <Subscriptions state={state} update={update} ns={ns} t={r.entity} open={(name) => open(`${r.entity.name}/subscriptions/${name}`)} />}
      {blade === 'Rules' && <Rules update={update} ns={ns} r={r} />}
      {blade === 'Shared access policies' && <EntityPolicies state={state} update={update} ns={ns} r={r} />}
    </Resource>
  )
}

function EntityOverview({ update, ns, r }) {
  const e = r.entity
  const c = r.kind === 'topic' ? topicCounts(e) : countsOf(e)
  const [sure, setSure] = useState(false)
  return (
    <>
      <Cmd>
        <CBtn icon="🗑" onClick={() => setSure(true)}>
          Delete
        </CBtn>
      </Cmd>
      {sure && (
        <Info kind="warn">
          Delete {r.path} and every message in it? This cannot be undone.{' '}
          <ABtn primary onClick={() => update((s) => deleteEntity(s, ns.name, r.path))}>
            Delete
          </ABtn>{' '}
          <ABtn onClick={() => setSure(false)}>Cancel</ABtn>
        </Info>
      )}
      <Essentials
        items={[
          ['Status', e.status], ['Created', azTime(e.created)], ['Updated', azTime(e.updated)], ['URL', `https://${hostOf(ns.name)}/${r.path}`],
          ...(r.kind !== 'subscription' ? [['Max size', `${gb(e.maxSizeMb)} (${bytes(c.sizeBytes)} used)`]] : []),
          ...(r.kind !== 'topic' ? [['Lock duration', durationText(e.lockMs)], ['Max delivery count', String(e.maxDelivery)], ['Requires session', e.sessions ? 'Yes' : 'No']] : []),
          ['Message time to live', durationText(e.ttlMs)], ...(r.kind !== 'subscription' ? [['Duplicate detection', e.dupDetect ? `Enabled, ${durationText(e.dupWindowMs)} window` : 'Disabled']] : []),
          ...(r.kind !== 'topic' ? [['Dead lettering on expiration', e.dlOnExpire ? 'Enabled' : 'Disabled']] : []),
        ]}
      />
      <div className="sy-az-tiles sb-counts">
        <div>
          <b>{c.active}</b> Active
        </div>
        <div>
          <b>{c.scheduled}</b> Scheduled
        </div>
        <div>
          <b className={c.deadLetter ? 'sb-bad' : ''}>{c.deadLetter}</b> Dead-letter
        </div>
        <div>
          <b>{c.transfer}</b> Transfer
        </div>
        <div>
          <b>{c.transferDeadLetter}</b> Transfer dead-letter
        </div>
      </div>
      {r.kind === 'topic' && <Info>A topic keeps no messages of its own. Each subscription gets a copy of the messages its rules match, and the counts above are the sum of the subscriptions.</Info>}
      {c.deferred > 0 && <Info>{c.deferred} of the active messages are deferred. A receiver gets them only by their sequence number.</Info>}
    </>
  )
}

function Properties({ update, ns, r }) {
  const e = r.entity
  const start = { lockMs: e.lockMs, maxDelivery: e.maxDelivery, ttlMs: e.ttlMs, dlOnExpire: e.dlOnExpire, maxSizeMb: e.maxSizeMb, dupWindowMs: e.dupWindowMs, dupDetect: e.dupDetect }
  const [f, setF] = useState(start)
  const [saved, setSaved] = useState(false)
  const errors = entityErrors({ serviceBus: { namespaces: { [ns.name]: ns } } }, ns.name, { ...f, maxDelivery: Number(f.maxDelivery) }, { kind: r.kind, editing: true })
  const changed = JSON.stringify(f) !== JSON.stringify(start)
  const set = (patch) => (setF({ ...f, ...patch }), setSaved(false))
  return (
    <>
      <Cmd>
        <CBtn icon="💾" disabled={!changed || errors.length > 0} onClick={() => { update((s) => updateEntity(s, ns.name, r.path, { ...f, maxDelivery: Number(f.maxDelivery) })); setSaved(true) }}>
          Save changes
        </CBtn>
        <CBtn icon="↺" disabled={!changed} onClick={() => setF(start)}>
          Discard
        </CBtn>
      </Cmd>
      <div className="sy-az-form">
        {r.kind !== 'subscription' && (
          <Row label="Max size">
            <Select value={String(f.maxSizeMb)} onChange={(v) => set({ maxSizeMb: Number(v) })} options={SIZES_MB.map((mb) => [String(mb), gb(mb)])} />
          </Row>
        )}
        <Duration key={`ttl-${e.ttlMs}`} label="Message time to live" value={f.ttlMs} onChange={(v) => set({ ttlMs: v })} />
        {r.kind !== 'topic' && (
          <>
            <Duration key={`lock-${e.lockMs}`} label="Message lock duration" value={f.lockMs} onChange={(v) => set({ lockMs: v })} units={UNITS.slice(2)} />
            <Row label="Max delivery count">
              <Num min="1" max="2000" value={f.maxDelivery} onChange={(v) => set({ maxDelivery: v })} />
            </Row>
            <Check checked={f.dlOnExpire} onChange={(v) => set({ dlOnExpire: v })}>
              Enable dead lettering on message expiration
            </Check>
          </>
        )}
        {e.dupDetect && <Duration key={`dup-${e.dupWindowMs}`} label="Duplicate detection window" value={f.dupWindowMs} onChange={(v) => set({ dupWindowMs: v })} />}
        <Row label="Requires session" group>
          <span>{e.sessions ? 'Enabled' : 'Disabled'}</span>
          <span className="sy-az-dim">Set when the entity is created. It cannot be changed.</span>
        </Row>
        {r.kind !== 'subscription' && (
          <Row label="Duplicate detection" group>
            <span>{e.dupDetect ? 'Enabled' : 'Disabled'}</span>
            <span className="sy-az-dim">Set when the entity is created. It cannot be changed.</span>
          </Row>
        )}
        {r.kind !== 'topic' && <Info>The lock duration is from 5 seconds to {durationText(MAX_LOCK)}. A receiver that needs longer renews the lock.</Info>}
        <Errors list={errors} />
        {saved && !changed && <Info>The changes are saved.</Info>}
      </div>
    </>
  )
}

function Subscriptions({ state, update, ns, t, open }) {
  const [form, setForm] = useState(null)
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setForm(blank('subscription'))}>
          Subscription
        </CBtn>
      </Cmd>
      <EntityRows topic list={Object.values(t.subscriptions)} onOpen={open} />
      {form && <CreatePane state={state} ns={ns} topic={t.name} form={form} setForm={setForm} onCreate={(f) => update((s) => createSubscription(s, ns.name, t.name, f))} />}
    </>
  )
}

function Rules({ update, ns, r }) {
  const [edit, setEdit] = useState(null)
  const err = edit && filterError(edit.sql)
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setEdit({ name: '', sql: '', isNew: true })}>
          Add filter
        </CBtn>
      </Cmd>
      <Grid
        heads={['Name', 'Filter type', 'SQL filter', '']}
        empty="No rules. A subscription with no rule gets no messages."
        rows={r.entity.rules.map((x) => (
          <tr key={x.name}>
            <td>{x.name}</td>
            <td>SQL Filter</td>
            <td className="pc-mono">{x.sql}</td>
            <td className="sy-az-acts">
              <button type="button" className="sy-az-link" onClick={() => setEdit({ ...x })}>
                Edit
              </button>
              <button type="button" className="sy-az-link" onClick={() => update((s) => deleteRule(s, ns.name, r.path, x.name))}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      />
      <Info>A message is copied to the subscription when any of its rules matches. Names refer to application properties; sys.Label, sys.CorrelationId, sys.MessageId and sys.SessionId are system properties.</Info>
      {edit && (
        <Pane
          title={edit.isNew ? 'Add filter' : `Edit ${edit.name}`}
          sub={r.path}
          onClose={() => setEdit(null)}
          foot={
            <ABtn primary disabled={Boolean(err) || !edit.name.trim() || (edit.isNew && r.entity.rules.some((x) => x.name === edit.name.trim()))} onClick={() => { update((s) => setRule(s, ns.name, r.path, edit.name.trim(), edit.sql)); setEdit(null) }}>
              Save changes
            </ABtn>
          }
        >
          <Row label="Filter name">{edit.isNew ? <Input value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /> : <span>{edit.name}</span>}</Row>
          <Row label="SQL Filter">
            <textarea className="pc-input pc-mono" rows={4} value={edit.sql} onChange={(e) => setEdit({ ...edit, sql: e.target.value })} />
          </Row>
          {err && edit.sql && <Info kind="bad">{err}</Info>}
        </Pane>
      )}
    </>
  )
}

// ---------- Service Bus Explorer ----------

function Explorer({ state, update, ns, r, seenKey }) {
  const [tab, setTab] = useState('main')
  const [mode, setMode] = useState('peek')
  const [count, setCount] = useState(100)
  const [deleteMode, setDeleteMode] = useState(false)
  const [shown, setShown] = useState(null) // { kind: 'peek'|'receive', list }
  const [openMsg, setOpenMsg] = useState(null)
  const [picked, setPicked] = useState([])
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState(null)
  const dead = tab === 'dead'
  const label = r.kind === 'queue' ? 'Queue' : 'Subscription'
  useEffect(() => {
    if (dead) update((s) => mark(s, `sb-dlq:${seenKey}`))
  }, [dead, seenKey, update])
  const switchTab = (t) => { setTab(t); setShown(null); setPicked([]); setNote(null) }
  const peek = () => { setShown({ kind: 'peek', list: peekMessages(state, ns.name, r.path, { dead, max: Math.max(1, Math.min(100, count)) }) }); setPicked([]); setNote(null) }
  const receive = () => {
    const out = explorerReceive(state, ns.name, r.path, { dead, mode: deleteMode ? 'ReceiveAndDelete' : 'PeekLock', max: Math.max(1, Math.min(100, count)) })
    const got = out.result
    update(() => out.state)
    if (got && !got.ok) setNote({ kind: 'bad', text: got.text })
    else setNote(got && !got.messages.length ? { kind: 'info', text: 'No messages to receive.' } : null)
    setShown({ kind: 'receive', list: got?.messages ?? [], deleted: deleteMode })
  }
  const live = (m) => (dead ? r.entity.dlq : r.entity.messages).find((x) => x.seq === m.seq)
  if (r.kind === 'topic')
    return (
      <>
        <Cmd>
          <CBtn icon="✉" onClick={() => setSending(true)}>
            Send messages
          </CBtn>
        </Cmd>
        <Info>Messages are sent to a topic and received from its subscriptions. Open a subscription to peek or receive.</Info>
        {note && <Info kind={note.kind}>{note.text}</Info>}
        {sending && <SendPane state={state} update={update} ns={ns} r={r} onClose={() => setSending(false)} onDone={setNote} />}
      </>
    )
  const c = countsOf(r.entity)
  return (
    <>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!dead} className={!dead ? 'on' : ''} onClick={() => switchTab('main')}>
          {label} ({c.active})
        </button>
        <button type="button" role="tab" aria-selected={dead} className={dead ? 'on' : ''} onClick={() => switchTab('dead')}>
          Dead-letter ({c.deadLetter})
        </button>
      </div>
      <Cmd>
        <div className="sb-mode" role="radiogroup" aria-label="Mode">
          <label>
            <input type="radio" name="sb-mode" checked={mode === 'peek'} onChange={() => setMode('peek')} /> Peek Mode
          </label>
          <label>
            <input type="radio" name="sb-mode" checked={mode === 'receive'} onChange={() => setMode('receive')} /> Receive Mode
          </label>
        </div>
        {mode === 'peek' ? (
          <CBtn icon="👁" onClick={peek}>
            Peek from start
          </CBtn>
        ) : (
          <CBtn icon="⇩" onClick={receive}>
            Receive messages
          </CBtn>
        )}
        <label className="sb-count">
          Messages <Num min="1" max="100" value={count} onChange={setCount} />
        </label>
        {mode === 'receive' && (
          <Check checked={deleteMode} onChange={setDeleteMode}>
            ReceiveAndDelete
          </Check>
        )}
        {!dead && r.kind === 'queue' && (
          <CBtn icon="✉" onClick={() => setSending(true)}>
            Send messages
          </CBtn>
        )}
        {dead && (
          <>
            <CBtn
              icon="↻"
              disabled={!picked.length}
              onClick={() => {
                const out = resendDeadLetters(state, ns.name, r.path, picked)
                const res = out.result
                update(() => out.state)
                setNote(res?.ok ? { kind: 'info', text: `${res.sent} message${res.sent === 1 ? '' : 's'} re-sent to ${r.path}${res.duplicates ? `. ${res.duplicates} dropped by duplicate detection` : ''}.` } : { kind: 'bad', text: res?.text ?? 'Re-send failed.' })
                setShown(null)
                setPicked([])
              }}
            >
              Re-send selected messages
            </CBtn>
            <CBtn icon="🗑" disabled={!picked.length} onClick={() => { update((s) => purgeDeadLetters(s, ns.name, r.path, picked)); setShown(null); setPicked([]); setNote({ kind: 'info', text: `${picked.length} dead-lettered messages deleted.` }) }}>
              Delete selected
            </CBtn>
          </>
        )}
      </Cmd>
      {r.entity.sessions && !dead && <Info>This entity requires sessions. Receive mode accepts the next free session and gets its messages in order. A message without a SessionId is refused.</Info>}
      {note && <Info kind={note.kind}>{note.text}</Info>}
      {shown && (
        <Grid
          heads={[
            dead && shown.kind === 'peek' ? (
              <input type="checkbox" aria-label="Select all" checked={picked.length > 0 && picked.length === shown.list.length} onChange={(e) => setPicked(e.target.checked ? shown.list.map((m) => m.seq) : [])} />
            ) : (
              ''
            ),
            'Sequence number', 'Message ID', 'Enqueued time', 'Delivery count', 'Session ID', 'Subject', 'State', ...(dead ? ['Dead-letter reason'] : []),
          ]}
          empty={shown.kind === 'peek' ? 'No messages to peek.' : 'No messages received.'}
          rows={shown.list.map((m) => {
            const now = live(m)
            const state2 = shown.kind === 'receive' && !shown.deleted ? (now?.lockToken === m.lockToken ? 'Locked' : 'Settled or lock ended') : shown.deleted ? 'Received and deleted' : m.state
            return (
              <tr key={m.seq}>
                <td>{dead && shown.kind === 'peek' && <input type="checkbox" aria-label={`Select ${m.seq}`} checked={picked.includes(m.seq)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.seq] : picked.filter((x) => x !== m.seq))} />}</td>
                <td>
                  <button type="button" className="sy-az-link" onClick={() => setOpenMsg(m)}>
                    {m.seq}
                  </button>
                </td>
                <td className="pc-mono">{m.messageId}</td>
                <td>{azTime(m.enqueued)}</td>
                <td>{m.deliveryCount}</td>
                <td>{m.sessionId ?? ''}</td>
                <td>{m.subject ?? ''}</td>
                <td>{state2}</td>
                {dead && <td>{m.deadLetterReason}</td>}
              </tr>
            )
          })}
        />
      )}
      {!shown && <p className="sy-az-dim">Peek shows messages without locking them. Receive takes them: PeekLock locks each for the lock duration of {durationText(r.entity.lockMs)} until you settle it, ReceiveAndDelete removes them.</p>}
      {sending && <SendPane state={state} update={update} ns={ns} r={r} onClose={() => setSending(false)} onDone={setNote} />}
      {openMsg && (
        <MessagePane
          m={openMsg}
          dead={dead}
          locked={shown?.kind === 'receive' && !shown.deleted && live(openMsg)?.lockToken === openMsg.lockToken && (live(openMsg)?.lockedUntil ?? 0) > state.clock}
          onClose={() => setOpenMsg(null)}
          onSettle={(action, extra) => {
            const out = explorerSettle(state, ns.name, r.path, openMsg.lockToken, action, { dead, ...extra })
            const res = out.result
            update(() => out.state)
            setNote(res?.ok ? { kind: 'info', text: `Message ${openMsg.seq}: ${action === 'deadLetter' ? 'dead-lettered' : { complete: 'completed', abandon: 'abandoned', defer: 'deferred' }[action]}.` } : { kind: 'bad', text: res?.text ?? 'Failed.' })
            setOpenMsg(null)
          }}
        />
      )}
    </>
  )
}

function MessagePane({ m, dead, locked, onClose, onSettle }) {
  const [dl, setDl] = useState(null)
  const props = Object.entries(m.properties ?? {})
  let body = m.body
  try {
    if (/json/i.test(m.contentType ?? '')) body = JSON.stringify(JSON.parse(m.body), null, 2)
  } catch {
    // shown as it is
  }
  return (
    <Pane
      title={`Message ${m.seq}`}
      sub={m.messageId}
      onClose={onClose}
      foot={
        locked && (
          <>
            <ABtn primary onClick={() => onSettle('complete')}>
              Complete
            </ABtn>
            <ABtn onClick={() => onSettle('abandon')}>Abandon</ABtn>
            {!dead && <ABtn onClick={() => setDl({ reason: 'ManualDeadLetter', description: '' })}>Dead-letter</ABtn>}
            {!dead && <ABtn onClick={() => onSettle('defer')}>Defer</ABtn>}
          </>
        )
      }
    >
      <b className="sy-az-h3">Broker properties</b>
      <Essentials
        items={[
          ['SequenceNumber', String(m.seq)], ['MessageId', m.messageId], ['EnqueuedTimeUtc', azTime(m.enqueued)], ['DeliveryCount', String(m.deliveryCount)], ['SessionId', m.sessionId ?? ''], ['CorrelationId', m.correlationId ?? ''],
          ['ContentType', m.contentType ?? ''], ['Subject', m.subject ?? ''], ['State', m.state], ['Size', bytes(String(m.body).length)],
          ...(m.lockToken ? [['LockToken', m.lockToken], ['LockedUntilUtc', azTime(m.lockedUntil)]] : []),
          ...(m.scheduledFor ? [['ScheduledEnqueueTimeUtc', azTime(m.scheduledFor)]] : []),
          ...(dead ? [['DeadLetterReason', m.deadLetterReason], ['DeadLetterErrorDescription', m.deadLetterErrorDescription || ''], ['DeadLetterSource', m.deadLetterSource ?? '']] : []),
        ]}
      />
      <b className="sy-az-h3">Custom properties</b>
      {props.length ? (
        <Grid heads={['Key', 'Value']} rows={props.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="pc-mono">{String(v)}</td>
          </tr>
        ))} />
      ) : (
        <p className="sy-az-dim">None.</p>
      )}
      <b className="sy-az-h3">Body</b>
      <pre className="sy-az-pre">{body}</pre>
      {locked && <Info>The message is locked to Service Bus Explorer until {azTime(m.lockedUntil)}. Settle it, or the lock ends and it is delivered again.</Info>}
      {dl && (
        <div className="sy-az-props">
          <Row label="Dead-letter reason">
            <Input value={dl.reason} onChange={(v) => setDl({ ...dl, reason: v })} />
          </Row>
          <Row label="Description">
            <Input value={dl.description} onChange={(v) => setDl({ ...dl, description: v })} />
          </Row>
          <div>
            <ABtn primary onClick={() => onSettle('deadLetter', dl)}>
              Dead-letter
            </ABtn>
          </div>
        </div>
      )}
    </Pane>
  )
}

const TYPES = ['application/json', 'text/plain', 'application/xml']
function SendPane({ state, update, ns, r, onClose, onDone }) {
  const [f, setF] = useState({ contentType: 'application/json', body: '', messageId: '', sessionId: '', correlationId: '', subject: '', props: '', delayMin: 0, count: 1 })
  const [error, setError] = useState(null)
  const set = (patch) => setF({ ...f, ...patch })
  return (
    <Pane
      title="Send messages"
      sub={r.path}
      onClose={onClose}
      foot={
        <ABtn
          primary
          onClick={() => {
            const properties = {}
            for (const line of f.props.split('\n').map((x) => x.trim()).filter(Boolean)) {
              const at = line.indexOf('=')
              if (at < 1) return setError(`Custom property "${line}" is not key=value.`)
              const v = line.slice(at + 1).trim()
              properties[line.slice(0, at).trim()] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v
            }
            let res = null
            let sent = 0
            let next = state
            for (let i = 0; i < Math.max(1, Math.min(50, f.count)); i++) {
              const out = explorerSend(next, ns.name, r.path, {
                body: f.body, contentType: f.contentType, messageId: f.messageId && f.count > 1 ? `${f.messageId}-${i + 1}` : f.messageId, sessionId: f.sessionId, correlationId: f.correlationId || null, subject: f.subject || null, properties,
                scheduledEnqueueTime: f.delayMin > 0 ? state.clock + f.delayMin * MIN : undefined,
              })
              res = out.result
              next = out.state
              if (!res.ok) break
              sent++
            }
            if (sent) update(() => next)
            if (res && !res.ok) return setError(res.text)
            onDone({ kind: 'info', text: `${sent} message${sent === 1 ? '' : 's'} sent to ${r.path}${res?.duplicate ? '. Duplicate detection dropped it: the MessageId was seen inside the window' : ''}.` })
            onClose()
          }}
        >
          Send
        </ABtn>
      }
    >
      <Row label="Content type">
        <Select value={f.contentType} onChange={(v) => set({ contentType: v })} options={TYPES} />
      </Row>
      <Row label="Message body">
        <textarea className="pc-input pc-mono" rows={5} value={f.body} onChange={(e) => set({ body: e.target.value })} placeholder='{ "orderId": "O-5200" }' />
      </Row>
      <b className="sy-az-h3">Broker properties</b>
      <Row label="MessageId">
        <Input value={f.messageId} onChange={(v) => set({ messageId: v })} placeholder="A new GUID when empty" />
      </Row>
      <Row label="SessionId">
        <Input value={f.sessionId} onChange={(v) => set({ sessionId: v })} placeholder={r.entity.sessions ? 'Required: this entity requires sessions' : 'Optional'} />
      </Row>
      <Row label="CorrelationId">
        <Input value={f.correlationId} onChange={(v) => set({ correlationId: v })} />
      </Row>
      <Row label="Subject (Label)">
        <Input value={f.subject} onChange={(v) => set({ subject: v })} />
      </Row>
      <Row label="Custom properties">
        <textarea className="pc-input pc-mono" rows={3} value={f.props} onChange={(e) => set({ props: e.target.value })} placeholder={'eventType=OrderPlaced\nregion=north'} />
      </Row>
      <Row label="Schedule, minutes from now">
        <Num min="0" value={f.delayMin} onChange={(v) => set({ delayMin: v })} />
      </Row>
      <Row label="Repeat send">
        <Num min="1" max="50" value={f.count} onChange={(v) => set({ count: v })} />
      </Row>
      {error && <Info kind="bad">{error}</Info>}
    </Pane>
  )
}

// ---------- shared access policies ----------

function Policies({ state, update, ns }) {
  const [adding, setAdding] = useState(null)
  const [open, setOpen] = useState(null)
  const p = ns.policies.find((x) => x.name === open)
  const addErrors = adding?.tried ? policyErrors(state, ns.name, adding.name, adding.claims) : []
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setAdding({ name: '', claims: [] })}>
          Add
        </CBtn>
      </Cmd>
      <Grid
        heads={['Policy', 'Claims']}
        rows={ns.policies.map((x) => (
          <tr key={x.name}>
            <td>
              <button type="button" className="sy-az-link" onClick={() => setOpen(x.name)}>
                {x.name}
              </button>
            </td>
            <td>{x.claims.join(', ')}</td>
          </tr>
        ))}
      />
      <Info>A policy here works for every queue and topic of the namespace. Manage includes Send and Listen. Give each application the smallest claim it needs: a sender Send, a receiver Listen.</Info>
      {adding && (
        <Pane
          title="Add SAS Policy"
          sub={ns.name}
          onClose={() => setAdding(null)}
          foot={
            <ABtn primary onClick={() => { if (policyErrors(state, ns.name, adding.name, adding.claims).length) return setAdding({ ...adding, tried: true }); update((s) => addPolicy(s, ns.name, adding.name, adding.claims)); setAdding(null) }}>
              Create
            </ABtn>
          }
        >
          <Row label="Policy name">
            <Input value={adding.name} onChange={(v) => setAdding({ ...adding, name: v })} />
          </Row>
          <ClaimChecks claims={adding.claims} onChange={(claims) => setAdding({ ...adding, claims })} />
          <Errors list={addErrors} />
        </Pane>
      )}
      {p && <PolicyPane key={p.name} state={state} update={update} ns={ns} p={p} onClose={() => setOpen(null)} />}
    </>
  )
}
// The policies of one queue or topic: their keys work for this entity only, and the connection string has EntityPath
function EntityPolicies({ state, update, ns, r }) {
  const [adding, setAdding] = useState(null)
  const [open, setOpen] = useState(null)
  const list = entityPoliciesOf(r.entity)
  const p = list.find((x) => x.name === open)
  const addErrors = adding?.tried ? entityPolicyErrors(state, ns.name, r.path, adding.name, adding.claims) : []
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setAdding({ name: '', claims: [] })}>
          Add
        </CBtn>
      </Cmd>
      <Grid
        heads={['Policy', 'Claims']}
        empty={`No policies on ${r.entity.name} yet. The namespace policies also reach it.`}
        rows={list.map((x) => (
          <tr key={x.name}>
            <td>
              <button type="button" className="sy-az-link" onClick={() => setOpen(x.name)}>
                {x.name}
              </button>
            </td>
            <td>{x.claims.join(', ')}</td>
          </tr>
        ))}
      />
      <Info>A policy here works for {r.entity.name} only{r.kind === 'topic' ? ' and its subscriptions' : ''}, which makes it the narrowest key you can give an application. Its connection string ends with EntityPath={r.path}.</Info>
      {adding && (
        <Pane
          title="Add SAS Policy"
          sub={`${ns.name}/${r.path}`}
          onClose={() => setAdding(null)}
          foot={
            <ABtn primary onClick={() => { if (entityPolicyErrors(state, ns.name, r.path, adding.name, adding.claims).length) return setAdding({ ...adding, tried: true }); update((s) => addEntityPolicy(s, ns.name, r.path, adding.name, adding.claims)); setAdding(null) }}>
              Create
            </ABtn>
          }
        >
          <Row label="Policy name">
            <Input value={adding.name} onChange={(v) => setAdding({ ...adding, name: v })} />
          </Row>
          <ClaimChecks claims={adding.claims} onChange={(claims) => setAdding({ ...adding, claims })} />
          <Errors list={addErrors} />
        </Pane>
      )}
      {p && (
        <Pane
          key={p.name}
          title={`SAS Policy: ${p.name}`}
          sub={`${ns.name}/${r.path}`}
          onClose={() => setOpen(null)}
          foot={<ABtn onClick={() => { update((s) => removeEntityPolicy(s, ns.name, r.path, p.name)); setOpen(null) }}>Delete, apps with this key lose access</ABtn>}
        >
          <p>Claims: {p.claims.join(', ')}</p>
          {['primary', 'secondary'].map((which) => (
            <div key={which} className="sy-az-key">
              <div className="sy-az-keyhead">
                <b>{which === 'primary' ? 'Primary key' : 'Secondary key'}</b>
                <ABtn onClick={() => update((s) => regenerateEntityKey(s, ns.name, r.path, p.name, which))}>Regenerate {which} key</ABtn>
              </div>
              <span className="sy-az-dim">{which === 'primary' ? 'Primary' : 'Secondary'} connection string</span>
              <Masked value={entityConnectionString(state, ns.name, r.path, p.name, which)} />
            </div>
          ))}
        </Pane>
      )}
    </>
  )
}
function ClaimChecks({ claims, onChange, disabled }) {
  const toggle = (c, on) => {
    let next = on ? [...claims, c] : claims.filter((x) => x !== c)
    if (c === 'Manage' && on) next = [...new Set([...next, 'Send', 'Listen'])]
    if (c !== 'Manage' && !on) next = next.filter((x) => x !== 'Manage')
    onChange(CLAIMS.filter((x) => next.includes(x)))
  }
  return (
    <div className="sy-az-checks" role="group" aria-label="Claims">
      {CLAIMS.map((c) => (
        <Check key={c} checked={claims.includes(c)} disabled={disabled} onChange={(v) => toggle(c, v)}>
          {c}
        </Check>
      ))}
    </div>
  )
}
function PolicyPane({ state, update, ns, p, onClose }) {
  const [claims, setClaims] = useState(p.claims)
  const [sure, setSure] = useState(false)
  const keys = keysOf(ns.name, p)
  const root = p.name === 'RootManageSharedAccessKey'
  return (
    <Pane
      title={`SAS Policy: ${p.name}`}
      sub={ns.name}
      onClose={onClose}
      foot={
        !root && (
          <>
            <ABtn primary disabled={!claims.length || claims.join() === p.claims.join()} onClick={() => update((s) => setPolicyClaims(s, ns.name, p.name, claims))}>
              Save
            </ABtn>
            {!sure ? (
              <ABtn onClick={() => setSure(true)}>Delete</ABtn>
            ) : (
              <ABtn onClick={() => { update((s) => removePolicy(s, ns.name, p.name)); onClose() }}>Delete, apps with this key lose access</ABtn>
            )}
          </>
        )
      }
    >
      <ClaimChecks claims={claims} onChange={setClaims} disabled={root} />
      {['primary', 'secondary'].map((which) => (
        <div key={which} className="sy-az-key">
          <div className="sy-az-keyhead">
            <b>{which === 'primary' ? 'Primary key' : 'Secondary key'}</b>
            <ABtn onClick={() => update((s) => regenerateKey(s, ns.name, p.name, which))}>Regenerate {which} key</ABtn>
          </div>
          <Masked value={keys[which]} />
          <span className="sy-az-dim">{which === 'primary' ? 'Primary' : 'Secondary'} connection string</span>
          <Masked value={connectionString(state, ns.name, p.name, which)} />
        </div>
      ))}
      <Info>An application that has the old key gets 401 InvalidSignature after a regenerate. Rotate with the other key: move the apps to the secondary key, regenerate the primary, then move back.</Info>
    </Pane>
  )
}
