// Observability: log forwarding to Splunk or ELK, custom dashboards and traces across apps. Pure and import free.
// Lives in state.observability.
//
// State shape (state.observability), filled lazily from the placeholder { created }:
//   splunk: { host, up, port, allTokens, indexes: [{ name, enabled }], tokens: [{ name, value, enabled, indexes, index,
//     sourcetype }], alerts: [{ name, search, every, window, threshold, to, enabled, throttle, lastRun, lastCount, fired,
//     lastFired, tested }], events: [event], internal: [splunkd event], hec: [{ t, app, status, text, n }], lastSearch }
//   elk: { host, port, n } (lab made: a Socket appender to Logstash only counts what it sent)
//   cursors: { 'env|app': { t, n } }, the newest log time already handed to the appenders of each app,
//     and how many lines at that time were handed (an older save holds a plain number)
//   dashboards: [{ id, name, range, widgets: [{ id, metric, app }], viewed }]
//   traces: [{ id, cid, t, ms, st, app, op, spans: [{ id, p, app, kind, fl, op, at, ms, st, err }] }], the newest 50
//   tracing: { sample }, 0 keeps only the traces of the API client; n keeps 1 trace in n of steady traffic, and every
//     slow or failed one (lab made tail sampling)
//   n: a counter for ids
//
// A Splunk event: { _time, index, sourcetype, source, host, app, env, level, loggerName, message, correlationId }
//
// An app opts in with two fields that the deploy keeps: app.log4j (the text of src/main/resources/log4j2.xml) and
// app.disableChLogs (the Disable CloudHub logs checkbox of Runtime Manager).
// Lab made, after CloudHub 1.0: with the box clear, CloudHub uses its own Log4j configuration and ignores the file in
// the app, so nothing is forwarded. With the box ticked, the file in the app is used, and Runtime Manager shows logs
// only while that file keeps the Log4J2CloudhubLogAppender. CloudHub 2.0 handles its own log capture differently;
// the lab applies the CloudHub 1.0 rule to every app. Source: cloudhub/custom-log-appender.

export const SPLUNK_HOST = 'splunk.harbor.lab'
export const HEC_PORT = 8088
export const HEC_URL = `https://${SPLUNK_HOST}:${HEC_PORT}/services/collector`
export const ELK_HOST = 'elk.harbor.lab'
const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
// lab made limits, so a long lab stays small when saved
const MAX_EVENTS = 250
const MAX_INTERNAL = 40
const MAX_HEC = 30
const MAX_TRACES = 50
const MAX_MESSAGE = 300
// lab made: one HEC round trip, and the most a request waits on a logging call that cannot connect
const HEC_MS = 35
const HANG_MS = 30000

// ---------- the seed ----------

export const defaultObservability = (now) => ({ created: now })
export const newSplunk = () => ({
  host: SPLUNK_HOST,
  up: true,
  port: HEC_PORT,
  allTokens: true,
  indexes: [
    { name: 'main', enabled: true },
    { name: 'mule', enabled: true },
    { name: 'mule_audit', enabled: false },
  ],
  tokens: [{ name: 'mule-apps', value: 'hbr-hec-5d20-apps', enabled: true, indexes: ['mule'], index: 'mule', sourcetype: 'mule:app' }],
  alerts: [],
  events: [],
  internal: [],
  hec: [],
  lastSearch: null,
})
// a save from before this module was built holds { created }: it gets the rest here
export function fill(o) {
  if (!o) return o
  o.splunk ??= newSplunk()
  const sp = o.splunk
  for (const [k, v] of Object.entries(newSplunk())) sp[k] ??= v
  o.elk ??= { host: ELK_HOST, port: 5044, n: 0 }
  o.cursors ??= {}
  o.dashboards ??= []
  o.traces ??= []
  o.tracing ??= { sample: 0 }
  o.n ??= 1
  return o
}
export const upgradeObservability = (o, now = 0) => fill(o ?? defaultObservability(now))
const nextN = (o) => (o.n = (o.n ?? 1) + 1)
const push = (list, item, max) => {
  list.push(item)
  if (list.length > max) list.splice(0, list.length - max)
}
const hex = (seed, n) => {
  let h = 2166136261
  const text = String(seed)
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  let out = ''
  for (let i = 0; out.length < n; i++) {
    h = Math.imul(h ^ (i + 0x9e37), 16777619) >>> 0
    out += ((h ^ (h >>> 13)) >>> 0).toString(16).padStart(8, '0')
  }
  return out.slice(0, n)
}

// ---------- log4j2.xml ----------

const attrs = (text) => Object.fromEntries([...String(text ?? '').matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]))
const refsIn = (body) => [...String(body ?? '').matchAll(/<AppenderRef\b([^>]*)\/?>/g)].map((m) => attrs(m[1]).ref).filter(Boolean)
// CloudHub properties reach the JVM as system properties, so log4j2.xml reads them with ${sys:name}. Lab made: protected
// properties are passed the same way. A lookup with no value stays as it is written, as in Log4j.
export const resolve = (text, props = {}) => String(text ?? '').replace(/\$\{sys:([^}:]+)(?::-([^}]*))?\}/g, (all, key, dflt) => props[key] ?? dflt ?? all)

const CACHE = new Map()
// The appenders and the root logger of a log4j2.xml. Each appender: { type, name, url, auth, host, port, refs, attrs }.
export function parseLog4j(xml) {
  const text = String(xml ?? '')
  if (CACHE.has(text)) return CACHE.get(text)
  const out = { appenders: [], root: null, rootRefs: [], asyncRoot: false, errors: [] }
  if (!/<Configuration\b/.test(text)) out.errors.push('The file has no <Configuration> element.')
  const block = (tag) => [...text.matchAll(new RegExp(`<${tag}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}>)`, 'g'))]
  for (const m of block('Http')) {
    const a = attrs(m[1])
    const props = [...String(m[2] ?? '').matchAll(/<Property\b([^>]*)\/?>/g)].map((p) => attrs(p[1]))
    out.appenders.push({ type: 'Http', name: a.name, url: a.url ?? '', auth: props.find((p) => p.name === 'Authorization')?.value ?? null, connectTimeoutMillis: Number(a.connectTimeoutMillis ?? 0), attrs: a })
  }
  for (const m of block('Socket')) {
    const a = attrs(m[1])
    out.appenders.push({ type: 'Socket', name: a.name, host: a.host ?? '', port: Number(a.port ?? 0), protocol: a.protocol ?? 'TCP', attrs: a })
  }
  for (const m of block('Async')) {
    const a = attrs(m[1])
    out.appenders.push({ type: 'Async', name: a.name, refs: refsIn(m[2]), attrs: a })
  }
  for (const m of block('Log4J2CloudhubLogAppender')) out.appenders.push({ type: 'CloudHub', name: attrs(m[1]).name, attrs: attrs(m[1]) })
  for (const tag of ['Console', 'RollingFile', 'File']) for (const m of block(tag)) out.appenders.push({ type: tag, name: attrs(m[1]).name, attrs: attrs(m[1]) })
  const root = text.match(/<(AsyncRoot|Root)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/)
  if (root) {
    out.root = { tag: root[1], level: attrs(root[2]).level ?? 'ERROR' }
    out.asyncRoot = root[1] === 'AsyncRoot'
    out.rootRefs = refsIn(root[3])
  } else out.errors.push('The file has no <Root> or <AsyncRoot> logger.')
  for (const ref of out.rootRefs) if (!out.appenders.some((x) => x.name === ref)) out.errors.push(`Unable to locate appender "${ref}" for logger config "root"`)
  if (CACHE.size > 40) CACHE.clear()
  CACHE.set(text, out)
  return out
}
// The appenders that really receive the events of the root logger. An appender behind an Async wrapper, or any
// appender of an AsyncRoot, does not block the flow that logs.
export function reachedAppenders(cfg) {
  const byName = Object.fromEntries(cfg.appenders.map((x) => [x.name, x]))
  const out = []
  const walk = (name, async, seen) => {
    const x = byName[name]
    if (!x || seen.has(name)) return
    if (x.type === 'Async') x.refs.forEach((r) => walk(r, true, new Set([...seen, name])))
    else out.push({ ...x, async: async || cfg.asyncRoot })
  }
  cfg.rootRefs.forEach((r) => walk(r, false, new Set()))
  return out
}
// Lab made: the Http appender of Log4j sends one request per event. The lab calls an Http appender "batched" when an
// Async wrapper with a bufferSize sits in front of it, so the flow hands events to a queue that a thread drains.
export function batchedHttp(cfg) {
  const asyncs = cfg.appenders.filter((x) => x.type === 'Async' && Number(x.attrs.bufferSize) > 0)
  return cfg.appenders.some((x) => x.type === 'Http' && asyncs.some((a) => a.refs.includes(x.name)) && cfg.rootRefs.some((r) => asyncs.some((a) => a.name === r)))
}
// Is the custom file in use, and does Runtime Manager still see the logs of the app?
export function loggingOf(app) {
  if (!app?.log4j || !app.disableChLogs) return { custom: false, cloudhub: true, appenders: [] }
  const cfg = parseLog4j(app.log4j)
  const reached = reachedAppenders(cfg)
  return { custom: true, cfg, appenders: reached, cloudhub: reached.some((x) => x.type === 'CloudHub') }
}

const urlParts = (url) => {
  const m = String(url).match(/^(https?):\/\/([^/:?]+)(?::(\d+))?(\/[^?]*)?(?:\?(.*))?$/)
  if (!m) return null
  const query = Object.fromEntries((m[5] ?? '').split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent)))
  return { scheme: m[1], host: m[2], port: Number(m[3] ?? (m[1] === 'https' ? 443 : 80)), path: m[4] ?? '/', query }
}

// ---------- the HTTP Event Collector ----------

// What HEC answers one request. `net` is a failure before any HTTP answer. The texts and codes are the ones HEC sends.
export function hecAnswer(sp, { url, auth }) {
  const u = urlParts(url)
  if (!u) return { net: `java.net.MalformedURLException: no protocol: ${url}` }
  if (u.host !== sp.host) return { net: `java.net.UnknownHostException: ${u.host}` }
  // the network drops the packets: the connect waits until it times out
  if (!sp.up) return { net: 'java.net.SocketTimeoutException: connect timed out', slow: true }
  // lab made: HEC stops listening on its port when it is disabled in Global Settings
  if (u.port !== sp.port || !sp.allTokens) return { net: `java.net.ConnectException: Connection refused (Connection refused) to ${u.host}:${u.port}` }
  if (!/^\/services\/collector(\/raw|\/event)?\/?$/.test(u.path)) return { status: 404, body: '{"text":"The requested URL was not found on this server.","code":404}', text: 'Not found', code: 404 }
  if (!auth) return { status: 401, body: '{"text":"Token is required","code":2}', text: 'Token is required', code: 2 }
  const m = String(auth).match(/^Splunk\s+(\S+)$/)
  if (!m) return { status: 401, body: '{"text":"Invalid authorization","code":3}', text: 'Invalid authorization', code: 3 }
  const token = sp.tokens.find((t) => t.value === m[1])
  if (!token) return { status: 403, body: '{"text":"Invalid token","code":4}', text: 'Invalid token', code: 4 }
  if (!token.enabled) return { status: 403, body: '{"text":"Token disabled","code":1}', text: 'Token disabled', code: 1 }
  const index = u.query.index || token.index || 'main'
  const idx = sp.indexes.find((x) => x.name === index)
  if (!idx || !idx.enabled || !(token.indexes ?? []).includes(index)) return { status: 400, body: '{"text":"Incorrect index","code":7,"invalid-event-number":0}', text: 'Incorrect index', code: 7 }
  // lab made: the query string gives the metadata on every endpoint; the event endpoint really reads it from the JSON envelope
  return { status: 200, body: '{"text":"Success","code":0}', text: 'Success', code: 0, token, index, sourcetype: u.query.sourcetype || token.sourcetype || 'httpevent', host: u.query.host }
}
const STATUS_LOGGER = 'org.apache.logging.log4j.status.StatusLogger'
const cidOf = (text) => String(text ?? '').match(/^event:(\S+)\s/)?.[1]
const plain = (text) => String(text ?? '').replace(/^event:\S+\s/, '')
const ipOf = (name) => `10.0.${(name.length * 7) % 200}.${(name.charCodeAt(0) * 3) % 250}`

function forward(s, o, app) {
  const sp = o.splunk
  const key = `${app.env}|${app.name}`
  const use = loggingOf(app)
  // the cursor is a position: { t, n } means n lines logged at time t were handed already.
  // A plain number comes from an older save: every line up to that time was handed.
  const cur = o.cursors[key]
  const since = typeof cur === 'number' ? cur : cur?.t ?? -Infinity
  let skip = typeof cur === 'number' ? Infinity : cur?.n ?? 0
  const fresh = app.logs.filter((l) => l.t > since || (l.t === since && skip-- <= 0))
  const lines = fresh.filter((l) => l.logger !== STATUS_LOGGER)
  // without the CloudHub appender Runtime Manager gets nothing: the lines are gone from the console at the next minute
  if (!use.cloudhub && fresh.length) {
    const gone = new Set(fresh)
    app.logs = app.logs.filter((l) => !gone.has(l))
  }
  const top = Math.max(since, ...fresh.map((l) => l.t))
  if (top !== -Infinity) o.cursors[key] = { t: top, n: app.logs.filter((l) => l.t === top).length }
  if (!use.custom || !lines.length) return
  const problems = []
  for (const x of use.appenders) {
    if (x.type === 'Http') {
      const r = hecAnswer(sp, { url: x.url, auth: x.auth === null ? null : resolve(x.auth, propsOf(app)) })
      push(sp.hec, { t: s.clock, app: app.name, status: r.status ?? 0, text: r.net ?? r.body, n: lines.length }, MAX_HEC)
      if (r.status === 200) {
        for (const l of lines)
          push(sp.events, { _time: l.t, index: r.index, sourcetype: r.sourcetype, source: `http:${r.token.name}`, host: r.host || app.name, app: app.name, env: app.env, level: l.level, loggerName: l.logger, message: plain(l.text).replace(/^\s*\*+\s*/, '').trim().slice(0, MAX_MESSAGE), correlationId: cidOf(l.text) ?? null }, MAX_EVENTS)
        continue
      }
      if (r.status) {
        // splunkd writes each refused request to its own log, index _internal. Lab made: one line a minute for each app.
        push(sp.internal, { _time: s.clock, index: '_internal', sourcetype: 'splunkd', source: '/opt/splunk/var/log/splunk/splunkd.log', host: 'splunk-idx01', component: 'HttpInputDataHandler', log_level: 'ERROR', app: null, level: 'ERROR', loggerName: 'HttpInputDataHandler', message: `Failed processing http input, token name=n/a, parsing_err="${r.text}", channel=n/a, source_IP=${ipOf(app.name)}, reply=${r.code}, events_processed=0, http_input_id=n/a`, correlationId: null }, MAX_INTERNAL)
      }
      // an appender behind Async or AsyncRoot drops what it cannot send, and ignoreExceptions keeps the flow unaware
      if (!x.async) problems.push(`Unable to send HTTP in appender [${x.name}] ${r.net ?? `java.io.IOException: Server returned HTTP response code: ${r.status} for URL: ${x.url}`}`)
    } else if (x.type === 'Socket') {
      if (x.host === ELK_HOST && x.port === o.elk.port) o.elk.n += lines.length
      else if (!x.async) problems.push(`Unable to write to stream TCP:${x.host}:${x.port} for appender ${x.name}: java.net.UnknownHostException: ${x.host}`)
    }
  }
  if (use.cloudhub) for (const p of problems.slice(0, 1)) push(app.logs, { t: s.clock, level: 'ERROR', text: p, logger: STATUS_LOGGER, config: app.config }, 120)
}
const propsOf = (app) => ({ ...app.props, ...app.secrets })

// How much longer a request takes because its log lines go through an appender that blocks the flow
export function loggingDelay(s, app, lines) {
  const use = loggingOf(app)
  if (!use.custom || !lines) return 0
  const sp = s.observability?.splunk ?? newSplunk()
  let ms = 0
  for (const x of use.appenders.filter((a) => a.type === 'Http' && !a.async)) {
    const r = hecAnswer(sp, { url: x.url, auth: resolve(x.auth ?? '', propsOf(app)) })
    // lab made: a connection that cannot be made waits connectTimeoutMillis, which is 0 (no limit) unless it is set
    ms += r.slow ? Math.min(HANG_MS, x.connectTimeoutMillis || HANG_MS) * lines : HEC_MS * lines
  }
  return Math.min(HANG_MS, ms)
}

// ---------- the tick ----------

function runAlerts(s, o) {
  const sp = o.splunk
  for (const a of sp.alerts) {
    if (!a.enabled || (a.lastRun != null && s.clock - a.lastRun < (a.every ?? 5) * MINUTE)) continue
    const r = runSpl(o, a.search, s.clock - (a.window ?? a.every ?? 5) * MINUTE, s.clock)
    a.lastRun = s.clock
    a.lastCount = r.count
    if (r.count > (a.threshold ?? 0) && (a.lastFired == null || s.clock - a.lastFired >= (a.throttle ?? 60) * MINUTE)) {
      a.lastFired = s.clock
      a.fired = (a.fired ?? 0) + 1
      s.mail ??= []
      s.mail.push({ t: s.clock, to: a.to, subject: `Splunk Alert: ${a.name}`, body: `The alert condition for '${a.name}' was triggered. Number of results: ${r.count} in the last ${a.window ?? a.every} minutes. Search: ${a.search}`, source: 'Splunk' })
      if (s.mail.length > 40) s.mail.shift()
    }
  }
}

// runs once a lab minute while state.observability exists
export function observabilityTick(s) {
  const o = s.observability
  if (!o) return s
  const forwarding = (s.apps ?? []).filter((a) => a.log4j)
  if (!o.splunk && !forwarding.length) return s
  fill(o)
  for (const app of forwarding) if (app.status === 'Running') forward(s, o, app)
  runAlerts(s, o)
  return s
}

// ---------- search: a small part of SPL ----------

export const TIME_RANGES = [
  ['15m', 'Last 15 minutes', 15 * MINUTE],
  ['60m', 'Last 60 minutes', HOUR],
  ['4h', 'Last 4 hours', 4 * HOUR],
  ['24h', 'Last 24 hours', DAY],
  ['7d', 'Last 7 days', 7 * DAY],
  ['all', 'All time', Infinity],
]
export const rangeOf = (key, now) => {
  const r = TIME_RANGES.find((x) => x[0] === key) ?? TIME_RANGES[1]
  return [r[2] === Infinity ? -Infinity : now - r[2], now]
}
// the pipes of a search, not counting a | inside quotes
const pipes = (q) => {
  const out = ['']
  let quoted = false
  for (const ch of String(q ?? '')) {
    if (ch === '"') quoted = !quoted
    if (ch === '|' && !quoted) out.push('')
    else out[out.length - 1] += ch
  }
  return out.map((x) => x.trim())
}
const tokens = (text) => [...String(text).matchAll(/(NOT\s+)?(?:([\w.]+)\s*(!=|=)\s*("[^"]*"|[^\s"]+)|"([^"]*)"|(\S+))/g)]
const like = (want) => {
  const w = String(want).toLowerCase()
  if (!w.includes('*')) return (v) => String(v ?? '').toLowerCase() === w
  const re = new RegExp(`^${w.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's')
  return (v) => re.test(String(v ?? '').toLowerCase())
}
export const rawOf = (e) =>
  e.index === '_internal'
    ? `${e.log_level} ${e.component} [splunkd] ${e.message}`
    : JSON.stringify({ level: e.level, loggerName: e.loggerName, message: e.message, correlationId: e.correlationId ?? undefined, app: e.app })
const FIELDS = ['host', 'source', 'sourcetype', 'index', 'app', 'level', 'loggerName', 'correlationId', 'message', 'component', 'log_level']
export const fieldsOf = (e) => Object.fromEntries(FIELDS.filter((k) => e[k] !== undefined && e[k] !== null).map((k) => [k, e[k]]))

function matcher(first) {
  const tests = []
  let indexes = null
  for (const m of tokens(first.replace(/^search\s+/i, ''))) {
    const not = Boolean(m[1])
    if (m[2]) {
      const value = m[4].replace(/^"|"$/g, '')
      const field = m[2]
      const eq = like(value)
      if (field === 'index') {
        if (!not && m[3] === '=') (indexes ??= []).push(eq)
        else tests.push((e) => !eq(e.index))
        continue
      }
      const t = (e) => eq(field === '_raw' ? rawOf(e) : e[field])
      tests.push(not !== (m[3] === '!=') ? (e) => !t(e) : t)
    } else {
      const word = (m[5] ?? m[6]).toLowerCase()
      if (word === 'and') continue
      // lab made: the lab joins every term with AND
      if (word === 'or') return { tests: [() => false], indexes, error: 'The lab search joins terms with AND only. Run one search for each value, or use stats count by field.' }
      const t = (e) => rawOf(e).toLowerCase().includes(word.replace(/\*/g, ''))
      tests.push(not ? (e) => !t(e) : t)
    }
  }
  return { tests, indexes }
}
const SPANS = { s: 1000, m: MINUTE, h: HOUR, d: DAY }
const countBy = (list, keys) => {
  const map = new Map()
  for (const e of list) {
    const k = JSON.stringify(keys.map((f) => e[f] ?? null))
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map].map(([k, n]) => [...JSON.parse(k), n])
}
// One search over the indexed events. Returns { events, count, columns, rows, kind, error, span }.
// Lab made: a search with no index= term looks in every index but _internal.
export function runSpl(o, query, from = -Infinity, to = Infinity) {
  const sp = o?.splunk ?? newSplunk()
  const [first, ...commands] = pipes(query)
  const { tests, indexes, error } = matcher(first)
  const all = [...sp.events, ...sp.internal].filter((e) => e._time > from && e._time <= to)
  let events = all.filter((e) => (indexes ? indexes.some((eq) => eq(e.index)) : e.index !== '_internal') && tests.every((t) => t(e))).sort((a, b) => b._time - a._time)
  let table = null
  let span = null
  const out = { error: error ?? null }
  for (const cmd of commands) {
    const [name, ...rest] = cmd.split(/\s+/)
    const args = rest.join(' ')
    const lower = name.toLowerCase()
    if (lower === 'head') {
      const n = Number(args || 10)
      if (table) table.rows = table.rows.slice(0, n)
      else events = events.slice(0, n)
    } else if (lower === 'stats') {
      const m = args.match(/^count(?:\(([\w.]+)\))?(?:\s+as\s+([\w.]+))?(?:\s+by\s+(.+))?$/i) ?? args.match(/^dc\(([\w.]+)\)(?:\s+as\s+([\w.]+))?(?:\s+by\s+(.+))?$/i)
      if (!m) return { ...empty(events), error: `Error in 'stats' command: the lab knows count, count(field) and dc(field), with "as" and "by".` }
      const by = (m[3] ?? '').split(/[\s,]+/).filter(Boolean)
      const label = m[2] ?? (/^dc/i.test(args) ? `dc(${m[1]})` : m[1] ? `count(${m[1]})` : 'count')
      const src = m[1] && !/^dc/i.test(args) ? events.filter((e) => e[m[1]] != null) : events
      const rows = /^dc/i.test(args) ? countBy(src, by).map((r) => [...r.slice(0, -1), new Set(src.filter((e) => by.every((f, i) => (e[f] ?? null) === r[i])).map((e) => e[m[1]])).size]) : countBy(src, by)
      table = { columns: [...by, label], rows: rows.sort((a, b) => b.at(-1) - a.at(-1)) }
    } else if (lower === 'timechart') {
      const m = args.match(/^(?:span=(\d+)([smhd])\s+)?count(?:\s+by\s+([\w.]+))?$/i)
      if (!m) return { ...empty(events), error: `Error in 'timechart' command: the lab knows timechart span=5m count, with an optional "by field".` }
      span = Number(m[1] ?? 5) * SPANS[(m[2] ?? 'm').toLowerCase()]
      const by = m[3]
      const lo = Number.isFinite(from) ? from : (events.at(-1)?._time ?? 0)
      const hi = Number.isFinite(to) ? to : (events[0]?._time ?? lo)
      const start = Math.floor(lo / span) * span
      const end = Math.floor(hi / span) * span
      const values = by ? [...new Set(events.map((e) => String(e[by] ?? 'NULL')))].slice(0, 6) : ['count']
      const rows = []
      // lab made: at most 400 buckets; a wide range with a short span keeps its newest buckets
      for (let t = Math.max(start, end - 399 * span); t <= end; t += span) {
        const inside = events.filter((e) => e._time >= t && e._time < t + span)
        rows.push([t, ...values.map((v) => (by ? inside.filter((e) => String(e[by] ?? 'NULL') === v).length : inside.length))])
      }
      table = { columns: ['_time', ...values], rows, time: true }
    } else if (lower === 'table' || lower === 'fields') {
      const cols = args.split(/[\s,]+/).filter(Boolean)
      table = table ? { columns: cols, rows: table.rows.map((r) => cols.map((c) => r[table.columns.indexOf(c)] ?? '')) } : { columns: cols, rows: events.map((e) => cols.map((c) => (c === '_time' ? e._time : e[c] ?? ''))), time: cols[0] === '_time' }
    } else if (lower === 'sort') {
      const m = args.match(/^(?:\d+\s+)?(-|\+)?\s*([\w.()]+)$/)
      if (!m) return { ...empty(events), error: `Error in 'sort' command: give one field, such as sort -count.` }
      const dir = m[1] === '-' ? -1 : 1
      if (table) {
        const i = table.columns.indexOf(m[2])
        table.rows = [...table.rows].sort((a, b) => (a[i] > b[i] ? dir : a[i] < b[i] ? -dir : 0))
      } else events = [...events].sort((a, b) => ((a[m[2]] ?? '') > (b[m[2]] ?? '') ? dir : (a[m[2]] ?? '') < (b[m[2]] ?? '') ? -dir : 0))
    } else return { ...empty(events), error: `Unknown search command '${name}'.` }
  }
  return { events, count: table ? table.rows.length : events.length, columns: table?.columns ?? null, rows: table?.rows ?? null, kind: table ? 'table' : 'events', time: table?.time ?? false, span, error: out.error }
}
const empty = (events) => ({ events, count: 0, columns: null, rows: null, kind: 'events', time: false, span: null })

// ---------- Splunk actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.observability = fill(s.observability ?? defaultObservability(s.clock ?? 0))
  s.seen ??= {}
  fn(s, s.observability, s.clock ?? 0)
  return s
}
const see = (s, key) => void (s.seen[key] ??= s.clock)

// Search and Reporting: runs a search and keeps what it found, for the lab steps
export const runSearch = (state, query, range = '60m') =>
  edit(state, (s, o, now) => {
    const [from, to] = rangeOf(range, now)
    const r = runSpl(o, query, from, to)
    const newest = r.events.reduce((t, e) => Math.max(t, e._time), -Infinity)
    o.splunk.lastSearch = { q: String(query).slice(0, 300), range, t: now, n: r.count, events: r.events.length, newest: Number.isFinite(newest) ? newest : null, apps: [...new Set(r.events.map((e) => e.app).filter(Boolean))].slice(0, 6), error: r.error }
    see(s, 'splunk:search')
    if (/index\s*=\s*_internal/i.test(query)) see(s, 'splunk:internal')
  })
export const viewHec = (state) => edit(state, (s) => see(s, 'splunk:hec'))
export const viewAlerts = (state) => edit(state, (s) => see(s, 'splunk:alerts'))
export const setHecGlobal = (state, patch) => edit(state, (s, o) => void Object.assign(o.splunk, patch))
export const setToken = (state, name, patch) =>
  edit(state, (s, o) => {
    const t = o.splunk.tokens.find((x) => x.name === name)
    if (t) Object.assign(t, patch)
  })
// New Token: Splunk makes a GUID. Lab made: the value comes from a counter, so a lab plays the same each time.
export function addToken(state, { name, index, indexes, sourcetype }) {
  const errors = []
  const n = String(name ?? '').trim()
  if (!/^[\w.-]{2,60}$/.test(n)) errors.push('A token name has letters, digits, dots, dashes and underscores.')
  if (state.observability?.splunk?.tokens?.some((t) => t.name === n)) errors.push(`The token ${n} exists already.`)
  const list = [].concat(indexes ?? index ?? []).filter(Boolean)
  if (!list.length) errors.push('Choose at least one allowed index.')
  if (errors.length) return { state, errors }
  return { state: edit(state, (s, o) => void o.splunk.tokens.push({ name: n, value: `hbr-hec-${hex(n + nextN(o), 4)}-${n.slice(0, 6)}`, enabled: true, indexes: list, index: index || list[0], sourcetype: sourcetype ?? '' })), errors: [] }
}
export const setIndex = (state, name, enabled) =>
  edit(state, (s, o) => {
    const x = o.splunk.indexes.find((i) => i.name === name)
    if (x) x.enabled = enabled
  })
// Settings, Indexes, New Index
export function addIndex(state, name) {
  const n = String(name ?? '').trim()
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(n)) return { state, errors: ['An index name has lowercase letters, digits, underscores and dashes, and cannot start with an underscore or a dash.'] }
  if (state.observability?.splunk?.indexes?.some((x) => x.name === n)) return { state, errors: [`The index ${n} exists already.`] }
  return { state: edit(state, (s, o) => void o.splunk.indexes.push({ name: n, enabled: true })), errors: [] }
}
// Save As, Alert: a scheduled search that mails when it finds more than `threshold` results
export function addAlert(state, form) {
  const name = String(form?.name ?? '').trim()
  const errors = []
  if (!name) errors.push('Give the alert a title.')
  if (!String(form?.search ?? '').trim()) errors.push('The alert needs a search.')
  if (state.observability?.splunk?.alerts?.some((a) => a.name === name)) errors.push(`An alert named ${name} exists already.`)
  if (!(Number(form?.every) >= 1)) errors.push('Run the alert every 1 minute or more.')
  if (errors.length) return { state, errors }
  return { state: edit(state, (s, o) => void o.splunk.alerts.push(newAlert({ ...form, name, every: Number(form.every), window: Number(form.window ?? form.every), threshold: Number(form.threshold ?? 0), created: s.clock }))), errors: [] }
}
export const setAlert = (state, name, patch) =>
  edit(state, (s, o) => {
    const a = o.splunk.alerts.find((x) => x.name === name)
    if (a) Object.assign(a, patch)
  })
// Searches, reports, and alerts: Run opens the search of the alert over its own window and keeps the count
export const testAlert = (state, name) =>
  edit(state, (s, o, now) => {
    const a = o.splunk.alerts.find((x) => x.name === name)
    if (!a) return
    const r = runSpl(o, a.search, now - (a.window ?? a.every ?? 5) * MINUTE, now)
    a.tested = { t: now, n: r.count }
    see(s, 'splunk:search')
    see(s, 'splunk:alerts')
  })
export const newAlert = (extra) => ({ name: 'alert', search: '', every: 5, window: 5, threshold: 0, to: 'ops@harbor.example', enabled: true, throttle: 60, lastRun: null, lastCount: null, fired: 0, lastFired: null, tested: null, ...extra })

// ---------- log4j2.xml templates ----------

const CLOUDHUB = `    <Log4J2CloudhubLogAppender name="CLOUDHUB"
        addressProvider="com.mulesoft.ch.logging.DefaultAggregatorAddressProvider"
        applicationContext="com.mulesoft.ch.logging.DefaultApplicationContext"
        appendRetryIntervalMs="\${sys:logging.appendRetryInterval}"
        appendMaxAttempts="\${sys:logging.appendMaxAttempts}">
      <PatternLayout pattern="[%d{MM-dd HH:mm:ss}] %-5p %c{1} [%t]: %m%n"/>
    </Log4J2CloudhubLogAppender>
`
// The usual shape: the Splunk HTTP appender behind an Async wrapper, and the CloudHub appender so Runtime Manager keeps
// the logs. The attributes of the CloudHub appender are shortened here; the docs page lists them all.
export function log4jTemplate({ token = '${sys:splunk.hec.token}', index = 'mule', sourcetype = 'mule:app', cloudhub = true, async = true, host = SPLUNK_HOST } = {}) {
  const target = async ? 'AsyncSplunk' : 'Splunk'
  const root = async ? 'AsyncRoot' : 'Root'
  return `<?xml version="1.0" encoding="utf-8"?>
<Configuration status="WARN"${cloudhub ? ' packages="com.mulesoft.ch.logging.appender"' : ''}>
  <Appenders>
    <Http name="Splunk" url="https://${host}:${HEC_PORT}/services/collector/raw?index=${index}&amp;sourcetype=${sourcetype}" connectTimeoutMillis="2000">
      <Property name="Authorization" value="Splunk ${token}"/>
      <JsonLayout compact="true" eventEol="true" properties="true"/>
    </Http>
${async ? `    <Async name="AsyncSplunk" bufferSize="1024" blocking="false">
      <AppenderRef ref="Splunk"/>
    </Async>
` : ''}${cloudhub ? CLOUDHUB : ''}  </Appenders>
  <Loggers>
    <${root} level="INFO">
${cloudhub ? '      <AppenderRef ref="CLOUDHUB"/>\n' : ''}      <AppenderRef ref="${target}"/>
    </${root}>
  </Loggers>
</Configuration>
`
}
export const ELK_SNIPPET = `    <Socket name="Logstash" host="${ELK_HOST}" port="5044" protocol="TCP">
      <JsonLayout compact="true" eventEol="true"/>
    </Socket>
`

// ---------- custom dashboards ----------

// Lab made: the metrics of a custom dashboard chart, per application. Anypoint Monitoring builds these in its query
// editor; custom dashboards need the Advanced or Titanium tier.
export const DASH_METRICS = ['Requests', 'Errors', 'Response time p95', 'Response time average', 'CPU']
export const percentile = (values, p) => {
  const list = values.filter((v) => typeof v === 'number').sort((a, b) => a - b)
  if (!list.length) return null
  return list[Math.min(list.length - 1, Math.max(0, Math.ceil((p / 100) * list.length) - 1))]
}
// the value of a metric over the inbound events of one app in a window (CPU comes from the engine, not from here)
export function metricOf(events, metric) {
  const calls = events.filter((e) => e.k === 'in')
  if (metric === 'Requests') return calls.length
  if (metric === 'Errors') return calls.filter((e) => e.e || (typeof e.s === 'number' && e.s >= 500)).length
  if (metric === 'Response time p95') return percentile(calls.map((e) => e.ms), 95)
  if (metric === 'Response time average') return calls.length ? Math.round(calls.reduce((n, e) => n + e.ms, 0) / calls.length) : null
  return null
}
export function addDashboard(state, name) {
  const n = String(name ?? '').trim()
  if (!n) return { state, errors: ['Give the dashboard a name.'] }
  if (state.observability?.dashboards?.some((d) => d.name === n)) return { state, errors: [`A dashboard named ${n} exists already.`] }
  let id
  const next = edit(state, (s, o) => {
    id = `db${nextN(o)}`
    o.dashboards.push({ id, name: n, range: HOUR, widgets: [], created: s.clock, viewed: null })
  })
  return { state: next, errors: [], id }
}
const onDash = (state, id, fn) =>
  edit(state, (s, o) => {
    const d = o.dashboards.find((x) => x.id === id)
    if (d) fn(d, o, s)
  })
export const addWidget = (state, id, { metric, app }) => (DASH_METRICS.includes(metric) && app ? onDash(state, id, (d, o) => void d.widgets.push({ id: `w${nextN(o)}`, metric, app })) : state)
export const removeWidget = (state, id, widget) => onDash(state, id, (d) => void (d.widgets = d.widgets.filter((w) => w.id !== widget)))
export const setDashboard = (state, id, patch) => onDash(state, id, (d) => void Object.assign(d, patch))
export const deleteDashboard = (state, id) => edit(state, (s, o) => void (o.dashboards = o.dashboards.filter((d) => d.id !== id)))
export const viewDashboard = (state, id) =>
  onDash(state, id, (d, o, s) => {
    d.viewed = s.clock
    see(s, 'mon:dashboards')
  })
export const viewDashboards = (state) => edit(state, (s) => see(s, 'mon:dashboards'))

// ---------- traces ----------
// OpenTelemetry names: a trace has a 32 hex digit trace ID, each span a 16 hex digit span ID and the ID of its parent.
// The engine records a span for each request that reaches an app, inside callApp of platform.js, and a package can add
// the spans of its own operations with r.spans: [{ op, ms, at, kind, kids }]. `at` is milliseconds after the start of
// the parent span; without it a span starts where the one before it ended. Lab made: Anypoint Monitoring has no page
// like this one; Mule 4.6 and later export such spans to an OpenTelemetry backend, which draws the waterfall.

// The calls of one request run inside each other, so the spans that are open form a stack. Lab made: it lives in the
// module for the length of one synchronous request and is never saved.
const STACK = []
const spanIdOf = (o, seed) => hex(`${seed}:${nextN(o)}`, 16)

export function spanStart(s, app, req, cid) {
  const o = s.observability
  if (!o || !cid || !app) return null
  if (!req.inside) STACK.length = 0
  const parent = STACK.at(-1) ?? null
  if (!parent && (req.inside || (!req.traced && !(o.tracing?.sample > 0)))) return null
  const span = {
    id: spanIdOf(o, `${cid}${app.name}`),
    p: parent?.id ?? null,
    app: app.name,
    kind: 'server',
    op: `${req.method ?? 'GET'} ${String(req.path ?? '/').split('?')[0]}`,
    at: parent ? parent.at + (req.at ?? parent.cursor) : 0,
    cursor: 2,
    given: req.at,
    trace: parent?.trace ?? { cid, t: s.clock + (req.offset ?? 0), traced: Boolean(req.traced), spans: [] },
  }
  STACK.push(span)
  return span
}
const clean = ({ id, p, app, kind, fl, op, at, ms, st, err }) => ({ id, p, app, kind, ...(fl && { fl }), op, at, ms, st, ...(err && { err }) })
function addKids(trace, parent, list = []) {
  let cursor = 2
  for (const k of list) {
    const at = parent.at + (k.at ?? cursor)
    const span = { id: hex(`${parent.id}${k.op}${at}`, 16), p: parent.id, app: parent.app, kind: k.kind ?? 'internal', fl: k.flow ?? parent.fl, op: k.op, at, ms: k.ms, st: k.error ? 'ERROR' : 'OK', err: k.error }
    if (k.at === undefined) cursor += k.ms + 1
    trace.spans.push(clean(span))
    addKids(trace, span, k.kids)
  }
}
// Ends the span of a request and gives the extra time its logging cost. Called for every answer of callApp.
export function answered(s, span, app, r) {
  const extra = app ? loggingDelay(s, app, (r.log?.length ?? 0) + 1) : 0
  if (!span) return extra
  const i = STACK.lastIndexOf(span)
  if (i >= 0) STACK.splice(i)
  const parent = STACK.at(-1)
  span.ms = (r.ms ?? 5) + extra
  span.fl = r.flow ?? ''
  span.st = r.status >= 500 || r.status === 0 ? 'ERROR' : 'OK'
  span.err = r.error ?? null
  span.trace.spans.push(clean(span))
  addKids(span.trace, span, r.spans)
  if (parent && parent.trace === span.trace) {
    if (span.given === undefined) parent.cursor += span.ms + 1
    else parent.cursor = Math.max(parent.cursor, span.given + span.ms + 1)
    return extra
  }
  // the root span ended: keep the trace if the sampler wants it
  const o = s.observability
  const sample = o.tracing?.sample ?? 0
  const t = span.trace
  const n = nextN(o)
  const keep = t.traced || (sample > 0 && (n % sample === 0 || span.ms >= 1000 || span.st === 'ERROR'))
  if (!keep) return extra
  o.traces ??= []
  push(o.traces, { id: hex(`${t.cid}:${t.t}:${n}`, 32), cid: t.cid, t: t.t, ms: span.ms, st: span.st, app: span.app, op: span.op, spans: t.spans.sort((a, b) => a.at - b.at) }, MAX_TRACES)
  return extra
}
export const tracesOf = (o, { cid = '', minMs = 0 } = {}) => (o?.traces ?? []).filter((t) => (!cid.trim() || t.cid === cid.trim() || t.id === cid.trim()) && t.ms >= (Number(minMs) || 0)).slice().reverse()
// Opening one trace. `cid` is the correlation ID the learner searched for, if any.
export const openTrace = (state, id, cid = '') =>
  edit(state, (s, o) => {
    const t = o.traces.find((x) => x.id === id)
    if (!t) return
    see(s, 'mon:trace')
    if (t.ms >= 2000) see(s, 'mon:trace-slow')
    if (cid.trim() && (t.cid === cid.trim() || t.id === cid.trim())) see(s, 'mon:trace-cid')
  })
export const viewTraces = (state) => edit(state, (s) => see(s, 'mon:traces'))
export const setSampling = (state, sample) => edit(state, (s, o) => void (o.tracing.sample = Math.max(0, Math.round(Number(sample) || 0))))
// depth of each span, for the waterfall
export function depthsOf(trace) {
  const by = Object.fromEntries(trace.spans.map((x) => [x.id, x]))
  const depth = (x, n = 0) => (x.p && by[x.p] && n < 20 ? depth(by[x.p], n + 1) : n)
  return Object.fromEntries(trace.spans.map((x) => [x.id, depth(x)]))
}
