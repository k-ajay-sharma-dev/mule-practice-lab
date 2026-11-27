// Anypoint Partner Manager: partners with their X12 identifiers and AS2 endpoints, message flows, tracking with the raw
// EDI of each transmission, document types with partner code lists, and certificates. The rules live in
// lab/platform-b2b.js.
import { useEffect, useState } from 'react'
import { dateText, mark, stamp } from '../../lab/platform.js'
import {
  ACK_CODES, addCode, AK4_ERRORS, AK5_ERRORS, CODE_LISTS, codeProblem, codesOf, createFlow, createPartner, daysLeft, deployFlow, deployProblems, DOC_TYPE_IDS, DOC_TYPES, flowOf, flowProblems, flowStatus, flowsOf, hostOf, importCert,
  ISA_QUALIFIERS, ISSUES, issuesOf, mdnOk, offeredOf, ORDER_UNITS, partnerOf, partnerProblems, partnersOf, prospectsOf, raiseIssue, removeCode, requestResend, requestResendFailed, requestTest, resendFailed, resendTx, searchTx, segmentsOf,
  certsOf, setEndpoint, setFlow, setUnitMap, slugOf, STATUSES, txById, undeployFlow,
} from '../../lab/platform-b2b.js'
import { Btn, Check, Errors, Field, Input, Link, Note, Select, SideNav, Table, Tabs } from './parts.jsx'

const VIEWS = ['Partners', 'Message flows', 'Tracking', 'Document types', 'Certificates']
const SEEN = { Partners: 'b2b:partners', Tracking: 'b2b:tracking', Certificates: 'b2b:certs' }
const nameOf = (b, id) => partnerOf(b, id)?.name ?? id

export default function PartnerManager({ state, update, place, go }) {
  const b = state.b2b
  const view = VIEWS.includes(place.view) ? place.view : 'Partners'
  useEffect(() => {
    if (b && SEEN[view]) update((s) => mark(s, SEEN[view]))
  }, [view, Boolean(b), update]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!b)
    return (
      <main className="pc-main">
        <h2>Partner Manager</h2>
        <p className="pc-empty pc-boxed">This lab has no B2B partners.</p>
      </main>
    )
  const props = { state, b, update, place, go }
  return (
    <>
      <SideNav items={[{ title: 'Partner Manager' }, ...VIEWS.map((v) => [v, v])]} value={view} onPick={(v) => go({ view: v })} />
      <main className="pc-main pm-main">
        {view === 'Partners' && (place.partner && partnerOf(b, place.partner) ? <PartnerPage key={place.partner} {...props} p={partnerOf(b, place.partner)} /> : <PartnerList {...props} />)}
        {view === 'Message flows' && (place.flow && flowOf(b, place.flow) ? <FlowPage key={place.flow} {...props} f={flowOf(b, place.flow)} /> : <FlowList {...props} />)}
        {view === 'Tracking' && (place.tx && txById(b, place.tx) ? <TxPage key={place.tx} {...props} tx={txById(b, place.tx)} /> : <Tracking {...props} />)}
        {view === 'Document types' && <DocTypes {...props} />}
        {view === 'Certificates' && <Certificates {...props} />}
      </main>
    </>
  )
}

const StatusTag = ({ value }) => <span className={`pm-tag pm-${String(value).toLowerCase().replace(/[^a-z]/g, '')}`}>{value}</span>
const Crumb = ({ go, view, label, name }) => (
  <p className="pc-dim">
    <Link onClick={() => go({ view })}>{label}</Link> / {name}
  </p>
)

// ---------- partners ----------

const EMPTY_PARTNER = { name: '', isaQual: '', isaId: '', gsId: '', contact: '' }
function PartnerList({ b, update, go }) {
  const [form, setForm] = useState(null)
  const errs = form ? partnerProblems(b, form) : []
  const [tried, setTried] = useState(false)
  const rows = partnersOf(b).map((p) => (
    <tr key={p.id}>
      <td>
        <Link onClick={() => go({ view: 'Partners', partner: p.id })}>{p.name}</Link>
      </td>
      <td>{p.role}</td>
      <td className="pm-mono">
        {p.isaQual} / {p.isaId}
      </td>
      <td className="pm-mono">{p.gsId}</td>
      <td className="pm-mono">{p.as2?.as2Id || 'Not set'}</td>
      <td>{p.host ? 'Host' : p.as2?.url ? 'AS2' : 'None'}{p.sftp ? ', SFTP' : ''}</td>
    </tr>
  ))
  const set = (k) => (v) => setForm({ ...form, [k]: v })
  return (
    <>
      <div className="pc-title">
        <h2>Partners</h2>
        {!form && (
          <Btn kind="primary" onClick={() => (setForm(EMPTY_PARTNER), setTried(false))}>
            New partner
          </Btn>
        )}
      </div>
      <p className="pc-dim">The host Harbor and its trading partners. A partner profile holds the X12 identifiers that its envelopes carry and the endpoints it sends and receives on.</p>
      {form && (
        <section className="pm-card">
          <h3>New partner</h3>
          <div className="pm-grid">
            <Field label="Name" required>
              <Input value={form.name} onChange={set('name')} aria-label="Name" />
            </Field>
            <Field label="ISA qualifier" required hint="ISA05 when it sends, ISA07 when it receives">
              <Select value={form.isaQual} onChange={set('isaQual')} placeholder="Pick a qualifier" options={Object.entries(ISA_QUALIFIERS).map(([k, v]) => [k, `${k} ${v}`])} aria-label="ISA qualifier" />
            </Field>
            <Field label="ISA ID" required hint="ISA06 or ISA08, up to 15 characters">
              <Input value={form.isaId} onChange={set('isaId')} aria-label="ISA ID" />
            </Field>
            <Field label="GS ID" required hint="GS02 or GS03, the application code">
              <Input value={form.gsId} onChange={set('gsId')} aria-label="GS ID" />
            </Field>
            <Field label="Contact">
              <Input value={form.contact} onChange={set('contact')} aria-label="Contact" />
            </Field>
          </div>
          {tried && <Errors list={errs} />}
          <div className="pm-actions">
            <Btn
              kind="primary"
              onClick={() => {
                setTried(true)
                if (errs.length) return
                update((s) => createPartner(s, form))
                go({ view: 'Partners', partner: slugOf(form.name) })
              }}
            >
              Create partner
            </Btn>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </section>
      )}
      <Table heads={['Name', 'Role', 'ISA qualifier / ID', 'GS ID', 'AS2 identifier', 'Endpoints']} rows={rows} />
    </>
  )
}

function PartnerPage({ b, update, go, p }) {
  const host = hostOf(b)
  const [ep, setEp] = useState(() => ({ as2Id: '', url: '', signCert: '', encCert: '', mdn: 'sync', mdnSigned: true, ...p.as2 }))
  const [issue, setIssue] = useState('')
  const [saved, setSaved] = useState('')
  const certs = certsOf(b).filter((c) => c.owner === p.id)
  const prospect = Object.values(prospectsOf(b)).some((x) => x.name === p.name || x.id === p.id)
  const issues = issuesOf(b).filter((x) => x.partner === p.id)
  const set = (k) => (v) => (setEp({ ...ep, [k]: v }), setSaved(''))
  return (
    <>
      <Crumb go={go} view="Partners" label="Partners" name={p.name} />
      <div className="pc-title">
        <h2>{p.name}</h2>
        <StatusTag value={p.host ? 'Host' : p.role} />
      </div>
      <section className="pm-card">
        <h3>Identifiers</h3>
        <dl className="pm-dl">
          <dt>X12 ISA qualifier</dt>
          <dd className="pm-mono">
            {p.isaQual} ({ISA_QUALIFIERS[p.isaQual] ?? 'unknown'})
          </dd>
          <dt>X12 ISA ID</dt>
          <dd className="pm-mono">{p.isaId}</dd>
          <dt>X12 GS ID</dt>
          <dd className="pm-mono">{p.gsId}</dd>
          <dt>Contact</dt>
          <dd>{p.contact || 'None'}</dd>
        </dl>
      </section>
      <section className="pm-card">
        <h3>AS2 endpoint</h3>
        {p.host ? (
          <dl className="pm-dl">
            <dt>AS2 identifier</dt>
            <dd className="pm-mono">{p.as2.as2Id}</dd>
            <dt>Receiving URL</dt>
            <dd className="pm-mono">{p.as2.url}</dd>
            <dt>Signing certificate</dt>
            <dd className="pm-mono">{p.as2.signCert}</dd>
            <dt>Encryption certificate</dt>
            <dd className="pm-mono">{p.as2.encCert}</dd>
          </dl>
        ) : (
          <>
            <p className="pc-dim">
              Messages from {p.name} carry AS2-From {ep.as2Id || '(its identifier)'} and AS2-To {host.as2.as2Id}. Messages to it carry AS2-From {host.as2.as2Id} and AS2-To {ep.as2Id || '(its identifier)'}.
            </p>
            <div className="pm-grid">
              <Field label="Partner AS2 identifier">
                <Input value={ep.as2Id} onChange={set('as2Id')} aria-label="Partner AS2 identifier" />
              </Field>
              <Field label="URL">
                <Input value={ep.url} onChange={set('url')} aria-label="URL" />
              </Field>
              <Field label="Signing certificate" hint="Verifies the signature of its messages">
                <Select value={ep.signCert} onChange={set('signCert')} placeholder="Pick a certificate" options={certs.filter((c) => c.use === 'Signing').map((c) => c.id)} aria-label="Signing certificate" />
              </Field>
              <Field label="Encryption certificate" hint="Harbor encrypts for the partner with it">
                <Select value={ep.encCert} onChange={set('encCert')} placeholder="Pick a certificate" options={certs.filter((c) => c.use === 'Encryption').map((c) => c.id)} aria-label="Encryption certificate" />
              </Field>
              <Field label="MDN">
                <Select value={ep.mdn} onChange={set('mdn')} options={[['sync', 'Synchronous'], ['async', 'Asynchronous']]} aria-label="MDN" />
              </Field>
              <Field label="Signed MDN">
                <Check checked={ep.mdnSigned} onChange={set('mdnSigned')}>
                  Request a signed MDN (signed-receipt-micalg sha-256)
                </Check>
              </Field>
            </div>
            <div className="pm-actions">
              <Btn
                kind="primary"
                onClick={() => {
                  update((s) => setEndpoint(s, p.id, { as2Id: ep.as2Id.trim(), url: ep.url.trim(), signCert: ep.signCert, encCert: ep.encCert, mdn: ep.mdn, mdnSigned: Boolean(ep.mdnSigned), ...(ep.mdn === 'async' && { mdnUrl: 'https://b2b.harbor.example/as2/mdn' }) }))
                  setSaved('Endpoint saved.')
                }}
              >
                Save endpoint
              </Btn>
              {saved && <span className="pc-dim">{saved}</span>}
            </div>
          </>
        )}
      </section>
      {!p.host && (
        <section className="pm-card">
          <h3>SFTP endpoint</h3>
          {p.sftp ? (
            <p className="pm-mono">
              sftp://{p.sftp.user}@{p.sftp.host}:{p.sftp.port}
              {p.sftp.path} ({p.sftp.enabled ? 'enabled' : 'not used, AS2 is the transport'})
            </p>
          ) : (
            <p className="pc-dim">No SFTP endpoint. This partner exchanges over AS2.</p>
          )}
        </section>
      )}
      {!p.host && (
        <section className="pm-card">
          <h3>Raise an issue</h3>
          <p className="pc-dim">Tell the partner about a problem in what it sends. The reply comes to the Inbox.</p>
          <div className="pm-row">
            <Select value={issue} onChange={setIssue} placeholder="Pick a problem" options={Object.entries(ISSUES).map(([k, v]) => [k, v.title])} aria-label="Issue" />
            <Btn disabled={!issue} onClick={() => (update((s) => raiseIssue(s, p.id, issue)), setIssue(''))}>
              Send to partner
            </Btn>
          </div>
          {issues.length > 0 && (
            <ul className="pm-list">
              {issues.map((x) => (
                <li key={x.key}>
                  <b>{x.title}</b> <span className="pc-dim">{stamp(x.t)}</span>
                  <br />
                  {x.reply}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {prospect && (
        <section className="pm-card">
          <h3>Onboarding</h3>
          <p className="pc-dim">The partner sends a test 850 when you ask. It uses its real identifiers and certificates, so it fails if the profile does not match them.</p>
          <Btn onClick={() => update((s) => requestTest(s, p.id))}>Request test 850</Btn>
        </section>
      )}
    </>
  )
}

// ---------- message flows ----------

const EMPTY_FLOW = { name: '', partner: '', dir: 'inbound', type: '850', target: '', validate: true, ack997: false }
function FlowList({ state, b, update, go }) {
  const [form, setForm] = useState(null)
  const [tried, setTried] = useState(false)
  const errs = form ? flowProblems(b, form) : []
  const set = (k) => (v) => setForm({ ...form, [k]: v })
  const apps = [...new Set(state.apps.map((a) => a.name))]
  const rows = flowsOf(b).map((f) => (
    <tr key={f.id}>
      <td>
        <Link onClick={() => go({ view: 'Message flows', flow: f.id })}>{f.name}</Link>
      </td>
      <td>{nameOf(b, f.partner)}</td>
      <td>{f.dir === 'inbound' ? 'Inbound' : 'Outbound'}</td>
      <td>
        X12 {f.type} {DOC_TYPES[f.type]?.name}
      </td>
      <td>{f.dir === 'inbound' ? f.target?.name : f.source?.name}</td>
      <td>
        <StatusTag value={flowStatus(f)} />
      </td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Message flows</h2>
        {!form && (
          <Btn kind="primary" onClick={() => (setForm(EMPTY_FLOW), setTried(false))}>
            New message flow
          </Btn>
        )}
      </div>
      <p className="pc-dim">An inbound flow receives from a partner, validates the X12, sends the 997, maps the document and calls the target. An outbound flow takes a document from a source, writes the X12 and sends it.</p>
      {form && (
        <section className="pm-card">
          <h3>New message flow</h3>
          <div className="pm-grid">
            <Field label="Name" required>
              <Input value={form.name} onChange={set('name')} aria-label="Flow name" />
            </Field>
            <Field label="Partner" required>
              <Select value={form.partner} onChange={set('partner')} placeholder="Pick a partner" options={partnersOf(b).filter((p) => !p.host).map((p) => [p.id, p.name])} aria-label="Partner" />
            </Field>
            <Field label="Direction">
              <Select value={form.dir} onChange={set('dir')} options={[['inbound', 'Inbound'], ['outbound', 'Outbound']]} aria-label="Direction" />
            </Field>
            <Field label="Document type">
              <Select value={form.type} onChange={set('type')} options={DOC_TYPE_IDS.filter((t) => t !== '997').map((t) => [t, `${t} ${DOC_TYPES[t].name}`])} aria-label="Document type" />
            </Field>
            <Field label={form.dir === 'inbound' ? 'Target' : 'Source'} required={form.dir === 'inbound'}>
              <Select value={form.target} onChange={set('target')} placeholder="Pick an application" options={apps} aria-label="Target" />
            </Field>
            {form.dir === 'inbound' && (
              <Field label="Checks">
                <Check checked={form.validate} onChange={set('validate')}>
                  Validate X12
                </Check>
                <Check checked={form.ack997} onChange={set('ack997')}>
                  Send 997
                </Check>
              </Field>
            )}
          </div>
          {tried && <Errors list={errs} />}
          <div className="pm-actions">
            <Btn
              kind="primary"
              onClick={() => {
                setTried(true)
                if (!errs.length) update((s) => createFlow(s, form)), setForm(null)
              }}
            >
              Create flow
            </Btn>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </section>
      )}
      <Table heads={['Name', 'Partner', 'Direction', 'Document', 'Target or source', 'Status']} rows={rows} />
    </>
  )
}

function FlowPage({ b, update, go, f }) {
  const [settings, setSettings] = useState({ validate: Boolean(f.validate), ack997: Boolean(f.ack997) })
  const [alerts, setAlerts] = useState({ rejected997: Boolean(f.alerts?.rejected997), negativeMdn: Boolean(f.alerts?.negativeMdn), to: f.alerts?.to ?? '', window: f.ackWindowMin ? String(f.ackWindowMin) : '' })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [deployErrs, setDeployErrs] = useState([])
  const status = flowStatus(f)
  const inbound = f.dir === 'inbound'
  return (
    <>
      <Crumb go={go} view="Message flows" label="Message flows" name={f.name} />
      <div className="pc-title">
        <h2>{f.name}</h2>
        <StatusTag value={status} />
        {status === 'Draft' ? (
          <Btn
            kind="primary"
            onClick={() => {
              const errs = deployProblems(b, f.id)
              setDeployErrs(errs)
              if (!errs.length) update((s) => deployFlow(s, f.id))
            }}
          >
            Deploy
          </Btn>
        ) : (
          <Btn onClick={() => update((s) => undeployFlow(s, f.id))}>Stop</Btn>
        )}
      </div>
      <Errors list={deployErrs} />
      <div className="pm-pipe" aria-label="Flow steps">
        {(inbound ? [`Receive AS2 from ${nameOf(b, f.partner)}`, `Validate X12 ${f.type}`, 'Send 997', 'Map to JSON', `Send to ${f.target?.name}`] : [`Source ${f.source?.name}`, `Write X12 ${f.type}`, `Send AS2 to ${nameOf(b, f.partner)}`, 'MDN', '997 from partner']).map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      {inbound && (
        <section className="pm-card">
          <h3>Settings</h3>
          <Check checked={settings.validate} onChange={(v) => setSettings({ ...settings, validate: v })}>
            Validate X12
          </Check>
          <Check checked={settings.ack997} onChange={(v) => setSettings({ ...settings, ack997: v })}>
            Send 997
          </Check>
          {!settings.validate && <Note>Without validation no document is checked, and every 997 says accepted.</Note>}
          <div className="pm-actions">
            <Btn onClick={() => (update((s) => setFlow(s, f.id, settings)), setNote('Settings saved.'))}>Save settings</Btn>
          </div>
          <p className="pc-dim">
            Target: {f.target?.name} at <span className="pm-mono">{f.target?.url}</span>
          </p>
        </section>
      )}
      {inbound && f.type === '850' && (
        <section className="pm-card">
          <h3>Unit mapping</h3>
          <p className="pc-dim">PO103 holds an X12 unit code. The Order API has its own units.</p>
          <Table
            heads={['X12 code', 'Order API unit', '']}
            rows={Object.entries(f.unitMap ?? {}).map(([k, v]) => (
              <tr key={k}>
                <td className="pm-mono">{k}</td>
                <td>{v}</td>
                <td>
                  <Link onClick={() => update((s) => setUnitMap(s, f.id, k, ''))}>Remove</Link>
                </td>
              </tr>
            ))}
          />
          <div className="pm-row">
            <Input value={from} onChange={setFrom} placeholder="X12 code" aria-label="X12 code" />
            <Select value={to} onChange={setTo} placeholder="Order API unit" options={ORDER_UNITS} aria-label="Order API unit" />
            <Btn disabled={!from.trim() || !to} onClick={() => (update((s) => setUnitMap(s, f.id, from, to)), setFrom(''), setTo(''))}>
              Add mapping
            </Btn>
          </div>
        </section>
      )}
      <section className="pm-card">
        <h3>Alerts</h3>
        <Check checked={alerts.rejected997} onChange={(v) => setAlerts({ ...alerts, rejected997: v })}>
          Alert when a 997 rejects a document
        </Check>
        <Check checked={alerts.negativeMdn} onChange={(v) => setAlerts({ ...alerts, negativeMdn: v })}>
          Alert on a negative MDN
        </Check>
        <div className="pm-grid">
          {!inbound && (
            <Field label="997 expected within (minutes)" hint="Empty: no limit">
              <input className="pc-input" value={alerts.window} onChange={(e) => setAlerts({ ...alerts, window: e.target.value.replace(/[^0-9]/g, '') })} aria-label="997 expected within (minutes)" />
            </Field>
          )}
          <Field label="Alert recipients">
            <Input value={alerts.to} onChange={(v) => setAlerts({ ...alerts, to: v })} aria-label="Alert recipients" />
          </Field>
        </div>
        <div className="pm-actions">
          <Btn onClick={() => (update((s) => setFlow(s, f.id, { ackWindowMin: alerts.window ? Number(alerts.window) : null, alerts: { rejected997: alerts.rejected997, negativeMdn: alerts.negativeMdn, to: alerts.to.trim() } })), setNote('Alerts saved.'))}>Save alerts</Btn>
          {note && <span className="pc-dim">{note}</span>}
        </div>
      </section>
    </>
  )
}

// ---------- tracking ----------

const mdnText = (tx) => (!tx.as2?.mdn ? (tx.dir === 'out' && tx.as2?.mode === 'async' ? 'Waiting' : 'None') : mdnOk(tx.as2.mdn) ? 'processed' : tx.as2.mdn.disposition.split('; ').pop())
function Tracking({ b, update, go }) {
  const [q, setQ] = useState('')
  const [partner, setPartner] = useState('')
  const [status, setStatus] = useState('')
  const list = searchTx(b, q).filter((t) => (!partner || t.partner === partner) && (!status || t.status === status))
  const rows = list.slice(0, 60).map((t) => (
    <tr key={t.id} className={t.status === 'Failed' ? 'pm-bad' : ''}>
      <td>{stamp(t.t)}</td>
      <td>{t.dir === 'in' ? 'Inbound' : 'Outbound'}</td>
      <td>{nameOf(b, t.partner)}</td>
      <td>{t.type}</td>
      <td>
        <Link onClick={() => go({ view: 'Tracking', tx: t.id })}>{t.ref || t.id}</Link>
      </td>
      <td className="pm-mono">{t.isa}</td>
      <td className="pm-mono">{t.gs}</td>
      <td className="pm-mono">{t.st}</td>
      <td>
        <StatusTag value={t.status} />
      </td>
      <td>{t.ack ? `${t.ack.code}${t.dir === 'in' ? ' sent' : ''}` : ''}</td>
      <td>{mdnText(t)}</td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Tracking</h2>
      </div>
      <div className="pm-row">
        <Input value={q} onChange={setQ} placeholder="Search by control number, document or Message-ID" aria-label="Search" />
        <Select value={partner} onChange={setPartner} placeholder="All partners" options={partnersOf(b).filter((p) => !p.host).map((p) => [p.id, p.name])} aria-label="Partner" />
        <Select value={status} onChange={setStatus} placeholder="All statuses" options={STATUSES} aria-label="Status" />
      </div>
      {partner && (
        <div className="pm-actions">
          <Btn onClick={() => update((s) => requestResendFailed(s, partner))}>Request resend of all failed</Btn>
          <Btn onClick={() => update((s) => resendFailed(s, partner))}>Resend all failed</Btn>
          <span className="pc-dim">Request resend asks the partner for its failed inbound documents. Resend sends Harbor's failed outbound documents again.</span>
        </div>
      )}
      <Table heads={['Time', 'Direction', 'Partner', 'Type', 'Document', 'ISA13', 'GS06', 'ST02', 'Status', '997', 'MDN']} rows={rows} empty="No transmissions match." />
      {list.length > 60 && <p className="pc-dim">Showing the newest 60 of {list.length}.</p>}
    </>
  )
}

function TxPage({ b, update, go, place, tx }) {
  const tab = place.tab === 'Raw EDI' ? 'Raw EDI' : 'Summary'
  useEffect(() => {
    if (tab === 'Raw EDI') update((s) => mark(s, 'b2b:raw'))
  }, [tab, update])
  const segs = segmentsOf(tx.raw)
  const mdn = tx.as2?.mdn
  return (
    <>
      <Crumb go={go} view="Tracking" label="Tracking" name={`${tx.type} ${tx.ref || tx.id}`} />
      <div className="pc-title">
        <h2>
          {tx.type} {DOC_TYPES[tx.type]?.name ?? ''} {tx.ref}
        </h2>
        <StatusTag value={tx.status} />
        {tx.dir === 'out' && tx.type !== '997' && <Btn onClick={() => update((s) => resendTx(s, tx.id))}>Resend</Btn>}
        {tx.dir === 'in' && tx.src && tx.status === 'Failed' && <Btn onClick={() => update((s) => requestResend(s, tx.id))}>Request resend</Btn>}
      </div>
      <Tabs tabs={['Summary', 'Raw EDI']} value={tab} onChange={(t) => go({ view: 'Tracking', tx: tx.id, tab: t })} />
      {tab === 'Summary' ? (
        <>
          <dl className="pm-dl pm-card">
            <dt>Direction</dt>
            <dd>{tx.dir === 'in' ? `Inbound from ${nameOf(b, tx.partner)}` : `Outbound to ${nameOf(b, tx.partner)}`}</dd>
            <dt>Control numbers</dt>
            <dd className="pm-mono">
              ISA13 {tx.isa}, GS06 {tx.gs}, ST02 {tx.st}
            </dd>
            <dt>Message flow</dt>
            <dd>{flowOf(b, tx.flow)?.name ?? 'None'}</dd>
            <dt>997</dt>
            <dd>{tx.ack ? `AK9 ${tx.ack.code} (${ACK_CODES[tx.ack.code]}), interchange ${tx.ack.isa}` : 'None'}</dd>
            {tx.target && (
              <>
                <dt>Target</dt>
                <dd>{tx.target}</dd>
              </>
            )}
            {tx.resentOf && (
              <>
                <dt>Resend of</dt>
                <dd>
                  <Link onClick={() => go({ view: 'Tracking', tx: tx.resentOf })}>{tx.resentOf}</Link>
                </dd>
              </>
            )}
          </dl>
          {tx.errors?.length > 0 && (
            <section className="pm-card">
              <h3>Errors</h3>
              <ul className="pm-list pm-errs">
                {tx.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </section>
          )}
          <section className="pm-card">
            <h3>AS2</h3>
            <dl className="pm-dl">
              <dt>Message-ID</dt>
              <dd className="pm-mono">{tx.as2?.messageId}</dd>
              <dt>AS2-From / AS2-To</dt>
              <dd className="pm-mono">
                {tx.as2?.from} / {tx.as2?.to}
              </dd>
              {tx.as2?.encCert && (
                <>
                  <dt>Encrypted for</dt>
                  <dd className="pm-mono">{tx.as2.encCert}</dd>
                </>
              )}
              <dt>MIC sent</dt>
              <dd className="pm-mono">{tx.as2?.mic ?? 'None'}</dd>
              <dt>MDN</dt>
              <dd className={mdn && !mdnOk(mdn) ? 'pm-badtext' : ''}>{mdn ? `${mdn.signed ? 'Signed' : 'Unsigned'} MDN at ${stamp(mdn.t)}. Disposition: ${mdn.disposition}` : 'No MDN yet'}</dd>
              {mdn && (
                <>
                  <dt>Received-Content-MIC</dt>
                  <dd className="pm-mono">{mdn.mic ? `${mdn.mic}, sha-256` : 'None'}</dd>
                </>
              )}
            </dl>
          </section>
          <section className="pm-card">
            <h3>History</h3>
            <ol className="pm-hist">
              {tx.hist.map((h, i) => (
                <li key={i}>
                  <span className="pc-dim">{stamp(h.t)}</span> <StatusTag value={h.s} /> {h.note}
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <section className="pm-card">
          <p className="pc-dim">
            {segs.length} segments. Element separator *, segment terminator ~, component separator {'>'}. From ST to SE: {(() => {
              const st = segs.findIndex((s) => s[0] === 'ST')
              const se = segs.findIndex((s) => s[0] === 'SE')
              return st >= 0 && se >= 0 ? `${se - st + 1} segments, SE01 says ${segs[se][1]}` : 'no transaction set'
            })()}.
          </p>
          <pre className="pm-raw" aria-label="Raw EDI">
            {segs.map((s, i) => (
              <span key={i} className="pm-seg">
                <b>{s[0]}</b>
                {s.slice(1).map((e, j) => (
                  <span key={j}>
                    <i>*</i>
                    {e}
                  </span>
                ))}
                <i>~</i>
                {'\n'}
              </span>
            ))}
          </pre>
        </section>
      )}
    </>
  )
}

// ---------- document types ----------

function DocTypes({ b, update, place, go }) {
  const type = DOC_TYPES[place.doc] ? place.doc : '850'
  const doc = DOC_TYPES[type]
  const partners = partnersOf(b).filter((p) => !p.host)
  const [partner, setPartner] = useState(partners[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const keys = Object.keys(CODE_LISTS).filter((k) => k.startsWith(`${type}|`))
  return (
    <>
      <div className="pc-title">
        <h2>Document types</h2>
      </div>
      <Tabs tabs={DOC_TYPE_IDS.map((t) => `X12 ${t}`)} value={`X12 ${type}`} onChange={(t) => go({ view: 'Document types', doc: t.slice(4) })} />
      <p className="pc-dim">
        X12 {type} {doc.name}, version 004010, functional group {doc.fg}.
      </p>
      <Table
        heads={['Segment', 'Name', 'Usage', 'Loop', 'Checked elements']}
        rows={doc.segments.map((s) => (
          <tr key={s.id + s.loop}>
            <td className="pm-mono">{s.id}</td>
            <td>{s.name}</td>
            <td>{s.req === 'M' ? 'Mandatory' : 'Optional'}</td>
            <td>{s.loop || ''}</td>
            <td>{s.elements.map((e) => `${s.id}${String(e.pos).padStart(2, '0')} ${e.name} (${e.ref}, ${e.req === 'M' ? 'M' : 'O'} ${e.kind} ${e.min}/${e.max})`).join('; ')}</td>
          </tr>
        ))}
      />
      {keys.length > 0 && (
        <section className="pm-card">
          <h3>Partner code lists</h3>
          <div className="pm-row">
            <Select value={partner} onChange={(v) => (setPartner(v), setErr(''))} options={partners.map((p) => [p.id, p.name])} aria-label="Partner for code lists" />
          </div>
          {keys.map((k) => (
            <div key={k} className="pm-codes">
              <b>{k.split('|')[1]}</b> Unit or Basis for Measurement Code, allowed for {nameOf(b, partner)}:
              {(codesOf(b, partner, k) ?? []).map((c) => (
                <span key={c} className="pm-chip">
                  {c}
                  <button type="button" aria-label={`Remove ${c}`} onClick={() => update((s) => removeCode(s, partner, k, c))}>
                    x
                  </button>
                </span>
              ))}
              <div className="pm-row">
                <Input value={code} onChange={(v) => (setCode(v), setErr(''))} placeholder="Code" aria-label="Code" />
                <Btn
                  onClick={() => {
                    const p = codeProblem(k, code)
                    setErr(p ?? '')
                    if (!p) update((s) => addCode(s, partner, k, code)), setCode('')
                  }}
                >
                  Add code
                </Btn>
              </div>
              {err && <Errors list={[err]} />}
            </div>
          ))}
        </section>
      )}
      <section className="pm-card">
        <h3>997 codes</h3>
        <p className="pc-dim">AK5 and AK9: {Object.entries(ACK_CODES).map(([k, v]) => `${k} ${v}`).join(', ')}.</p>
        <p className="pc-dim">AK5 errors: {Object.entries(AK5_ERRORS).map(([k, v]) => `${k} ${v}`).join(', ')}.</p>
        <p className="pc-dim">AK4 errors: {Object.entries(AK4_ERRORS).map(([k, v]) => `${k} ${v}`).join(', ')}.</p>
      </section>
    </>
  )
}

// ---------- certificates ----------

function Certificates({ state, b, update }) {
  const now = state.clock
  const usedBy = (c) =>
    partnersOf(b)
      .filter((p) => p.as2?.signCert === c.id || p.as2?.encCert === c.id)
      .map((p) => `${p.name} ${p.as2.signCert === c.id ? 'signing' : 'encryption'}`)
      .join(', ')
  const left = (c) => {
    const d = daysLeft(c, now)
    return <span className={d < 0 ? 'pm-badtext' : d < 30 ? 'pm-warntext' : ''}>{d < 0 ? 'Expired' : `${d} days`}</span>
  }
  return (
    <>
      <div className="pc-title">
        <h2>Certificates</h2>
      </div>
      <p className="pc-dim">Public certificates of the partners and the certificates of the host. Harbor's private keys stay in its keystore.</p>
      <Table
        heads={['Alias', 'Owner', 'Use', 'Subject', 'SHA-1 fingerprint', 'Valid from', 'Expires', 'Left', 'Used by']}
        rows={certsOf(b).map((c) => (
          <tr key={c.id}>
            <td className="pm-mono">{c.alias}</td>
            <td>{nameOf(b, c.owner)}</td>
            <td>{c.use}</td>
            <td className="pm-mono">{c.subject}</td>
            <td className="pm-mono pm-small">{c.fp}</td>
            <td>{dateText(c.notBefore)}</td>
            <td>{dateText(c.notAfter)}</td>
            <td>{left(c)}</td>
            <td>{usedBy(c) || 'Not used'}</td>
          </tr>
        ))}
      />
      <h3>Certificates sent by partners</h3>
      <Table
        heads={['Alias', 'Partner', 'Use', 'Valid from', 'Expires', 'Note', '']}
        rows={offeredOf(b).map((c) => (
          <tr key={c.id}>
            <td className="pm-mono">{c.alias}</td>
            <td>{nameOf(b, c.owner)}</td>
            <td>{c.use}</td>
            <td>{dateText(c.notBefore)}</td>
            <td>{dateText(c.notAfter)}</td>
            <td>{c.note}</td>
            <td>
              <Btn onClick={() => update((s) => importCert(s, c.id))}>Import</Btn>
            </td>
          </tr>
        ))}
        empty="No certificate waits for import."
      />
    </>
  )
}
