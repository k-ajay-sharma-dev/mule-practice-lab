// An SAP ERP system for the Mule SAP connector: S/4HANA style system HRP, client 100, with IDocs and their status
// records (WE02, BD87, WE19), partner profiles (WE20), ports (WE21), the tRFC queue (SM58), RFC destinations (SM59),
// the gateway (SMGW), BAPIs (SE37), sales orders (VA03), stock (MMBE) and customers (XD03). Pure and import free.
// Lives in state.sap.
//
// State shape (state.sap, once filled; the open console seeds only { created } and fillSap builds the rest on first use):
//   sid, client, host, sysnr, gwserv,
//   users: { MULE_RFC: { type, password, locked, failed } },
//   customers: { '4711': { name, areas: ['1000/10/00'], changes: [{ t, by, text }] } },
//   materials: { 'H-1250': { text, plant, sloc, unrestricted, lockedBy } },
//   orders: { '0000012001': { vbeln, kunnr, area, po, items: [{ posnr, matnr, qty }], t, source, by } },
//   partners: [{ prn, prt, text, inbound: [{ mestyp, process, trigger }], outbound: [{ mestyp, idoctp, port, mode }] }],
//   ports: [{ name, type, dest, text }],
//   dests: [{ name, type, text, programId, host }],
//   idocs: [{ docnum, dir, idoctp, mestyp, sndprn, sndprt, rcvprn, rcvprt, sndpor, rcvpor, t, status, ref, vbeln,
//             segs: [[name, level, fields]], hist: [{ c, t, m }], aud }],
//   trfc: [{ tid, fm, dest, docnum, t, user, status, tries }], (SM58)
//   programs: { MULE_HARBOR: { app, t, count, since, closed } }, (SMGW logged on clients)
//   inbox: { MULE_HARBOR: [docnum] } (IDocs the gateway has handed to a registered program, read by listen)
//   sessions: { id: { app, t, luw: [order] } } (RFC sessions with work that is not committed yet)
//   requests: [{ kunnr, area, at }] (lab-made: a request to the master data team, done 5 lab minutes later)
//   gwlog: [{ t, text, ok }], calls: [{ t, who, fm, session, text, ok }], n (counter), nextVbeln
//
// ctx.sap (see sapCtx) takes the SAP connector configuration as cfg: { applicationServerHost, systemNumber, client,
// username, password, gatewayHost, gatewayService, programId, connectionCount }.
//   sendIdoc(cfg, idoc)            the Send IDoc operation: a tRFC call of IDOC_INBOUND_ASYNCHRONOUS. ok means SAP took the
//                                  LUW, not that the IDoc posted. SAP gives the IDoc its number; the caller gets the TID.
//   listen(cfg, programId)         the Document listener: registers the program at the gateway and returns the IDocs SAP sent.
//   begin(cfg)                     opens one RFC session for a transaction (the Transactional scope of the connector).
//   executeBapi(cfg, name, params, { transaction })  sRFC call. Without a transaction each call takes its own session
//                                  from the pool, and that session ends after the call: work without COMMIT WORK is lost.
//   commit(transaction), rollback(transaction)  BAPI_TRANSACTION_COMMIT or ROLLBACK in that session, then the session ends.
// A failure returns { ok: false, type: 'SAP:CONNECTIVITY' | 'SAP:EXECUTION', error, ms }.

export const SAP_HOST = 'sap.harbor.lab'
export const SID = 'HRP'
export const SAP_CLIENT = '100'
export const SYSNR = '00'
export const GW_SERVICE = 'sapgw00'
export const PROGRAM_ID = 'MULE_HARBOR'
export const RFC_USER = 'MULE_RFC'
export const WEB_PARTNER = 'HARBORWEB'
export const MULE_PORT = 'MULEPORT'
export const MULE_DEST = 'MULE_HARBOR_DEST'
export const AREA = '1000/10/00'
export const OPS_MAIL = 'ops@harbor.example'
const MINUTE = 60000
// lab-made limits, so a saved console stays small
const MAX_IDOCS = 150
const MAX_LOG = 60
const MAX_CALLS = 40
const MAX_TRFC = 30
// lab-made: a registration counts as live while its listener polled in the last 2 lab minutes
const LIVE = 2 * MINUTE

// ---------- statuses ----------

// The real IDoc status values and their short texts (table TEDS2)
export const STATUS = {
  '01': ['out', 'IDoc generated'],
  '02': ['out', 'Error passing data to port'],
  '03': ['out', 'Data passed to port OK'],
  12: ['out', 'Dispatch OK'],
  26: ['out', 'Error during syntax check of IDoc (outbound)'],
  29: ['out', 'Error in ALE service'],
  30: ['out', 'IDoc ready for dispatch (ALE service)'],
  50: ['in', 'IDoc added'],
  51: ['in', 'Application document not posted'],
  53: ['in', 'Application document posted'],
  56: ['in', 'IDoc with errors added'],
  62: ['in', 'IDoc passed to application'],
  64: ['in', 'IDoc ready to be transferred to application'],
  68: ['in', 'Error, no further processing'],
  74: ['in', 'IDoc was created by test transaction'],
}
export const statusText = (c) => STATUS[c]?.[1] ?? `Status ${c}`
export const statusLight = (c) => (['53', '03', '12'].includes(c) ? 'green' : ['51', '56', '02', '26', '29'].includes(c) ? 'red' : c === '68' ? 'grey' : 'yellow')
export const IDOC_TYPES = { ORDERS: 'ORDERS05', ORDRSP: 'ORDERS05', DESADV: 'DELVRY07', INVOIC: 'INVOIC02', MATMAS: 'MATMAS05', ALEAUD: 'ALEAUD01' }
export const areaText = (a) => String(a ?? '').split('/').join(' ')

// The messages of the application, close to the SD and MM texts. Lab-made wording where marked.
export const MSG = {
  noArea: (k, a) => `Customer ${k} does not exist in sales area ${areaText(a)}`, // lab-made wording of the SD check of the sales area data
  noCustomer: (k) => `Customer ${k} does not exist`,
  noMaterial: (m) => `Material ${m} does not exist`,
  locked: (m, u) => `Material ${m} is locked by user ${u}`,
  saved: (v) => `Standard Order ${Number(v)} has been saved`,
  notChanged: 'Sales document was not changed',
  noProfile: (prn, mes) => `EDI: Partner profile not available. Partner ${prn} type LS, message type ${mes}`,
  noDoc: (v) => `SD document ${v} is not in the database or has been archived`,
}

// ---------- builders ----------

const seg = (name, level, fields) => [name, level, fields]
export function newSapSystem(now = 0, extra = {}) {
  return {
    created: now,
    sid: SID,
    client: SAP_CLIENT,
    host: SAP_HOST,
    sysnr: SYSNR,
    gwserv: GW_SERVICE,
    users: { [RFC_USER]: { type: 'System', password: 'Rfc-Harbor-2611', locked: false, failed: 0 }, HARBOR_DEV: { type: 'Dialog', password: 'Dev-Harbor-2611', locked: false, failed: 0 } },
    customers: {
      4711: { name: 'Harbor Web Shop', areas: [AREA], changes: [] },
      4712: { name: 'Quay Deli', areas: [AREA], changes: [] },
      4713: { name: 'Pier Cafe', areas: [AREA, '1000/20/00'], changes: [] },
    },
    materials: {
      'H-1250': { text: 'Harbor deck chair', plant: '1000', sloc: '0001', unrestricted: 240, lockedBy: null },
      'H-1300': { text: 'Harbor folding table', plant: '1000', sloc: '0001', unrestricted: 85, lockedBy: null },
      'H-2000': { text: 'Rope lantern', plant: '1000', sloc: '0001', unrestricted: 12, lockedBy: null },
    },
    orders: {},
    partners: [
      {
        prn: WEB_PARTNER,
        prt: 'LS',
        text: 'Harbor web shop through MuleSoft',
        inbound: [
          { mestyp: 'ORDERS', process: 'ORDE', trigger: 'immediately' },
          { mestyp: 'MATMAS', process: 'MATM', trigger: 'immediately' },
        ],
        outbound: [
          { mestyp: 'DESADV', idoctp: 'DELVRY07', port: MULE_PORT, mode: 'immediately' },
          { mestyp: 'INVOIC', idoctp: 'INVOIC02', port: MULE_PORT, mode: 'immediately' },
        ],
      },
    ],
    ports: [{ name: MULE_PORT, type: 'Transactional RFC', dest: MULE_DEST, text: 'MuleSoft runtime, Harbor integration' }],
    dests: [
      { name: MULE_DEST, type: 'T', text: 'TCP/IP connection to the Mule SAP connector', activation: 'Registered Server Program', programId: PROGRAM_ID, gwhost: SAP_HOST, gwserv: GW_SERVICE },
      { name: `${SID}CLNT${SAP_CLIENT}`, type: '3', text: 'ABAP connection to this system', host: SAP_HOST },
    ],
    // logical systems (BD54): a partner profile of type LS needs one
    logsys: [`${SID}CLNT${SAP_CLIENT}`, WEB_PARTNER],
    idocs: [],
    trfc: [],
    programs: {},
    inbox: {},
    sessions: {},
    requests: [],
    gwlog: [],
    calls: [],
    n: 4711000,
    nextVbeln: 12001,
    ...extra,
  }
}
const SYSTEM_KEYS = Object.keys(newSapSystem())

// The system of the open console, with a few IDocs of the night
export function defaultSapSystem(now = 0) {
  const y = newSapSystem(now)
  for (const [i, [po, m, q]] of [
    ['WEB-7001', 'H-1250', 4],
    ['WEB-7002', 'H-1300', 1],
    ['WEB-7003', 'H-2000', 2],
  ].entries())
    inbound(y, ordersIdoc({ po, kunnr: '4711', items: [{ matnr: m, qty: q }] }), now - (90 - i * 20) * MINUTE, 'MULE_RFC')
  outboundIdoc(y, WEB_PARTNER, 'DESADV', [seg('E1EDL20', 1, { VBELN: '0080001021', VSTEL: '1000' }), seg('E1EDL24', 2, { POSNR: '000010', MATNR: 'H-1250', LFIMG: '4' })], now - 40 * MINUTE, 'BATCH_ALE')
  return y
}

// fills a missing or placeholder state.sap, and any key an older save lacks
export function fillSap(y) {
  if (!y) return defaultSapSystem(0)
  if (!y.sid) {
    const base = defaultSapSystem(y.created ?? 0)
    for (const k of Object.keys(base)) y[k] ??= base[k]
    return y
  }
  if (SYSTEM_KEYS.some((k) => y[k] === undefined || y[k] === null)) {
    const base = newSapSystem(y.created ?? 0)
    for (const k of SYSTEM_KEYS) y[k] ??= base[k]
  }
  return y
}
export const isFilled = (y) => Boolean(y?.sid)

// ---------- small helpers ----------

const pad = (n, w) => String(n).padStart(w, '0')
const push = (list, entry, max) => {
  list.push(entry)
  if (list.length > max) list.splice(0, list.length - max)
}
const next = (y) => (y.n = (y.n ?? 4711000) + 1)
const hexOf = (seed) => {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < 24; i++) {
    for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, 24).toUpperCase()
}
const fail = (type, error, ms = 40) => ({ ok: false, type, error, ms })
const gw = (y, now, text, ok = true) => push(y.gwlog, { t: now, text, ok }, MAX_LOG)
const callLog = (y, now, who, fm, session, text, ok = true) => push(y.calls, { t: now, who, fm, session, text, ok }, MAX_CALLS)
export const idocOf = (y, docnum) => (y?.idocs ?? []).find((d) => d.docnum === docnum)
export const vbelnOf = (v) => pad(String(v ?? '').trim().replace(/^0+/, '') || '0', 10)
export const partnerOf = (y, prn) => (y?.partners ?? []).find((p) => p.prn === prn)
export const fieldsOf = (d, name) => (d?.segs ?? []).filter((x) => x[0] === name).map((x) => x[2])
const say = (d, c, t, m = '') => {
  d.hist.push({ c, t, ...(m && { m }) })
  d.status = c
}
const trimIdocs = (y) => {
  while (y.idocs.length > MAX_IDOCS) {
    const i = y.idocs.findIndex((d) => ['53', '12', '68'].includes(d.status))
    y.idocs.splice(i < 0 ? 0 : i, 1)
  }
}
// segments come from an app as nested objects { name, fields, children } or as rows [name, level, fields]
function flatSegs(list, level = 1, out = []) {
  for (const x of list ?? []) {
    if (Array.isArray(x)) out.push(seg(x[0], x[1] ?? level, { ...x[2] }))
    else if (x?.name) {
      out.push(seg(String(x.name).toUpperCase(), level, { ...(x.fields ?? {}) }))
      flatSegs(x.children, level + 1, out)
    }
  }
  return out
}

// An ORDERS05 IDoc for a web shop order: org data in E1EDK14, sold-to in E1EDKA1, the PO number in E1EDK02 and an
// E1EDP01 per item with the material in E1EDP19.
export function ordersIdoc({ po, kunnr, area = AREA, items = [], sndprn = WEB_PARTNER }) {
  const [vkorg, vtweg, spart] = area.split('/')
  return {
    idoctp: 'ORDERS05',
    mestyp: 'ORDERS',
    sndprn,
    sndprt: 'LS',
    segments: [
      { name: 'E1EDK01', fields: { CURCY: 'EUR', BSART: 'TA' } },
      { name: 'E1EDK14', fields: { QUALF: '008', ORGID: vkorg } },
      { name: 'E1EDK14', fields: { QUALF: '007', ORGID: vtweg } },
      { name: 'E1EDK14', fields: { QUALF: '006', ORGID: spart } },
      { name: 'E1EDKA1', fields: { PARVW: 'AG', PARTN: kunnr } },
      { name: 'E1EDK02', fields: { QUALF: '001', BELNR: po } },
      ...items.map((it, i) => ({ name: 'E1EDP01', fields: { POSEX: pad((i + 1) * 10, 6), MENGE: String(it.qty), MENEE: 'PCE' }, children: [{ name: 'E1EDP19', fields: { QUALF: '002', IDTNR: it.matnr } }] })),
    ],
  }
}

// ---------- the application: sales orders ----------

const openQty = (y, matnr) => Object.values(y.orders).reduce((n, o) => n + o.items.filter((i) => i.matnr === matnr).reduce((k, i) => k + i.qty, 0), 0)
export const availableOf = (y, matnr) => Math.max(0, (y.materials[matnr]?.unrestricted ?? 0) - openQty(y, matnr))
export const orderedOf = openQty

// the checks of sales order entry. Returns the first error text, or null.
function orderError(y, { kunnr, area, items }) {
  const c = y.customers[kunnr]
  if (!c) return MSG.noCustomer(kunnr)
  if (!c.areas.includes(area)) return MSG.noArea(kunnr, area)
  if (!items.length) return 'No items were entered' // lab-made
  for (const it of items) {
    const m = y.materials[it.matnr]
    if (!m) return MSG.noMaterial(it.matnr)
    if (m.lockedBy) return MSG.locked(it.matnr, m.lockedBy)
    if (!(it.qty > 0)) return `Item ${it.posnr}: enter a quantity` // lab-made
  }
  return null
}
const newOrder = (y, { kunnr, area, po, items }, now, source, by) => {
  const vbeln = vbelnOf(y.nextVbeln++)
  return { vbeln, kunnr, area, po, items: items.map((i) => ({ posnr: i.posnr, matnr: i.matnr, qty: i.qty })), t: now, source, by }
}

// ---------- IDoc inbound ----------

function readOrders(d) {
  const k14 = Object.fromEntries(fieldsOf(d, 'E1EDK14').map((f) => [f.QUALF, f.ORGID]))
  const area = `${k14['008'] ?? ''}/${k14['007'] ?? ''}/${k14['006'] ?? ''}`
  const kunnr = String(fieldsOf(d, 'E1EDKA1').find((f) => f.PARVW === 'AG')?.PARTN ?? '').trim()
  const po = fieldsOf(d, 'E1EDK02').find((f) => f.QUALF === '001')?.BELNR ?? ''
  const items = []
  d.segs.forEach((x, i) => {
    if (x[0] !== 'E1EDP01') return
    const child = d.segs.slice(i + 1).find((z, j, rest) => z[0] === 'E1EDP19' && z[2].QUALF === '002' && !rest.slice(0, j).some((w) => w[0] === 'E1EDP01'))
    items.push({ posnr: x[2].POSEX ?? pad((items.length + 1) * 10, 6), matnr: String(child?.[2].IDTNR ?? '').trim(), qty: Number(x[2].MENGE) })
  })
  return { kunnr, area, po, items }
}

// passes an IDoc in status 64 (or 51) to the application: IDOC_INPUT_ORDERS for ORDERS, IDOC_INPUT_MATMAS01 for MATMAS
function post(y, d, now) {
  say(d, '62', now)
  if (d.mestyp === 'ORDERS') {
    const o = readOrders(d)
    const err = orderError(y, o)
    if (err) return say(d, '51', now, err)
    const order = newOrder(y, o, now, 'IDoc', d.docnum)
    y.orders[order.vbeln] = order
    d.vbeln = order.vbeln
    return say(d, '53', now, MSG.saved(order.vbeln))
  }
  if (d.mestyp === 'MATMAS') {
    const f = fieldsOf(d, 'E1MARAM')[0] ?? {}
    const m = String(f.MATNR ?? '').trim()
    if (!m) return say(d, '51', now, 'Material number is missing in segment E1MARAM') // lab-made wording
    if (y.materials[m]?.lockedBy) return say(d, '51', now, MSG.locked(m, y.materials[m].lockedBy))
    y.materials[m] = { text: fieldsOf(d, 'E1MAKTM')[0]?.MAKTX ?? y.materials[m]?.text ?? m, plant: '1000', sloc: '0001', unrestricted: y.materials[m]?.unrestricted ?? 0, lockedBy: null }
    return say(d, '53', now, `Material ${m} changed`)
  }
  say(d, '53', now)
}

// IDOC_INBOUND_ASYNCHRONOUS: the IDoc is saved (50), checked against the partner profile and, with trigger immediately,
// passed to the application at once. With trigger by background program it waits in 64 for RBDAPP01.
function inbound(y, idoc, now, user, test = false) {
  const d = {
    docnum: pad(next(y), 16),
    dir: 'in',
    idoctp: String(idoc.idoctp ?? '').toUpperCase(),
    mestyp: String(idoc.mestyp ?? '').toUpperCase(),
    sndprn: String(idoc.sndprn ?? '').toUpperCase(),
    sndprt: idoc.sndprt ?? 'LS',
    sndpor: idoc.sndpor ?? `SAP${SID}`,
    rcvprn: `${SID}CLNT${SAP_CLIENT}`,
    rcvprt: 'LS',
    rcvpor: `SAP${SID}`,
    t: now,
    status: '',
    ref: '',
    segs: idoc.segs ?? flatSegs(idoc.segments),
    hist: [],
  }
  d.ref = fieldsOf(d, 'E1EDK02').find((f) => f.QUALF === '001')?.BELNR ?? fieldsOf(d, 'E1MARAM')[0]?.MATNR ?? ''
  y.idocs.push(d)
  if (test) say(d, '74', now, `Created in WE19 by ${user}`)
  const row = partnerOf(y, d.sndprn)?.inbound.find((r) => r.mestyp === d.mestyp)
  if (!row) {
    say(d, '50', now)
    say(d, '56', now, MSG.noProfile(d.sndprn, d.mestyp))
  } else {
    say(d, '50', now)
    say(d, '64', now)
    if (row.trigger === 'immediately') post(y, d, now)
  }
  trimIdocs(y)
  return d
}

// ---------- IDoc outbound ----------

function outboundIdoc(y, prn, mestyp, segs, now, user) {
  const row = partnerOf(y, prn)?.outbound.find((r) => r.mestyp === mestyp)
  const d = {
    docnum: pad(next(y), 16),
    dir: 'out',
    idoctp: row?.idoctp ?? IDOC_TYPES[mestyp] ?? '',
    mestyp,
    sndprn: `${SID}CLNT${SAP_CLIENT}`,
    sndprt: 'LS',
    sndpor: `SAP${SID}`,
    rcvprn: prn,
    rcvprt: 'LS',
    rcvpor: row?.port ?? '',
    t: now,
    status: '',
    ref: '',
    segs,
    hist: [],
  }
  y.idocs.push(d)
  say(d, '01', now)
  if (!row) {
    say(d, '29', now, `No outbound partner profile for ${prn} and message type ${mestyp}`) // lab-made wording
    return d
  }
  say(d, '30', now)
  const port = y.ports.find((p) => p.name === row.port)
  if (!port) {
    say(d, '02', now, `Port ${row.port} does not exist`) // lab-made wording
    return d
  }
  // with transfer mode immediately the IDoc goes to the port at once. 03 means passed to tRFC, not received.
  say(d, '03', now)
  const tid = hexOf(`${d.docnum}${next(y)}`)
  push(y.trfc, { tid, fm: 'IDOC_INBOUND_ASYNCHRONOUS', dest: port.dest, docnum: d.docnum, t: now, user, status: 'Transaction recorded', tries: 0 }, MAX_TRFC)
  trimIdocs(y)
  return d
}

// ---------- the gateway and tRFC delivery ----------

// a destination of type T with gateway options that do not name the gateway of this system (empty means this gateway)
const gwOff = (y, d) => (d.gwhost && String(d.gwhost).toLowerCase() !== y.host) || (d.gwserv && ![y.gwserv, `33${y.sysnr}`].includes(String(d.gwserv).toLowerCase()))
const appRunning = (s, name) => (s?.apps ?? []).some((a) => a.name === name && a.status === 'Running')
export function registration(s, y, pid, now) {
  const p = y.programs[pid]
  if (!p || p.closed || now - p.t > LIVE || (s && !appRunning(s, p.app))) return null
  return p
}
// why a tRFC to a program fails, as SM58 shows it
function trfcError(y, pid, now) {
  const p = y.programs[pid]
  if (p?.closed && now - p.closed < 30 * MINUTE) return 'Connection closed (no data)'
  return `program ${pid} not registered`
}
// SAP calls the registered server program for each recorded LUW of a destination of type T
function deliver(s, y, entry, now) {
  const dest = y.dests.find((x) => x.name === entry.dest)
  const pid = dest?.programId
  entry.tries++
  entry.t = now
  if (!dest) return void (entry.status = `Destination ${entry.dest} does not exist`) // lab-made wording
  // lab-made: programs register at the gateway of this system only, so the destination must name that gateway
  if (gwOff(y, dest)) {
    entry.status = `Connect to SAP gateway failed. GWHOST=${dest.gwhost || '(empty)'} GWSERV=${dest.gwserv || '(empty)'}`
    return false
  }
  if (!registration(s, y, pid, now)) {
    entry.status = trfcError(y, pid, now)
    return false
  }
  y.inbox[pid] = [...(y.inbox[pid] ?? []), entry.docnum].slice(-60)
  const d = idocOf(y, entry.docnum)
  // lab-made: 12 is set at once; in SAP the report RBDMOIND sets it after the tRFC confirmation
  if (d) say(d, '12', now)
  y.trfc = y.trfc.filter((x) => x !== entry)
  return true
}

// ---------- logon and RFC ----------

const word = (v) => String(v ?? '').trim()
function logon(y, cfg) {
  const host = word(cfg?.applicationServerHost).toLowerCase()
  const sysnr = word(cfg?.systemNumber)
  if (!host) return fail('SAP:CONNECTIVITY', '(101) JCO_ERROR_CONFIGURATION: Parameter jco.client.ashost is missing') // lab-made wording of the JCo check
  if (host !== y.host || sysnr !== y.sysnr)
    return fail('SAP:CONNECTIVITY', `(102) JCO_ERROR_COMMUNICATION: Connect to SAP gateway failed. Connection parameters: TYPE=A ASHOST=${host} SYSNR=${sysnr || '??'}. LOCATION CPIC (TCP/IP) on local host. ERROR partner '${host}:33${sysnr || '??'}' not reached`, 3000)
  const client = word(cfg?.client)
  if (client !== y.client) return fail('SAP:CONNECTIVITY', `(103) JCO_ERROR_LOGON_FAILURE: Client ${client || '(empty)'} is not available in this system`, 300)
  const name = word(cfg?.username).toUpperCase()
  const u = y.users[name]
  if (u?.locked) return fail('SAP:CONNECTIVITY', '(103) JCO_ERROR_LOGON_FAILURE: User is locked. Please notify the person responsible', 300)
  if (!u || cfg?.password !== u.password) {
    // lab-made: the user is locked after 5 failed logons (login/fails_to_user_lock is 5 by default)
    if (u && ++u.failed >= 5) u.locked = true
    return fail('SAP:CONNECTIVITY', '(103) JCO_ERROR_LOGON_FAILURE: Name or password is incorrect (repeat logon)', 300)
  }
  u.failed = 0
  return { ok: true, user: name }
}
function gatewayCheck(y, cfg) {
  const host = word(cfg?.gatewayHost).toLowerCase()
  const svc = word(cfg?.gatewayService).toLowerCase()
  if (host !== y.host) return fail('SAP:CONNECTIVITY', `(102) JCO_ERROR_COMMUNICATION: Connect to SAP gateway failed. Connection parameters: TYPE=R GWHOST=${host || '(empty)'} GWSERV=${svc}. ERROR hostname '${host}' unknown`, 3000)
  if (svc !== y.gwserv && svc !== `33${y.sysnr}`) return fail('SAP:CONNECTIVITY', `(102) JCO_ERROR_COMMUNICATION: Connect to SAP gateway failed. Connection parameters: TYPE=R GWHOST=${host} GWSERV=${svc || '(empty)'}. ERROR service '${svc}' unknown`, 3000)
  return { ok: true }
}

const ret = (TYPE, ID, NUMBER, MESSAGE) => ({ TYPE, ID, NUMBER, MESSAGE })
// The function modules the lab system knows. Each runs in a session; work it does waits in session.luw until
// BAPI_TRANSACTION_COMMIT (COMMIT WORK) in the same session.
const FMS = {
  BAPI_SALESORDER_CREATEFROMDAT2: {
    text: 'Sales order: Create sales order',
    imports: { ORDER_HEADER_IN: { DOC_TYPE: 'TA', SALES_ORG: '1000', DISTR_CHAN: '10', DIVISION: '00', PURCH_NO_C: 'PO-1' }, TESTRUN: '' },
    tables: { ORDER_PARTNERS: [{ PARTN_ROLE: 'AG', PARTN_NUMB: '4712' }], ORDER_ITEMS_IN: [{ ITM_NUMBER: '000010', MATERIAL: 'H-1300', TARGET_QTY: '2' }], RETURN: [] },
    run(y, session, p, now, who) {
      const h = p.ORDER_HEADER_IN ?? {}
      const area = `${word(h.SALES_ORG)}/${word(h.DISTR_CHAN)}/${word(h.DIVISION)}`
      const kunnr = word((p.ORDER_PARTNERS ?? []).find((x) => word(x.PARTN_ROLE) === 'AG')?.PARTN_NUMB).replace(/^0+/, '')
      const items = (p.ORDER_ITEMS_IN ?? []).map((x, i) => ({ posnr: pad(word(x.ITM_NUMBER) || (i + 1) * 10, 6), matnr: word(x.MATERIAL), qty: Number((p.ORDER_SCHEDULES_IN ?? []).find((z) => word(z.ITM_NUMBER) === word(x.ITM_NUMBER))?.REQ_QTY ?? x.TARGET_QTY) }))
      const RETURN = []
      if (!word(h.SALES_ORG)) RETURN.push(ret('E', 'V4', '219', 'Enter a sales organization')) // lab-made wording
      const err = RETURN.length ? null : orderError(y, { kunnr, area, items })
      if (RETURN.length || err) {
        if (err) RETURN.push(ret('E', 'V1', '302', err))
        RETURN.push(ret('E', 'V4', '219', MSG.notChanged))
        return { export: { SALESDOCUMENT: '' }, tables: { RETURN } }
      }
      RETURN.push(ret('S', 'V4', '233', 'SALES_HEADER_IN has been processed successfully'))
      for (const it of items) {
        RETURN.push(ret('S', 'V4', '233', 'SALES_ITEM_IN has been processed successfully'))
        const av = availableOf(y, it.matnr) - session.luw.reduce((n, o) => n + o.items.filter((x) => x.matnr === it.matnr).reduce((k, x) => k + x.qty, 0), 0)
        if (it.qty > av) RETURN.push(ret('W', 'V1', '391', `Item ${it.posnr}: only ${Math.max(0, av)} PC of ${it.matnr} available on the requested date`)) // lab-made wording
      }
      if (word(p.TESTRUN).toUpperCase() === 'X') return { export: { SALESDOCUMENT: '' }, tables: { RETURN } }
      // the number is drawn from the number range now; without a commit it is lost and leaves a gap
      const order = newOrder(y, { kunnr, area, po: word(h.PURCH_NO_C), items }, now, session.source, who)
      session.luw.push(order)
      RETURN.push(ret('S', 'V1', '311', MSG.saved(order.vbeln)))
      return { export: { SALESDOCUMENT: order.vbeln }, tables: { RETURN } }
    },
  },
  BAPI_TRANSACTION_COMMIT: {
    text: 'Execute external commit when using BAPIs',
    imports: { WAIT: 'X' },
    tables: {},
    run(y, session) {
      // COMMIT WORK of this session only. A session with no work commits nothing and still answers with an empty RETURN.
      for (const o of session.luw) y.orders[o.vbeln] = o
      session.done = session.luw.map((o) => o.vbeln)
      session.luw = []
      return { export: { RETURN: ret('', '', '000', '') }, tables: {} }
    },
  },
  BAPI_TRANSACTION_ROLLBACK: {
    text: 'Execute external rollback when using BAPIs',
    imports: {},
    tables: {},
    run(y, session) {
      session.dropped = session.luw.map((o) => o.vbeln)
      session.luw = []
      return { export: { RETURN: ret('', '', '000', '') }, tables: {} }
    },
  },
  BAPI_MATERIAL_AVAILABILITY: {
    text: 'Availability check',
    imports: { PLANT: '1000', MATERIAL: 'H-1250', UNIT: 'PC' },
    tables: { WMDVSX: [], WMDVEX: [] },
    run(y, session, p) {
      const m = word(p.MATERIAL)
      if (!y.materials[m]) return { export: { AV_QTY_PLT: '0', RETURN: ret('E', 'M3', '305', MSG.noMaterial(m)) }, tables: { WMDVEX: [] } }
      if (word(p.PLANT) !== y.materials[m].plant) return { export: { AV_QTY_PLT: '0', RETURN: ret('E', 'M3', '305', `Material ${m} is not maintained in plant ${word(p.PLANT)}`) }, tables: { WMDVEX: [] } }
      const av = availableOf(y, m)
      return { export: { AV_QTY_PLT: String(av), ENDLEADTME: '00000000', RETURN: ret('', '', '000', '') }, tables: { WMDVEX: [{ REQ_QTY: String(orderedOf(y, m)), COM_QTY: String(av) }] } }
    },
  },
  RFC_PING: { text: 'Test RFC connection', imports: {}, tables: {}, run: () => ({ export: {}, tables: {} }) },
  IDOC_INBOUND_ASYNCHRONOUS: {
    text: 'Inbound IDocs over tRFC (called by the Send IDoc operation)',
    imports: {},
    tables: { IDOC_CONTROL_REC_40: [], IDOC_DATA_REC_40: [] },
    sendOnly: true,
  },
}
export const FUNCTION_MODULES = Object.fromEntries(Object.entries(FMS).map(([k, v]) => [k, { text: v.text, imports: v.imports, tables: v.tables, sendOnly: Boolean(v.sendOnly) }]))

function openSession(y, who, now, source) {
  const id = `S${next(y)}`
  y.sessions[id] = { who, t: now, luw: [], source }
  return id
}
// ends a session. Work that waits for a commit is thrown away, as at the end of an ABAP session without COMMIT WORK.
function closeSession(y, id, now, why = 'Session ended') {
  const ses = y.sessions[id]
  if (!ses) return []
  const lost = ses.luw.map((o) => o.vbeln)
  if (lost.length) callLog(y, now, ses.who, '(end of session)', id, `${why} without COMMIT WORK: order ${lost.map(Number).join(', ')} rolled back`, false)
  delete y.sessions[id]
  return lost
}
function runFm(y, id, name, params, now, who) {
  const fm = FMS[String(name ?? '').trim().toUpperCase()]
  if (!fm || fm.sendOnly) return null
  const ses = y.sessions[id]
  const r = fm.run(y, ses, structuredClone(params ?? {}), now, who)
  const rtab = r.tables?.RETURN ?? (r.export?.RETURN ? [r.export.RETURN] : [])
  const worst = rtab.find((x) => x.TYPE === 'E' || x.TYPE === 'A') ?? rtab.find((x) => x.TYPE === 'W') ?? rtab.at(-1)
  callLog(y, now, who, String(name).toUpperCase(), id, worst?.MESSAGE ? `${worst.TYPE} ${worst.MESSAGE}` : 'OK', !rtab.some((x) => x.TYPE === 'E' || x.TYPE === 'A'))
  return r
}

// ---------- the ctx hook ----------

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function sapCtx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.sap = fillSap(s.sap))
  const now = () => s.clock ?? 0
  const sessions = new Map()
  return {
    sendIdoc(cfg, idoc) {
      const y = sys()
      const l = logon(y, cfg)
      if (!l.ok) return l
      const type = String(idoc?.idoctp ?? '').toUpperCase()
      if (!Object.values(IDOC_TYPES).includes(type)) return fail('SAP:EXECUTION', `Basic type ${type || '(empty)'} is not known in system ${SID}`) // lab-made wording
      const tid = hexOf(`${who}${next(y)}`)
      // the LUW of IDOC_INBOUND_ASYNCHRONOUS is done once the IDoc is saved: posting is the work of SAP, after the call
      inbound(y, idoc, now(), l.user)
      callLog(y, now(), who, 'IDOC_INBOUND_ASYNCHRONOUS', tid, `tRFC LUW ${tid} executed (${type})`)
      return { ok: true, tid, ms: 140 }
    },
    listen(cfg, programId = cfg?.programId) {
      const y = sys()
      const g = gatewayCheck(y, cfg)
      if (!g.ok) return g
      const pid = word(programId)
      if (!pid) return fail('SAP:CONNECTIVITY', '(101) JCO_ERROR_CONFIGURATION: Parameter jco.server.progid is missing') // lab-made wording
      const t = now()
      const was = y.programs[pid]
      const count = Math.max(1, Number(cfg?.connectionCount) || 1)
      if (!was || was.closed || t - was.t > LIVE || was.app !== who) {
        gw(y, t, `Program ${pid} registered by ${who}, ${count} connection${count > 1 ? 's' : ''}`)
        y.programs[pid] = { app: who, t, since: t, count }
      } else Object.assign(was, { t, count })
      // a registration in time takes the LUWs that waited in SM58 for this program
      for (const e of [...y.trfc]) if (y.dests.find((x) => x.name === e.dest)?.programId === pid) deliver(s, y, e, t)
      const got = (y.inbox[pid] ?? []).map((n) => idocOf(y, n)).filter(Boolean)
      y.inbox[pid] = []
      return { ok: true, ms: 20, idocs: got.map((d) => ({ docnum: d.docnum, idoctp: d.idoctp, mestyp: d.mestyp, segments: d.segs.map(([name, level, fields]) => ({ name, level, fields: { ...fields } })) })) }
    },
    begin(cfg) {
      const y = sys()
      const l = logon(y, cfg)
      if (!l.ok) return l
      const id = openSession(y, who, now(), who)
      sessions.set(id, true)
      return { ok: true, transaction: id }
    },
    executeBapi(cfg, name, params = {}, { transaction } = {}) {
      const y = sys()
      const fname = String(name ?? '').trim().toUpperCase()
      if (transaction && !y.sessions[transaction]) return fail('SAP:EXECUTION', `Transaction ${transaction} is not active`) // lab-made wording
      let id = transaction
      if (!id) {
        const l = logon(y, cfg)
        if (!l.ok) return l
        id = openSession(y, who, now(), who)
      }
      const r = runFm(y, id, fname, params, now(), who)
      if (!r) {
        if (!transaction) closeSession(y, id, now())
        return fail('SAP:EXECUTION', `JCO_ERROR_FUNCTION_NOT_FOUND: Function ${fname || '(empty)'} not found`)
      }
      // without a transaction the connection goes back to the pool and the session ends with this call
      if (!transaction) closeSession(y, id, now(), 'Call ended')
      const RETURN = r.tables?.RETURN ?? (r.export?.RETURN ? [r.export.RETURN] : [])
      return { ok: true, ms: 180, session: id, export: r.export, tables: r.tables, RETURN }
    },
    commit(transaction) {
      const y = sys()
      if (!y.sessions[transaction]) return fail('SAP:EXECUTION', `Transaction ${transaction} is not active`) // lab-made wording
      runFm(y, transaction, 'BAPI_TRANSACTION_COMMIT', { WAIT: 'X' }, now(), who)
      const saved = y.sessions[transaction].done ?? []
      closeSession(y, transaction, now())
      sessions.delete(transaction)
      return { ok: true, ms: 60, saved }
    },
    rollback(transaction) {
      const y = sys()
      if (!y.sessions[transaction]) return { ok: true, ms: 5, dropped: [] }
      runFm(y, transaction, 'BAPI_TRANSACTION_ROLLBACK', {}, now(), who)
      const dropped = y.sessions[transaction].dropped ?? []
      closeSession(y, transaction, now())
      sessions.delete(transaction)
      return { ok: true, ms: 20, dropped }
    },
  }
}

// ---------- the tick ----------

// The ALE audit: report RBDSTATE sends an ALEAUD01 IDoc with the status of the inbound IDocs of a partner whose
// outbound profile has message type ALEAUD. Lab-made: it runs every 5 lab minutes and sends up to 20 statuses per IDoc.
function aleAudit(y, now) {
  for (const p of y.partners) {
    if (!p.outbound.some((r) => r.mestyp === 'ALEAUD')) continue
    const changed = y.idocs.filter((d) => d.dir === 'in' && d.sndprn === p.prn && ['51', '53', '56', '68'].includes(d.status) && d.aud !== d.status).slice(0, 20)
    if (!changed.length) continue
    const segs = [seg('E1ADHDR', 1, { MESTYP: changed[0].mestyp, MESCOD: '', MESFCT: '' })]
    for (const d of changed) {
      d.aud = d.status
      segs.push(seg('E1STATE', 2, { DOCNUM: d.docnum, STATUS: d.status, STATXT: (d.hist.at(-1)?.m ?? statusText(d.status)).slice(0, 70), STAPA1: d.ref }))
    }
    outboundIdoc(y, p.prn, 'ALEAUD', segs, now, 'BATCH_ALE')
  }
}

// runs once a lab minute while state.sap exists. Changes `s` in place.
export function sapTick(s) {
  const y = s?.sap
  if (!isFilled(y)) return s
  const now = s.clock ?? 0
  // registered programs whose app stopped: the gateway sees the connection close
  for (const [pid, p] of Object.entries(y.programs)) {
    if (p.closed) continue
    if (!appRunning(s, p.app) || now - p.t > LIVE) {
      p.closed = now
      gw(y, now, `Connection to program ${pid} of ${p.app} closed`, false)
    }
  }
  // sessions that an app opened and never ended: the pool closes them and the work is rolled back
  for (const [id, ses] of Object.entries(y.sessions)) if (now - ses.t >= MINUTE) closeSession(y, id, now, 'Connection closed by the pool')
  // requests to the master data team
  for (const r of y.requests.filter((x) => x.at <= now)) {
    const c = y.customers[r.kunnr]
    if (c && !c.areas.includes(r.area)) {
      c.areas.push(r.area)
      c.changes.push({ t: now, by: 'MDM_TEAM', text: `Sales area ${areaText(r.area)} added` })
    }
    s.mail?.push({ t: now, to: OPS_MAIL, subject: `Customer ${r.kunnr} extended to sales area ${areaText(r.area)}`, body: `Hello, customer ${r.kunnr} ${c?.name ?? ''} has sales area ${areaText(r.area)} again. Sorry, the morning change by MDM_BATCH removed it. IDocs that failed on it need to be processed again. Harbor master data team`, source: 'Harbor master data team' })
    if (s.mail?.length > 40) s.mail.shift()
  }
  y.requests = y.requests.filter((x) => x.at > now)
  // RBDAPP01: inbound IDocs with trigger by background program
  if ((now / MINUTE) % 5 === 0) {
    for (const d of y.idocs.filter((x) => x.dir === 'in' && x.status === '64')) post(y, d, now)
    aleAudit(y, now)
  }
  // tRFC: a recorded LUW goes out at once; one that failed is retried every 15 minutes (lab-made: RSARFCEX)
  for (const e of [...y.trfc]) if (e.tries === 0 || now - e.t >= 15 * MINUTE) deliver(s, y, e, now)
  return s
}

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.sap = fillSap(s.sap)
  const result = fn(s, s.sap, s.clock ?? 0)
  return { state: s, result }
}
const only = (r) => r.state

export const upgradeSap = (state) => (isFilled(state?.sap) ? state : only(edit(state, () => null)))

// BD87: process the selected IDocs again. 51 and 64 go to the application; 56 is checked against the partner profile.
export const processIdocs = (state, docnums) =>
  edit(state, (s, y, now) => {
    const out = []
    for (const n of docnums) {
      const d = idocOf(y, n)
      if (!d || d.dir !== 'in') continue
      if (d.status === '56') {
        if (!partnerOf(y, d.sndprn)?.inbound.some((r) => r.mestyp === d.mestyp)) {
          out.push({ docnum: n, status: '56', m: MSG.noProfile(d.sndprn, d.mestyp) })
          continue
        }
        say(d, '64', now)
      }
      if (!['51', '64'].includes(d.status)) {
        out.push({ docnum: n, status: d.status, m: `IDoc ${n} has status ${d.status} and cannot be processed` }) // lab-made wording
        continue
      }
      post(y, d, now)
      out.push({ docnum: n, status: d.status, m: d.hist.at(-1)?.m ?? statusText(d.status) })
    }
    return out
  })

// WE19 standard inbound: a copy of an IDoc, with the segments as edited, goes in as a NEW IDoc. The original keeps its status.
export const testInbound = (state, docnum, segs) =>
  edit(state, (s, y, now) => {
    const src = idocOf(y, docnum)
    if (!src) return null
    const d = inbound(y, { idoctp: src.idoctp, mestyp: src.mestyp, sndprn: src.sndprn, sndprt: src.sndprt, sndpor: src.sndpor, segs: structuredClone(segs ?? src.segs) }, now, 'HARBOR_DEV', true)
    return { docnum: d.docnum, status: d.status, m: d.hist.at(-1)?.m ?? statusText(d.status) }
  })

// RC1_IDOC_SET_STATUS: sets IDocs to 68, so no one processes them again (for example a 51 that WE19 replaced)
export const setNoFurther = (state, docnums) =>
  edit(state, (s, y, now) => {
    let n = 0
    for (const x of docnums) {
      const d = idocOf(y, x)
      if (d?.dir === 'in' && ['51', '56', '64'].includes(d.status)) say(d, '68', now, 'Set by RC1_IDOC_SET_STATUS'), n++
    }
    return n
  })

// SM58: Execute LUW for the selected entries
export const executeLuws = (state, tids) =>
  edit(state, (s, y, now) => {
    let ok = 0
    for (const e of y.trfc.filter((x) => tids.includes(x.tid))) if (deliver(s, y, e, now)) ok++
    return { ok, left: y.trfc.filter((x) => tids.includes(x.tid)).length }
  })
export const deleteLuws = (state, tids) =>
  edit(state, (s, y) => {
    const n = y.trfc.length
    y.trfc = y.trfc.filter((x) => !tids.includes(x.tid))
    return n - y.trfc.length
  })

// SM59: Connection Test
export const testDestination = (state, name) =>
  edit(state, (s, y, now) => {
    const d = y.dests.find((x) => x.name === name)
    if (!d) return { ok: false, text: `Destination ${name} does not exist` }
    if (d.type === '3') return { ok: true, text: 'Connection test OK', rows: [['Logon', '4 msec'], ['10 KB', '2 msec'], ['20 KB', '3 msec']] }
    if (gwOff(y, d)) return { ok: false, text: `Error: Connect to SAP gateway failed. GWHOST=${d.gwhost} GWSERV=${d.gwserv}. Registered programs log on to ${y.host} ${y.gwserv}.` }
    if (!registration(s, y, d.programId, now)) {
      gw(y, now, `Connection test of ${name}: ${trfcError(y, d.programId, now)}`, false)
      return { ok: false, text: `Error: ${trfcError(y, d.programId, now)}. CPI-C error CM_ALLOCATE_FAILURE_RETRY.` }
    }
    return { ok: true, text: 'Connection test OK', rows: [['Logon', '11 msec'], ['10 KB', '9 msec'], ['20 KB', '14 msec']] }
  })

// WE20: outbound parameters of a partner
export const addOutbound = (state, prn, row) =>
  edit(state, (s, y) => {
    const p = partnerOf(y, prn)
    const mestyp = word(row?.mestyp).toUpperCase()
    if (!p || !mestyp || p.outbound.some((r) => r.mestyp === mestyp)) return false
    p.outbound.push({ mestyp, idoctp: word(row.idoctp).toUpperCase() || IDOC_TYPES[mestyp] || '', port: word(row.port) || MULE_PORT, mode: row.mode === 'collect' ? 'collect' : 'immediately' })
    return true
  })
export const removeOutbound = (state, prn, mestyp) =>
  edit(state, (s, y) => {
    const p = partnerOf(y, prn)
    if (p) p.outbound = p.outbound.filter((r) => r.mestyp !== mestyp)
    return true
  })
export const setInboundTrigger = (state, prn, mestyp, trigger) =>
  edit(state, (s, y) => {
    const r = partnerOf(y, prn)?.inbound.find((x) => x.mestyp === mestyp)
    if (r) r.trigger = trigger === 'background' ? 'background' : 'immediately'
    return Boolean(r)
  })

// SE37: single test, or a test sequence that runs BAPI_TRANSACTION_COMMIT after the module in the same session
export const testFunction = (state, name, params, { sequence = false } = {}) =>
  edit(state, (s, y, now) => {
    const fname = String(name ?? '').trim().toUpperCase()
    if (!FMS[fname]) return { ok: false, text: `Function module ${fname || '(empty)'} does not exist` }
    if (FMS[fname].sendOnly) return { ok: false, text: `${fname} takes IDocs over tRFC. Test an IDoc in WE19.` }
    const id = openSession(y, 'HARBOR_DEV (SE37)', now, 'SE37')
    const r = runFm(y, id, fname, params, now, 'HARBOR_DEV')
    let committed = []
    if (sequence && fname !== 'BAPI_TRANSACTION_COMMIT') {
      runFm(y, id, 'BAPI_TRANSACTION_COMMIT', { WAIT: 'X' }, now, 'HARBOR_DEV')
      committed = y.sessions[id].done ?? []
    }
    const lost = closeSession(y, id, now, 'Test ended')
    return { ok: true, export: r.export, tables: r.tables, committed, lost, sequence }
  })

// XD03 (lab-made action): ask the master data team to extend a customer to a sales area; it is done 5 lab minutes later
export const requestSalesArea = (state, kunnr, area) =>
  edit(state, (s, y, now) => {
    if (!y.customers[kunnr] || y.customers[kunnr].areas.includes(area) || y.requests.some((r) => r.kunnr === kunnr && r.area === area)) return false
    y.requests.push({ kunnr, area, at: now + 5 * MINUTE })
    y.customers[kunnr].changes.push({ t: now, by: 'HARBOR_DEV', text: `Request to the master data team: add sales area ${areaText(area)}` })
    return true
  })

// ---------- setup actions: SU01, SM59, WE21, BD54, WE20, WE19 outbound ----------

const NAME_OK = /^[A-Z0-9_]{1,30}$/
// SU01: a new user. type System (B) is the type for RFC users: no dialog logon, the password does not expire.
export const createUser = (state, { name, type = 'System', password }) =>
  edit(state, (s, y) => {
    const n = word(name).toUpperCase()
    if (!NAME_OK.test(n) || n.length > 12) return { ok: false, text: 'User names have up to 12 letters, digits or _' }
    if (y.users[n]) return { ok: false, text: `User ${n} already exists` }
    if (String(password ?? '').length < 8) return { ok: false, text: 'The password must have at least 8 characters' } // lab-made: the login/min_password_lng of Harbor
    y.users[n] = { type: ['System', 'Dialog', 'Communications', 'Service'].includes(type) ? type : 'System', password: String(password), locked: false, failed: 0 }
    return { ok: true, text: `User ${n} created` }
  })
// SM59: a new destination. Type T with activation Registered Server Program names the program ID and the gateway.
export const createDestination = (state, { name, programId, gwhost, gwserv, text }) =>
  edit(state, (s, y) => {
    const n = word(name).toUpperCase()
    if (!NAME_OK.test(n)) return { ok: false, text: 'Enter a destination name of letters, digits or _' }
    if (y.dests.some((d) => d.name === n)) return { ok: false, text: `Destination ${n} already exists` }
    if (!word(programId)) return { ok: false, text: 'Enter a program ID for a registered server program' }
    y.dests.push({ name: n, type: 'T', text: word(text) || 'Registered server program', activation: 'Registered Server Program', programId: word(programId), gwhost: word(gwhost).toLowerCase(), gwserv: word(gwserv).toLowerCase() })
    return { ok: true, text: `Destination ${n} saved` }
  })
export const deleteDestination = (state, name) =>
  edit(state, (s, y) => {
    if (y.ports.some((p) => p.dest === name)) return { ok: false, text: `Port ${y.ports.find((p) => p.dest === name).name} uses ${name}` }
    y.dests = y.dests.filter((d) => d.name !== name || d.type === '3')
    return { ok: true, text: `Destination ${name} deleted` }
  })
// WE21: a transactional RFC port. SAP proposes a number such as A000000001; the lab lets you name it.
export const createPort = (state, { name, dest, text }) =>
  edit(state, (s, y) => {
    const n = word(name).toUpperCase()
    if (!NAME_OK.test(n) || n.length > 10) return { ok: false, text: 'A port name has up to 10 letters, digits or _' }
    if (y.ports.some((p) => p.name === n)) return { ok: false, text: `Port ${n} already exists` }
    if (!y.dests.some((d) => d.name === dest)) return { ok: false, text: `RFC destination ${dest || '(empty)'} does not exist` }
    y.ports.push({ name: n, type: 'Transactional RFC', dest, text: word(text) })
    return { ok: true, text: `Port ${n} saved` }
  })
// BD54: a logical system
export const createLogicalSystem = (state, name) =>
  edit(state, (s, y) => {
    const n = word(name).toUpperCase()
    if (!NAME_OK.test(n) || n.length > 10) return { ok: false, text: 'A logical system has up to 10 letters, digits or _' }
    if (y.logsys.includes(n)) return { ok: false, text: `Logical system ${n} already exists` }
    y.logsys.push(n)
    return { ok: true, text: `Logical system ${n} saved` }
  })
// WE20: a partner of type LS, which must be a logical system
export const createPartner = (state, prn, text = '') =>
  edit(state, (s, y) => {
    const n = word(prn).toUpperCase()
    if (!y.logsys.includes(n)) return { ok: false, text: `Logical system ${n || '(empty)'} does not exist. Define it in BD54 first` }
    if (partnerOf(y, n)) return { ok: false, text: `Partner ${n} already exists` }
    y.partners.push({ prn: n, prt: 'LS', text: word(text), inbound: [], outbound: [] })
    return { ok: true, text: `Partner ${n} saved` }
  })
export const PROCESS_CODES = { ORDERS: 'ORDE', MATMAS: 'MATM', DESADV: 'DESA', INVOIC: 'INVL', ALEAUD: 'AUD1' }
export const addInbound = (state, prn, row) =>
  edit(state, (s, y) => {
    const p = partnerOf(y, prn)
    const mestyp = word(row?.mestyp).toUpperCase()
    if (!p || !mestyp || p.inbound.some((r) => r.mestyp === mestyp)) return false
    p.inbound.push({ mestyp, process: word(row.process).toUpperCase() || PROCESS_CODES[mestyp] || '', trigger: row.trigger === 'background' ? 'background' : 'immediately' })
    return true
  })
export const removeInbound = (state, prn, mestyp) =>
  edit(state, (s, y) => {
    const p = partnerOf(y, prn)
    if (p) p.inbound = p.inbound.filter((r) => r.mestyp !== mestyp)
    return true
  })
// WE19 outbound (lab-made content): a test IDoc to a partner through its outbound profile, port and destination
const TEST_OUT = {
  INVOIC: (y) => [seg('E1EDK01', 1, { CURCY: 'EUR', BELNR: `00900${pad(y.n % 100000, 5)}` }), seg('E1EDKA1', 1, { PARVW: 'RE', PARTN: '4712' }), seg('E1EDP01', 1, { POSEX: '000010', MENGE: '2', MENEE: 'PCE' }), seg('E1EDP19', 2, { QUALF: '002', IDTNR: 'H-1300' }), seg('E1EDS01', 1, { SUMID: '011', SUMME: '118.00', WAERQ: 'EUR' })],
  DESADV: () => [seg('E1EDL20', 1, { VBELN: '0080001022', VSTEL: '1000' }), seg('E1EDL24', 2, { POSNR: '000010', MATNR: 'H-1300', LFIMG: '2' })],
  MATMAS: () => [seg('E1MARAM', 1, { MATNR: 'H-1300', MTART: 'FERT', MEINS: 'PCE' }), seg('E1MAKTM', 2, { SPRAS: 'E', MAKTX: 'Harbor folding table' })],
}
export const testOutbound = (state, prn, mestyp) =>
  edit(state, (s, y, now) => {
    const make = TEST_OUT[mestyp]
    if (!make) return { ok: false, text: `No test data for message type ${mestyp}` }
    const d = outboundIdoc(y, word(prn).toUpperCase(), mestyp, make(y), now, 'HARBOR_DEV')
    d.ref = mestyp === 'INVOIC' ? fieldsOf(d, 'E1EDK01')[0].BELNR : ''
    const e = y.trfc.find((x) => x.docnum === d.docnum)
    if (e) deliver(s, y, e, now)
    return { ok: ['03', '12'].includes(d.status), docnum: d.docnum, status: d.status, text: e ? (y.trfc.includes(e) ? `IDoc ${d.docnum} passed to port; tRFC: ${e.status}` : `IDoc ${d.docnum} passed to port and handed to the registered program`) : `IDoc ${d.docnum}: ${d.hist.at(-1).m ?? statusText(d.status)}` }
  })

// SU01: unlock a user and reset the failed logons
export const unlockUser = (state, name) =>
  edit(state, (s, y) => {
    const u = y.users[name]
    if (u) Object.assign(u, { locked: false, failed: 0 })
    return Boolean(u)
  })

// for labs: a material locked by a user, a customer without a sales area
export const lockMaterial = (y, matnr, user) => void (y.materials[matnr] && (y.materials[matnr].lockedBy = user))
export const dropArea = (y, kunnr, area, now, by = 'MDM_BATCH') => {
  const c = y.customers[kunnr]
  if (!c) return
  c.areas = c.areas.filter((a) => a !== area)
  c.changes.push({ t: now, by, text: `Sales area ${areaText(area)} removed` })
}

// the placeholder the open console seeds: tiny; fillSap builds the system on first use
export const defaultSap = (now) => ({ created: now })
