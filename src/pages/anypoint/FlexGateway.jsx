// Runtime Manager, Flex Gateways: the self-managed gateways, their replicas, the APIs they serve with the configuration
// version they applied, an Envoy style log, and the outbound firewall rules of their hosts in the data center.
// The rules live in lab/platform-flex.js; the policy decisions come from lab/engine.js.
import { useEffect, useMemo, useState } from 'react'
import { send } from '../../lab/engine.js'
import { mark, stamp } from '../../lab/platform.js'
import {
  addEgressRule, apisOn, appliedOf, callsOf, CONF_DIR, CONTROL_HOSTS, controlChecks, egressVerdict, FLEX, flexCall, gatewayOf, gatewaysOf, installCommands, isPlaceholder, JWTS, latestOf, localYaml, logLines,
  previewFlex, removeEgressRule, restartGateway, stopGateway, upgradeFlex,
} from '../../lab/platform-flex.js'
import { policyByType } from '../../lab/policies.js'
import { Btn, Check, Copy, Errors, Field, Input, Link, Note, Select, SideNav, Table, Tabs } from './parts.jsx'

const TABS = ['Overview', 'APIs', 'Logs', 'Host network']
const SEEN = { APIs: 'flex-apis', Logs: 'flex-logs', 'Host network': 'flex-net' }
const ago = (now, t) => {
  const m = Math.round((now - t) / 60000)
  return m < 1 ? 'less than a minute ago' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`
}

export default function FlexGateway({ state, update, place, go, openEnv }) {
  // a lab without Flex Gateway shows the console defaults, read only
  const readOnly = !state.flex
  const placeholder = isPlaceholder(state.flex)
  useEffect(() => {
    if (placeholder) update((s) => upgradeFlex(s))
  }, [placeholder, update])
  const preview = useMemo(() => (readOnly ? previewFlex(state) : null), [readOnly, state])
  const view = readOnly ? preview : placeholder ? upgradeFlex(state) : state
  const page = place.page ?? 'Flex Gateways'
  const gw = place.gateway ? gatewayOf(view, place.gateway) : null
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} items={[{ title: 'Runtime Manager' }, ['Flex Gateways', 'Flex Gateways'], ['Add a Flex Gateway', 'Add a Flex Gateway']]} value={gw ? 'Flex Gateways' : page} onPick={(p) => go({ page: p, gateway: null })} />
      <main className="pc-main">
        {readOnly && <Note>This lab does not use Flex Gateway. The page shows the gateway of the practice console and cannot be changed here.</Note>}
        {gw ? (
          <GatewayPage key={gw.name} state={view} gw={gw} tab={place.tab ?? 'Overview'} readOnly={readOnly} update={update} go={go} />
        ) : page === 'Add a Flex Gateway' ? (
          <AddGateway state={view} go={go} />
        ) : (
          <GatewayList state={view} go={go} />
        )}
      </main>
    </>
  )
}

const GOOD = ['Connected', 'In sync', 'active', 'Allowed']
const BAD = ['Disconnected', 'inactive', 'Blocked']
const Status = ({ value }) => <span className={`fx-status ${GOOD.includes(value) ? 'fx-good' : BAD.includes(value) ? 'fx-bad' : 'fx-idle'}`}>{value}</span>

function GatewayList({ state, go }) {
  const list = gatewaysOf(state)
  return (
    <>
      <div className="pc-title">
        <h2>Flex Gateways</h2>
      </div>
      <div className="pc-bar">
        <Btn kind="primary" onClick={() => go({ page: 'Add a Flex Gateway' })}>
          + Add Gateway
        </Btn>
      </div>
      <p className="pc-dim">Self-managed gateways that run on your own Linux hosts, Docker or Kubernetes. In Connected Mode a gateway gets its APIs and policies from API Manager and reports to Runtime Manager.</p>
      <Table
        heads={['Name', 'Status', 'Mode', 'Platform', 'Version', 'Replicas', 'Last seen', 'APIs']}
        empty={`No Flex Gateways in ${state.env}.`}
        rows={list.map((g) => (
          <tr key={g.name}>
            <td>
              <Link onClick={() => go({ gateway: g.name, tab: 'Overview' })}>{g.name}</Link>
            </td>
            <td>
              <Status value={g.mode === 'Connected' ? g.status : 'Local'} />
            </td>
            <td>{g.mode} Mode</td>
            <td>{g.platform}</td>
            <td>{g.version}</td>
            <td>{g.replicas.length}</td>
            <td>{g.lastSeen ? `${stamp(g.lastSeen)} (${ago(state.clock, g.lastSeen)})` : 'Never'}</td>
            <td>{apisOn(state, g.name).length}</td>
          </tr>
        ))}
      />
    </>
  )
}

// ---------- Add a Flex Gateway ----------

function AddGateway({ state, go }) {
  const [name, setName] = useState('harbor-flex-edge')
  const [tab, setTab] = useState('Linux')
  const api = apisOn(state, FLEX)[0]
  const n = name.trim() || 'my-gateway'
  return (
    <>
      <p className="pc-dim">
        <Link onClick={() => go({ page: 'Flex Gateways' })}>Flex Gateways</Link> / Add a Flex Gateway
      </p>
      <div className="pc-title">
        <h2>Add a Flex Gateway</h2>
      </div>
      <p className="pc-dim">Install Flex Gateway on your host, then register it with the command below. The registration writes registration.yaml and the certificates of the gateway to the output directory. Run the commands on your host; the lab does not run them.</p>
      <Field label="Gateway name" hint="The name Runtime Manager shows">
        <Input value={name} onChange={setName} aria-label="Gateway name" />
      </Field>
      <Tabs tabs={['Linux', 'Docker', 'Local Mode']} value={tab} onChange={setTab} />
      {tab !== 'Local Mode' ? (
        <>
          <h3 className="pc-h3">{tab === 'Linux' ? 'Install on Ubuntu and register in Connected Mode' : 'Run in a container and register in Connected Mode'}</h3>
          <ol className="fx-steps">
            {installCommands(n, tab).map((c, i) => (
              <li key={i}>
                <pre className="fx-code">{c}</pre>
                <Copy text={c.replace(/\\\n\s*/g, ' ')} />
              </li>
            ))}
          </ol>
          <Note>
            Connected Mode needs outbound HTTPS on port 443 from every replica to the control plane, for example {CONTROL_HOSTS.join(', ')}. Nothing has to reach the gateway from Anypoint. The token is valid for a short time and for one environment ({state.env}).
          </Note>
        </>
      ) : (
        <>
          <h3 className="pc-h3">Local Mode</h3>
          <p className="pc-dim">
            In Local Mode the gateway is registered with --connected=false and does not talk to API Manager. You declare APIs and policies as YAML files in {CONF_DIR}, and the gateway applies a file when it changes. Runtime Manager does not show a Local Mode gateway.
          </p>
          <pre className="fx-code">{`sudo flexctl registration create --organization=<organization id> \\\n  --token=<token> --connected=false \\\n  --output-directory=${CONF_DIR} \\\n  ${n}`}</pre>
          {api && (
            <>
              <h3 className="pc-h3">{api.name} as Local Mode files</h3>
              <pre className="fx-code">{localYaml(api)}</pre>
            </>
          )}
        </>
      )}
    </>
  )
}

// ---------- one gateway ----------

function GatewayPage({ state, gw, tab, readOnly, update, go }) {
  useEffect(() => {
    if (!readOnly) update((s) => mark(s, `flex:${gw.name}`))
  }, [gw.name, readOnly, update])
  useEffect(() => {
    if (!readOnly && SEEN[tab]) update((s) => mark(s, SEEN[tab]))
  }, [tab, readOnly, update])
  const props = { state, gw, readOnly, update, go }
  return (
    <>
      <p className="pc-dim">
        <Link onClick={() => go({ gateway: null, page: 'Flex Gateways' })}>Flex Gateways</Link> / {gw.name}
      </p>
      <div className="pc-title">
        <h2>{gw.name}</h2>
        <Status value={gw.status} />
      </div>
      <p className="pc-dim">
        {gw.mode} Mode, {gw.platform}, Flex Gateway {gw.version}, {state.env}.
      </p>
      <Tabs tabs={TABS} value={tab} onChange={(t) => go({ gateway: gw.name, tab: t })} />
      {tab === 'Overview' && <Overview {...props} />}
      {tab === 'APIs' && <Apis {...props} />}
      {tab === 'Logs' && <Logs {...props} />}
      {tab === 'Host network' && <HostNetwork {...props} />}
    </>
  )
}

function Overview({ state, gw, readOnly, update }) {
  const pending = apisOn(state, gw.name).filter((a) => appliedOf(state, gw.name, a)?.sig !== latestOf(state, a).sig)
  return (
    <>
      <dl className="pc-facts">
        <dt>Status</dt>
        <dd>
          <Status value={gw.status} /> since {stamp(gw.since)}
        </dd>
        <dt>Last seen</dt>
        <dd>{gw.lastSeen ? `${stamp(gw.lastSeen)} (${ago(state.clock, gw.lastSeen)})` : 'Never'}</dd>
        <dt>Mode</dt>
        <dd>{gw.mode} Mode</dd>
        <dt>Version</dt>
        <dd>{gw.version}</dd>
        <dt>Configuration directory</dt>
        <dd className="pc-mono">{CONF_DIR}</dd>
        <dt>Service</dt>
        <dd>
          flex-gateway <Status value={gw.service} />
        </dd>
      </dl>
      {gw.status !== 'Connected' && (
        <Note>
          The gateway has not reached the control plane since {stamp(gw.since)}. Its replicas keep serving traffic with the configuration they applied last. Changes made in API Manager since then wait in the control plane{pending.length ? `: ${pending.map((a) => a.name).join(', ')}` : ''}.
        </Note>
      )}
      <h3 className="pc-h3">Replicas</h3>
      <Table
        heads={['Replica', 'Address', 'Status', 'Last seen']}
        rows={gw.replicas.map((r) => (
          <tr key={r.id}>
            <td className="pc-mono">{r.id}</td>
            <td className="pc-mono">{r.ip}</td>
            <td>
              <Status value={state.clock - r.seen <= 2 * 60000 && gw.status === 'Connected' ? 'Connected' : 'Disconnected'} />
            </td>
            <td>{r.seen ? `${stamp(r.seen)} (${ago(state.clock, r.seen)})` : 'Never'}</td>
          </tr>
        ))}
      />
      <div className="pc-bar">
        <Btn disabled={readOnly} onClick={() => update((s) => restartGateway(s, gw.name))}>
          Restart flex-gateway
        </Btn>
        <Btn disabled={readOnly || gw.service !== 'active'} onClick={() => update((s) => stopGateway(s, gw.name))}>
          Stop flex-gateway
        </Btn>
      </div>
      <p className="pc-dim">The buttons run sudo systemctl restart flex-gateway and sudo systemctl stop flex-gateway on every replica. The agent also retries the control plane by itself each lab minute.</p>
    </>
  )
}

const settingsText = (p) => {
  const x = p.settings ?? {}
  if (p.type === 'jwt') return `JWKS Url ${x.jwksUrl || '(empty)'}. Audience ${x.validateAud === 'No' ? 'not validated' : x.audiences || '(none)'}.`
  if (p.type === 'rate-limit') return `${x.requests} requests per ${x.periodMs} ms, identifier ${x.identifier}.`
  if (p.type === 'ip-allow') return `Allowlist ${x.list}.`
  if (p.type === 'client-id') return `Credentials from ${x.origin}, secret ${x.secret}.`
  if (p.type === 'spike') return `${x.requests} requests per ${x.periodMs} ms.`
  return ''
}
const PolicyList = ({ policies }) => (
  <ol className="pc-policies">
    {policies.map((p, i) => (
      <li key={p.id}>
        <span className="pc-order">{i + 1}</span>
        <span className="pc-grow">
          <b>{policyByType.get(p.type)?.name ?? p.type}</b>
          <small>{settingsText(p)}</small>
        </span>
      </li>
    ))}
    {policies.length === 0 && <li className="pc-empty">No policies</li>}
  </ol>
)

function Apis({ state, gw, readOnly, update, go }) {
  const apis = apisOn(state, gw.name)
  const [yaml, setYaml] = useState(null)
  const synced = apis.map((a) => [a, appliedOf(state, gw.name, a), latestOf(state, a)]).filter(([, ap, l]) => ap && ap.sig === l.sig).map(([a, ap]) => `flex-sync:${a.id}:v${ap.v}`)
  const key = synced.join(',')
  useEffect(() => {
    if (readOnly || !key) return
    update((s) => key.split(',').reduce((x, k) => mark(x, k), s))
  }, [key, readOnly, update])
  return (
    <>
      <p className="pc-dim">API instances in API Manager whose runtime is this gateway. The gateway applies a new configuration version when it polls the control plane.</p>
      {apis.length === 0 && <p className="pc-empty pc-boxed">No APIs on this gateway.</p>}
      {apis.map((a) => {
        const ap = appliedOf(state, gw.name, a)
        const l = latestOf(state, a)
        const same = ap?.sig === l.sig
        return (
          <section key={a.id} className="fx-api">
            <div className="pc-title">
              <h3 className="pc-h3">
                <Link onClick={() => go({ product: 'API Manager', api: a.id, tab: 'Policies' })}>{a.name}</Link> ({a.id})
              </h3>
              <Status value={same ? 'In sync' : 'Pending'} />
            </div>
            <dl className="pc-facts">
              <dt>Listener</dt>
              <dd className="pc-mono">
                http://0.0.0.0:{a.port}
                {a.basePath}
              </dd>
              <dt>Upstream URL</dt>
              <dd className="pc-mono">{a.upstream}</dd>
              <dt>Applied configuration</dt>
              <dd>{ap ? `Version ${ap.v}, applied ${stamp(ap.t)}` : 'None'}</dd>
              <dt>Latest configuration</dt>
              <dd>
                Version {l.v}, from {stamp(l.t)}
              </dd>
            </dl>
            {!same && <Note>{gw.status === 'Connected' ? 'The gateway applies the latest version on its next poll.' : `Version ${l.v} waits in the control plane. The gateway is ${gw.status} and runs version ${ap?.v ?? 'none'}.`}</Note>}
            <h4 className="fx-h4">Policies the gateway runs, in order</h4>
            <PolicyList policies={ap?.policies ?? []} />
            {!same && (
              <>
                <h4 className="fx-h4">Policies in API Manager, not applied yet</h4>
                <PolicyList policies={a.policies} />
              </>
            )}
            <Btn onClick={() => setYaml(yaml === a.id ? null : a.id)}>{yaml === a.id ? 'Hide Local Mode files' : 'Show as Local Mode files'}</Btn>
            {yaml === a.id && <pre className="fx-code">{localYaml(a)}</pre>}
          </section>
        )
      })}
      {apis.length > 0 && <TestRequest state={state} apis={apis} readOnly={readOnly} update={update} />}
    </>
  )
}

function TestRequest({ state, apis, readOnly, update }) {
  const [f, setF] = useState({ api: apis[0].id, method: 'GET', path: '/', ip: '198.51.100.7', client: '', jwt: '' })
  const [result, setResult] = useState(null)
  const set = (patch) => setF({ ...f, ...patch })
  const api = apis.find((a) => a.id === f.api) ?? apis[0]
  const clients = api.contracts.map((c) => c.client)
  function sendIt() {
    const client = state.clients.find((c) => c.name === f.client)
    const r = flexCall(state, send, { api: api.id, method: f.method, path: f.path || '/', ip: f.ip.trim(), client: f.client, clientId: client?.clientId ?? '', clientSecret: client?.clientSecret ?? '', jwt: f.jwt || undefined, ua: 'curl/8.5.0' })
    setResult(r.response)
    update(() => r.state)
  }
  return (
    <section className="fx-api">
      <h3 className="pc-h3">Test request</h3>
      <p className="pc-dim">Sends one request to the gateway from a host in the data center, as curl would.</p>
      <div className="fx-form">
        <Field label="API">
          <Select value={api.id} onChange={(v) => set({ api: v })} options={apis.map((a) => [a.id, a.name])} />
        </Field>
        <Field label="Method">
          <Select value={f.method} onChange={(method) => set({ method })} options={['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']} />
        </Field>
        <Field label="Path" hint={`After the base path ${api.basePath}`}>
          <Input value={f.path} onChange={(path) => set({ path })} />
        </Field>
        <Field label="Source IP">
          <Input value={f.ip} onChange={(ip) => set({ ip })} />
        </Field>
        <Field label="Client credentials" hint="client_id and client_secret headers">
          <Select value={f.client} onChange={(client) => set({ client })} options={[['', 'None'], ...clients.map((c) => [c, c])]} />
        </Field>
        <Field label="Bearer token">
          <Select value={f.jwt} onChange={(jwt) => set({ jwt })} options={[['', 'None'], ...Object.keys(JWTS).map((k) => [k, `${k} token (iss ${JWTS[k].iss}, aud ${JWTS[k].aud}, kid ${JWTS[k].kid})`])]} />
        </Field>
      </div>
      <Btn kind="primary" disabled={readOnly} onClick={sendIt}>
        Send
      </Btn>
      {result && (
        <div className="fx-result" aria-label="Response">
          <p>
            <b>{result.status || 'No answer'}</b> {result.flag !== '-' && <span className="pc-mono">response flag {result.flag}</span>} {result.applied && <span className="pc-dim">configuration version {result.applied}</span>}
          </p>
          {result.body && <pre className="fx-code">{result.body}</pre>}
          {result.why && <p className="pc-dim">{result.why}</p>}
          {result.trace.length > 0 && (
            <ol className="fx-trace">
              {result.trace.map((t, i) => (
                <li key={i}>
                  <b>{t.policy}</b> {t.outcome}: {t.detail}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}

function Logs({ state, gw }) {
  const [kind, setKind] = useState('all')
  const [term, setTerm] = useState('')
  const lines = logLines(state, gw.name, { kind, limit: 200 }).filter((l) => !term || l.text.toLowerCase().includes(term.toLowerCase())).slice(0, 80)
  return (
    <>
      <div className="pc-bar">
        <Select value={kind} onChange={setKind} options={[['all', 'All logs'], ['access', 'Access log'], ['agent', 'Gateway agent']]} aria-label="Log source" />
        <Input value={term} onChange={setTerm} placeholder="Search the logs" aria-label="Search the logs" />
      </div>
      <p className="pc-dim">Newest first. Access lines use the Envoy format: start time, request line, status, response flags, bytes received and sent, duration, upstream time, client address, user agent, request ID, authority and upstream host.</p>
      {lines.length === 0 ? (
        <p className="pc-empty pc-boxed">No log lines.</p>
      ) : (
        <ul className="fx-log" aria-label="Logs">
          {lines.map((l, i) => (
            <li key={i} className={`fx-${l.level}`}>
              {l.access ? l.text : `${stamp(l.t)} ${l.text}`}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function HostNetwork({ state, gw, readOnly, update }) {
  const [f, setF] = useState({ dest: '', port: '443', action: 'Allow', note: '', top: false })
  const [errors, setErrors] = useState([])
  function add() {
    const r = addEgressRule(state, gw.name, f)
    setErrors(r.errors)
    if (!r.errors.length) {
      update((s) => addEgressRule(s, gw.name, f).state)
      setF({ ...f, dest: '', note: '' })
    }
  }
  const upstreams = [...new Set(apisOn(state, gw.name).map((a) => a.upstream))]
  const hostOf = (url) => url.match(/^https?:\/\/([^/:]+)(?::(\d+))?/) ?? []
  return (
    <>
      <p className="pc-dim">
        The firewall of the Harbor data center for the gateway hosts {gw.replicas.map((r) => `${r.id} (${r.ip})`).join(' and ')}. It is a lab tool and not part of Anypoint. Outbound rules are checked from the top; the first match wins, and anything without a match is denied.
      </p>
      <h3 className="pc-h3">Outbound rules</h3>
      <Table
        heads={['#', 'Destination', 'Port', 'Action', 'Note', '']}
        rows={[
          ...gw.egress.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className="pc-mono">{r.dest}</td>
              <td>{r.port}</td>
              <td>{r.action}</td>
              <td>{r.note}</td>
              <td>
                {!readOnly && (
                  <Link aria-label={`Remove rule ${i + 1}`} onClick={() => update((s) => removeEgressRule(s, gw.name, i))}>
                    Remove
                  </Link>
                )}
              </td>
            </tr>
          )),
          <tr key="default">
            <td>Default</td>
            <td className="pc-mono">any</td>
            <td>any</td>
            <td>Deny</td>
            <td>Anything without a match</td>
            <td />
          </tr>,
        ]}
      />
      {!readOnly && (
        <>
          <h3 className="pc-h3">Add an outbound rule</h3>
          <div className="fx-form">
            <Field label="Destination" hint="any, a host name, or *.domain for its sub domains">
              <Input value={f.dest} onChange={(dest) => setF({ ...f, dest })} placeholder="anypoint.mulesoft.com" />
            </Field>
            <Field label="Port" hint="A number, or any">
              <input className="pc-input" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} aria-label="Port" />
            </Field>
            <Field label="Action">
              <Select value={f.action} onChange={(action) => setF({ ...f, action })} options={['Allow', 'Deny']} />
            </Field>
            <Field label="Note">
              <Input value={f.note} onChange={(note) => setF({ ...f, note })} />
            </Field>
          </div>
          <Check checked={f.top} onChange={(top) => setF({ ...f, top })}>
            Put the rule at the top
          </Check>
          <Errors list={errors} />
          <Btn kind="primary" onClick={add}>
            Add rule
          </Btn>
        </>
      )}
      <h3 className="pc-h3">Connectivity check</h3>
      <Table
        heads={['From the gateway to', 'Port', 'Purpose', 'Result']}
        rows={[
          ...controlChecks(gw).map((c) => (
            <tr key={c.host}>
              <td className="pc-mono">{c.host}</td>
              <td>443</td>
              <td>Control plane</td>
              <td>
                <Status value={c.allowed ? 'Allowed' : 'Blocked'} /> {c.text}
              </td>
            </tr>
          )),
          ...upstreams.map((u) => {
            const [, host, port] = hostOf(u)
            const v = host ? egressVerdict(gw, host, Number(port ?? 80)) : { allowed: false, text: 'Not a URL' }
            return (
              <tr key={u}>
                <td className="pc-mono">{host}</td>
                <td>{port ?? 80}</td>
                <td>Upstream</td>
                <td>
                  <Status value={v.allowed ? 'Allowed' : 'Blocked'} /> {v.text}
                </td>
              </tr>
            )
          }),
        ]}
      />
      <p className="pc-dim">Last seen by the control plane: {gw.lastSeen ? stamp(gw.lastSeen) : 'never'}. {callsOf(state, apisOn(state, gw.name)[0]?.id ?? '', state.clock - 5 * 60000).length} requests in the last 5 minutes.</p>
    </>
  )
}
