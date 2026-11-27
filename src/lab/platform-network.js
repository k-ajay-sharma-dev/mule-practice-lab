// CloudHub 2.0 networking of the Platform Lab: private spaces, static outbound IPs, firewall rules, VPN and transit
// gateway connections, internal DNS, TLS contexts and custom domains. Pure and import free, so the engine and the pkg
// files can import it. Lives in state.network; every helper copes with it missing (old saves, labs without it).
//
// Modelled on the Runtime Manager pages of CloudHub 2.0 private spaces (docs.mulesoft.com/cloudhub-2/ps-*):
// a private space has a CIDR block and reserved CIDRs, can be linked to several environments, gets static outbound IPs
// only when you enable them (the shared space has none), has inbound and outbound firewall rules, connects to your
// network with VPN connections (two tunnels each, static or dynamic routing) or a transit gateway attachment, and
// forwards the internal domains you list to your own DNS servers. Apps in the shared space call out from addresses
// that the platform picks and that can change when the app is deployed again.
//
// ---------- API in short (for lab and package authors) ----------
// State: state.network = defaultNetwork(now), or newNetwork({ spaces: [newSpace('brightmart-ps', {...})], ... }) in a lab.
//   spaces[name]   { name, region, envs, cidr, reserved, staticIps: { enabled, state, ips, pool }, firewall: { inbound, outbound },
//                    vpns: [{ name, remoteIp, routing, routes, tunnels: [{ name, outsideIp, insideCidr, status }], status, pending, log }],
//                    tgws: [{ name, tgwId, status, routes }], dns: [{ domain, servers }], tls: [...], domains: [...], log }
//   sharedPool     the outbound addresses of the shared space (lab made, documentation ranges)
//   corpDns        the addresses of the company DNS servers (they answer for the names in onPrem)
//   onPrem[host]   { ip, ports } a host on the company network, known to the company DNS only
//   internet[host] { ip, ports, allow?, owner?, contact? } a public host; `allow` is the IP allowlist of its owner
//   outbox         mail the learner sent from the lab mail tool; a partner answers it in networkTick
//
// In a package: ctx.network
//   .egress                    the outbound IP of the app now
//   .space                     the private space of the app, or null in the shared space
//   .resolve(host)             { ok, ip, via } or { ok: false, kind: 'dns', type, error }
//   .reach(host, port)         { ok, ip, from, via } or { ok: false, kind, type, error }
//        kind: 'dns' | 'dns-timeout' | 'no-route' | 'tunnel-down' | 'firewall' | 'refused'
//   .request(host, { port, method, path }) reach() plus the allowlist of the host:
//        { ok, status, from } or { ok: false, kind, type, status?, error, message } where message is the whole Mule text
// Pure helpers for labs: egressOf(state, app), resolve(state, app, host), reach(state, app, host, port), staticIpsOf.
// UI actions (pure, state in, new state out): see "UI actions" below. Seen keys of the screen:
//   ps:<space>, ps-vpn:<space>, ps-dns:<space>, ps-fw:<space>.

const MIN = 60000
export const DEFAULT_EGRESS = '203.0.113.24' // the same value as platform-systems.js uses when there is no network state
export const REGION = 'US East (Ohio)'
export const PROTOCOLS = ['TCP', 'UDP', 'All']
const MAX_LOG = 40
const APPLY_MS = 2 * MIN // a change to a VPN or the static IPs takes a moment (lab made: about two minutes)
const PARTNER_MS = 10 * MIN // a partner reads a mail and changes its allowlist in about ten minutes (lab made)

// ---------- addresses ----------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const num = (ip) => String(ip).split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0
const maskOf = (bits) => (Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0)
export const isIp = (x) => IPV4.test(String(x)) && String(x).split('.').every((o) => Number(o) <= 255)
export const inCidr = (ip, cidr) => {
  const [base, bits = '32'] = String(cidr).split('/')
  return isIp(ip) && isIp(base) && (num(ip) & maskOf(bits)) === (num(base) & maskOf(bits))
}
export const overlaps = (a, b) => {
  const [x, xb = '32'] = String(a).split('/')
  const [y, yb = '32'] = String(b).split('/')
  const bits = Math.min(Number(xb), Number(yb))
  return (num(x) & maskOf(bits)) === (num(y) & maskOf(bits))
}
export const isPrivate = (ip) => ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'].some((c) => inCidr(ip, c))
// The error of a CIDR block, or null. Host bits must be zero, the way AWS asks for it.
export function cidrError(text) {
  const t = String(text ?? '').trim()
  const [base, bits, extra] = t.split('/')
  if (extra !== undefined || !isIp(base) || !/^\d{1,2}$/.test(bits ?? '') || Number(bits) > 32) return `${t || 'An empty value'} is not a CIDR block. Write it as 10.40.0.0/16.`
  const net = (num(base) & maskOf(bits)) >>> 0
  if (net !== num(base)) return `${t} has host bits set. Use the network address ${[24, 16, 8, 0].map((s) => (net >>> s) & 255).join('.')}/${bits}.`
  return null
}

const hash = (text) => {
  const t = String(text)
  let h = 2166136261
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619)
  return h >>> 0
}

// ---------- state ----------

export const newSpace = (name, extra = {}) => ({
  name,
  region: REGION,
  envs: ['Sandbox', 'Production'],
  cidr: '10.110.0.0/22',
  // lab reading of the field: ranges of your own network that the space keeps clear of, so routes to them work
  reserved: ['10.20.0.0/16', '10.40.0.0/16'],
  status: 'Running',
  // pool: the addresses the platform gives on Enable (lab made, documentation range)
  staticIps: { enabled: false, state: 'Disabled', ips: [], pool: ['203.0.113.24', '203.0.113.25'] },
  firewall: {
    // the default rules of a new private space (cloudhub-2/ps-config-fw-rules); the lab does not apply inbound rules to calls
    inbound: [
      { type: 'Anywhere', cidr: '0.0.0.0/0', protocol: 'TCP', from: 443, to: 443 },
      { type: 'Anywhere', cidr: '0.0.0.0/0', protocol: 'TCP', from: 80, to: 80 },
    ],
    outbound: [
      { type: 'Anywhere', cidr: '0.0.0.0/0', protocol: 'TCP', from: 0, to: 65535 },
      { type: 'Anywhere', cidr: '0.0.0.0/0', protocol: 'TCP', from: 443, to: 443 },
    ],
  },
  vpns: [],
  tgws: [],
  dns: [],
  tls: [{ name: 'brightmart-api-tls', cn: '*.api.brightmart.example', issuer: 'Brightmart Issuing CA 2', expires: '2027-08-31' }],
  domains: [{ domain: 'orders.api.brightmart.example', tls: 'brightmart-api-tls' }],
  log: [],
  ...extra,
})

export const newVpn = (name, extra = {}) => ({
  name,
  remoteIp: '192.0.2.10',
  routing: 'Static',
  routes: ['10.20.0.0/16'],
  tunnels: [
    { name: 'Tunnel 1', outsideIp: '192.0.2.201', insideCidr: '169.254.10.0/30', status: 'UP' },
    { name: 'Tunnel 2', outsideIp: '192.0.2.202', insideCidr: '169.254.11.0/30', status: 'UP' },
  ],
  status: 'Available',
  pending: null,
  log: [],
  ...extra,
})

export const newNetwork = ({ spaces = [], ...extra } = {}) => ({
  spaces: Array.isArray(spaces) ? Object.fromEntries(spaces.map((x) => [x.name, x])) : spaces,
  sharedPool: ['198.51.100.71', '198.51.100.118', '198.51.100.163', '198.51.100.204'],
  dcEgress: '192.0.2.10', // the company firewall, which apps on your own servers call out from
  corpDns: ['10.20.0.53', '10.20.0.54'],
  onPrem: {
    'erp.corp.brightmart.lab': { ip: '10.40.12.30', ports: [8443] },
    'wms.corp.brightmart.lab': { ip: '10.20.6.14', ports: [443, 8080] },
    'sql01.corp.brightmart.lab': { ip: '10.20.7.21', ports: [1433] },
  },
  internet: {
    'login.microsoftonline.com': { ip: '192.0.2.150', ports: [443] },
    'api.larkspur-freight.example': { ip: '192.0.2.80', ports: [443], owner: 'Larkspur Freight', contact: 'integration@larkspur-freight.example', allow: null },
  },
  outbox: [],
  ...extra,
})

// The console of the lab: brightmart-ps with static IPs, a VPN to the data center and the company domain forwarded
export function defaultNetwork(now = 0) {
  const ps = newSpace('brightmart-ps', {
    staticIps: { enabled: true, state: 'Available', ips: ['203.0.113.24', '203.0.113.25'], pool: ['203.0.113.24', '203.0.113.25'] },
    vpns: [newVpn('brightmart-dc-vpn', { routes: ['10.20.0.0/16', '10.40.0.0/16'], log: [{ t: now, text: 'Tunnel 1 is UP. Tunnel 2 is UP.' }] })],
    tgws: [{ name: 'brightmart-tgw', tgwId: 'tgw-0a51e7c2d9', status: 'Available', routes: ['172.20.0.0/16'] }],
    dns: [{ domain: 'corp.brightmart.lab', servers: ['10.20.0.53', '10.20.0.54'] }],
  })
  return newNetwork({ spaces: [ps], created: now })
}

// a console saved while this module was a placeholder has state.network without spaces: it gets the defaults
export const upgradeNetwork = (n, now = 0) => (!n || n.spaces ? n : { ...defaultNetwork(now), ...n, spaces: defaultNetwork(now).spaces })
// Reads see a placeholder as the defaults (cached per object, so a read never changes the state); networkTick and the
// UI actions write the upgrade into the state.
const UPGRADED = new WeakMap()
const netOf = (s) => {
  const n = s?.network
  if (!n || n.spaces) return n ?? null
  if (!UPGRADED.has(n)) UPGRADED.set(n, upgradeNetwork(n, n.created ?? 0))
  return UPGRADED.get(n)
}
export const spacesOf = (s) => Object.values(netOf(s)?.spaces ?? {})
export const spaceOf = (s, name) => netOf(s)?.spaces?.[name] ?? null
// the private space an app runs in, or null for the shared space and for your own servers
export const spaceOfApp = (s, app) => {
  const x = app && !app.targetType ? spaceOf(s, app.target) : null
  return x && (x.envs ?? []).includes(app.env ?? 'Sandbox') ? x : null
}
export const appsIn = (s, name) => (s.apps ?? []).filter((a) => !a.targetType && a.target === name)
export const staticIpsOf = (x) => (x?.staticIps?.enabled && x.staticIps.state === 'Available' ? x.staticIps.ips : [])

// The outbound IP an app calls from. An egress.ip property wins (older labs set it). A private space with static IPs
// sends from one of them; which one depends on where the replica runs, so allowlist all of them. The shared space, and a
// private space without static IPs, send from a changing address of the platform: it changes when the app is deployed
// again (lab made: the next address of the pool for each new configuration).
export function egressOf(s, app) {
  const own = app?.props?.['egress.ip']
  if (own) return own
  const n = netOf(s)
  if (!n) return DEFAULT_EGRESS
  if (app?.targetType) return n.dcEgress ?? DEFAULT_EGRESS
  const seed = hash(`${app?.name ?? ''}:${app?.env ?? ''}`) + Number(app?.config ?? 1)
  const ips = staticIpsOf(spaceOfApp(s, app))
  if (ips.length) return ips[seed % ips.length]
  const pool = n.sharedPool?.length ? n.sharedPool : [DEFAULT_EGRESS]
  return pool[seed % pool.length]
}

// ---------- name resolution and paths ----------

const unknown = (host, why = 'Name or service not known') => ({ ok: false, kind: 'dns', type: 'HTTP:CONNECTIVITY', error: `${host}: ${why} (java.net.UnknownHostException)` })
const timeout = (kind) => ({ ok: false, kind, type: 'HTTP:CONNECTIVITY', error: 'connect timed out (java.net.SocketTimeoutException)' })
const hostOf = (x) => String(x ?? '').trim().replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, '').toLowerCase()

const portIn = (r, port, protocol) => (r.protocol === 'All' || r.protocol === protocol) && port >= Number(r.from) && port <= Number(r.to)
// the outbound rules of a space allow this address and port
export const outboundAllows = (x, ip, port, protocol = 'TCP') => (x.firewall?.outbound ?? []).some((r) => inCidr(ip, r.cidr) && portIn(r, port, protocol))

// How a packet from a private space gets to a private address: the space itself, a VPN or a transit gateway
// DNS forwarding is done by the resolver of the space, so the outbound rules of the apps do not apply to it (dns true)
function pathFrom(x, ip, port, protocol = 'TCP', dns = false) {
  if (inCidr(ip, x.cidr)) return { ok: true, via: 'space' }
  if (!dns && !outboundAllows(x, ip, port, protocol)) return timeout('firewall')
  const vpn = (x.vpns ?? []).find((v) => (v.routes ?? []).some((r) => inCidr(ip, r)))
  if (vpn) return vpn.tunnels.some((t) => t.status === 'UP') ? { ok: true, via: vpn.name } : timeout('tunnel-down')
  const tgw = (x.tgws ?? []).find((g) => g.status === 'Available' && (g.routes ?? []).some((r) => inCidr(ip, r)))
  return tgw ? { ok: true, via: tgw.name } : timeout('no-route')
}

// The address of a host as the app sees it. A private space sends the names under an internal domain to the DNS
// servers listed for it, over the VPN; every other name goes to the default DNS of the space, which knows public names.
export function resolve(s, app, target) {
  const host = hostOf(target)
  if (isIp(host)) return { ok: true, ip: host, via: 'address' }
  const n = netOf(s)
  if (!n) return { ok: true, ip: '192.0.2.99', via: 'default' } // no network state: every name resolves (older labs)
  if (app?.targetType) {
    const known = n.onPrem?.[host] ?? n.internet?.[host]
    return known ? { ok: true, ip: known.ip, via: 'company DNS' } : unknown(host)
  }
  const x = spaceOfApp(s, app)
  const zone = x && [...(x.dns ?? [])].sort((a, b) => b.domain.length - a.domain.length).find((d) => host === d.domain || host.endsWith(`.${d.domain}`))
  if (zone) {
    const server = (zone.servers ?? []).find((ip) => (n.corpDns ?? []).includes(ip) && pathFrom(x, ip, 53, 'UDP', true).ok)
    if (!server) return { ...unknown(host, 'Temporary failure in name resolution'), kind: 'dns-timeout' }
    const rec = n.onPrem?.[host]
    return rec ? { ok: true, ip: rec.ip, via: `DNS ${server}` } : unknown(host)
  }
  const pub = n.internet?.[host]
  return pub ? { ok: true, ip: pub.ip, via: 'default DNS' } : unknown(host)
}

// Can the app open a TCP connection to host:port? The errors are the ones the HTTP Request operation shows.
export function reach(s, app, target, port = 443) {
  const r = resolve(s, app, target)
  if (!r.ok) return r
  const n = netOf(s)
  const from = egressOf(s, app)
  if (!n || app?.targetType) return { ok: true, ip: r.ip, from, via: 'direct' }
  const x = spaceOfApp(s, app)
  const host = hostOf(target)
  const rec = n.onPrem?.[host] ?? n.internet?.[host] ?? Object.values({ ...n.onPrem, ...n.internet }).find((h) => h.ip === r.ip)
  let path = { ok: true, via: 'internet' }
  if (isPrivate(r.ip)) path = x ? pathFrom(x, r.ip, port) : timeout('no-route')
  else if (x && !outboundAllows(x, r.ip, port)) path = timeout('firewall')
  if (!path.ok) return path
  if (rec && !(rec.ports ?? []).includes(Number(port))) return { ok: false, kind: 'refused', type: 'HTTP:CONNECTIVITY', error: 'Connection refused (java.net.ConnectException)' }
  return { ok: true, ip: r.ip, from: isPrivate(r.ip) && x ? 'the private space' : from, via: path.via }
}

// An HTTPS call: reach() and then the IP allowlist of the host. `message` is the text the HTTP Request operation gives.
export function request(s, app, target, { port = 443, method = 'GET', path = '/' } = {}) {
  const host = hostOf(target)
  const url = `https://${host}${Number(port) === 443 ? '' : `:${port}`}${path}`
  const r = reach(s, app, host, port)
  if (!r.ok) return { ...r, url, message: `HTTP ${method} on resource '${url}' failed: ${r.error}.` }
  const rec = netOf(s)?.internet?.[host]
  const from = egressOf(s, app)
  if (rec?.allow && !rec.allow.some((c) => inCidr(from, c)))
    return { ok: false, kind: 'forbidden', type: 'HTTP:FORBIDDEN', status: 403, url, from, error: `Client IP ${from} is not on the allowlist of ${rec.owner ?? host}`, message: `HTTP ${method} on resource '${url}' failed: forbidden (403). Body: {"error":"ip_not_allowed","detail":"Client IP ${from} is not on the allowlist."}` }
  return { ok: true, status: method === 'POST' ? 201 : 200, url, from: r.from, via: r.via }
}

// the context an app gets as ctx.network
export function networkCtx(s, app) {
  return {
    egress: egressOf(s, app),
    space: spaceOfApp(s, app)?.name ?? null,
    resolve: (host) => resolve(s, app, host),
    reach: (host, port) => reach(s, app, host, port),
    request: (host, opts) => request(s, app, host, opts),
  }
}

// ---------- the clock ----------

const pushLog = (list, entry) => {
  list.push(entry)
  if (list.length > MAX_LOG) list.splice(0, list.length - MAX_LOG)
}
const ipsIn = (text) => [...new Set(String(text).match(/\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b/g) ?? [])]

// runs once a lab minute while state.network exists; changes `s` in place (the engine passes a draft)
export function networkTick(s) {
  if (!s.network) return s
  if (!s.network.spaces) s.network = upgradeNetwork(s.network, s.network.created ?? s.clock)
  const n = s.network
  for (const x of Object.values(n.spaces ?? {})) {
    if (x.staticIps?.state === 'Pending' && x.staticIps.until <= s.clock) {
      x.staticIps.state = 'Available'
      delete x.staticIps.until
      pushLog((x.log ??= []), { t: s.clock, text: `Static IPs ${x.staticIps.ips.join(', ')} are available. New outbound connections of the apps in ${x.name} use them.` })
    }
    for (const v of x.vpns ?? []) {
      if (v.pending && v.pending.until <= s.clock) {
        v.routes = v.pending.routes
        v.pending = null
        v.status = 'Available'
        pushLog((v.log ??= []), { t: s.clock, text: `Static routes updated: ${v.routes.join(', ') || 'none'}. Connection is Available.` })
      }
    }
  }
  // a partner answers a mail with addresses: it adds single addresses and small ranges to its allowlist
  for (const m of n.outbox ?? []) {
    if (m.done || m.t + PARTNER_MS > s.clock) continue
    m.done = true
    const host = Object.keys(n.internet ?? {}).find((h) => n.internet[h].contact && n.internet[h].contact === String(m.to).trim().toLowerCase())
    if (!host) continue
    const rec = n.internet[host]
    const found = ipsIn(`${m.subject} ${m.body}`)
    const wide = found.filter((c) => Number(c.split('/')[1] ?? 32) < 24)
    let body
    if (!found.length) body = `Hello Brightmart team. Your mail has no IP address in it, so we changed nothing. Please send the addresses your calls come from. ${rec.owner} integration team`
    else if (wide.length) body = `Hello Brightmart team. We cannot allow ${wide.join(', ')}: our security policy accepts single addresses and ranges up to /24 only. Please send the exact outbound addresses. Nothing was changed. ${rec.owner} integration team`
    else {
      const add = found.map((c) => (c.includes('/') ? c : `${c}/32`)).filter((c) => !cidrError(c))
      rec.allow = [...new Set([...(rec.allow ?? []), ...add])]
      body = `Hello Brightmart team. We added ${add.join(', ')} to the allowlist of ${host}. It now holds ${rec.allow.join(', ')}. ${rec.owner} integration team`
    }
    s.mail ??= []
    s.mail.push({ t: s.clock, to: 'ops@brightmart.example', subject: `Re: ${m.subject}`, body, source: rec.owner })
    if (s.mail.length > 40) s.mail.shift()
  }
  return s
}

// ---------- UI actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  if (!s.network) return s
  s.network = upgradeNetwork(s.network, s.clock)
  fn(s, s.network)
  return s
}
const at = (s) => s.clock ?? 0

export const enableStaticIps = (state, name) =>
  edit(state, (s, n) => {
    const x = n.spaces[name]
    if (!x || x.staticIps?.enabled) return
    const pool = x.staticIps?.pool?.length ? x.staticIps.pool : ['203.0.113.24', '203.0.113.25']
    x.staticIps = { ...x.staticIps, enabled: true, state: 'Pending', ips: [...pool], until: at(s) + APPLY_MS }
    pushLog((x.log ??= []), { t: at(s), text: `Static IPs requested for ${x.name}: ${pool.join(', ')}. Allocating.` })
  })

// Errors of a static route on a VPN, or []
export function routeErrors(s, name, vpnName, cidr) {
  const x = spaceOf(s, name)
  const v = x?.vpns.find((y) => y.name === vpnName)
  if (!v) return ['There is no such VPN connection.']
  const bad = cidrError(cidr)
  if (bad) return [bad]
  const c = String(cidr).trim()
  const routes = v.pending?.routes ?? v.routes
  if (routes.includes(c)) return [`${c} is already a route of ${v.name}.`]
  if (overlaps(c, x.cidr)) return [`${c} overlaps the CIDR block of the private space, ${x.cidr}. Traffic to it would stay in the space.`]
  if (v.routing !== 'Static') return ['This connection uses dynamic routing. Its routes come from BGP on your gateway.']
  return []
}
const changeRoutes = (state, name, vpnName, fn, text) =>
  edit(state, (s, n) => {
    const v = n.spaces[name]?.vpns.find((y) => y.name === vpnName)
    if (!v) return
    const routes = fn([...(v.pending?.routes ?? v.routes)])
    v.pending = { routes, until: at(s) + APPLY_MS }
    v.status = 'Updating'
    pushLog((v.log ??= []), { t: at(s), text })
  })
export function addVpnRoute(state, name, vpnName, cidr) {
  const errors = routeErrors(state, name, vpnName, cidr)
  if (errors.length) return { state, errors }
  const c = String(cidr).trim()
  return { state: changeRoutes(state, name, vpnName, (r) => [...r, c], `Static route ${c} added. Updating the connection.`), errors: [] }
}
export const removeVpnRoute = (state, name, vpnName, cidr) => changeRoutes(state, name, vpnName, (r) => r.filter((x) => x !== cidr), `Static route ${cidr} removed. Updating the connection.`)
// for labs: a tunnel goes UP or DOWN on the side of the remote gateway
export const setTunnel = (state, name, vpnName, index, status, why = '') =>
  edit(state, (s, n) => {
    const v = n.spaces[name]?.vpns.find((y) => y.name === vpnName)
    const t = v?.tunnels[index]
    if (!t) return
    t.status = status
    pushLog((v.log ??= []), { t: at(s), text: `${t.name} (${t.outsideIp}) is ${status}.${why ? ` ${why}` : ''}` })
  })

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
export function dnsErrors(s, name, domain, servers) {
  const x = spaceOf(s, name)
  if (!x) return ['There is no such private space.']
  const d = String(domain ?? '').trim().toLowerCase()
  const e = []
  if (!DOMAIN.test(d)) e.push(`${d || 'An empty value'} is not a domain name. Write it as corp.example.com, without a dot at the start.`)
  // from cloudhub-2/ps-gather-setup-info: MuleSoft and AWS domains cannot be internal domains
  else if (['cloudhub.io', 'mulesoft.com', 'anypointdns.net', 'amazonaws.com', 'compute.internal'].some((r) => d === r || d.endsWith(`.${r}`))) e.push(`${d} cannot be an internal domain. MuleSoft and AWS domains are not supported.`)
  if (x.dns.some((z) => z.domain === d)) e.push(`${d} is already an internal domain of ${x.name}.`)
  const list = servers.map((v) => String(v).trim()).filter(Boolean)
  if (!list.length) e.push('Add at least one DNS server.')
  for (const ip of list) if (!isIp(ip)) e.push(`${ip} is not an IPv4 address.`)
  return e
}
export function addInternalDomain(state, name, domain, servers) {
  const errors = dnsErrors(state, name, domain, servers)
  if (errors.length) return { state, errors }
  const d = String(domain).trim().toLowerCase()
  const next = edit(state, (s, n) => {
    const x = n.spaces[name]
    x.dns.push({ domain: d, servers: servers.map((v) => String(v).trim()).filter(Boolean) })
    pushLog((x.log ??= []), { t: at(s), text: `Internal domain ${d} added. Queries go to ${x.dns.at(-1).servers.join(', ')}.` })
  })
  return { state: next, errors: [] }
}
export const removeInternalDomain = (state, name, domain) =>
  edit(state, (s, n) => {
    const x = n.spaces[name]
    if (!x) return
    x.dns = x.dns.filter((z) => z.domain !== domain)
    pushLog((x.log ??= []), { t: at(s), text: `Internal domain ${domain} removed.` })
  })

// rule: { type: 'Anywhere'|'Custom'|'Private network', cidr, protocol, from, to }; dir: 'inbound'|'outbound'
export function ruleErrors(rule) {
  const e = []
  const bad = cidrError(rule.cidr)
  if (bad) e.push(bad)
  if (!PROTOCOLS.includes(rule.protocol)) e.push('Choose TCP, UDP or All.')
  const from = Number(rule.from)
  const to = Number(rule.to)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > 65535 || from > to) e.push('The port range is two numbers from 0 to 65535, the first not above the second.')
  return e
}
export function addFirewallRule(state, name, dir, rule) {
  const errors = ruleErrors(rule)
  if (errors.length) return { state, errors }
  const next = edit(state, (s, n) => {
    const x = n.spaces[name]
    const r = { type: rule.cidr === '0.0.0.0/0' ? 'Anywhere' : 'Custom', cidr: rule.cidr.trim(), protocol: rule.protocol, from: Number(rule.from), to: Number(rule.to) }
    x.firewall[dir].push(r)
    pushLog((x.log ??= []), { t: at(s), text: `${dir === 'inbound' ? 'Inbound' : 'Outbound'} rule added: ${r.protocol} ${r.from}-${r.to} ${dir === 'inbound' ? 'from' : 'to'} ${r.cidr}.` })
  })
  return { state: next, errors: [] }
}
export const removeFirewallRule = (state, name, dir, index) =>
  edit(state, (s, n) => {
    const x = n.spaces[name]
    const [r] = x?.firewall[dir].splice(index, 1) ?? []
    if (r) pushLog((x.log ??= []), { t: at(s), text: `${dir === 'inbound' ? 'Inbound' : 'Outbound'} rule removed: ${r.protocol} ${r.from}-${r.to} ${r.cidr}.` })
  })

// The lab mail tool: a mail from the operations team to someone outside, such as a partner. Lab made: the console
// has no mail client, and a partner who gets the mail answers it in networkTick.
export const sendMail = (state, to, subject, body) =>
  edit(state, (s, n) => {
    n.outbox ??= []
    n.outbox.push({ t: at(s), to: String(to).trim().toLowerCase(), subject: String(subject).trim(), body: String(body) })
    if (n.outbox.length > 20) n.outbox.shift()
  })
export const contactsOf = (s) => Object.entries(netOf(s)?.internet ?? {}).filter(([, h]) => h.contact).map(([host, h]) => ({ host, owner: h.owner, contact: h.contact }))
