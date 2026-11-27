// AWS: an AWS Management Console style screen of the Harbor account in US East (Ohio). S3 keeps buckets, objects, Block
// Public Access, default encryption and bucket policies; SQS keeps queues with their redrive policy, Send and receive
// messages and Start DLQ redrive; SNS keeps topics, SQS subscriptions with filter policies and Publish message; IAM keeps
// users, access keys, roles, trust policies, policies and the Policy simulator; KMS keeps the key policies; CloudTrail
// lists the event history. A lab tool: the console user harbor-admin does everything.
import { useEffect, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import {
  ACCOUNT, arnBucket, arnQueue, arnRole, arnTopic, arnUser, ARN_ROOT, attachManaged, createAccessKey, createBucket, createQueue, createRole, createTopic, createUser, deleteAccessKey, deleteFromConsole, deleteObject,
  deletePolicy, detachManaged, editQueue, isFilled, MANAGED, pollFromConsole, policyDoc, publishFromConsole, purgeQueue, putPolicy, queueCounts, queueUrl, readJson, REGION, REGION_NAME,
  sendFromConsole, setAccessKeyStatus, setBlockPublicAccess, setBucketEncryption, setBucketPolicy, setKeyPolicy, setMaxSession, setQueuePolicy, setSubscription, setTrustPolicy, simulate, sourceOf, startRedrive,
  subscribe, unsubscribe, upgradeAws, uploadObject,
} from '../../lab/platform-aws.js'
import { Btn, Check, Copy, Errors, Field, Link, Radios, Select, Table, Tabs } from './parts.jsx'

const SERVICES = ['S3', 'SQS', 'SNS', 'IAM', 'KMS', 'CloudTrail']
const SEEN = { S3: 'aws:s3', SQS: 'aws:sqs', SNS: 'aws:sns', IAM: 'aws:iam', KMS: 'aws:kms', CloudTrail: 'aws:trail' }
const ACCOUNT_TEXT = `${ACCOUNT.slice(0, 4)}-${ACCOUNT.slice(4, 8)}-${ACCOUNT.slice(8)}`
const size = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)
const BPA = [
  ['acls', 'Block public access to buckets and objects granted through new access control lists (ACLs)'],
  ['ignoreAcls', 'Block public access to buckets and objects granted through any access control lists (ACLs)'],
  ['policy', 'Block public access to buckets and objects granted through new public bucket or access point policies'],
  ['restrict', 'Block public and cross-account access to buckets and objects through any public bucket or access point policies'],
]
const ENCRYPTIONS = [
  ['SSE-S3', 'Server-side encryption with Amazon S3 managed keys (SSE-S3)'],
  ['SSE-KMS', 'Server-side encryption with AWS Key Management Service keys (SSE-KMS)'],
]
const SESSIONS = [
  [3600, '1 hour'],
  [7200, '2 hours'],
  [14400, '4 hours'],
  [28800, '8 hours'],
  [43200, '12 hours'],
]

const Txt = ({ value, onChange, ...p }) => <input className="pc-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p} />
const Json = ({ value, onChange, label, rows = 14 }) => <textarea className="pc-input pc-mono aws-json" rows={rows} aria-label={label} spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} />
const Kv = ({ rows }) => (
  <dl className="aws-kv">
    {rows.map(([k, v]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </div>
    ))}
  </dl>
)
const Flash = ({ msg }) => (msg ? <p className={`aws-flash aws-${msg.type}`} role="status">{msg.text}</p> : null)
function Crumbs({ items }) {
  return (
    <nav className="aws-crumbs" aria-label="Breadcrumbs">
      {items.map(([label, go], i) => (
        <span key={i}>
          {go ? <Link onClick={go}>{label}</Link> : <b>{label}</b>}
          {i < items.length - 1 && ' > '}
        </span>
      ))}
    </nav>
  )
}
// runs `key` through mark once, when the view opens
function useSeen(update, ...keys) {
  const k = keys.filter(Boolean).join('|')
  useEffect(() => {
    if (k) update((s) => k.split('|').reduce(mark, s))
  }, [k]) // eslint-disable-line react-hooks/exhaustive-deps
}

export default function AwsConsole({ state, update, place }) {
  const y = state.aws
  const [svc, setSvc] = useState(SERVICES.includes(place?.service) ? place.service : 'S3')
  useEffect(() => {
    if (y && !isFilled(y)) update((s) => upgradeAws(s))
  }, [y, update])
  const filled = isFilled(y)
  useEffect(() => {
    if (filled) update((s) => mark(s, SEEN[svc]))
  }, [svc, filled]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!y)
    return (
      <main className="pc-main">
        <h2>AWS</h2>
        <p className="pc-empty pc-boxed">This lab has no AWS account.</p>
      </main>
    )
  if (!filled) return <main className="pc-main">Opening the AWS console...</main>

  // runs an action on the current state, saves its state and gives back its result
  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    return r.result ?? {}
  }
  const props = { y, state, update, act }
  return (
    <main className="pc-main aws-app">
      <header className="aws-bar">
        <b className="aws-logo">aws</b>
        <nav className="aws-services" aria-label="Services">
          {SERVICES.map((x) => (
            <button key={x} type="button" className={svc === x ? 'on' : ''} aria-current={svc === x ? 'page' : undefined} onClick={() => setSvc(x)}>
              {x}
            </button>
          ))}
        </nav>
        <span className="aws-region">
          {REGION_NAME} <small>{REGION}</small>
        </span>
        <span className="aws-acct">harbor-admin @ {ACCOUNT_TEXT}</span>
      </header>
      <div className="aws-page">
        {svc === 'S3' && <S3 key="s3" {...props} />}
        {svc === 'SQS' && <Sqs key="sqs" {...props} />}
        {svc === 'SNS' && <Sns key="sns" {...props} />}
        {svc === 'IAM' && <Iam key="iam" {...props} />}
        {svc === 'KMS' && <Kms key="kms" {...props} />}
        {svc === 'CloudTrail' && <Trail key="trail" {...props} />}
      </div>
    </main>
  )
}

// ---------- S3 ----------

function S3(props) {
  const { y } = props
  const [open, setOpen] = useState(null)
  const [creating, setCreating] = useState(false)
  if (creating) return <CreateBucket {...props} done={(name) => (setCreating(false), name && setOpen(name))} />
  if (open && y.buckets[open]) return <Bucket key={open} {...props} name={open} back={() => setOpen(null)} />
  const list = Object.values(y.buckets).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <section>
      <Crumbs items={[['Amazon S3'], ['Buckets']]} />
      <div className="aws-head">
        <h2>General purpose buckets ({list.length})</h2>
        <Btn kind="primary" onClick={() => setCreating(true)}>
          Create bucket
        </Btn>
      </div>
      <Table
        heads={['Name', 'AWS Region', 'Access', 'Creation date']}
        rows={list.map((b) => (
          <tr key={b.name}>
            <td>
              <Link onClick={() => setOpen(b.name)}>{b.name}</Link>
            </td>
            <td>
              {REGION_NAME} {b.region}
            </td>
            <td>{Object.values(b.bpa).every(Boolean) ? 'Bucket and objects not public' : 'Objects can be public'}</td>
            <td>{stamp(b.created)}</td>
          </tr>
        ))}
        empty="You don't have any buckets."
      />
    </section>
  )
}

function BpaChecks({ value, onChange }) {
  const all = BPA.every(([k]) => value[k])
  return (
    <div className="aws-bpa">
      <Check checked={all} onChange={(on) => onChange(Object.fromEntries(BPA.map(([k]) => [k, on])))}>
        <b>Block all public access</b>
      </Check>
      {BPA.map(([k, label]) => (
        <Check key={k} checked={value[k]} onChange={(on) => onChange({ ...value, [k]: on })}>
          {label}
        </Check>
      ))}
    </div>
  )
}
function EncryptionFields({ y, value, onChange }) {
  const keys = Object.values(y.keys)
  return (
    <>
      <Radios name="sse" value={value.type} onChange={(type) => onChange({ ...value, type, key: type === 'SSE-KMS' ? value.key || keys[0]?.alias || '' : '' })} options={ENCRYPTIONS} />
      {value.type === 'SSE-KMS' && (
        <Field label="AWS KMS key">
          <Select value={value.key} onChange={(key) => onChange({ ...value, key })} placeholder="Choose from your AWS KMS keys" options={keys.map((k) => [k.alias, `${k.alias} (${k.id})`])} />
        </Field>
      )}
    </>
  )
}

function CreateBucket({ y, act, done }) {
  const [name, setName] = useState('')
  const [bpa, setBpa] = useState({ acls: true, ignoreAcls: true, policy: true, restrict: true })
  const [enc, setEnc] = useState({ type: 'SSE-S3', key: '' })
  const [errors, setErrors] = useState([])
  const submit = () => {
    const r = act((s) => createBucket(s, { name, bpa, encryption: enc }))
    setErrors(r.errors ?? [])
    if (!r.errors) done(r.name)
  }
  return (
    <section>
      <Crumbs items={[['Amazon S3'], ['Buckets', () => done(null)], ['Create bucket']]} />
      <h2>Create bucket</h2>
      <div className="aws-card">
        <h3>General configuration</h3>
        <Field label="AWS Region">
          <Txt value={`${REGION_NAME} ${REGION}`} onChange={() => {}} readOnly />
        </Field>
        <Field label="Bucket name" hint="Bucket names must be unique and must not contain spaces or uppercase letters.">
          <Txt value={name} onChange={setName} placeholder="myawsbucket" />
        </Field>
      </div>
      <div className="aws-card">
        <h3>Block Public Access settings for this bucket</h3>
        <BpaChecks value={bpa} onChange={setBpa} />
      </div>
      <div className="aws-card">
        <h3>Default encryption</h3>
        <EncryptionFields y={y} value={enc} onChange={setEnc} />
      </div>
      <Errors list={errors} />
      <div className="pc-foot">
        <Btn onClick={() => done(null)}>Cancel</Btn>
        <Btn kind="primary" onClick={submit}>
          Create bucket
        </Btn>
      </div>
    </section>
  )
}

function Bucket({ y, update, act, name, back }) {
  const b = y.buckets[name]
  const [tab, setTab] = useState('Objects')
  useSeen(update, `aws:s3:${name}`, `aws:s3:${name}:${tab}`)
  return (
    <section>
      <Crumbs items={[['Amazon S3'], ['Buckets', back], [name]]} />
      <h2>{name}</h2>
      <Tabs tabs={['Objects', 'Properties', 'Permissions']} value={tab} onChange={setTab} />
      {tab === 'Objects' && <Objects b={b} act={act} />}
      {tab === 'Properties' && <BucketProps key={JSON.stringify(b.encryption)} y={y} b={b} act={act} />}
      {tab === 'Permissions' && <BucketPerms key={b.policy + JSON.stringify(b.bpa)} b={b} act={act} />}
    </section>
  )
}

function Objects({ b, act }) {
  const [open, setOpen] = useState(null)
  const [key, setKey] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState([])
  const list = Object.entries(b.objects).sort((m, n) => n[1].t - m[1].t)
  const o = open && b.objects[open]
  return (
    <>
      <Table
        heads={['Name', 'Last modified', 'Size', 'Encryption', 'Uploaded by', '']}
        rows={list.map(([k, x]) => (
          <tr key={k}>
            <td>
              <Link onClick={() => setOpen(k)}>{k}</Link>
            </td>
            <td>{stamp(x.t)}</td>
            <td>{size(x.size)}</td>
            <td>{x.sse === 'aws:kms' ? 'SSE-KMS' : 'SSE-S3'}</td>
            <td>{x.by}</td>
            <td>
              <Link onClick={() => act((s) => deleteObject(s, b.name, k))}>Delete</Link>
            </td>
          </tr>
        ))}
        empty="No objects. Upload a file to see it here."
      />
      {o && (
        <div className="aws-card">
          <h3>{open}</h3>
          <Kv rows={[['S3 URI', `s3://${b.name}/${open}`], ['Object URL', `https://${b.name}.s3.${b.region}.amazonaws.com/${open}`], ['ETag', o.etag], ['Server-side encryption', o.sse === 'aws:kms' ? `SSE-KMS (${o.kms})` : 'SSE-S3']]} />
          <pre className="pc-pre">{o.body}</pre>
        </div>
      )}
      <div className="aws-card">
        <h3>Upload</h3>
        <Field label="Key">
          <Txt value={key} onChange={setKey} placeholder="folder/file.json" />
        </Field>
        <Field label="Content">
          <textarea className="pc-input pc-mono" rows={3} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Content" />
        </Field>
        <Errors list={errors} />
        <Btn
          kind="primary"
          onClick={() => {
            const r = act((s) => uploadObject(s, b.name, key, body))
            setErrors(r.errors ?? [])
            if (!r.errors) setKey('')
          }}
        >
          Upload
        </Btn>
      </div>
    </>
  )
}

function BucketProps({ y, b, act }) {
  const [editing, setEditing] = useState(false)
  const [enc, setEnc] = useState(b.encryption)
  const [errors, setErrors] = useState([])
  return (
    <>
      <div className="aws-card">
        <h3>Bucket overview</h3>
        <Kv rows={[['AWS Region', `${REGION_NAME} ${b.region}`], ['Amazon Resource Name (ARN)', arnBucket(b.name)], ['Creation date', stamp(b.created)]]} />
      </div>
      <div className="aws-card">
        <div className="aws-head">
          <h3>Default encryption</h3>
          {!editing && <Btn onClick={() => setEditing(true)}>Edit</Btn>}
        </div>
        {editing ? (
          <>
            <EncryptionFields y={y} value={enc} onChange={setEnc} />
            <Errors list={errors} />
            <div className="pc-foot">
              <Btn onClick={() => setEditing(false)}>Cancel</Btn>
              <Btn
                kind="primary"
                onClick={() => {
                  const r = act((s) => setBucketEncryption(s, b.name, enc))
                  setErrors(r.errors ?? [])
                }}
              >
                Save changes
              </Btn>
            </div>
          </>
        ) : (
          <Kv rows={[['Encryption type', b.encryption.type === 'SSE-KMS' ? 'Server-side encryption with AWS Key Management Service keys (SSE-KMS)' : 'Server-side encryption with Amazon S3 managed keys (SSE-S3)'], ...(b.encryption.type === 'SSE-KMS' ? [['Encryption key', b.encryption.key]] : [])]} />
        )}
      </div>
    </>
  )
}

function BucketPerms({ b, act }) {
  const [editBpa, setEditBpa] = useState(false)
  const [bpa, setBpa] = useState(b.bpa)
  const [text, setText] = useState(b.policy)
  const [errors, setErrors] = useState([])
  const [msg, setMsg] = useState(null)
  return (
    <>
      <div className="aws-card">
        <div className="aws-head">
          <h3>Block public access (bucket settings)</h3>
          {!editBpa && <Btn onClick={() => setEditBpa(true)}>Edit</Btn>}
        </div>
        {editBpa ? (
          <>
            <BpaChecks value={bpa} onChange={setBpa} />
            <div className="pc-foot">
              <Btn onClick={() => setEditBpa(false)}>Cancel</Btn>
              <Btn kind="primary" onClick={() => act((s) => setBlockPublicAccess(s, b.name, bpa))}>
                Save changes
              </Btn>
            </div>
          </>
        ) : (
          <Kv rows={[['Block all public access', Object.values(b.bpa).every(Boolean) ? 'On' : 'Off'], ...BPA.map(([k, label]) => [label, b.bpa[k] ? 'On' : 'Off'])]} />
        )}
      </div>
      <div className="aws-card">
        <h3>Bucket policy</h3>
        <p className="pc-dim">
          The bucket policy, written in JSON, provides access to the objects stored in the bucket. Bucket ARN <code>{arnBucket(b.name)}</code>
        </p>
        <Json value={text} onChange={setText} label="Bucket policy" />
        <Errors list={errors} />
        <Flash msg={msg} />
        <div className="pc-foot">
          <Btn
            onClick={() => {
              const r = act((s) => setBucketPolicy(s, b.name, ''))
              setErrors(r.errors ?? [])
              setText('')
            }}
          >
            Delete
          </Btn>
          <Btn
            kind="primary"
            onClick={() => {
              const r = act((s) => setBucketPolicy(s, b.name, text))
              setErrors(r.errors ?? [])
              setMsg(r.errors ? null : { type: 'ok', text: 'Successfully edited bucket policy.' })
            }}
          >
            Save changes
          </Btn>
        </div>
      </div>
    </>
  )
}

// ---------- KMS ----------

function Kms({ y, update, act }) {
  const [open, setOpen] = useState(null)
  const k = open && y.keys[open]
  useSeen(update, k && `aws:kms:${k.alias}`)
  if (k) return <KeyPage key={k.id + k.policy} k={k} act={act} back={() => setOpen(null)} />
  const list = Object.values(y.keys)
  return (
    <section>
      <Crumbs items={[['Key Management Service (KMS)'], ['Customer managed keys']]} />
      <h2>Customer managed keys ({list.length})</h2>
      <Table
        heads={['Aliases', 'Key ID', 'Status', 'Key type']}
        rows={list.map((x) => (
          <tr key={x.id}>
            <td>
              <Link onClick={() => setOpen(x.id)}>{x.alias}</Link>
            </td>
            <td className="pc-mono">{x.id}</td>
            <td>{x.enabled ? 'Enabled' : 'Disabled'}</td>
            <td>Symmetric</td>
          </tr>
        ))}
        empty="No customer managed keys."
      />
    </section>
  )
}
function KeyPage({ k, act, back }) {
  const [text, setText] = useState(k.policy)
  const [errors, setErrors] = useState([])
  return (
    <section>
      <Crumbs items={[['KMS'], ['Customer managed keys', back], [k.id]]} />
      <h2>{k.alias}</h2>
      <div className="aws-card">
        <Kv rows={[['Alias', k.alias], ['ARN', k.arn], ['Status', k.enabled ? 'Enabled' : 'Disabled'], ['Creation date', stamp(k.created)]]} />
      </div>
      <div className="aws-card">
        <h3>Key policy</h3>
        <p className="pc-dim">The statement for {ARN_ROOT} lets IAM policies of the account grant use of this key.</p>
        <Json value={text} onChange={setText} label="Key policy" />
        <Errors list={errors} />
        <div className="pc-foot">
          <Btn
            kind="primary"
            onClick={() => {
              const r = act((s) => setKeyPolicy(s, k.id, text))
              setErrors(r.errors ?? [])
            }}
          >
            Save changes
          </Btn>
        </div>
      </div>
    </section>
  )
}

// ---------- SQS ----------

const sourcesOf = (y, name) => Object.values(y.queues).filter((q) => q.redrive?.dlq === name)
function Sqs(props) {
  const { y, state } = props
  const [open, setOpen] = useState(null)
  const [creating, setCreating] = useState(false)
  if (creating) return <QueueForm {...props} done={(name) => (setCreating(false), name && setOpen(name))} />
  if (open && y.queues[open]) return <Queue key={open} {...props} name={open} back={() => setOpen(null)} />
  const list = Object.values(y.queues).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <section>
      <Crumbs items={[['Amazon SQS'], ['Queues']]} />
      <div className="aws-head">
        <h2>Queues ({list.length})</h2>
        <Btn kind="primary" onClick={() => setCreating(true)}>
          Create queue
        </Btn>
      </div>
      <Table
        heads={['Name', 'Type', 'Created', 'Messages available', 'Messages in flight', 'Dead-letter queue']}
        rows={list.map((q) => {
          const c = queueCounts(q, state.clock)
          return (
            <tr key={q.name}>
              <td>
                <Link onClick={() => setOpen(q.name)}>{q.name}</Link>
              </td>
              <td>{q.fifo ? 'FIFO' : 'Standard'}</td>
              <td>{stamp(q.created)}</td>
              <td>{c.visible}</td>
              <td>{c.inFlight}</td>
              <td>{q.redrive ? `${q.redrive.dlq} (${q.redrive.max})` : sourcesOf(y, q.name).length ? 'Is a dead-letter queue' : 'None'}</td>
            </tr>
          )
        })}
        empty="No queues."
      />
    </section>
  )
}

const NumField = ({ label, value, onChange, hint }) => (
  <Field label={label} hint={hint}>
    <input className="pc-input" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
  </Field>
)
function QueueForm({ y, act, done, edit }) {
  const q = edit && y.queues[edit]
  const [f, setF] = useState(
    q
      ? { visibility: String(q.visibility), retention: String(q.retention), wait: String(q.wait), delay: String(q.delay), contentDedup: q.contentDedup, dlqOn: Boolean(q.redrive), dlq: q.redrive?.dlq ?? '', maxReceives: String(q.redrive?.max ?? 10) }
      : { fifo: false, name: '', visibility: '30', retention: '345600', wait: '0', delay: '0', contentDedup: false, dlqOn: false, dlq: '', maxReceives: '10' },
  )
  const [errors, setErrors] = useState([])
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const fifo = q ? q.fifo : f.fifo
  const dlqs = Object.values(y.queues).filter((x) => x.fifo === fifo && x.name !== (q?.name ?? f.name))
  const submit = () => {
    const form = { ...f, dlq: f.dlqOn ? f.dlq : '' }
    const r = act((s) => (q ? editQueue(s, q.name, form) : createQueue(s, form)))
    setErrors(r.errors ?? [])
    if (!r.errors) done(q ? q.name : r.name)
  }
  return (
    <section>
      <Crumbs items={[['Amazon SQS'], ['Queues', () => done(null)], [q ? `Edit ${q.name}` : 'Create queue']]} />
      <h2>{q ? `Edit ${q.name}` : 'Create queue'}</h2>
      {!q && (
        <div className="aws-card">
          <h3>Details</h3>
          <Radios
            name="qtype"
            value={f.fifo ? 'FIFO' : 'Standard'}
            onChange={(v) => set({ fifo: v === 'FIFO' })}
            options={[
              ['Standard', 'Standard', 'At-least-once delivery, message ordering is not preserved'],
              ['FIFO', 'FIFO', 'First-in-first-out delivery, message ordering is preserved'],
            ]}
          />
          <Field label="Name" hint={f.fifo ? 'The name of a FIFO queue must end with the .fifo suffix.' : 'A queue name is case-sensitive and can have up to 80 characters.'}>
            <Txt value={f.name} onChange={(name) => set({ name })} placeholder={f.fifo ? 'MyQueue.fifo' : 'MyQueue'} />
          </Field>
        </div>
      )}
      <div className="aws-card aws-grid">
        <h3>Configuration</h3>
        <NumField label="Visibility timeout (seconds)" value={f.visibility} onChange={(visibility) => set({ visibility })} hint="Should be between 0 seconds and 12 hours." />
        <NumField label="Message retention period (seconds)" value={f.retention} onChange={(retention) => set({ retention })} hint="Should be between 1 minute and 14 days." />
        <NumField label="Delivery delay (seconds)" value={f.delay} onChange={(delay) => set({ delay })} hint="Should be between 0 seconds and 15 minutes." />
        <NumField label="Receive message wait time (seconds)" value={f.wait} onChange={(wait) => set({ wait })} hint="Should be between 0 and 20 seconds." />
        {fifo && (
          <Check checked={f.contentDedup} onChange={(contentDedup) => set({ contentDedup })}>
            Content-based deduplication
          </Check>
        )}
      </div>
      <div className="aws-card aws-grid">
        <h3>Dead-letter queue</h3>
        <Radios
          name="dlq"
          value={f.dlqOn ? 'on' : 'off'}
          onChange={(v) => set({ dlqOn: v === 'on' })}
          options={[
            ['off', 'Disabled'],
            ['on', 'Enabled'],
          ]}
        />
        {f.dlqOn && (
          <>
            <Field label="Choose queue">
              <Select value={f.dlq} onChange={(dlq) => set({ dlq })} placeholder="Choose a queue" options={dlqs.map((x) => x.name)} />
            </Field>
            <NumField label="Maximum receives" value={f.maxReceives} onChange={(maxReceives) => set({ maxReceives })} hint="Should be between 1 and 1000." />
          </>
        )}
      </div>
      <Errors list={errors} />
      <div className="pc-foot">
        <Btn onClick={() => done(null)}>Cancel</Btn>
        <Btn kind="primary" onClick={submit}>
          {q ? 'Save' : 'Create queue'}
        </Btn>
      </div>
    </section>
  )
}

function Queue(props) {
  const { y, state, update, act, name, back } = props
  const q = y.queues[name]
  const [tab, setTab] = useState('Details')
  const [editing, setEditing] = useState(false)
  const [purging, setPurging] = useState(false)
  const [msg, setMsg] = useState(null)
  useSeen(update, `aws:sqs:${name}`)
  if (editing) return <QueueForm {...props} edit={name} done={() => setEditing(false)} />
  const c = queueCounts(q, state.clock)
  const sources = sourcesOf(y, name)
  return (
    <section>
      <Crumbs items={[['Amazon SQS'], ['Queues', back], [name]]} />
      <div className="aws-head">
        <h2>{name}</h2>
        <div className="aws-acts">
          <Btn onClick={() => setEditing(true)}>Edit</Btn>
          {purging ? (
            <>
              <Btn
                kind="danger"
                onClick={() => {
                  act((s) => purgeQueue(s, name))
                  setPurging(false)
                  setMsg({ type: 'ok', text: `Your purge request for ${name} was accepted.` })
                }}
              >
                Purge all messages
              </Btn>
              <Btn onClick={() => setPurging(false)}>Cancel</Btn>
            </>
          ) : (
            <Btn onClick={() => setPurging(true)}>Purge</Btn>
          )}
          {sources.length > 0 && (
            <Btn
              kind="primary"
              onClick={() => {
                const r = act((s) => startRedrive(s, name))
                setMsg(r.errors ? { type: 'bad', text: r.errors[0] } : { type: 'ok', text: `DLQ redrive started: ${r.moved} message${r.moved === 1 ? '' : 's'} moved to the source queue.` })
              }}
            >
              Start DLQ redrive
            </Btn>
          )}
        </div>
      </div>
      <Flash msg={msg} />
      <Tabs tabs={['Details', 'Monitoring', 'Send and receive messages', 'Access policy']} value={tab} onChange={setTab} />
      {tab === 'Details' && (
        <div className="aws-card">
          <Kv
            rows={[
              ['Name', name],
              ['Type', q.fifo ? 'FIFO' : 'Standard'],
              ['ARN', arnQueue(name)],
              ['URL', queueUrl(name)],
              ['Visibility timeout', `${q.visibility} seconds`],
              ['Message retention period', `${q.retention} seconds`],
              ['Delivery delay', `${q.delay} seconds`],
              ['Receive message wait time', `${q.wait} seconds`],
              ['Maximum message size', '256 KB'],
              ['Messages available', c.visible],
              ['Messages in flight (not available to other consumers)', c.inFlight],
              ['Messages delayed', c.delayed],
              ['Dead-letter queue', q.redrive ? `${q.redrive.dlq}, Maximum receives ${q.redrive.max}` : 'Disabled'],
              ...(sources.length ? [['Source queues (this is their dead-letter queue)', sources.map((x) => x.name).join(', ')]] : []),
              ...(q.lastRedrive ? [['Last DLQ redrive', `${stamp(q.lastRedrive.t)}, ${q.lastRedrive.moved} messages`]] : []),
            ]}
          />
        </div>
      )}
      {tab === 'Monitoring' && (
        <div className="aws-tiles">
          {[
            ['NumberOfMessagesSent', q.stats.sent],
            ['NumberOfMessagesReceived', q.stats.received],
            ['NumberOfMessagesDeleted', q.stats.deleted],
            ['NumberOfEmptyReceives', q.stats.empty],
            ['ApproximateNumberOfMessagesVisible', c.visible],
            ['ApproximateNumberOfMessagesNotVisible', c.inFlight],
            ['Moved to the dead-letter queue (lab count)', q.stats.moved],
          ].map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
          <p className="pc-dim">Totals since the queue was created. In CloudWatch these are metrics of the AWS/SQS namespace.</p>
        </div>
      )}
      {tab === 'Send and receive messages' && <SendReceive key={name} q={q} act={act} now={state.clock} />}
      {tab === 'Access policy' && <AccessPolicy key={q.policy} q={q} act={act} />}
    </section>
  )
}

function AttrRows({ rows, onChange, types = ['String', 'Number'] }) {
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="aws-attrs">
      {rows.map((r, i) => (
        <div key={i} className="aws-attr">
          <Select value={r.type} onChange={(type) => set(i, { type })} options={types} aria-label="Type" />
          <Txt value={r.name} onChange={(name) => set(i, { name })} placeholder="Name" aria-label="Name" />
          <Txt value={r.value} onChange={(value) => set(i, { value })} placeholder="Value" aria-label="Value" />
          <button type="button" className="pc-x" aria-label={`Remove ${r.name || 'attribute'}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>
            ×
          </button>
        </div>
      ))}
      <Btn onClick={() => onChange([...rows, { type: types[0], name: '', value: '' }])}>Add new attribute</Btn>
    </div>
  )
}

function SendReceive({ q, act, now }) {
  const [body, setBody] = useState('')
  const [group, setGroup] = useState('')
  const [dedup, setDedup] = useState('')
  const [attrs, setAttrs] = useState([])
  const [sent, setSent] = useState(null)
  const [errors, setErrors] = useState([])
  const [got, setGot] = useState([])
  const [polled, setPolled] = useState(false)
  const [pick, setPick] = useState([])
  const [open, setOpen] = useState(null)
  const send = () => {
    const map = Object.fromEntries(attrs.filter((a) => a.name.trim()).map((a) => [a.name.trim(), { DataType: a.type, StringValue: a.value }]))
    const r = act((s) => sendFromConsole(s, q.name, { body, attrs: map, group, dedup }))
    setErrors(r.errors ?? [])
    if (!r.errors) setSent(r)
  }
  const poll = () => {
    const r = act((s) => pollFromConsole(s, q.name, 10))
    setGot(r.messages ?? [])
    setPolled(true)
    setPick([])
    setOpen(null)
  }
  const m = got.find((x) => x.MessageId === open)
  return (
    <>
      <div className="aws-card">
        <h3>Send message</h3>
        <Field label="Message body">
          <textarea className="pc-input pc-mono" rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message body" />
        </Field>
        {q.fifo && (
          <div className="pc-pair">
            <Field label="Message group ID">
              <Txt value={group} onChange={setGroup} />
            </Field>
            <Field label="Message deduplication ID" hint={q.contentDedup ? 'Optional: content-based deduplication is on.' : 'Required for this queue.'}>
              <Txt value={dedup} onChange={setDedup} />
            </Field>
          </div>
        )}
        <h4>Message attributes</h4>
        <AttrRows rows={attrs} onChange={setAttrs} />
        <Errors list={errors} />
        {sent && <Flash msg={{ type: 'ok', text: sent.duplicate ? `Accepted, but a message with the same deduplication ID was sent in the last 5 minutes, so it was not added. Message ID: ${sent.id}` : `Your message has been sent and is ready to be received. Message ID: ${sent.id}` }} />}
        <div className="pc-foot">
          <Btn kind="primary" onClick={send}>
            Send message
          </Btn>
        </div>
      </div>
      <div className="aws-card">
        <div className="aws-head">
          <h3>Receive messages</h3>
          <div className="aws-acts">
            <Btn
              disabled={!pick.length}
              onClick={() => {
                act((s) => deleteFromConsole(s, q.name, got.filter((x) => pick.includes(x.MessageId)).map((x) => x.ReceiptHandle)))
                setGot(got.filter((x) => !pick.includes(x.MessageId)))
                setPick([])
              }}
            >
              Delete
            </Btn>
            <Btn kind="primary" onClick={poll}>
              Poll for messages
            </Btn>
          </div>
        </div>
        <p className="pc-dim">
          Messages available {queueCounts(q, now).visible}. Polling receives up to 10 messages: each receive counts toward the receive count, and the messages stay hidden from other consumers for {q.visibility} seconds.
        </p>
        {polled && (
          <Table
            heads={['', 'ID', 'Sent', 'Size', 'Receive count']}
            rows={got.map((x) => (
              <tr key={x.MessageId}>
                <td>
                  <input type="checkbox" aria-label={`Select ${x.MessageId}`} checked={pick.includes(x.MessageId)} onChange={(e) => setPick(e.target.checked ? [...pick, x.MessageId] : pick.filter((p) => p !== x.MessageId))} />
                </td>
                <td>
                  <Link onClick={() => setOpen(x.MessageId)}>{x.MessageId}</Link>
                </td>
                <td>{stamp(Number(x.Attributes.SentTimestamp))}</td>
                <td>{size(x.Body.length)}</td>
                <td>{x.Attributes.ApproximateReceiveCount}</td>
              </tr>
            ))}
            empty="No messages available. Messages in flight show again when their visibility timeout ends."
          />
        )}
        {m && (
          <div className="aws-msg">
            <h4>Message {m.MessageId}</h4>
            <b>Body</b>
            <pre className="pc-pre">{prettyBody(m.Body)}</pre>
            <b>Attributes</b>
            <pre className="pc-pre">{JSON.stringify(m.Attributes, null, 2)}</pre>
            {Object.keys(m.MessageAttributes ?? {}).length > 0 && (
              <>
                <b>Message attributes</b>
                <pre className="pc-pre">{JSON.stringify(m.MessageAttributes, null, 2)}</pre>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
const prettyBody = (text) => {
  const v = readJson(text)
  if (!v) return text
  if (typeof v.Message === 'string' && readJson(v.Message)) return JSON.stringify({ ...v, Message: v.Message }, null, 2)
  return JSON.stringify(v, null, 2)
}

function AccessPolicy({ q, act }) {
  const [text, setText] = useState(q.policy)
  const [errors, setErrors] = useState([])
  return (
    <div className="aws-card">
      <h3>Access policy</h3>
      <p className="pc-dim">Defines who can access the queue. Without a statement here, IAM policies of the account decide.</p>
      <Json value={text} onChange={setText} label="Access policy" />
      <Errors list={errors} />
      <div className="pc-foot">
        <Btn
          kind="primary"
          onClick={() => {
            const r = act((s) => setQueuePolicy(s, q.name, text))
            setErrors(r.errors ?? [])
          }}
        >
          Save
        </Btn>
      </div>
    </div>
  )
}

// ---------- SNS ----------

function Sns(props) {
  const { y, act } = props
  const [open, setOpen] = useState(null)
  const [name, setName] = useState('')
  const [errors, setErrors] = useState([])
  if (open && y.topics[open]) return <Topic key={open} {...props} name={open} back={() => setOpen(null)} />
  const list = Object.values(y.topics)
  return (
    <section>
      <Crumbs items={[['Amazon SNS'], ['Topics']]} />
      <h2>Topics ({list.length})</h2>
      <Table
        heads={['Name', 'Type', 'ARN', 'Subscriptions']}
        rows={list.map((t) => (
          <tr key={t.name}>
            <td>
              <Link onClick={() => setOpen(t.name)}>{t.name}</Link>
            </td>
            <td>Standard</td>
            <td className="pc-mono">{t.arn}</td>
            <td>{t.subs.length}</td>
          </tr>
        ))}
        empty="No topics."
      />
      <div className="aws-card aws-inline">
        <Field label="Create topic: Name">
          <Txt value={name} onChange={setName} placeholder="MyTopic" />
        </Field>
        <Btn
          kind="primary"
          onClick={() => {
            const r = act((s) => createTopic(s, name))
            setErrors(r.errors ?? [])
            if (!r.errors) setOpen(r.name)
          }}
        >
          Create topic
        </Btn>
        <Errors list={errors} />
      </div>
    </section>
  )
}

function Topic({ y, update, act, name, back }) {
  const t = y.topics[name]
  const [tab, setTab] = useState('Subscriptions')
  const [publishing, setPublishing] = useState(false)
  useSeen(update, `aws:sns:${name}`)
  return (
    <section>
      <Crumbs items={[['Amazon SNS'], ['Topics', back], [name]]} />
      <div className="aws-head">
        <h2>{name}</h2>
        <Btn kind="primary" onClick={() => setPublishing(!publishing)}>
          Publish message
        </Btn>
      </div>
      <div className="aws-card">
        <Kv rows={[['Name', name], ['ARN', t.arn], ['Type', 'Standard']]} />
      </div>
      {publishing && <Publish t={t} act={act} />}
      <Tabs tabs={['Subscriptions', 'Monitoring']} value={tab} onChange={setTab} />
      {tab === 'Subscriptions' && <Subs y={y} t={t} act={act} />}
      {tab === 'Monitoring' && (
        <>
          <div className="aws-tiles">
            {[
              ['NumberOfMessagesPublished', t.stats.published],
              ['NumberOfNotificationsDelivered', t.stats.delivered],
              ['NumberOfNotificationsFilteredOut', t.stats.filtered],
              ['NumberOfNotificationsFailed', t.subs.reduce((n, x) => n + x.stats.failed, 0)],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <b>{v}</b>
              </div>
            ))}
          </div>
          <Table
            heads={['Subscription endpoint', 'Delivered', 'Filtered out', 'Failed']}
            rows={t.subs.map((x) => (
              <tr key={x.id}>
                <td>{x.endpoint.split(':').at(-1)}</td>
                <td>{x.stats.delivered}</td>
                <td>{x.stats.filtered}</td>
                <td>{x.stats.failed}</td>
              </tr>
            ))}
          />
        </>
      )}
    </section>
  )
}

function Subs({ y, t, act }) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [queue, setQueue] = useState('')
  const [filter, setFilter] = useState('')
  const [raw, setRaw] = useState(false)
  const [errors, setErrors] = useState([])
  const startEdit = (x) => {
    setEditing(x.id)
    setCreating(false)
    setFilter(x.filter)
    setRaw(x.raw)
    setErrors([])
  }
  const save = () => {
    const r = act((s) => (editing ? setSubscription(s, t.name, editing, { filter, raw }) : subscribe(s, t.name, { queue, filter, raw })))
    setErrors(r.errors ?? [])
    if (!r.errors) {
      setEditing(null)
      setCreating(false)
    }
  }
  return (
    <>
      <Table
        heads={['ID', 'Endpoint', 'Status', 'Protocol', 'Filter policy', 'Raw message delivery', '']}
        rows={t.subs.map((x) => (
          <tr key={x.id}>
            <td className="pc-mono">{x.id.slice(0, 8)}</td>
            <td className="pc-mono">{x.endpoint}</td>
            <td>Confirmed</td>
            <td>SQS</td>
            <td>{x.filter ? <pre className="aws-filter">{x.filter}</pre> : 'None'}</td>
            <td>{x.raw ? 'Enabled' : 'Disabled'}</td>
            <td>
              <Link onClick={() => startEdit(x)}>Edit</Link> <Link onClick={() => act((s) => unsubscribe(s, t.name, x.id))}>Delete</Link>
            </td>
          </tr>
        ))}
        empty="No subscriptions."
      />
      {!creating && !editing && (
        <Btn
          onClick={() => {
            setCreating(true)
            setFilter('')
            setRaw(false)
            setErrors([])
          }}
        >
          Create subscription
        </Btn>
      )}
      {(creating || editing) && (
        <div className="aws-card">
          <h3>{editing ? 'Edit subscription' : 'Create subscription'}</h3>
          {!editing && (
            <div className="pc-pair">
              <Field label="Protocol">
                <Select value="sqs" onChange={() => {}} options={[['sqs', 'Amazon SQS']]} />
              </Field>
              <Field label="Endpoint">
                <Select value={queue} onChange={setQueue} placeholder="Choose an Amazon SQS queue" options={Object.keys(y.queues).map((n) => [n, arnQueue(n)])} />
              </Field>
            </div>
          )}
          <Check checked={raw} onChange={setRaw}>
            Enable raw message delivery
          </Check>
          <Field label="Subscription filter policy" hint="Filter policy scope: Message attributes. Leave it empty to receive every message.">
            <Json value={filter} onChange={setFilter} label="Subscription filter policy" rows={6} />
          </Field>
          <Errors list={errors} />
          <div className="pc-foot">
            <Btn
              onClick={() => {
                setEditing(null)
                setCreating(false)
              }}
            >
              Cancel
            </Btn>
            <Btn kind="primary" onClick={save}>
              {editing ? 'Save changes' : 'Create subscription'}
            </Btn>
          </div>
        </div>
      )}
    </>
  )
}

function Publish({ t, act }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attrs, setAttrs] = useState([])
  const [errors, setErrors] = useState([])
  const [msg, setMsg] = useState(null)
  return (
    <div className="aws-card">
      <h3>Publish message to {t.name}</h3>
      <Field label="Subject (optional)">
        <Txt value={subject} onChange={setSubject} />
      </Field>
      <Field label="Message body">
        <textarea className="pc-input pc-mono" rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message body" />
      </Field>
      <h4>Message attributes</h4>
      <AttrRows rows={attrs} onChange={setAttrs} types={['String', 'Number', 'String.Array']} />
      <Errors list={errors} />
      <Flash msg={msg} />
      <div className="pc-foot">
        <Btn
          kind="primary"
          onClick={() => {
            const r = act((s) => publishFromConsole(s, t.name, { message: body, subject, attrs }))
            setErrors(r.errors ?? [])
            setMsg(r.errors ? null : { type: 'ok', text: `Message ${r.id} published successfully. Delivered to: ${r.to.length ? r.to.join(', ') : 'no subscription (every filter policy dropped it)'}.` })
          }}
        >
          Publish message
        </Btn>
      </div>
    </div>
  )
}

// ---------- IAM ----------

function Iam(props) {
  const [view, setView] = useState(['Users'])
  const go = (...v) => setView(v)
  return (
    <section className="aws-iam">
      <nav className="aws-side" aria-label="Identity and Access Management">
        <b>Access management</b>
        {['Users', 'Roles', 'Policy simulator'].map((x) => (
          <button key={x} type="button" className={view[0] === x ? 'on' : ''} onClick={() => go(x)}>
            {x}
          </button>
        ))}
      </nav>
      <div className="aws-main">
        {view[0] === 'Users' && (view[1] && props.y.users[view[1]] ? <Holder key={view[1]} {...props} kind="user" name={view[1]} back={() => go('Users')} /> : <Users {...props} open={(n) => go('Users', n)} />)}
        {view[0] === 'Roles' && (view[1] && props.y.roles[view[1]] ? <Holder key={view[1]} {...props} kind="role" name={view[1]} back={() => go('Roles')} /> : <Roles {...props} open={(n) => go('Roles', n)} />)}
        {view[0] === 'Policy simulator' && <Simulator {...props} />}
      </div>
    </section>
  )
}

function Users({ y, state, act, open }) {
  const [name, setName] = useState('')
  const [errors, setErrors] = useState([])
  const list = Object.values(y.users)
  return (
    <>
      <Crumbs items={[['IAM'], ['Users']]} />
      <h2>Users ({list.length})</h2>
      <Table
        heads={['User name', 'Access keys', 'Permissions policies', 'Last activity', 'Creation time']}
        rows={list.map((u) => {
          const used = Math.max(...u.keys.map((k) => k.lastUsed ?? -Infinity))
          return (
            <tr key={u.name}>
              <td>
                <Link onClick={() => open(u.name)}>{u.name}</Link>
              </td>
              <td>{u.keys.length ? u.keys.map((k) => `${k.id.slice(-4)} ${k.status}`).join(', ') : 'None'}</td>
              <td>{[...Object.keys(u.policies), ...u.managed].join(', ') || 'None'}</td>
              <td>{Number.isFinite(used) ? `${Math.max(0, Math.round((state.clock - used) / 60000))} minutes ago` : 'Never'}</td>
              <td>{stamp(u.created)}</td>
            </tr>
          )
        })}
      />
      <div className="aws-card aws-inline">
        <Field label="Create user: User name">
          <Txt value={name} onChange={setName} placeholder="svc-my-app" />
        </Field>
        <Btn
          kind="primary"
          onClick={() => {
            const r = act((s) => createUser(s, name))
            setErrors(r.errors ?? [])
            if (!r.errors) open(r.name)
          }}
        >
          Create user
        </Btn>
        <Errors list={errors} />
      </div>
    </>
  )
}

const TRUST_TEMPLATE = policyDoc({ Effect: 'Allow', Principal: { AWS: ARN_ROOT }, Action: 'sts:AssumeRole' })
function Roles({ y, act, open }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [trust, setTrust] = useState(TRUST_TEMPLATE)
  const [max, setMax] = useState(3600)
  const [errors, setErrors] = useState([])
  const list = Object.values(y.roles)
  const trusted = (r) => (readJson(r.trust)?.Statement ?? []).flatMap((st) => [].concat(st.Principal?.AWS ?? st.Principal?.Service ?? [])).map((p) => (p === ARN_ROOT ? `Account ${ACCOUNT}` : p.split('/').at(-1)))
  return (
    <>
      <Crumbs items={[['IAM'], ['Roles']]} />
      <div className="aws-head">
        <h2>Roles ({list.length})</h2>
        <Btn kind="primary" onClick={() => setCreating(!creating)}>
          Create role
        </Btn>
      </div>
      {creating && (
        <div className="aws-card">
          <h3>Create role</h3>
          <Field label="Role name">
            <Txt value={name} onChange={setName} />
          </Field>
          <Field label="Trust policy (custom trust policy)">
            <Json value={trust} onChange={setTrust} label="Trust policy" rows={10} />
          </Field>
          <Field label="Maximum session duration">
            <Select value={max} onChange={(v) => setMax(Number(v))} options={SESSIONS} />
          </Field>
          <Errors list={errors} />
          <div className="pc-foot">
            <Btn onClick={() => setCreating(false)}>Cancel</Btn>
            <Btn
              kind="primary"
              onClick={() => {
                const r = act((s) => createRole(s, { name, trust, maxSession: max }))
                setErrors(r.errors ?? [])
                if (!r.errors) open(r.name)
              }}
            >
              Create role
            </Btn>
          </div>
        </div>
      )}
      <Table
        heads={['Role name', 'Trusted entities', 'Maximum session duration', 'Creation time']}
        rows={list.map((r) => (
          <tr key={r.name}>
            <td>
              <Link onClick={() => open(r.name)}>{r.name}</Link>
            </td>
            <td>{trusted(r).join(', ')}</td>
            <td>{r.maxSession / 3600} hour{r.maxSession === 3600 ? '' : 's'}</td>
            <td>{stamp(r.created)}</td>
          </tr>
        ))}
        empty="No roles."
      />
    </>
  )
}

// a user or a role: its permissions, and the keys of a user or the trust policy of a role
function Holder({ y, state, update, act, kind, name, back }) {
  const h = kind === 'role' ? y.roles[name] : y.users[name]
  const [tab, setTab] = useState('Permissions')
  useSeen(update, `aws:iam:${kind}:${name}`, `aws:iam:${kind}:${name}:${tab}`)
  const tabs = kind === 'role' ? ['Permissions', 'Trust relationships'] : ['Permissions', 'Security credentials']
  return (
    <>
      <Crumbs items={[['IAM'], [kind === 'role' ? 'Roles' : 'Users', back], [name]]} />
      <h2>{name}</h2>
      <div className="aws-card">
        <Kv rows={[['ARN', h.arn], ['Created', stamp(h.created)], ...(kind === 'role' ? [['Maximum session duration', <MaxSession key={h.maxSession} h={h} act={act} />]] : [])]} />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'Permissions' && <Permissions h={h} kind={kind} act={act} />}
      {tab === 'Security credentials' && <Keys u={h} act={act} now={state.clock} />}
      {tab === 'Trust relationships' && <Trust key={h.trust} r={h} act={act} />}
    </>
  )
}
function MaxSession({ h, act }) {
  const [v, setV] = useState(h.maxSession)
  return (
    <span className="aws-inline">
      <Select value={v} onChange={(x) => setV(Number(x))} options={SESSIONS} aria-label="Maximum session duration" />
      {v !== h.maxSession && <Btn onClick={() => act((s) => setMaxSession(s, h.name, v))}>Save changes</Btn>}
    </span>
  )
}

const POLICY_TEMPLATE = policyDoc({ Sid: 'Statement1', Effect: 'Allow', Action: [], Resource: [] })
function Permissions({ h, kind, act }) {
  const [mode, setMode] = useState(null) // 'attach' | 'inline' | policy name being edited
  const [pname, setPname] = useState('')
  const [text, setText] = useState('')
  const [managed, setManaged] = useState('')
  const [errors, setErrors] = useState([])
  const startInline = (n) => {
    setMode(n ? `edit:${n}` : 'inline')
    setPname(n ?? '')
    setText(n ? h.policies[n] : POLICY_TEMPLATE)
    setErrors([])
  }
  const save = () => {
    const r = act((s) => putPolicy(s, kind, h.name, pname, text))
    setErrors(r.errors ?? [])
    if (!r.errors) setMode(null)
  }
  return (
    <>
      <div className="aws-head">
        <h3>Permissions policies ({Object.keys(h.policies).length + h.managed.length})</h3>
        <div className="aws-acts">
          <Btn onClick={() => (setMode('attach'), setErrors([]))}>Attach policies directly</Btn>
          <Btn kind="primary" onClick={() => startInline(null)}>
            Create inline policy
          </Btn>
        </div>
      </div>
      <Table
        heads={['Policy name', 'Type', '']}
        rows={[
          ...Object.keys(h.policies).map((n) => (
            <tr key={`i:${n}`}>
              <td>{n}</td>
              <td>Customer inline</td>
              <td>
                <Link onClick={() => startInline(n)}>Edit</Link> <Link onClick={() => act((s) => deletePolicy(s, kind, h.name, n))}>Remove</Link>
              </td>
            </tr>
          )),
          ...h.managed.map((n) => (
            <tr key={`m:${n}`}>
              <td>{n}</td>
              <td>AWS managed</td>
              <td>
                <Link onClick={() => act((s) => detachManaged(s, kind, h.name, n))}>Remove</Link>
              </td>
            </tr>
          )),
        ]}
        empty="No permissions policies."
      />
      {mode === 'attach' && (
        <div className="aws-card aws-inline">
          <Field label="AWS managed policy">
            <Select value={managed} onChange={setManaged} placeholder="Choose a policy" options={Object.keys(MANAGED)} />
          </Field>
          <Btn
            kind="primary"
            onClick={() => {
              const r = act((s) => attachManaged(s, kind, h.name, managed))
              setErrors(r.errors ?? [])
              if (!r.errors) setMode(null)
            }}
          >
            Add permissions
          </Btn>
          <Btn onClick={() => setMode(null)}>Cancel</Btn>
          {managed && <pre className="pc-pre aws-wide">{MANAGED[managed]}</pre>}
        </div>
      )}
      {(mode === 'inline' || mode?.startsWith('edit:')) && (
        <div className="aws-card">
          <h3>{mode === 'inline' ? 'Create inline policy' : `Edit ${pname}`}</h3>
          <p className="pc-dim">Policy editor, JSON. Each statement has Effect, Action and Resource, and may have a Condition.</p>
          {mode === 'inline' && (
            <Field label="Policy name">
              <Txt value={pname} onChange={setPname} />
            </Field>
          )}
          <Json value={text} onChange={setText} label="Policy editor" />
          <Errors list={errors} />
          <div className="pc-foot">
            <Btn onClick={() => setMode(null)}>Cancel</Btn>
            <Btn kind="primary" onClick={save}>
              {mode === 'inline' ? 'Create policy' : 'Save changes'}
            </Btn>
          </div>
        </div>
      )}
    </>
  )
}

function Keys({ u, act, now }) {
  const [made, setMade] = useState(null)
  const [errors, setErrors] = useState([])
  return (
    <>
      <div className="aws-head">
        <h3>Access keys ({u.keys.length})</h3>
        <Btn
          kind="primary"
          onClick={() => {
            const r = act((s) => createAccessKey(s, u.name))
            setErrors(r.errors ?? [])
            setMade(r.errors ? null : r)
          }}
        >
          Create access key
        </Btn>
      </div>
      <p className="pc-dim">Use access keys to send programmatic calls to AWS. A user can have two access keys at a time.</p>
      <Errors list={errors} />
      {made && (
        <div className="aws-flash aws-ok aws-key" role="status">
          <b>Access key created. This is the only time that the secret access key can be viewed or downloaded. You cannot recover it later.</b>
          <span>
            Access key <code>{made.id}</code> <Copy text={made.id} />
          </span>
          <span>
            Secret access key <code>{made.secret}</code> <Copy text={made.secret} />
          </span>
        </div>
      )}
      <Table
        heads={['Access key ID', 'Status', 'Created', 'Last used', '']}
        rows={u.keys.map((k) => (
          <tr key={k.id}>
            <td className="pc-mono">{k.id}</td>
            <td>{k.status}</td>
            <td>{stamp(k.created)}</td>
            <td>{k.lastUsed === null ? 'Never' : `${Math.max(0, Math.round((now - k.lastUsed) / 60000))} minutes ago`}</td>
            <td>
              <Link onClick={() => act((s) => setAccessKeyStatus(s, u.name, k.id, k.status === 'Active' ? 'Inactive' : 'Active'))}>{k.status === 'Active' ? 'Deactivate' : 'Activate'}</Link>{' '}
              <Link
                onClick={() => {
                  const r = act((s) => deleteAccessKey(s, u.name, k.id))
                  setErrors(r.errors ?? [])
                }}
              >
                Delete
              </Link>
            </td>
          </tr>
        ))}
        empty="No access keys."
      />
    </>
  )
}

function Trust({ r, act }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(r.trust)
  const [errors, setErrors] = useState([])
  return (
    <div className="aws-card">
      <div className="aws-head">
        <h3>Trusted entities</h3>
        {!editing && <Btn onClick={() => setEditing(true)}>Edit trust policy</Btn>}
      </div>
      <p className="pc-dim">Entities that can assume this role under specified conditions.</p>
      {editing ? (
        <>
          <Json value={text} onChange={setText} label="Trust policy" rows={12} />
          <Errors list={errors} />
          <div className="pc-foot">
            <Btn onClick={() => setEditing(false)}>Cancel</Btn>
            <Btn
              kind="primary"
              onClick={() => {
                const x = act((s) => setTrustPolicy(s, r.name, text))
                setErrors(x.errors ?? [])
              }}
            >
              Update policy
            </Btn>
          </div>
        </>
      ) : (
        <pre className="pc-pre">{r.trust}</pre>
      )}
    </div>
  )
}

const DECISION = { allowed: 'allowed', explicitDeny: 'denied (explicit deny)', implicitDeny: 'denied (implicitly denied, no statement allows it)' }
function Simulator({ y, update }) {
  const principals = [...Object.keys(y.users).map((n) => [`user:${n}`, `User ${n}`]), ...Object.keys(y.roles).map((n) => [`role:${n}`, `Role ${n}`])]
  const [who, setWho] = useState(principals[0]?.[0] ?? '')
  const [action, setAction] = useState('s3:PutObject')
  const [resource, setResource] = useState('')
  const [result, setResult] = useState(null)
  const arns = [...Object.keys(y.buckets).flatMap((b) => [arnBucket(b), arnBucket(b, '*')]), ...Object.keys(y.queues).map(arnQueue), ...Object.keys(y.topics).map(arnTopic), ...Object.values(y.keys).map((k) => k.arn), ...Object.keys(y.roles).map(arnRole)]
  return (
    <>
      <Crumbs items={[['IAM'], ['Policy simulator']]} />
      <h2>IAM Policy Simulator</h2>
      <p className="pc-dim">Tests the policies of a user or role, with the bucket, queue, topic, key or trust policy of the resource, as AWS evaluates them: an explicit deny wins, then an allow, else the implicit deny.</p>
      <div className="aws-card aws-grid">
        <Field label="Users, groups and roles">
          <Select value={who} onChange={setWho} options={principals} />
        </Field>
        <Field label="Action" hint="For example s3:PutObject, sqs:ReceiveMessage, kms:GenerateDataKey, sts:AssumeRole.">
          <Txt value={action} onChange={setAction} />
        </Field>
        <Field label="Resource ARN">
          <Txt value={resource} onChange={setResource} list="aws-arns" placeholder="arn:aws:s3:::bucket/key" />
          <datalist id="aws-arns">
            {arns.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <div>
          <Btn
            kind="primary"
            onClick={() => {
              setResult(simulate(y, who, action, resource))
              update((s) => mark(s, 'aws:iam:simulator'))
            }}
          >
            Run simulation
          </Btn>
        </div>
      </div>
      {result && (
        <div className={`aws-flash ${result.decision === 'allowed' ? 'aws-ok' : 'aws-bad'}`} role="status">
          <b>
            {action} on {resource || '*'}: {DECISION[result.decision]}
          </b>
          {result.policy && (
            <span>
              Matched statement {result.sid || '(no Sid)'} in {result.policy}
            </span>
          )}
          {result.message && <span>{result.message}</span>}
        </div>
      )}
      <p className="pc-dim">
        ARNs of this account: user {arnUser('NAME')}, role {arnRole('NAME')}, bucket {arnBucket('NAME')}, queue {arnQueue('NAME')}.
      </p>
    </>
  )
}

// ---------- CloudTrail ----------

const LOOKUPS = [
  ['name', 'Event name'],
  ['user', 'User name'],
  ['res', 'Resource name'],
  ['src', 'Event source'],
  ['key', 'AWS access key'],
]
const record = (e) => ({
  eventVersion: '1.09',
  userIdentity: e.arn
    ? { type: e.arn.includes(':assumed-role/') ? 'AssumedRole' : 'IAMUser', arn: e.arn, accountId: ACCOUNT, ...(e.key && { accessKeyId: e.key }), ...(e.arn.includes(':user/') && { userName: e.user }) }
    : { type: 'Unknown', ...(e.key && { accessKeyId: e.key }) },
  eventTime: `${stamp(e.t).replace(' ', 'T')}Z`,
  eventSource: sourceOf(e.src),
  eventName: e.name,
  awsRegion: REGION,
  sourceIPAddress: e.ip,
  userAgent: e.app ? `aws-sdk-java/2.x Mule app ${e.app}` : e.user === 'harbor-admin' ? 'AWS Internal (console)' : 'aws-cli/2.x',
  requestParameters: { resource: e.res },
  ...(e.code ? { errorCode: e.code, errorMessage: e.msg } : { responseElements: e.msg ? { detail: e.msg } : null }),
  eventID: e.id,
  readOnly: /^(Get|List|Head|Receive|Describe)/.test(e.name),
  eventType: ['s3', 'sqs', 'sns', 'kms'].includes(e.src) && !/^(Create|Put|Delete|Set|Start|Purge|Subscribe|Unsubscribe)/.test(e.name) ? 'AwsApiCall (data event)' : 'AwsApiCall',
  recipientAccountId: ACCOUNT,
})
function Trail({ y, update }) {
  const [by, setBy] = useState('name')
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(null)
  const v = value.trim().toLowerCase()
  const list = [...y.trail].reverse().filter((e) => !v || String(by === 'src' ? sourceOf(e.src) : e[by] ?? '').toLowerCase().includes(v))
  const e = open && y.trail.find((x) => x.id === open)
  useSeen(update, e && `aws:event:${e.name}`, e?.code && `aws:event:${e.code}`)
  return (
    <section>
      <Crumbs items={[['CloudTrail'], ['Event history']]} />
      <h2>Event history ({list.length})</h2>
      <p className="pc-dim">The last events of the trail harbor-trail, with S3 and SQS data events on. Lab-made: the history keeps the newest 60 events.</p>
      <div className="aws-card aws-inline">
        <Field label="Lookup attributes">
          <Select value={by} onChange={setBy} options={LOOKUPS} />
        </Field>
        <Field label="Enter a value">
          <Txt value={value} onChange={setValue} placeholder="For example AssumeRole" />
        </Field>
      </div>
      <Table
        heads={['Event name', 'Event time', 'User name', 'Event source', 'Resource name', 'Error code']}
        rows={list.map((x) => (
          <tr key={x.id} className={x.code ? 'aws-err' : ''}>
            <td>
              <Link onClick={() => setOpen(x.id)}>{x.name}</Link>
            </td>
            <td>{stamp(x.t)}</td>
            <td>{x.user || 'None'}</td>
            <td>{sourceOf(x.src)}</td>
            <td className="aws-res">{x.res}</td>
            <td>{x.code || 'None'}</td>
          </tr>
        ))}
        empty="No events match."
      />
      {e && (
        <div className="aws-card">
          <div className="aws-head">
            <h3>
              {e.name} at {stamp(e.t)}
            </h3>
            <Btn onClick={() => setOpen(null)}>Close</Btn>
          </div>
          <b>Event record</b>
          <pre className="pc-pre">{JSON.stringify(record(e), null, 2)}</pre>
        </div>
      )}
    </section>
  )
}
