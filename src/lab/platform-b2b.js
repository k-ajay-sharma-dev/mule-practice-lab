// B2B with Anypoint Partner Manager: the host Brightmart and its trading partners, AS2 endpoints with certificates and MDNs,
// X12 documents (850, 855, 856, 810, 997) with their envelopes and control numbers, X12 validation with 997 and TA1
// acknowledgments, inbound and outbound message flows, and the tracking of every transmission.
// Pure and import free. Lives in state.b2b.
//
// State shape (state.b2b). The partners, flows, certificates and code lists are the same seed on every console, so a
// lean state leaves them out until an action changes them (own). Reads fall back to the seed.
//   created, n (a counter), ctrl: { brightmart, northwind, bayline } (the next ISA13 of each sender),
//   partners?, flows?, certs?: [extra certificates], codes?: { 'northwind|850|PO103': ['EA', ...] },
//   tx: [transmission], pending: [{ kind: mdn | ack | resend, at, ... }], feeds: [{ partner, every, at, n, orders }],
//   inq: [{ id, flow, app, doc }] (mapped documents waiting for the target app), quirks: { northwind: { se01, pad } },
//   partnerKeys: { bayline: certId } (the key the partner really decrypts with), offered: [certificates partners sent],
//   issues: [{ key, partner, t, title, reply }], alerts: [{ t, flow, subject }], seenIsa: { partner: [ISA13] }
// A transmission: { id, t, dir: in | out, partner, type, isa, gs, st, ref, status: Received | Validated | Failed |
//   Acknowledged | Sent, hist: [{ s, t, note }], raw, errors, ack: { code, isa, t }, as2: { messageId, from, to, url,
//   encCert, signCert, mic, mode, mdn: { disposition, mic, signed, t } }, flow, src, orig, resentOf, target }
//
// ctx.b2b (b2bCtx) gives an app sendDocument(partner, type, payload), receive(flowId), ack(txId, code) and track(query).
// A failure returns { ok: false, type, error }. The error types B2B:* are lab made: the X12 and AS2 connectors of Mule
// have their own types, and Partner Manager reports problems in Tracking rather than as Mule errors.

const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const BASE = Date.UTC(2026, 10, 2) // day 0 of the lab clock, the same as platform.js
const MAX_TX = 80
const MAX_INQ = 40
const MAX_ALERTS = 30
const pad2 = (n) => String(n).padStart(2, '0')
const dt = (t) => new Date(BASE + t)
export const x12Date = (t) => `${dt(t).getUTCFullYear()}${pad2(dt(t).getUTCMonth() + 1)}${pad2(dt(t).getUTCDate())}`
const x12Time = (t) => `${pad2(dt(t).getUTCHours())}${pad2(dt(t).getUTCMinutes())}`
export const dayOf = (t) => `${dt(t).getUTCFullYear()}-${pad2(dt(t).getUTCMonth() + 1)}-${pad2(dt(t).getUTCDate())}`
const at = (days, hours = 0) => days * DAY + hours * HOUR

export const STATUSES = ['Received', 'Validated', 'Failed', 'Acknowledged', 'Sent']
export const DISP_OK = 'automatic-action/MDN-sent-automatically; processed'
export const DISP_DECRYPT = 'automatic-action/MDN-sent-automatically; processed/error: decryption-failed'
export const mdnOk = (mdn) => Boolean(mdn) && !/error/.test(mdn.disposition)

// ---------- X12 reference data ----------

// ISA05 and ISA07 interchange ID qualifiers
export const ISA_QUALIFIERS = { '01': 'DUNS (Dun & Bradstreet)', '08': 'UCC EDI Communications ID', 12: 'Phone number', 14: 'DUNS plus suffix', ZZ: 'Mutually defined' }
// element 355, Unit or Basis for Measurement Code: a part of the X12 code list
export const UOM_355 = { EA: 'Each', CA: 'Case', BX: 'Box', PK: 'Package', DZ: 'Dozen', PL: 'Pallet/Unit Load', LB: 'Pound', KG: 'Kilogram' }
export const ORDER_UNITS = ['EACH', 'CASE', 'BOX', 'PACK', 'DOZEN', 'PALLET']
// AK501 and AK901
export const ACK_CODES = { A: 'Accepted', E: 'Accepted, but errors were noted', P: 'Partially accepted', R: 'Rejected' }
// AK502 to AK506: transaction set syntax error codes
export const AK5_ERRORS = {
  1: 'Transaction Set Not Supported',
  2: 'Transaction Set Trailer Missing',
  3: 'Transaction Set Control Number in Header and Trailer Do Not Match',
  4: 'Number of Included Segments Does Not Match Actual Count',
  5: 'One or More Segments in Error',
}
// AK304: segment syntax error codes
export const AK3_ERRORS = { 1: 'Unrecognized segment ID', 2: 'Unexpected segment', 3: 'Mandatory segment missing', 6: 'Segment Not in Defined Transaction Set', 8: 'Segment Has Data Element Errors' }
// AK403: data element syntax error codes
export const AK4_ERRORS = { 1: 'Mandatory data element missing', 4: 'Data element too short', 5: 'Data element too long', 6: 'Invalid character in data element', 7: 'Invalid code value', 8: 'Invalid Date' }
// TA105: interchange note codes of a TA1
export const TA1_ERRORS = { '001': 'The Interchange Control Number in the Header and Trailer Do Not Match', '025': 'Duplicate Interchange Control Number' }

const E = (pos, ref, name, req, min, max, kind = 'AN') => ({ pos, ref, name, req, min, max, kind })
const S = (id, name, req, elements = [], loop = '') => ({ id, name, req, elements, loop })
const ST = S('ST', 'Transaction Set Header', 'M', [E(1, '143', 'Transaction Set Identifier Code', 'M', 3, 3, 'ID'), E(2, '329', 'Transaction Set Control Number', 'M', 4, 9)])
const SE = S('SE', 'Transaction Set Trailer', 'M', [E(1, '96', 'Number of Included Segments', 'M', 1, 10, 'N0'), E(2, '329', 'Transaction Set Control Number', 'M', 4, 9)])
const N1 = S('N1', 'Name', 'O', [E(1, '98', 'Entity Identifier Code', 'M', 2, 3, 'ID'), E(2, '93', 'Name', 'O', 1, 60), E(3, '66', 'Identification Code Qualifier', 'O', 1, 2, 'ID'), E(4, '67', 'Identification Code', 'O', 2, 80)], 'N1')
const CTT = S('CTT', 'Transaction Totals', 'O', [E(1, '354', 'Number of Line Items', 'M', 1, 6, 'N0')], 'CTT')
// Version 004010. Lab made: PO102 and PO103 are conditional in X12, Brightmart's implementation guide makes them mandatory.
export const DOC_TYPES = {
  850: {
    name: 'Purchase Order',
    fg: 'PO',
    segments: [
      ST,
      S('BEG', 'Beginning Segment for Purchase Order', 'M', [E(1, '353', 'Transaction Set Purpose Code', 'M', 2, 2, 'ID'), E(2, '92', 'Purchase Order Type Code', 'M', 2, 2, 'ID'), E(3, '324', 'Purchase Order Number', 'M', 1, 22), E(5, '373', 'Date', 'M', 8, 8, 'DT')]),
      S('REF', 'Reference Identification', 'O', [E(1, '128', 'Reference Identification Qualifier', 'M', 2, 3, 'ID'), E(2, '127', 'Reference Identification', 'O', 1, 30)]),
      S('DTM', 'Date/Time Reference', 'O', [E(1, '374', 'Date/Time Qualifier', 'M', 3, 3, 'ID'), E(2, '373', 'Date', 'O', 8, 8, 'DT')]),
      N1,
      S('N3', 'Address Information', 'O', [E(1, '166', 'Address Information', 'M', 1, 55)], 'N1'),
      S('N4', 'Geographic Location', 'O', [E(1, '19', 'City Name', 'O', 2, 30), E(2, '156', 'State or Province Code', 'O', 2, 2, 'ID'), E(3, '116', 'Postal Code', 'O', 3, 15)], 'N1'),
      S('PO1', 'Baseline Item Data', 'M', [E(1, '350', 'Assigned Identification', 'O', 1, 20), E(2, '330', 'Quantity Ordered', 'M', 1, 15, 'R'), E(3, '355', 'Unit or Basis for Measurement Code', 'M', 2, 2, 'ID'), E(4, '212', 'Unit Price', 'O', 1, 17, 'R'), E(6, '235', 'Product/Service ID Qualifier', 'O', 2, 2, 'ID'), E(7, '234', 'Product/Service ID', 'O', 1, 48)], 'PO1'),
      S('PID', 'Product/Item Description', 'O', [E(1, '349', 'Item Description Type', 'M', 1, 1, 'ID'), E(5, '352', 'Description', 'O', 1, 80)], 'PO1'),
      CTT,
      SE,
    ],
  },
  855: {
    name: 'Purchase Order Acknowledgment',
    fg: 'PR',
    segments: [ST, S('BAK', 'Beginning Segment for Purchase Order Acknowledgment', 'M', [E(1, '353', 'Transaction Set Purpose Code', 'M', 2, 2, 'ID'), E(2, '587', 'Acknowledgment Type', 'M', 2, 2, 'ID'), E(3, '324', 'Purchase Order Number', 'M', 1, 22), E(4, '373', 'Date', 'M', 8, 8, 'DT')]), S('PO1', 'Baseline Item Data', 'O', [], 'PO1'), S('ACK', 'Line Item Acknowledgment', 'O', [E(1, '668', 'Line Item Status Code', 'M', 2, 2, 'ID')], 'PO1/ACK'), CTT, SE],
  },
  856: {
    name: 'Ship Notice/Manifest',
    fg: 'SH',
    segments: [ST, S('BSN', 'Beginning Segment for Ship Notice', 'M', [E(1, '353', 'Transaction Set Purpose Code', 'M', 2, 2, 'ID'), E(2, '396', 'Shipment Identification', 'M', 2, 30), E(3, '373', 'Date', 'M', 8, 8, 'DT')]), S('HL', 'Hierarchical Level', 'M', [E(1, '628', 'Hierarchical ID Number', 'M', 1, 12), E(3, '735', 'Hierarchical Level Code', 'M', 1, 2, 'ID')], 'HL'), S('TD5', 'Carrier Details (Routing Sequence/Transit Time)', 'O', [], 'HL'), S('REF', 'Reference Identification', 'O', [], 'HL'), S('DTM', 'Date/Time Reference', 'O', [], 'HL'), N1, S('PRF', 'Purchase Order Reference', 'O', [E(1, '324', 'Purchase Order Number', 'M', 1, 22)], 'HL'), S('LIN', 'Item Identification', 'O', [], 'HL'), S('SN1', 'Item Detail (Shipment)', 'O', [E(2, '382', 'Number of Units Shipped', 'M', 1, 10, 'R'), E(3, '355', 'Unit or Basis for Measurement Code', 'M', 2, 2, 'ID')], 'HL'), CTT, SE],
  },
  810: {
    name: 'Invoice',
    fg: 'IN',
    segments: [ST, S('BIG', 'Beginning Segment for Invoice', 'M', [E(1, '373', 'Date', 'M', 8, 8, 'DT'), E(2, '76', 'Invoice Number', 'M', 1, 22), E(4, '324', 'Purchase Order Number', 'O', 1, 22)]), N1, S('IT1', 'Baseline Item Data (Invoice)', 'O', [], 'IT1'), S('TDS', 'Total Monetary Value Summary', 'M', [E(1, '610', 'Amount', 'M', 1, 15, 'N2')]), CTT, SE],
  },
  997: {
    name: 'Functional Acknowledgment',
    fg: 'FA',
    segments: [ST, S('AK1', 'Functional Group Response Header', 'M', [E(1, '479', 'Functional Identifier Code', 'M', 2, 2, 'ID'), E(2, '28', 'Group Control Number', 'M', 1, 9, 'N0')]), S('AK2', 'Transaction Set Response Header', 'O', [], 'AK2'), S('AK3', 'Data Segment Note', 'O', [], 'AK2/AK3'), S('AK4', 'Data Element Note', 'O', [], 'AK2/AK3'), S('AK5', 'Transaction Set Response Trailer', 'M', [E(1, '717', 'Transaction Set Acknowledgment Code', 'M', 1, 1, 'ID')], 'AK2'), S('AK9', 'Functional Group Response Trailer', 'M', [E(1, '715', 'Functional Group Acknowledge Code', 'M', 1, 1, 'ID')]), SE],
  },
}
export const DOC_TYPE_IDS = Object.keys(DOC_TYPES)
const DEFAULT_CODES = { '850|PO103': ['EA', 'CA', 'PK'], '850|BEG01': ['00', '05', '06'], '850|BEG02': ['SA', 'NE', 'DS'] }
// the elements whose allowed values a partner's document type can change, with the X12 code list a value must be in
export const CODE_LISTS = { '850|PO103': UOM_355 }

// ---------- seed ----------

const seedPartners = () => ({
  brightmart: { id: 'brightmart', name: 'Brightmart', host: true, role: 'Host', isaQual: 'ZZ', isaId: 'BRIGHTMART', gsId: 'BRIGHTMART', contact: 'edi-team@brightmart.example', as2: { as2Id: 'BRIGHTMART-AS2', url: 'https://b2b.brightmart.example/as2/receive', signCert: 'brightmart-sign-2026', encCert: 'brightmart-enc-2026' } },
  northwind: {
    id: 'northwind',
    name: 'Northwind Supplies',
    role: 'Supplier',
    isaQual: '01',
    isaId: '123456789',
    gsId: 'NORTHWIND',
    contact: 'edi@northwind-supplies.example',
    as2: { as2Id: 'NORTHWIND-AS2', url: 'https://as2.northwind-supplies.example/as2', signCert: 'northwind-sign-2026', encCert: 'northwind-enc-2026', mdn: 'sync', mdnSigned: true, mic: 'sha-256', encryption: 'AES256_CBC', signing: 'SHA256' },
    sftp: null,
    ackDelay: 3,
  },
  bayline: {
    id: 'bayline',
    name: 'Bayline Logistics',
    role: 'Logistics provider',
    isaQual: 'ZZ',
    isaId: 'BAYLINE',
    gsId: 'BAYLINE',
    contact: 'edi-support@bayline-logistics.example',
    as2: { as2Id: 'BAYLINE-AS2', url: 'https://as2.bayline-logistics.example/as2/receive', signCert: 'bayline-sign-2025', encCert: 'bayline-enc-2025', mdn: 'async', mdnUrl: 'https://b2b.brightmart.example/as2/mdn', mdnSigned: true, mic: 'sha-256', encryption: 'AES256_CBC', signing: 'SHA256' },
    sftp: { host: 'sftp.bayline-logistics.example', port: 22, user: 'brightmart', path: '/inbound/edi', enabled: false },
    ackDelay: 4,
  },
})
const cert = (id, owner, use, cn, notBefore, notAfter, issuer = 'CN=Lab Trust CA G2, O=Lab Trust') => ({ id, alias: id, owner, use, subject: `CN=${cn}`, issuer, serial: hex(id, 16).toUpperCase(), fp: fingerprint(id), notBefore, notAfter })
const seedCerts = () => [
  cert('brightmart-sign-2026', 'brightmart', 'Signing', 'b2b.brightmart.example', at(-300), at(65)),
  cert('brightmart-enc-2026', 'brightmart', 'Encryption', 'b2b.brightmart.example', at(-300), at(65)),
  cert('northwind-sign-2026', 'northwind', 'Signing', 'as2.northwind-supplies.example', at(-80), at(285)),
  cert('northwind-enc-2026', 'northwind', 'Encryption', 'as2.northwind-supplies.example', at(-80), at(285)),
  cert('bayline-sign-2025', 'bayline', 'Signing', 'as2.bayline-logistics.example', at(-340), at(150)),
  cert('bayline-enc-2025', 'bayline', 'Encryption', 'as2.bayline-logistics.example', at(-340), at(26)),
]
export const newCert = cert
const seedFlows = () => ({
  'nw-850-in': { id: 'nw-850-in', name: 'Northwind 850 to Order API', partner: 'northwind', dir: 'inbound', type: '850', receive: 'AS2', validate: true, ack997: true, target: { kind: 'API', name: 'Brightmart order intake', app: 'brightmart-edi-order-intake', url: 'https://brightmart-edi-order-intake.internal.brightmart.example/api/orders' }, unitMap: { EA: 'EACH', CA: 'CASE', PK: 'PACK' }, alerts: { rejected997: false, negativeMdn: false, to: '' }, ackWindowMin: null },
  'brightmart-855-out': { id: 'brightmart-855-out', name: 'Order acknowledgment 855 to Northwind', partner: 'northwind', dir: 'outbound', type: '855', send: 'AS2', source: { kind: 'API', name: 'Brightmart order intake', app: 'brightmart-edi-order-intake' }, alerts: { rejected997: false, negativeMdn: false, to: '' }, ackWindowMin: null },
  'nw-810-in': { id: 'nw-810-in', name: 'Northwind 810 to Payables API', partner: 'northwind', dir: 'inbound', type: '810', receive: 'AS2', validate: true, ack997: true, target: { kind: 'API', name: 'Brightmart payables', app: 'brightmart-payables-sapi', url: 'https://brightmart-payables-sapi.internal.brightmart.example/api/invoices' }, unitMap: { EA: 'EACH', CA: 'CASE', PK: 'PACK' }, alerts: { rejected997: false, negativeMdn: false, to: '' }, ackWindowMin: null },
  'bayline-856-out': { id: 'bayline-856-out', name: 'Ship notice 856 to Bayline', partner: 'bayline', dir: 'outbound', type: '856', send: 'AS2', source: { kind: 'API', name: 'Brightmart ASN dispatch', app: 'brightmart-asn-dispatch' }, alerts: { rejected997: false, negativeMdn: false, to: '' }, ackWindowMin: null },
})

// ---------- small helpers ----------

function hex(seed, n = 8) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  let out = ''
  for (let i = 0; out.length < n; i++) {
    h = Math.imul(h ^ (i + 0x9e37), 16777619) >>> 0
    out += ((h ^ (h >>> 13)) >>> 0).toString(16).padStart(8, '0')
  }
  return out.slice(0, n)
}
function fingerprint(id) {
  const h = hex(`fp${id}`, 40).toUpperCase()
  return h.match(/../g).slice(0, 10).join(':')
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
// lab made: a 32 byte digest of the content, written in base64 the way an MDN carries Received-Content-MIC
export function micOf(raw) {
  const bytes = hex(String(raw), 64).match(/../g).map((x) => parseInt(x, 16))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3)
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=')
  }
  return out
}
const push = (list, item, max) => {
  list.push(item)
  if (list.length > max) list.splice(0, list.length - max)
}
const hist = (tx, s, t, note) => tx.hist.push({ s, t, note })
const setStatus = (tx, s, t, note) => {
  tx.status = s
  hist(tx, s, t, note)
}
const num9 = (n) => String(n).padStart(9, '0')

// ---------- lean reads ----------

export function fill(b) {
  b ??= {}
  b.created ??= 0
  b.n ??= 1
  b.ctrl ??= { brightmart: 4100, northwind: 731, bayline: 2210 }
  for (const k of ['tx', 'pending', 'feeds', 'inq', 'alerts', 'issues', 'offered']) b[k] ??= []
  for (const k of ['quirks', 'partnerKeys', 'seenIsa']) b[k] ??= {}
  return b
}
// copies a part of the seed into the state before it is changed
function own(b, key) {
  if (!b[key]) b[key] = key === 'partners' ? seedPartners() : key === 'flows' ? seedFlows() : key === 'certs' ? [] : {}
  return b[key]
}
export const partnersOf = (b) => Object.values(b?.partners ?? seedPartners())
export const hostOf = (b) => partnersOf(b).find((p) => p.host)
export function partnerOf(b, key) {
  const k = String(key ?? '').trim().toLowerCase()
  return partnersOf(b).find((p) => p.id === k || p.name.toLowerCase() === k || p.isaId.toLowerCase() === k || p.as2?.as2Id.toLowerCase() === k)
}
export const flowsOf = (b) => Object.values(b?.flows ?? seedFlows())
export const flowOf = (b, id) => flowsOf(b).find((f) => f.id === id)
export const certsOf = (b) => [...seedCerts(), ...(b?.certs ?? [])]
export const certOf = (b, id) => certsOf(b).find((c) => c.id === id)
export const offeredOf = (b) => b?.offered ?? []
export const txOf = (b) => b?.tx ?? []
export const txById = (b, id) => txOf(b).find((x) => x.id === id)
export const codesOf = (b, partner, key) => b?.codes?.[`${partner}|${key}`] ?? DEFAULT_CODES[key] ?? null
export const issuesOf = (b) => b?.issues ?? []
export const alertsOf = (b) => b?.alerts ?? []
export const daysLeft = (c, now) => Math.floor((c.notAfter - now) / DAY)
// a flow runs once it is deployed; the seed flows are. A flow made in the screen starts as Draft.
export const flowStatus = (f) => f?.status ?? 'Running'
const findFlow = (b, partner, dir, type) => flowsOf(b).find((f) => f.partner === partner && f.dir === dir && f.type === type && flowStatus(f) === 'Running')
export const prospectsOf = (b) => b?.prospects ?? {}

// ---------- X12 writing and reading ----------

const toRaw = (segs) => segs.map((e) => `${e.join('*')}~`).join('\n')
export function envelope(from, to, fg, sets, ctrl, t, ackRequested = '0') {
  const isa = ['ISA', '00', ' '.repeat(10), '00', ' '.repeat(10), from.isaQual, from.isaId.padEnd(15), to.isaQual, to.isaId.padEnd(15), x12Date(t).slice(2), x12Time(t), 'U', '00401', num9(ctrl), ackRequested, 'P', '>']
  return toRaw([isa, ['GS', fg, from.gsId, to.gsId, x12Date(t), x12Time(t), String(ctrl), 'X', '004010'], ...sets.flat(), ['GE', String(sets.length), String(ctrl)], ['IEA', '1', num9(ctrl)]])
}
const wrapSet = (type, body, se01Short = false) => [['ST', type, '0001'], ...body, ['SE', String(body.length + 2 - (se01Short ? 1 : 0)), '0001']]

// X12 as segments: [['ISA', ...], ['GS', ...], ...]. The element separator is ISA position 4, the segment
// terminator the character after ISA16, so it stays right when the partner sends other separators.
export function segmentsOf(raw) {
  const text = String(raw ?? '')
  if (!text.startsWith('ISA') || text.length < 106) return []
  const es = text[3]
  const term = text[105]
  return text
    .split(term)
    .map((x) => x.replace(/^[\r\n]+/, ''))
    .filter(Boolean)
    .map((x) => x.split(es))
}
export function parseX12(raw) {
  const segs = segmentsOf(raw)
  const out = { isa: segs[0] ?? null, iea: null, groups: [] }
  let g = null
  let set = null
  for (const s of segs.slice(1)) {
    if (s[0] === 'GS') out.groups.push((g = { gs: s, ge: null, sets: [] }))
    else if (s[0] === 'GE' && g) g.ge = s
    else if (s[0] === 'IEA') out.iea = s
    else if (s[0] === 'ST' && g) g.sets.push((set = [s]))
    else if (set) {
      set.push(s)
      if (s[0] === 'SE') set = null
    }
  }
  return out
}
const refOf = (type, set) => {
  const seg = (id) => set?.find((s) => s[0] === id)
  return type === '850' ? seg('BEG')?.[3] : type === '855' ? seg('BAK')?.[3] : type === '856' ? seg('BSN')?.[2] : type === '810' ? seg('BIG')?.[2] : type === '997' ? `AK1 ${seg('AK1')?.[2] ?? ''}` : ''
}

// Checks one transaction set (ST to SE) against its document type and the partner's code lists.
// Returns { setCodes: [AK5 codes], segErrors: [{ seg, pos, loop, code, elems: [{ elem, ref, code, bad }] }] }
export function checkSet(b, partner, type, set) {
  const doc = DOC_TYPES[type]
  const setCodes = []
  const segErrors = []
  if (!doc) return { setCodes: ['1'], segErrors }
  const se = set.at(-1)
  if (se?.[0] !== 'SE') setCodes.push('2')
  else {
    if (se[2] !== set[0][2]) setCodes.push('3')
    if (Number(se[1]) !== set.length) setCodes.push('4')
  }
  const byId = Object.fromEntries(doc.segments.map((d) => [d.id, d]))
  for (const d of doc.segments) if (d.req === 'M' && !set.some((s) => s[0] === d.id)) segErrors.push({ seg: d.id, pos: doc.segments.indexOf(d) + 1, loop: d.loop, code: '3', elems: [] })
  set.forEach((s, i) => {
    const d = byId[s[0]]
    if (!d) return void segErrors.push({ seg: s[0], pos: i + 1, loop: '', code: '6', elems: [] })
    const elems = []
    for (const e of d.elements) {
      const v = s[e.pos] ?? ''
      const key = `${type}|${s[0]}${pad2(e.pos)}`
      const codes = codesOf(b, partner, key)
      let code = null
      if (v === '') code = e.req === 'M' ? '1' : null
      else if (v.length > e.max) code = '5'
      else if (v.length < e.min) code = '4'
      else if ((e.kind === 'R' || e.kind === 'N0' || e.kind === 'N2') && !/^-?\d+(\.\d+)?$/.test(v)) code = '6'
      else if (e.kind === 'DT' && !/^\d{8}$/.test(v)) code = '8'
      else if (e.kind === 'ID' && codes && !codes.includes(v)) code = '7'
      if (code) elems.push({ elem: e.pos, ref: e.ref, code, bad: v })
    }
    if (elems.length) segErrors.push({ seg: s[0], pos: i + 1, loop: d.loop, code: '8', elems })
  })
  if (segErrors.length && !setCodes.includes('5')) setCodes.push('5')
  return { setCodes, segErrors }
}
// the 997 for one functional group: one AK2 to AK5 per transaction set
function build997(group, results) {
  const body = [['AK1', group.gs[1], group.gs[6]]]
  let accepted = 0
  group.sets.forEach((set, i) => {
    const r = results[i]
    body.push(['AK2', set[0][1], set[0][2]])
    for (const e of r.segErrors) {
      body.push(['AK3', e.seg, String(e.pos), e.loop ? e.loop.split('/')[0] : '', e.code])
      for (const x of e.elems) body.push(['AK4', String(x.elem), x.ref, x.code, x.bad])
    }
    const ok = !r.setCodes.length && !r.segErrors.length
    if (ok) accepted++
    body.push(ok ? ['AK5', 'A'] : ['AK5', 'R', ...r.setCodes.slice(0, 5)])
  })
  const n = group.sets.length
  const code = accepted === n ? 'A' : accepted === 0 ? 'R' : 'P'
  body.push(['AK9', code, String(Number(group.ge?.[1] ?? n)), String(n), String(accepted)])
  return { set: wrapSet('997', body), code }
}
// plain words for the errors of a transaction set, for Tracking
export function errorText(r) {
  const out = []
  for (const c of r.setCodes) if (c !== '5') out.push(`AK5 ${c}: ${AK5_ERRORS[c]}`)
  for (const e of r.segErrors) {
    if (!e.elems.length) out.push(`AK3 ${e.seg} at position ${e.pos}: ${AK3_ERRORS[e.code]}`)
    for (const x of e.elems) out.push(`AK3 ${e.seg} at position ${e.pos}, AK4 element ${e.seg}${pad2(x.elem)} (${x.ref}): ${AK4_ERRORS[x.code]}${x.bad ? `, value "${x.bad}"` : ''}`)
  }
  return out
}

// the X12 body of an outbound document from the payload an app gives
function buildBody(type, p, t) {
  const lines = p.lines ?? []
  if (!lines.length && type !== '997') return { error: `The payload has no lines: ${type} needs at least one` }
  // a purchase order of Brightmart to a supplier
  if (type === '850')
    return { body: [['BEG', '00', 'SA', p.po, '', x12Date(t)], ['N1', 'ST', 'Brightmart DC East', '92', 'DC01'], ...lines.map((l, i) => ['PO1', String(i + 1), String(l.qty), l.uom ?? 'EA', l.price ?? '', '', 'VP', l.part ?? '', 'BP', l.item ?? '']), ['CTT', String(lines.length)]] }
  if (type === '855')
    return { body: [['BAK', '00', p.status ?? 'AC', p.po, x12Date(t)], ...lines.flatMap((l, i) => [['PO1', String(i + 1), String(l.qty), l.uom, l.price ?? '', '', 'VP', l.part ?? '', 'BP', l.item ?? ''], ['ACK', p.status === 'RJ' ? 'IR' : 'IA', String(l.qty), l.uom]]), ['CTT', String(lines.length)]] }
  if (type === '856') {
    const body = [['BSN', '00', p.shipment, x12Date(t), x12Time(t), '0001'], ['HL', '1', '', 'S'], ['TD5', 'B', '2', p.carrier ?? 'BYLN', 'M', p.carrierName ?? 'Bayline Ground'], ['REF', 'BM', p.bol ?? ''], ['DTM', '011', x12Date(t)], ['N1', 'ST', p.shipTo ?? '', '92', p.shipToCode ?? ''], ['HL', '2', '1', 'O'], ['PRF', p.po]]
    lines.forEach((l, i) => body.push(['HL', String(3 + i), '2', 'I'], ['LIN', String(i + 1), 'VP', l.part ?? l.item ?? ''], ['SN1', '', String(l.qty), l.uom ?? 'EA']))
    body.push(['CTT', String(lines.length)])
    return { body }
  }
  if (type === '810') {
    const total = lines.reduce((n, l) => n + Math.round(Number(l.qty) * Number(l.price) * 100), 0)
    return { body: [['BIG', x12Date(t), p.invoice, '', p.po], ['N1', 'BT', 'Brightmart', '92', 'HQ'], ...lines.map((l, i) => ['IT1', String(i + 1), String(l.qty), l.uom, String(l.price), '', 'VP', l.part ?? '']), ['TDS', String(total)], ['CTT', String(lines.length)]] }
  }
  return { error: `Document type ${type} cannot be sent from a payload` }
}

// ---------- the AS2 transport ----------

const msgId = (b, host) => `<${hex(`as2${b.n}`, 12)}.${b.n}@${host}>`
const newTx = (b, x) => {
  const tx = { id: `tx-${b.n++}`, hist: [], errors: [], ack: null, ...x }
  push(b.tx, tx, MAX_TX)
  return tx
}
function alert(s, b, flow, subject, body) {
  if (!flow?.alerts?.to) return
  const now = s.clock ?? 0
  push(b.alerts, { t: now, flow: flow.id, subject }, MAX_ALERTS)
  s.mail ??= []
  s.mail.push({ t: now, to: flow.alerts.to, subject, body, source: 'Anypoint Partner Manager' })
}

// Sends an X12 interchange to a partner over AS2: signed with the host key, encrypted with the certificate the
// partner endpoint names. The partner decrypts with the key it really has (partnerKeys), and answers with an MDN.
function transmit(s, b, partner, raw, meta) {
  const now = s.clock ?? 0
  const host = hostOf(b)
  const ep = partner.as2
  const x = parseX12(raw)
  const set = x.groups[0]?.sets[0]
  const tx = newTx(b, { t: now, dir: 'out', partner: partner.id, type: meta.type, isa: x.isa?.[13], gs: x.groups[0]?.gs[6], st: set?.[0][2], ref: meta.ref ?? refOf(meta.type, set), status: 'Sent', raw, flow: meta.flow ?? null, src: meta.src ?? null, app: meta.app ?? null, orig: meta.orig ?? null, resentOf: meta.resentOf ?? null, as2: { messageId: msgId(b, 'b2b.brightmart.example'), from: host.as2.as2Id, to: ep.as2Id, url: ep.url, encCert: ep.encCert, signCert: host.as2.signCert, mic: micOf(raw), mode: ep.mdn, mdn: null } })
  hist(tx, 'Sent', now, `AS2 POST ${ep.url}: HTTP 200 OK. AS2-From ${host.as2.as2Id}, AS2-To ${ep.as2Id}, Message-ID ${tx.as2.messageId}. Signed with ${host.as2.signCert} (SHA-256), encrypted for ${ep.encCert} (AES-256-CBC). Disposition-Notification-Options: signed-receipt-micalg=sha-256${ep.mdn === 'async' ? `, Receipt-Delivery-Option ${ep.mdnUrl}` : ''}.`)
  const ok = (b.partnerKeys[partner.id] ?? ep.encCert) === ep.encCert
  const mdn = { disposition: ok ? DISP_OK : DISP_DECRYPT, mic: ok ? tx.as2.mic : null, signed: ep.mdnSigned !== false, from: ep.as2Id }
  if (ep.mdn === 'async') b.pending.push({ kind: 'mdn', at: now + MINUTE, tx: tx.id, mdn })
  else applyMdn(s, b, tx, mdn)
  if (ok && !['997', 'TA1'].includes(meta.type)) b.pending.push({ kind: 'ack', at: now + (partner.ackDelay ?? 4) * MINUTE, tx: tx.id })
  // a supplier answers a purchase order with an 855 after its 997, when it has an inbound flow for the answer
  if (ok && meta.type === '850' && findFlow(b, partner.id, 'inbound', '855')) b.pending.push({ kind: 'po855', at: now + ((partner.ackDelay ?? 4) + 2) * MINUTE, tx: tx.id })
  return tx
}
function applyMdn(s, b, tx, mdn) {
  const now = s.clock ?? 0
  tx.as2.mdn = { ...mdn, t: now }
  const good = mdnOk(mdn)
  hist(tx, tx.status, now, `${tx.as2.mode === 'async' ? 'Asynchronous' : 'Synchronous'} MDN from ${mdn.from}: Disposition: ${mdn.disposition}.${good ? ` Received-Content-MIC: ${mdn.mic}, sha-256 matches the MIC sent.` : ' No Received-Content-MIC: the partner could not read the content.'}`)
  if (good) return
  setStatus(tx, 'Failed', now, 'Negative MDN: the partner did not process the message.')
  const flow = flowOf(b, tx.flow)
  if (flow?.alerts?.negativeMdn) alert(s, b, flow, `Negative MDN from ${partnerOf(b, tx.partner)?.name}: ${tx.type} ${tx.ref}`, `Interchange ${tx.isa} (${tx.type} ${tx.ref}) to ${partnerOf(b, tx.partner)?.name}: the MDN says "${mdn.disposition}". The partner has not received the document. Check the encryption certificate of the partner endpoint, then resend it from Tracking.`)
}

// Sends one document to a partner through its outbound message flow
function sendOut(s, b, key, type, payload, meta = {}) {
  const now = s.clock ?? 0
  const partner = partnerOf(b, key)
  if (!partner || partner.host) return { ok: false, type: 'B2B:PARTNER_NOT_FOUND', error: `No trading partner "${key}" in Partner Manager` }
  if (!DOC_TYPES[type]) return { ok: false, type: 'B2B:DOCUMENT_TYPE', error: `Document type ${type} is not set up` }
  const flow = type === '997' ? null : findFlow(b, partner.id, 'outbound', type)
  if (type !== '997' && !flow) return { ok: false, type: 'B2B:NO_MESSAGE_FLOW', error: `No outbound message flow sends ${type} to ${partner.name}` }
  if (!partner.as2) return { ok: false, type: 'B2B:ENDPOINT', error: `${partner.name} has no AS2 endpoint` }
  const built = type === '997' ? { body: payload.body } : buildBody(type, payload ?? {}, now)
  if (built.error) return { ok: false, type: 'B2B:TRANSFORMATION', error: built.error }
  const ctrl = b.ctrl.brightmart++
  const raw = envelope(hostOf(b), partner, DOC_TYPES[type].fg, [type === '997' ? payload.set : wrapSet(type, built.body)], ctrl, now)
  const tx = transmit(s, b, partner, raw, { type, flow: flow?.id, src: type === '997' ? null : payload, app: meta.app, ref: meta.ref })
  return { ok: true, id: tx.id, isa: tx.isa, gs: tx.gs, st: tx.st, status: tx.status, messageId: tx.as2.messageId, mdn: tx.as2.mdn }
}

// ---------- inbound ----------

function mapOrder(flow, partner, set) {
  const seg = (id) => set.find((s) => s[0] === id)
  const lines = []
  for (const p of set.filter((s) => s[0] === 'PO1')) {
    const unit = flow.unitMap?.[p[3]]
    if (!unit) return { error: `Mapping of PO1 line ${p[1]}: the Order API has no unit for the X12 code "${p[3]}". The unit mapping of ${flow.name} has ${Object.keys(flow.unitMap ?? {}).join(', ')}.` }
    lines.push({ line: Number(p[1]), qty: Number(p[2]), unit, price: Number(p[4]), vendorPart: p[7] ?? '', item: p[9] ?? '' })
  }
  return { doc: { orderNumber: seg('BEG')?.[3], orderDate: seg('BEG')?.[5], partner: partner.name, shipTo: seg('N1')?.[2] ?? '', lines } }
}

// An interchange arrives from a partner over AS2: MDN, envelope checks, validation, 997, mapping and delivery
// With extra.as2From the partner is found the way an AS2 receiver finds it: by the AS2-From header. Then the signature
// must verify with the signing certificate of that partner, and ISA05 and ISA06 must be its X12 identifiers.
function receiveIn(s, b, key, raw, extra = {}) {
  const now = s.clock ?? 0
  const host = hostOf(b)
  const x = parseX12(raw)
  if (extra.as2From) {
    const p = partnersOf(b).find((q) => !q.host && q.as2?.as2Id === extra.as2From)
    const refuse = (partner, note, disposition) => {
      const tx = newTx(b, { t: now, dir: 'in', partner, type: x.groups[0]?.sets[0]?.[0][1] ?? '?', isa: x.isa?.[13], gs: x.groups[0]?.gs[6], st: x.groups[0]?.sets[0]?.[0][2], ref: refOf('850', x.groups[0]?.sets[0]) ?? '', status: 'Received', raw, src: extra.src ?? null, as2: { messageId: `<${hex(`in${b.n}`, 12)}@partner>`, from: extra.as2From, to: host.as2.as2Id, mode: 'sync', mic: null, mdn: disposition ? { disposition, mic: null, signed: true, from: host.as2.as2Id, t: now } : null } })
      tx.errors = [note]
      setStatus(tx, 'Failed', now, note)
      return tx
    }
    if (!p) return refuse(extra.as2From, `AS2: no trading partner has the AS2 identifier ${extra.as2From}. The message was refused with HTTP 403 and no MDN.`, null)
    if (p.as2.signCert !== extra.signedWith) return refuse(p.id, `AS2: the signature does not verify with ${p.as2.signCert || 'no signing certificate'}, the signing certificate of ${p.name}. A negative MDN went back.`, 'automatic-action/MDN-sent-automatically; processed/error: authentication-failed')
    if (String(x.isa?.[5]).trim() !== p.isaQual || String(x.isa?.[6]).trim() !== p.isaId) return refuse(p.id, `X12: ISA05 ${String(x.isa?.[5]).trim()} and ISA06 ${String(x.isa?.[6]).trim()} are not the interchange identifiers of ${p.name} (${p.isaQual} ${p.isaId}). The interchange was not processed.`, DISP_OK)
    key = p.id
  }
  const partner = partnerOf(b, key)
  const group = x.groups[0]
  const set = group?.sets[0]
  const type = set?.[0][1] ?? '?'
  const tx = newTx(b, { t: now, dir: 'in', partner: partner.id, type, isa: x.isa?.[13], gs: group?.gs[6], st: set?.[0][2], ref: refOf(type, set) ?? '', status: 'Received', raw, src: extra.src ?? null, as2: { messageId: `<${hex(`in${b.n}`, 12)}@${partner.as2?.url.split('/')[2] ?? 'partner'}>`, from: partner.as2?.as2Id, to: host.as2.as2Id, mode: partner.as2?.mdn ?? 'sync', mic: micOf(raw), mdn: { disposition: DISP_OK, mic: micOf(raw), signed: true, from: host.as2.as2Id, t: now } } })
  hist(tx, 'Received', now, `AS2 message ${tx.as2.messageId}, AS2-From ${tx.as2.from}, AS2-To ${tx.as2.to}. Decrypted with ${host.as2.encCert}, signature verified with ${partner.as2?.signCert}. ${tx.as2.mode === 'async' ? 'Asynchronous' : 'Synchronous'} signed MDN returned: processed, Received-Content-MIC ${tx.as2.mic}, sha-256.`)
  if (type === '997') return partner997(s, b, tx, partner, set)
  const flow = findFlow(b, partner.id, 'inbound', type)
  tx.flow = flow?.id ?? null
  if (!flow) return setStatus(tx, 'Failed', now, `No inbound message flow for ${type} from ${partner.name}.`), tx
  // the interchange envelope: ISA13 and IEA02 must agree, and an ISA13 the partner used before is a duplicate
  const seen = (b.seenIsa[partner.id] ??= [])
  const ta1 = x.iea?.[2] !== tx.isa ? '001' : seen.includes(tx.isa) ? '025' : null
  if (ta1) {
    tx.errors = [`TA1 ${ta1}: ${TA1_ERRORS[ta1]}`]
    setStatus(tx, 'Failed', now, `Interchange ${tx.isa} rejected: ${TA1_ERRORS[ta1]}. A TA1 with code R was returned and the content was not processed.`)
    return tx
  }
  push(seen, tx.isa, 60)
  let results = group.sets.map((st) => (flow.validate ? checkSet(b, partner.id, type, st) : { setCodes: [], segErrors: [] }))
  if (flow.validate) {
    const errs = results.flatMap(errorText)
    if (errs.length) {
      tx.errors = errs
      setStatus(tx, 'Failed', now, `X12 validation against ${type} 004010 of ${partner.name}: ${errs.length} error${errs.length > 1 ? 's' : ''}. ${errs[0]}.`)
    } else setStatus(tx, 'Validated', now, `X12 validation against ${type} 004010 of ${partner.name}: no errors.`)
  } else {
    results = group.sets.map(() => ({ setCodes: [], segErrors: [] }))
    setStatus(tx, 'Validated', now, 'Validation is off for this flow: the document was not checked.')
  }
  if (flow.ack997) {
    const ack = build997(group, results)
    const sent = sendOut(s, b, partner.id, '997', { set: ack.set }, { ref: `AK1 ${group.gs[6]}` })
    tx.ack = { code: ack.code, isa: sent.isa, t: now, sent: true }
    hist(tx, tx.status, now, `997 with AK9 ${ack.code} (${ACK_CODES[ack.code]}) sent to ${partner.name} as interchange ${sent.isa}.`)
    if (ack.code !== 'A' && flow.alerts?.rejected997) alert(s, b, flow, `997 ${ack.code} sent to ${partner.name}: ${type} ${tx.ref}`, `Partner Manager rejected ${type} ${tx.ref} from ${partner.name} (interchange ${tx.isa}, group ${tx.gs}) and sent a 997 with AK9 ${ack.code}. Errors: ${tx.errors.join('; ')}. Open Tracking and search for ${tx.isa}.`)
  }
  if (tx.status === 'Failed') return tx
  // map and deliver to the target of the flow. Lab made: the target app takes its documents with ctx.b2b.receive
  // instead of Partner Manager posting them to its HTTP endpoint.
  const mapped = type === '850' ? mapOrder(flow, partner, set) : { doc: { partner: partner.name, type, ref: tx.ref } }
  if (mapped.error) {
    tx.errors = [mapped.error]
    setStatus(tx, 'Failed', now, `Mapping to the target failed: ${mapped.error} The 997 already told the partner the document was accepted.`)
    return tx
  }
  push(b.inq, { id: tx.id, flow: flow.id, app: flow.target?.app, doc: mapped.doc, t: now }, MAX_INQ)
  tx.target = 'Pending'
  setStatus(tx, tx.ack ? 'Acknowledged' : 'Validated', now, `Mapped to JSON and queued for ${flow.target?.name} (${flow.target?.url}).`)
  return tx
}
// a 997 from a partner closes the outbound transmission it answers
function partner997(s, b, tx, partner, set) {
  const now = s.clock ?? 0
  const ak1 = set.find((x) => x[0] === 'AK1')
  const ak9 = set.find((x) => x[0] === 'AK9')
  const code = ak9?.[1] ?? 'R'
  setStatus(tx, 'Validated', now, `Functional acknowledgment for group ${ak1?.[2]}: AK9 ${code} (${ACK_CODES[code]}).`)
  const out = [...b.tx].reverse().find((x) => x.dir === 'out' && x.partner === partner.id && x.gs === ak1?.[2] && !x.ack && x.type !== '997')
  if (!out) return tx
  out.ack = { code, isa: tx.isa, t: now }
  if (code === 'A' || code === 'E') setStatus(out, 'Acknowledged', now, `997 from ${partner.name}: AK9 ${code}, interchange ${tx.isa}.`)
  else {
    setStatus(out, 'Failed', now, `997 from ${partner.name}: AK9 ${code}, the partner rejected the document.`)
    const flow = flowOf(b, out.flow)
    if (flow?.alerts?.rejected997) alert(s, b, flow, `997 ${code} from ${partner.name}: ${out.type} ${out.ref}`, `${partner.name} rejected ${out.type} ${out.ref} (interchange ${out.isa}).`)
  }
  return tx
}

// ---------- the partners' side ----------

// a partner builds an 850 from its ERP. Quirks are how the partner's system gets it wrong: se01 counts the segments
// without SE itself, pad writes unit codes of migrated items with a trailing space.
export function partner850(b, key, src, t) {
  const partner = typeof key === 'object' ? key : partnerOf(b, key)
  b.ctrl[partner.id] ??= 101
  const q = b.quirks?.[partner.id] ?? {}
  const lines = src.lines.map((l, i) => [['PO1', String(i + 1), String(l.qty), q.pad && l.migrated ? `${l.uom} ` : l.uom, l.price, '', 'VP', l.part, 'BP', l.item], ['PID', 'F', '', '', '', l.desc]]).flat()
  const body = [['BEG', '00', 'SA', src.po, '', x12Date(t)], ['REF', 'VR', src.vendor ?? 'NW-VENDOR-77'], ['DTM', '002', x12Date(t + 5 * DAY)], ['N1', 'ST', 'Brightmart DC East', '92', 'DC01'], ['N3', '1 Quay Road'], ['N4', 'Brightmart City', 'CA', '90001'], ...lines, ['CTT', String(src.lines.length)]]
  const ctrl = b.ctrl[partner.id]++
  return envelope(partner, hostOf(b), 'PO', [wrapSet('850', body, q.se01)], ctrl, t)
}
// the supplier accepts the purchase order with an 855, BAK02 AC
function partner855(s, b, out) {
  const partner = partnerOf(b, out.partner)
  const now = s.clock ?? 0
  const src = { po: out.ref, status: 'AC', lines: out.src?.lines ?? [] }
  const built = buildBody('855', src, now)
  if (built.error) return
  b.ctrl[partner.id] ??= 101
  receiveIn(s, b, partner.id, envelope(partner, hostOf(b), 'PR', [wrapSet('855', built.body)], b.ctrl[partner.id]++, now), { src })
}
function partnerAck(s, b, out) {
  const partner = partnerOf(b, out.partner)
  const now = s.clock ?? 0
  const body = [['AK1', DOC_TYPES[out.type]?.fg ?? 'PO', out.gs], ['AK2', out.type, out.st], ['AK5', 'A'], ['AK9', 'A', '1', '1', '1']]
  const raw = envelope(partner, hostOf(b), 'FA', [wrapSet('997', body)], b.ctrl[partner.id]++, now)
  receiveIn(s, b, partner.id, raw)
}

// Issues Brightmart can raise with a partner. Lab made: the partner answers by mail and fixes its side from the next
// interchange when the issue is real; a code that is valid X12 is for Brightmart to accept.
export const ISSUES = {
  'se01-count': { title: 'SE01 is one less than the segments from ST to SE', fixes: 'se01', reply: 'Thank you. Our new ERP did not count the SE segment itself in SE01. It is fixed from the next interchange.' },
  'uom-padding': { title: 'PO103 unit codes come with a trailing space ("EA ")', fixes: 'pad', reply: 'Thank you. The items we migrated kept a three character unit field. We trim it from the next interchange.' },
  'uom-bx': { title: 'PO103 unit code BX is not in our list', fixes: null, reply: 'BX (Box) is a valid X12 code of element 355, and we sell tea bags by the box since the new ERP. Please add BX to your implementation guide for us.' },
  'isa-qualifier': { title: 'ISA05 qualifier 01 with ISA06 123456789', fixes: null, reply: 'Qualifier 01 with our DUNS number is what we agreed in the trading partner setup. Nothing changes on our side.' },
}

// ---------- the ctx hook and the tick ----------

export const defaultB2b = (now) => ({ created: now })

export function b2bCtx(s, app) {
  const b = () => (s.b2b = fill(s.b2b))
  const me = app?.name ?? 'app'
  return {
    sendDocument: (partner, type, payload) => sendOut(s, b(), partner, String(type), payload, { app: me }),
    // Lab made: the message flows an app needs are set up in Partner Manager on its first call, as if the B2B team
    // had deployed them with the app. A flow that already exists keeps its settings.
    addFlows: (list) => {
      const x = b()
      if (list.every((f) => flowOf(x, f.id))) return
      const flows = own(x, 'flows')
      for (const f of list) flows[f.id] ??= structuredClone(f)
    },
    // the mapped documents an inbound flow delivered to this app
    receive: (flowId) => {
      const x = b()
      const mine = x.inq.filter((d) => d.app === me && (!flowId || d.flow === flowId))
      x.inq = x.inq.filter((d) => !mine.includes(d))
      for (const d of mine) {
        const tx = txById(x, d.id)
        if (tx) {
          tx.target = 'Delivered'
          hist(tx, tx.status, s.clock ?? 0, `Delivered to ${me}: HTTP 201 Created.`)
        }
      }
      return mine.map((d) => ({ id: d.id, flow: d.flow, ...structuredClone(d.doc) }))
    },
    // the business answer to an inbound 850: an 855 with BAK02 AC (accepted), AE (accepted with changes) or RJ
    ack: (id, status = 'AC') => {
      const x = b()
      const tx = txById(x, id)
      if (!tx || tx.dir !== 'in' || tx.type !== '850') return { ok: false, type: 'B2B:NOT_FOUND', error: `No inbound 850 ${id}` }
      const set = parseX12(tx.raw).groups[0]?.sets[0] ?? []
      const lines = set.filter((p) => p[0] === 'PO1').map((p) => ({ qty: p[2], uom: p[3], price: p[4], part: p[7], item: p[9] }))
      return sendOut(s, x, tx.partner, '855', { po: tx.ref, status, lines }, { app: me })
    },
    track: (query) => searchTx(b(), query).map((t) => ({ id: t.id, t: t.t, dir: t.dir, partner: t.partner, type: t.type, isa: t.isa, gs: t.gs, st: t.st, ref: t.ref, status: t.status, ack: t.ack?.code ?? null, mdn: t.as2?.mdn?.disposition ?? null })),
  }
}

// runs once a lab minute while state.b2b exists. A lean state with no transmissions has nothing to do.
export function b2bTick(s) {
  const b = s.b2b
  if (!b?.tx) return s
  fill(b)
  const now = s.clock ?? 0
  for (const f of b.feeds) {
    f.at ??= now
    if (now < f.at) continue
    f.at = now + (f.every ?? 15) * MINUTE
    const n = (f.n = (f.n ?? 0) + 1)
    const src = { po: `${f.prefix ?? 'NW-'}${f.first + n}`, lines: f.orders[(n - 1) % f.orders.length] }
    receiveIn(s, b, f.partner, partner850(b, f.partner, src, now), { src })
  }
  const due = b.pending.filter((p) => p.at <= now)
  b.pending = b.pending.filter((p) => p.at > now)
  for (const p of due) {
    if (p.kind === 'resend') receiveIn(s, b, p.partner, partner850(b, p.partner, p.src, now), { src: p.src })
    if (p.kind === 'test') {
      const pr = b.prospects?.[p.prospect]
      if (pr) receiveIn(s, b, null, partner850(b, pr, pr.test, now), { src: pr.test, as2From: pr.as2Id, signedWith: pr.signCert })
    }
    const tx = p.tx && txById(b, p.tx)
    if (!tx) continue
    if (p.kind === 'mdn') applyMdn(s, b, tx, p.mdn)
    if (p.kind === 'ack') partnerAck(s, b, tx)
    if (p.kind === 'po855') partner855(s, b, tx)
  }
  // 997 overdue: an outbound document whose flow names an acknowledgment window and has no 997 inside it
  for (const tx of b.tx) {
    if (tx.dir !== 'out' || tx.ack || tx.overdue || tx.type === '997' || tx.status === 'Failed') continue
    const flow = flowOf(b, tx.flow)
    const win = Number(flow?.ackWindowMin)
    if (!win || now < tx.t + win * MINUTE) continue
    tx.overdue = true
    setStatus(tx, 'Failed', now, `No 997 within ${win} minutes of sending.`)
    alert(s, b, flow, `997 overdue from ${partnerOf(b, tx.partner)?.name}: ${tx.type} ${tx.ref}`, `${tx.type} ${tx.ref} went to ${partnerOf(b, tx.partner)?.name} as interchange ${tx.isa} at ${dayOf(tx.t)} and no 997 came within ${win} minutes. The partner may not have received it.`)
  }
  return s
}

// ---------- search ----------

export function searchTx(b, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return [...txOf(b)].reverse()
  const n = /^\d+$/.test(q) ? String(Number(q)) : null
  return [...txOf(b)].reverse().filter((t) => [t.id, t.ref, t.as2?.messageId].some((v) => String(v ?? '').toLowerCase().includes(q)) || (n !== null && [t.isa, t.gs, t.st].some((v) => v !== undefined && v !== null && String(Number(v)) === n)))
}

// ---------- UI actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.b2b = fill(s.b2b)
  fn(s, s.b2b, s.clock ?? 0)
  return s
}
export const setFlow = (state, id, patch) =>
  edit(state, (s, b) => {
    const f = own(b, 'flows')[id]
    if (!f) return
    const { alerts, ...rest } = patch
    Object.assign(f, rest)
    if (alerts) f.alerts = { ...f.alerts, ...alerts }
  })
export const setUnitMap = (state, id, from, to) =>
  edit(state, (s, b) => {
    const f = own(b, 'flows')[id]
    const k = String(from ?? '').trim().toUpperCase()
    if (!f || !k) return
    f.unitMap = { ...f.unitMap }
    if (to) f.unitMap[k] = to
    else delete f.unitMap[k]
  })
// why a value cannot go into the allowed list of an element, or null
export function codeProblem(key, code) {
  const v = String(code ?? '').trim().toUpperCase()
  if (!v) return 'Type a code.'
  const list = CODE_LISTS[key]
  if (list && !list[v]) return `${v} is not a code of X12 element 355 (Unit or Basis for Measurement Code). The list has ${Object.keys(list).join(', ')}.`
  return null
}
export const addCode = (state, partner, key, code) =>
  codeProblem(key, code)
    ? state
    : edit(state, (s, b) => {
        const v = String(code).trim().toUpperCase()
        const codes = own(b, 'codes')
        const now = codesOf(b, partner, key) ?? []
        if (!now.includes(v)) codes[`${partner}|${key}`] = [...now, v]
      })
export const removeCode = (state, partner, key, code) =>
  edit(state, (s, b) => {
    own(b, 'codes')[`${partner}|${key}`] = (codesOf(b, partner, key) ?? []).filter((c) => c !== code)
  })
export const setEndpoint = (state, partner, patch) =>
  edit(state, (s, b, now) => {
    const p = own(b, 'partners')[partner]
    if (!p || p.host) return
    p.as2 ??= { as2Id: '', url: '', signCert: '', encCert: '', mdn: 'sync', mdnSigned: true, mic: 'sha-256', encryption: 'AES256_CBC', signing: 'SHA256' }
    for (const [k, use] of [['encCert', 'Encryption'], ['signCert', 'Signing']]) {
      if (!patch[k]) continue
      const c = certOf(b, patch[k])
      if (!c || c.owner !== partner || c.use !== use) return
    }
    if (patch.encCert && patch.encCert !== p.as2.encCert) p.as2.encSince = now
    Object.assign(p.as2, patch)
  })
export const slugOf = (name) => String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// Partners, New partner: the problems of the form, or [] when it can be created
export function partnerProblems(b, form) {
  const out = []
  if (!String(form.name ?? '').trim()) out.push('Name is required.')
  else if (partnerOf(b, slugOf(form.name)) || partnersOf(b).some((p) => p.name.toLowerCase() === String(form.name).trim().toLowerCase())) out.push(`A partner named ${String(form.name).trim()} exists.`)
  if (!ISA_QUALIFIERS[form.isaQual]) out.push('Pick an ISA qualifier.')
  const id = String(form.isaId ?? '').trim()
  if (!id) out.push('ISA ID is required.')
  else if (id.length > 15) out.push('ISA ID has at most 15 characters (ISA06 is 15 long, padded with spaces).')
  else if (partnersOf(b).some((p) => p.isaQual === form.isaQual && p.isaId === id)) out.push(`Another partner has ISA ID ${form.isaQual} ${id}.`)
  const gs = String(form.gsId ?? '').trim()
  if (!gs) out.push('GS ID is required.')
  else if (gs.length > 15) out.push('GS ID has at most 15 characters.')
  return out
}
export const createPartner = (state, form) =>
  partnerProblems(state.b2b, form).length
    ? state
    : edit(state, (s, b) => {
        const id = slugOf(form.name)
        own(b, 'partners')[id] = { id, name: String(form.name).trim(), role: form.role || 'Trading partner', isaQual: form.isaQual, isaId: String(form.isaId).trim(), gsId: String(form.gsId).trim(), contact: String(form.contact ?? '').trim(), as2: null, sftp: null, ackDelay: 3 }
      })
// Message flows, New message flow. It starts as Draft and runs once deployed.
export function flowProblems(b, form) {
  const out = []
  if (!String(form.name ?? '').trim()) out.push('Name is required.')
  const p = partnerOf(b, form.partner)
  if (!p || p.host) out.push('Pick a partner.')
  if (!DOC_TYPES[form.type] || form.type === '997') out.push('Pick a document type. A 997 is sent by the inbound flow it acknowledges.')
  if (form.dir === 'inbound' && !String(form.target ?? '').trim()) out.push('Pick the target that gets the mapped documents.')
  if (p && flowsOf(b).some((f) => f.partner === p.id && f.dir === form.dir && f.type === form.type)) out.push(`${p.name} has a ${form.dir} ${form.type} flow already.`)
  return out
}
export const createFlow = (state, form) =>
  flowProblems(state.b2b, form).length
    ? state
    : edit(state, (s, b) => {
        const p = partnerOf(b, form.partner)
        const id = `${p.id}-${form.type}-${form.dir === 'inbound' ? 'in' : 'out'}`
        const app = String(form.target ?? '').trim()
        own(b, 'flows')[id] = {
          id,
          name: String(form.name).trim(),
          partner: p.id,
          dir: form.dir,
          type: form.type,
          status: 'Draft',
          ...(form.dir === 'inbound'
            ? { receive: 'AS2', validate: Boolean(form.validate), ack997: Boolean(form.ack997), target: { kind: 'API', name: app, app, url: `https://${app}.internal.brightmart.example/api/orders` }, unitMap: { EA: 'EACH', CA: 'CASE', PK: 'PACK' } }
            : { send: 'AS2', source: { kind: 'API', name: app, app } }),
          alerts: { rejected997: false, negativeMdn: false, to: '' },
          ackWindowMin: null,
        }
      })
// Deploy: lab made, Partner Manager checks what the flow needs and then runs it
export function deployProblems(b, id) {
  const f = flowOf(b, id)
  if (!f) return ['No such flow.']
  const p = partnerOf(b, f.partner)
  const out = []
  if (!p?.as2?.as2Id || !p.as2.url) out.push(`${p?.name} has no AS2 endpoint: set its AS2 identifier and URL.`)
  if (!p?.as2?.signCert || !p?.as2?.encCert) out.push(`The AS2 endpoint of ${p?.name} needs a signing and an encryption certificate.`)
  return out
}
export const deployFlow = (state, id) =>
  deployProblems(state.b2b, id).length
    ? state
    : edit(state, (s, b) => {
        const f = own(b, 'flows')[id]
        if (f) f.status = 'Running'
      })
export const undeployFlow = (state, id) =>
  edit(state, (s, b) => {
    const f = own(b, 'flows')[id]
    if (f) f.status = 'Draft'
  })
// Partners, Request test 850: lab made, the partner in onboarding sends its test purchase order two minutes later
export const requestTest = (state, key) =>
  edit(state, (s, b, now) => {
    const id = Object.keys(b.prospects ?? {}).find((k) => k === key || b.prospects[k].name === partnerOf(b, key)?.name)
    if (!id || b.pending.some((p) => p.kind === 'test' && p.prospect === id)) return
    b.pending.push({ kind: 'test', at: now + 2 * MINUTE, prospect: id })
  })
export const setPartner = (state, partner, patch) =>
  edit(state, (s, b) => {
    const p = own(b, 'partners')[partner]
    if (p) Object.assign(p, patch)
  })
// Certificates, Import: a certificate the partner sent becomes one Partner Manager can use
export const importCert = (state, id) =>
  edit(state, (s, b) => {
    const c = b.offered.find((x) => x.id === id)
    if (!c || certOf(b, id)) return
    own(b, 'certs').push(structuredClone(c))
    b.offered = b.offered.filter((x) => x.id !== id)
  })
export const raiseIssue = (state, partner, key) =>
  edit(state, (s, b, now) => {
    const issue = ISSUES[key]
    const p = partnerOf(b, partner)
    if (!issue || !p || b.issues.some((x) => x.key === key && x.partner === p.id)) return
    b.issues.push({ key, partner: p.id, t: now, title: issue.title, reply: issue.reply })
    if (issue.fixes) b.quirks[p.id] = { ...b.quirks[p.id], [issue.fixes]: false }
    s.mail ??= []
    s.mail.push({ t: now, to: hostOf(b).contact, subject: `Re: ${issue.title}`, body: issue.reply, source: p.name })
  })
// Tracking, Resend: the same interchange again, with the same control numbers, through the current endpoint settings
export const resendTx = (state, id) =>
  edit(state, (s, b, now) => {
    const tx = txById(b, id)
    const p = tx && partnerOf(b, tx.partner)
    if (!tx || tx.dir !== 'out' || !p?.as2) return
    const again = transmit(s, b, p, tx.raw, { type: tx.type, flow: tx.flow, src: tx.src, app: tx.app, ref: tx.ref, resentOf: tx.id, orig: tx.orig ?? tx.id })
    hist(tx, tx.status, now, `Resent as ${again.id}.`)
  })
export const resendFailed = (state, partner) => {
  const failed = txOf(state.b2b).filter((t) => t.dir === 'out' && t.partner === partner && t.status === 'Failed' && t.type !== '997' && !txOf(state.b2b).some((x) => x.resentOf === t.id))
  return failed.reduce((s, t) => resendTx(s, t.id), state)
}
// Tracking, Request resend: asks the partner to send an inbound document again. Lab made: the partner's system sends
// it three minutes later with new control numbers, built the way its ERP builds it at that moment.
export const requestResend = (state, id) =>
  edit(state, (s, b, now) => {
    const tx = txById(b, id)
    if (!tx || tx.dir !== 'in' || !tx.src || b.pending.some((p) => p.kind === 'resend' && p.src.po === tx.src.po)) return
    b.pending.push({ kind: 'resend', at: now + 3 * MINUTE, partner: tx.partner, src: tx.src })
    hist(tx, tx.status, now, `Resend requested from ${partnerOf(b, tx.partner)?.name}.`)
  })
export const requestResendFailed = (state, partner) => {
  const all = txOf(state.b2b)
  const done = new Set(all.filter((t) => t.dir === 'in' && t.status !== 'Failed').map((t) => t.ref))
  const seen = new Set()
  const pick = [...all].reverse().filter((t) => t.dir === 'in' && t.partner === partner && t.status === 'Failed' && t.src && !done.has(t.ref) && !seen.has(t.ref) && seen.add(t.ref))
  return pick.reduce((s, t) => requestResend(s, t.id), state)
}
