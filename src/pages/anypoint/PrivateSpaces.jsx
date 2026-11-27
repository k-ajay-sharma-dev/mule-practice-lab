// CloudHub 2.0 private spaces in Runtime Manager: the list of spaces and a space page with the tabs Network, Private
// network, Firewall rules, Domains & TLS, DNS and Applications. The rules live in lab/platform-network.js.
import { useEffect, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import {
  addFirewallRule, addInternalDomain, addVpnRoute, appsIn, contactsOf, defaultNetwork, egressOf, enableStaticIps, PROTOCOLS, removeFirewallRule, removeInternalDomain,
  removeVpnRoute, sendMail, spaceOf, spacesOf, staticIpsOf, upgradeNetwork,
} from '../../lab/platform-network.js'
import { Btn, Copy, Errors, Field, Input, Link, Note, Select, SideNav, Table, Tabs } from './parts.jsx'

const TABS = ['Network', 'Private network', 'Firewall rules', 'Domains & TLS', 'DNS', 'Applications']
const SEEN = { 'Private network': 'ps-vpn', 'Firewall rules': 'ps-fw', DNS: 'ps-dns' }

export default function PrivateSpaces({ state, update, place, go, openEnv }) {
  // a lab without network state shows the console defaults, read only, so nothing changes the outbound IP of its apps
  const readOnly = !state.network
  const view = readOnly ? { ...state, network: defaultNetwork(state.clock) } : state.network.spaces ? state : { ...state, network: upgradeNetwork(state.network, state.clock) }
  const space = place.space && spaceOf(view, place.space)
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} items={[['Private Spaces', 'Private Spaces']]} value="Private Spaces" onPick={() => go({})} />
      <main className="pc-main">
        {readOnly && <Note>This lab does not use private networking. The page shows the settings of the practice console and cannot be changed here.</Note>}
        {space ? <SpacePage key={space.name} state={view} space={space} tab={place.tab ?? 'Network'} readOnly={readOnly} update={update} go={go} /> : <SpaceList state={view} go={go} />}
      </main>
    </>
  )
}

function SpaceList({ state, go }) {
  const rows = spacesOf(state).map((x) => (
    <tr key={x.name}>
      <td>
        <Link onClick={() => go({ space: x.name, tab: 'Network' })}>{x.name}</Link>
      </td>
      <td>{x.region}</td>
      <td>{x.envs.join(', ')}</td>
      <td>{x.vpns.length + x.tgws.length}</td>
      <td>{staticIpsOf(x).length ? staticIpsOf(x).length : 'Not enabled'}</td>
      <td>{appsIn(state, x.name).length}</td>
      <td>
        <Status value={x.status} />
      </td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Private Spaces</h2>
      </div>
      <p className="pc-dim">A private space is a virtual private network for your CloudHub 2.0 apps: its own CIDR block, firewall rules, static outbound IPs, and connections to your network. Apps in the shared space use addresses of the platform instead.</p>
      <Table heads={['Name', 'Region', 'Environments', 'Connections', 'Static IPs', 'Apps', 'Status']} rows={rows} empty="No private spaces in this organization." />
    </>
  )
}

const Status = ({ value }) => {
  const good = ['Running', 'Available', 'UP', 'Attached'].includes(value)
  const bad = ['DOWN', 'Failed'].includes(value)
  return <span className={`ps-status ${good ? 'ps-good' : bad ? 'ps-bad' : 'ps-idle'}`}>{value}</span>
}

function SpacePage({ state, space, tab, readOnly, update, go }) {
  useEffect(() => {
    if (readOnly) return
    update((s) => mark(s, `ps:${space.name}`))
  }, [space.name, readOnly, update])
  useEffect(() => {
    if (!readOnly && SEEN[tab]) update((s) => mark(s, `${SEEN[tab]}:${space.name}`))
  }, [space.name, tab, readOnly, update])
  const props = { state, space, readOnly, update }
  return (
    <>
      <p className="pc-dim">
        <Link onClick={() => go({ space: null })}>Private Spaces</Link> / {space.name}
      </p>
      <div className="pc-title">
        <h2>{space.name}</h2>
        <Status value={space.status} />
      </div>
      <p className="pc-dim">
        {space.region}. Environments: {space.envs.join(', ')}.
      </p>
      <Tabs tabs={TABS} value={tab} onChange={(t) => go({ space: space.name, tab: t })} />
      {tab === 'Network' && <NetworkTab {...props} />}
      {tab === 'Private network' && <PrivateNetworkTab {...props} />}
      {tab === 'Firewall rules' && <FirewallTab {...props} />}
      {tab === 'Domains & TLS' && <DomainsTab {...props} />}
      {tab === 'DNS' && <DnsTab {...props} />}
      {tab === 'Applications' && <AppsTab {...props} />}
    </>
  )
}

const Log = ({ list }) =>
  list?.length > 0 && (
    <ul className="ps-log" aria-label="Log">
      {[...list].reverse().slice(0, 12).map((l, i) => (
        <li key={i}>
          <time>{stamp(l.t)}</time> {l.text}
        </li>
      ))}
    </ul>
  )

// ---------- Network ----------

function NetworkTab({ state, space, readOnly, update }) {
  const ips = staticIpsOf(space)
  const st = space.staticIps ?? {}
  return (
    <section className="ps-section">
      <dl className="ps-facts">
        <dt>CIDR block</dt>
        <dd className="pc-mono">{space.cidr}</dd>
        <dt>Reserved CIDRs</dt>
        <dd className="pc-mono">{space.reserved?.join(', ') || 'None'}</dd>
        <dt>Region</dt>
        <dd>{space.region}</dd>
      </dl>
      <p className="pc-dim">Reserved CIDRs are the ranges of your company network. The platform keeps the space clear of them, so routes to them work.</p>
      <h3>Static IPs</h3>
      <p className="pc-dim">Outbound calls of the apps in this space leave from these public addresses. Give all of them to a partner that allowlists you.</p>
      {!st.enabled ? (
        <div className="ps-row">
          <span>Static IPs are not enabled. Apps call out from addresses of the platform that can change.</span>
          <Btn kind="primary" disabled={readOnly} onClick={() => update((s) => enableStaticIps(s, space.name))}>
            Enable static IPs
          </Btn>
        </div>
      ) : st.state === 'Pending' ? (
        <p>
          <Status value="Pending" /> Allocating {st.ips.length} static IPs. This takes about two minutes.
        </p>
      ) : (
        <Table
          heads={['Static IP', 'Status', '']}
          rows={ips.map((ip) => (
            <tr key={ip}>
              <td className="pc-mono">{ip}</td>
              <td>
                <Status value="Available" />
              </td>
              <td>
                <Copy text={ip} />
              </td>
            </tr>
          ))}
        />
      )}
      {ips.length > 0 && !readOnly && <MailTool state={state} ips={ips} update={update} />}
      <h3>Log</h3>
      <Log list={space.log} />
      {!space.log?.length && <p className="pc-dim">No changes yet.</p>}
    </section>
  )
}

// Lab tool: the console has no mail client, so the addresses go out from here
function MailTool({ state, ips, update }) {
  const contacts = contactsOf(state)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState(contacts[0]?.contact ?? '')
  const [subject, setSubject] = useState('Outbound IP addresses of Harbor')
  const [body, setBody] = useState(`Hello. Please allowlist the outbound addresses of Harbor: ${ips.join(', ')}. Harbor operations team`)
  const sent = state.network.outbox ?? []
  return (
    <div className="ps-tool">
      <b>Lab tool</b>
      {!open ? (
        <Btn onClick={() => setOpen(true)}>Mail these addresses</Btn>
      ) : (
        <>
          <Field label="To">
            <Input value={to} onChange={setTo} list="ps-contacts" aria-label="To" />
            <datalist id="ps-contacts">
              {contacts.map((c) => (
                <option key={c.contact} value={c.contact}>
                  {c.owner}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="Subject">
            <Input value={subject} onChange={setSubject} />
          </Field>
          <Field label="Message" wide>
            <textarea className="pc-input" rows={3} aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="ps-row">
            <Btn onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn
              kind="primary"
              disabled={!to.trim() || !body.trim()}
              onClick={() => {
                update((s) => sendMail(s, to, subject, body))
                setOpen(false)
              }}
            >
              Send
            </Btn>
          </div>
        </>
      )}
      {sent.length > 0 && (
        <ul className="ps-log">
          {[...sent].reverse().map((m, i) => (
            <li key={i}>
              <time>{stamp(m.t)}</time> Sent to {m.to}: {m.subject}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- Private network ----------

function PrivateNetworkTab({ space, readOnly, update, state }) {
  return (
    <section className="ps-section">
      <h3>VPN connections</h3>
      {space.vpns.length === 0 && <p className="pc-dim">No VPN connections.</p>}
      {space.vpns.map((v) => (
        <Vpn key={v.name} state={state} space={space} vpn={v} readOnly={readOnly} update={update} />
      ))}
      <h3>Transit gateway attachments</h3>
      <Table
        heads={['Name', 'Transit gateway ID', 'Status', 'Routes']}
        empty="No transit gateway attachments."
        rows={space.tgws.map((g) => (
          <tr key={g.name}>
            <td>{g.name}</td>
            <td className="pc-mono">{g.tgwId}</td>
            <td>
              <Status value={g.status} />
            </td>
            <td className="pc-mono">{g.routes.join(', ')}</td>
          </tr>
        ))}
      />
    </section>
  )
}

function Vpn({ state, space, vpn, readOnly, update }) {
  const [route, setRoute] = useState('')
  const [errors, setErrors] = useState([])
  const routes = vpn.pending?.routes ?? vpn.routes
  const add = () => {
    const r = addVpnRoute(state, space.name, vpn.name, route)
    setErrors(r.errors)
    if (r.errors.length) return
    update(() => r.state)
    setRoute('')
  }
  return (
    <div className="ps-card">
      <div className="ps-row">
        <b>{vpn.name}</b>
        <Status value={vpn.status} />
      </div>
      <dl className="ps-facts">
        <dt>Remote IP address</dt>
        <dd className="pc-mono">{vpn.remoteIp}</dd>
        <dt>Routing</dt>
        <dd>{vpn.routing === 'Static' ? 'Static' : 'Dynamic (BGP)'}</dd>
      </dl>
      <Table
        heads={['Tunnel', 'Outside IP', 'Inside CIDR', 'Status']}
        rows={vpn.tunnels.map((t) => (
          <tr key={t.name}>
            <td>{t.name}</td>
            <td className="pc-mono">{t.outsideIp}</td>
            <td className="pc-mono">{t.insideCidr}</td>
            <td>
              <Status value={t.status} />
            </td>
          </tr>
        ))}
      />
      <h4>Static routes</h4>
      {vpn.pending && <p className="pc-dim">Updating. The new routes are active in about two minutes.</p>}
      <ul className="ps-chips">
        {routes.map((r) => (
          <li key={r} className="pc-mono">
            {r}
            {!vpn.routes.includes(r) && <small> pending</small>}
            {!readOnly && vpn.routing === 'Static' && (
              <button type="button" aria-label={`Remove route ${r}`} onClick={() => update((s) => removeVpnRoute(s, space.name, vpn.name, r))}>
                ×
              </button>
            )}
          </li>
        ))}
        {routes.length === 0 && <li className="pc-dim">No routes</li>}
      </ul>
      {!readOnly && vpn.routing === 'Static' && (
        <div className="ps-row">
          <Input value={route} onChange={setRoute} placeholder="10.40.0.0/16" aria-label={`New static route of ${vpn.name}`} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Btn onClick={add}>Add route</Btn>
        </div>
      )}
      <Errors list={errors} />
      <h4>Logs</h4>
      <Log list={vpn.log} />
      {!vpn.log?.length && <p className="pc-dim">No events.</p>}
    </div>
  )
}

// ---------- Firewall rules ----------

function FirewallTab({ state, space, readOnly, update }) {
  return (
    <section className="ps-section">
      <p className="pc-dim">Traffic is blocked unless a rule allows it. Outbound rules decide which addresses and ports the apps of the space can call.</p>
      {['inbound', 'outbound'].map((dir) => (
        <Rules key={dir} state={state} space={space} dir={dir} readOnly={readOnly} update={update} />
      ))}
    </section>
  )
}

function Rules({ state, space, dir, readOnly, update }) {
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState([])
  const save = () => {
    // the number boxes keep text, so an empty box is an error here and not port 0
    if (String(form.from).trim() === '' || String(form.to).trim() === '') return setErrors(['The port range is two numbers from 0 to 65535, the first not above the second.'])
    const r = addFirewallRule(state, space.name, dir, form)
    setErrors(r.errors)
    if (r.errors.length) return
    update(() => r.state)
    setForm(null)
  }
  return (
    <>
      <div className="ps-row">
        <h3>{dir === 'inbound' ? 'Inbound traffic' : 'Outbound traffic'}</h3>
        {!readOnly && !form && <Btn onClick={() => setForm({ cidr: '', protocol: 'TCP', from: 443, to: 443 })}>Add rule</Btn>}
      </div>
      <Table
        heads={['Type', dir === 'inbound' ? 'Source' : 'Destination', 'Protocol', 'Port range', '']}
        empty="No rules. All traffic in this direction is blocked."
        rows={space.firewall[dir].map((r, i) => (
          <tr key={i}>
            <td>{r.type}</td>
            <td className="pc-mono">{r.cidr}</td>
            <td>{r.protocol}</td>
            <td>{r.from === r.to ? r.from : `${r.from}-${r.to}`}</td>
            <td>
              {!readOnly && (
                <Link aria-label={`Remove ${dir} rule ${i + 1}`} onClick={() => update((s) => removeFirewallRule(s, space.name, dir, i))}>
                  Remove
                </Link>
              )}
            </td>
          </tr>
        ))}
      />
      {form && (
        <div className="ps-form">
          <Field label="CIDR">
            <Input value={form.cidr} onChange={(cidr) => setForm({ ...form, cidr })} placeholder="0.0.0.0/0" />
          </Field>
          <Field label="Protocol">
            <Select value={form.protocol} onChange={(protocol) => setForm({ ...form, protocol })} options={PROTOCOLS} />
          </Field>
          <Field label="From port">
            <input className="pc-input" type="number" min="0" max="65535" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </Field>
          <Field label="To port">
            <input className="pc-input" type="number" min="0" max="65535" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <div className="ps-row">
            <Btn onClick={() => { setForm(null); setErrors([]) }}>Cancel</Btn>
            <Btn kind="primary" onClick={save}>
              Save rule
            </Btn>
          </div>
        </div>
      )}
      <Errors list={errors} />
    </>
  )
}

// ---------- Domains & TLS ----------

function DomainsTab({ space }) {
  return (
    <section className="ps-section">
      <h3>TLS contexts</h3>
      <Table
        heads={['Name', 'Common name', 'Issuer', 'Expires']}
        rows={space.tls.map((t) => (
          <tr key={t.name}>
            <td>{t.name}</td>
            <td className="pc-mono">{t.cn}</td>
            <td>{t.issuer}</td>
            <td>{t.expires}</td>
          </tr>
        ))}
      />
      <h3>Custom domains</h3>
      <Table
        heads={['Domain', 'TLS context']}
        empty="No custom domains. Apps use the default domain of the space."
        rows={space.domains.map((d) => (
          <tr key={d.domain}>
            <td className="pc-mono">{d.domain}</td>
            <td>{d.tls}</td>
          </tr>
        ))}
      />
    </section>
  )
}

// ---------- DNS ----------

function DnsTab({ state, space, readOnly, update }) {
  const [domain, setDomain] = useState('')
  const [servers, setServers] = useState('')
  const [errors, setErrors] = useState([])
  const add = () => {
    const r = addInternalDomain(state, space.name, domain, servers.split(/[\s,]+/))
    setErrors(r.errors)
    if (r.errors.length) return
    update(() => r.state)
    setDomain('')
    setServers('')
  }
  return (
    <section className="ps-section">
      <p className="pc-dim">Names under an internal domain are sent to your DNS servers, over the VPN or transit gateway, so those servers must be reachable from the space. Every other name goes to the default DNS of the space, which knows public names only.</p>
      <h3>Internal domains</h3>
      <Table
        heads={['Domain', 'DNS servers', '']}
        empty="No internal domains. Only public names resolve."
        rows={space.dns.map((z) => (
          <tr key={z.domain}>
            <td className="pc-mono">{z.domain}</td>
            <td className="pc-mono">{z.servers.join(', ')}</td>
            <td>
              {!readOnly && (
                <Link aria-label={`Remove ${z.domain}`} onClick={() => update((s) => removeInternalDomain(s, space.name, z.domain))}>
                  Remove
                </Link>
              )}
            </td>
          </tr>
        ))}
      />
      {!readOnly && (
        <div className="ps-form">
          <Field label="Domain">
            <Input value={domain} onChange={setDomain} placeholder="corp.example.com" />
          </Field>
          <Field label="DNS server IPs" hint="One or more, separated by commas.">
            <Input value={servers} onChange={setServers} placeholder="10.20.0.53, 10.20.0.54" />
          </Field>
          <div className="ps-row">
            <Btn kind="primary" onClick={add}>
              Add domain
            </Btn>
          </div>
        </div>
      )}
      <Errors list={errors} />
    </section>
  )
}

// ---------- Applications ----------

function AppsTab({ state, space }) {
  return (
    <section className="ps-section">
      <Table
        heads={['Name', 'Environment', 'Status', 'Outbound IP']}
        empty="No applications are deployed to this space."
        rows={appsIn(state, space.name).map((a) => (
          <tr key={`${a.env}-${a.name}`}>
            <td>{a.name}</td>
            <td>{a.env}</td>
            <td>{a.status}</td>
            <td className="pc-mono">{egressOf(state, a)}</td>
          </tr>
        ))}
      />
    </section>
  )
}
