// An HL7 v2 integration engine at Bayview Health, a fictional hospital whose source system is Epic. Epic sends HL7
// v2.5.1 messages over MLLP from its outbound interfaces to the MLLP listeners of Mule apps; the apps send them on to
// the Bayview LIS (laboratory system), which answers each message with an ACK. Pure and import free. Lives in state.hl7.
//
// The open console seeds only { created }; fillHl7 builds the rest the first time a screen or an app uses it.
//
// State shape (state.hl7, once filled):
//   created, facility,
//   interfaces: [{ id, name, type: 'ADT' | 'ORU', events: ['A01', ...], host, port, tls, ackTimeout (s),
//                  onAe: 'Continue' | 'Hold', status: 'Running' | 'Stopped', connected, since, ever, reconnects,
//                  lastError, held, queue: [{ raw, ctl, tries, due }], feed: [{ at, raw }],
//                  n: { sent, AA, AE, AR, timeout, filtered } }]   (the outbound interfaces of Epic)
//   listeners: { [port]: { app, host, port, tls, t, since } }   (the MLLP listeners of Mule apps, live while they poll)
//   lis: { name, host, port, patients: { mrn: { name, dob, sex, mergedInto } },
//          encounters: [{ visit, mrn, cls, loc, status, admit, discharge, t }], results: [{ mrn, visit, code, text, value, units, flag, t }],
//          slow: [{ from, to, min, max }], n: { AA, AE, AR } }
//   log: [{ id, t, leg, app, ctl, type, mrn, raw, ack, ackRaw, status, tries, note }]
//        leg is the id of an Epic interface (Epic to Mule) or 'LIS' (Mule to the LIS)
//   errors: [{ t, app, ctl, type, mrn, reason, raw }]   (the error store the apps write bad messages to)
//   seq (log id counter), ctl (control ID counter)
//
// ctx.hl7 (see hl7Ctx), for package handlers:
//   listen(cfg, handler)   the MLLP listener. cfg: { host, port, tls }. Registers the listener, lets the Epic interfaces
//                          that point at it connect, and hands their queued messages to handler(msg) one at a time, in
//                          order. msg: { id, controlId, type, event, raw, parsed, iface, tries }. The handler returns the
//                          ACK from ack(). An ACK slower than the ackTimeout of the interface is late: Epic closes the
//                          connection, reconnects and sends the same message again. Returns { ok, ms, results }.
//   ack(msg, code, text, err)  builds the ACK (MSH, MSA and, for AE and AR, ERR) and gives it back. err: { code, loc }
//   send(cfg, msg)         outbound MLLP to the LIS. cfg: { host, port }. Returns { ok, ms, ack: { code, text, errCode, errLoc, raw } }
//                          or { ok: false, type: 'MLLP:CONNECTIVITY', error, ms }.
//   read(text) / parse(text)    the Read operation of the HL7 EDI connector: text to segments and fields
//   write(obj) / build(obj)     the Write operation: segments back to text
//   validate(parsed)            the Validate operation: a list of { code, loc, text } against HL7 v2.5.1 rules
//   park(msg, reason)           writes a message to the error store
// Lab-made simplifications are marked where they are made.

export const EPIC_HOST = 'epic-bridges.bayview.lab'
// lab-made: this name reaches the MLLP listener of any running Mule app, the way a load balancer would
export const MULE_HOST = 'mule-hl7.bayview.lab'
export const LIS_HOST = 'lis.bayview.lab'
export const LIS_PORT = 6661
export const FACILITY = 'BVH'
export const VERSION = '2.5.1'
export const VT = '\x0b'
export const FS = '\x1c'
export const CR = '\r'
const MINUTE = 60000
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
// lab-made limits, so a saved console stays small
const MAX_LOG = 160
const MAX_QUEUE = 120
const MAX_ERRORS = 30
const MAX_RESULTS = 30
const MAX_ENCOUNTERS = 60
// a listener counts as live while its app polled in the last 2 lab minutes
const LIVE = 2 * MINUTE
// lab-made: one poll of a listener handles at most 30 messages and one minute of work
const PER_POLL = 30
const POLL_BUDGET = MINUTE

// ---------- HL7 tables ----------

// HL7 table 0357, message error condition codes, as ERR-3 carries them
export const ERR_CODES = {
  0: 'Message accepted',
  100: 'Segment sequence error',
  101: 'Required field missing',
  102: 'Data type error',
  103: 'Table value not found',
  200: 'Unsupported message type',
  201: 'Unsupported event code',
  202: 'Unsupported processing id',
  203: 'Unsupported version id',
  204: 'Unknown key identifier',
  205: 'Duplicate key identifier',
  206: 'Application record locked',
  207: 'Application internal error',
}
// HL7 table 0008, acknowledgment codes of the original mode
export const ACK_CODES = { AA: 'Application Accept', AE: 'Application Error', AR: 'Application Reject' }
// HL7 table 0004, patient class
export const PATIENT_CLASS = { E: 'Emergency', I: 'Inpatient', O: 'Outpatient', P: 'Preadmit', R: 'Recurring patient', B: 'Obstetrics', C: 'Commercial Account', N: 'Not Applicable', U: 'Unknown' }
export const EVENTS = { A01: 'Admit/visit notification', A02: 'Transfer a patient', A03: 'Discharge/end visit', A04: 'Register a patient', A05: 'Pre-admit a patient', A08: 'Update patient information', A11: 'Cancel admit/visit notification', A13: 'Cancel discharge/end visit', A31: 'Update person information', A40: 'Merge patient, patient identifier list', R01: 'Unsolicited transmission of an observation message' }
// the message structure of MSH-9.3 for each trigger event in v2.5.1
export const STRUCTURES = { A01: 'ADT_A01', A02: 'ADT_A02', A03: 'ADT_A03', A04: 'ADT_A01', A05: 'ADT_A05', A08: 'ADT_A01', A11: 'ADT_A09', A13: 'ADT_A01', A31: 'ADT_A05', A40: 'ADT_A39', R01: 'ORU_R01' }
export const ADT_EVENTS = ['A01', 'A02', 'A03', 'A04', 'A05', 'A08', 'A11', 'A13', 'A31', 'A40']
// what the LIS and the lab apps take
export const SUPPORTED = { ADT: ['A01', 'A03', 'A04', 'A08', 'A40'], ORU: ['R01'] }

// the field names of HL7 v2.5.1 for the segments of the lab
export const FIELD_NAMES = {
  MSH: { 1: 'Field Separator', 2: 'Encoding Characters', 3: 'Sending Application', 4: 'Sending Facility', 5: 'Receiving Application', 6: 'Receiving Facility', 7: 'Date/Time Of Message', 8: 'Security', 9: 'Message Type', 10: 'Message Control ID', 11: 'Processing ID', 12: 'Version ID', 13: 'Sequence Number', 15: 'Accept Acknowledgment Type', 16: 'Application Acknowledgment Type', 17: 'Country Code', 18: 'Character Set' },
  EVN: { 1: 'Event Type Code', 2: 'Recorded Date/Time', 3: 'Date/Time Planned Event', 4: 'Event Reason Code', 5: 'Operator ID', 6: 'Event Occurred' },
  PID: { 1: 'Set ID', 2: 'Patient ID', 3: 'Patient Identifier List', 4: 'Alternate Patient ID', 5: 'Patient Name', 6: "Mother's Maiden Name", 7: 'Date/Time of Birth', 8: 'Administrative Sex', 10: 'Race', 11: 'Patient Address', 13: 'Phone Number, Home', 18: 'Patient Account Number' },
  PV1: { 1: 'Set ID', 2: 'Patient Class', 3: 'Assigned Patient Location', 4: 'Admission Type', 7: 'Attending Doctor', 10: 'Hospital Service', 18: 'Patient Type', 19: 'Visit Number', 44: 'Admit Date/Time', 45: 'Discharge Date/Time' },
  MRG: { 1: 'Prior Patient Identifier List', 3: 'Prior Patient Account Number', 5: 'Prior Visit Number', 7: 'Prior Patient Name' },
  OBR: { 1: 'Set ID', 2: 'Placer Order Number', 3: 'Filler Order Number', 4: 'Universal Service Identifier', 7: 'Observation Date/Time', 16: 'Ordering Provider', 22: 'Results Report/Status Change Date/Time', 25: 'Result Status' },
  OBX: { 1: 'Set ID', 2: 'Value Type', 3: 'Observation Identifier', 4: 'Observation Sub-ID', 5: 'Observation Value', 6: 'Units', 7: 'References Range', 8: 'Abnormal Flags', 11: 'Observation Result Status', 14: 'Date/Time of the Observation' },
  MSA: { 1: 'Acknowledgment Code', 2: 'Message Control ID', 3: 'Text Message' },
  ERR: { 1: 'Error Code and Location', 2: 'Error Location', 3: 'HL7 Error Code', 4: 'Severity', 5: 'Application Error Code', 7: 'Diagnostic Information', 8: 'User Message' },
}
export const COMPONENT_NAMES = {
  'MSH-9': ['Message Code', 'Trigger Event', 'Message Structure'],
  'MSH-11': ['Processing ID', 'Processing Mode'],
  'PID-3': ['ID Number', 'Check Digit', 'Check Digit Scheme', 'Assigning Authority', 'Identifier Type Code'],
  'MRG-1': ['ID Number', 'Check Digit', 'Check Digit Scheme', 'Assigning Authority', 'Identifier Type Code'],
  'PID-5': ['Family Name', 'Given Name', 'Second Name'],
  'PV1-3': ['Point of Care', 'Room', 'Bed', 'Facility'],
  'PV1-7': ['ID Number', 'Family Name', 'Given Name'],
  'OBR-4': ['Identifier', 'Text', 'Name of Coding System'],
  'OBX-3': ['Identifier', 'Text', 'Name of Coding System'],
  'ERR-2': ['Segment ID', 'Segment Sequence', 'Field Position'],
  'ERR-3': ['Identifier', 'Text', 'Name of Coding System'],
}

// ---------- time and small helpers ----------

const pad = (n, w = 2) => String(n).padStart(w, '0')
// an HL7 DTM value, YYYYMMDDHHMMSS, from the lab clock (lab-made: no time zone offset)
export const dtm = (t) => {
  const d = new Date(BASE + (t ?? 0))
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}
const word = (v) => String(v ?? '').trim()
const push = (list, entry, max) => {
  list.push(entry)
  if (list.length > max) list.splice(0, list.length - max)
}
const hash = (text) => {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}
const fail = (error, ms = 30, type = 'MLLP:CONNECTIVITY') => ({ ok: false, type, error, ms }) // lab-made error type

// ---------- MLLP framing ----------

// MLLP wraps each message in a start block 0x0B and an end block 0x1C 0x0D
export const frame = (text) => `${VT}${text}${FS}${CR}`
export const unframe = (bytes) => String(bytes ?? '').replace(/^\x0b/, '').replace(/\x1c\r?$/, '')

// ---------- delimiters and escape sequences ----------

export const STD = { field: '|', comp: '^', rep: '~', esc: '\\', sub: '&' }
// the escape sequences of HL7 v2: \F\ \S\ \T\ \R\ \E\ for the delimiters, and \.br\ for a line break
export function unescapeHl7(value, d = STD) {
  const v = String(value ?? '')
  if (!v.includes(d.esc)) return v
  const map = { F: d.field, S: d.comp, T: d.sub, R: d.rep, E: d.esc, '.br': '\n' }
  let out = ''
  for (let i = 0; i < v.length; i++) {
    if (v[i] === d.esc) {
      const j = v.indexOf(d.esc, i + 1)
      if (j > i && map[v.slice(i + 1, j)] !== undefined) {
        out += map[v.slice(i + 1, j)]
        i = j
        continue
      }
    }
    out += v[i]
  }
  return out
}
export const escapeHl7 = (value) => String(value ?? '').replace(/[\\|^&~]/g, (c) => ({ '\\': '\\E\\', '|': '\\F\\', '^': '\\S\\', '&': '\\T\\', '~': '\\R\\' })[c])
// one component list as text, each part escaped: comp('880021', '', '', 'BVH', 'MR') is 880021^^^BVH^MR
export const comp = (...parts) => parts.map(escapeHl7).join('^').replace(/\^+$/, '')

// ---------- read (parse) and write (build) ----------

// Read: text to segments. fields[n] is field n of the segment, so for MSH fields[1] is the field separator and
// fields[2] the encoding characters, the way HL7 numbers MSH.
export function parse(text) {
  const lines = unframe(text).split(/\r\n|\r|\n/).filter((l) => l.trim() !== '')
  if (!lines.length || !lines[0].startsWith('MSH')) return { ok: false, error: 'The message does not start with an MSH segment', segments: [], d: STD, msh: {} }
  const head = lines[0]
  const d = { field: head[3], comp: head[4] ?? '^', rep: head[5] ?? '~', esc: head[6] ?? '\\', sub: head[7] ?? '&' }
  const segments = lines.map((l) => {
    const parts = l.split(d.field)
    const name = parts[0]
    return { name, fields: name === 'MSH' ? [name, d.field, ...parts.slice(1)] : parts }
  })
  const msh = segments[0].fields
  const type = String(msh[9] ?? '').split(d.comp)
  return {
    ok: true,
    d,
    segments,
    msh: {
      sendingApp: first(msh[3], d),
      sendingFacility: first(msh[4], d),
      receivingApp: first(msh[5], d),
      receivingFacility: first(msh[6], d),
      time: msh[7] ?? '',
      code: type[0] ?? '',
      event: type[1] ?? '',
      structure: type[2] ?? '',
      type: type.slice(0, 2).filter(Boolean).join('^'),
      controlId: msh[10] ?? '',
      processingId: first(msh[11], d),
      version: first(msh[12], d),
    },
  }
}
const first = (v, d) => unescapeHl7(String(v ?? '').split(d.rep)[0].split(d.comp)[0], d)

// Write: segments to text, joined by the segment terminator CR. Takes a parsed message, { segments }, or segment lines.
export function build(obj) {
  if (typeof obj === 'string') return obj
  if (Array.isArray(obj)) return obj.map((x) => (typeof x === 'string' ? x : segText(x))).join(CR)
  return (obj?.segments ?? []).map(segText).join(CR)
}
const segText = (seg) => {
  const f = seg.fields ?? [seg.name]
  const sep = seg.name === 'MSH' ? f[1] || '|' : '|'
  return (seg.name === 'MSH' ? [f[0], ...f.slice(2)] : f).join(sep).replace(/\|+$/, '')
}

// the raw text of field n of the k-th segment of a name, or ''
export const fieldOf = (p, seg, n, k = 0) => p?.segments?.filter((x) => x.name === seg)[k]?.fields[n] ?? ''
export const segmentsNamed = (p, seg) => (p?.segments ?? []).filter((x) => x.name === seg)
// a field as repetitions of components, every value unescaped
export const repsOf = (raw, d = STD) => (raw === '' ? [] : String(raw).split(d.rep).map((r) => r.split(d.comp).map((c) => unescapeHl7(c.split(d.sub)[0], d))))
// a path such as PID-5.1: the first repetition, component 1, unescaped
export function valueOf(p, path) {
  const m = /^([A-Z0-9]{3})-(\d+)(?:\.(\d+))?$/.exec(path)
  if (!m) return ''
  const raw = fieldOf(p, m[1], Number(m[2]))
  if (m[1] === 'MSH' && Number(m[2]) <= 2) return raw
  const r = repsOf(raw, p.d)[0] ?? []
  return m[3] ? (r[Number(m[3]) - 1] ?? '') : unescapeHl7(String(raw).split(p.d.rep)[0], p.d)
}
// the identifiers of a CX list (PID-3, MRG-1): [{ id, authority, type }]
export const idsOf = (p, seg = 'PID', n = 3) => repsOf(fieldOf(p, seg, n), p.d).map((c) => ({ id: c[0] ?? '', authority: c[3] ?? '', type: c[4] ?? '' }))
// the medical record number: the identifier of type MR, else the first one
export const mrnOf = (p) => {
  const ids = idsOf(p)
  return (ids.find((x) => x.type === 'MR') ?? ids[0])?.id ?? ''
}
// every identifier and the control ID of a message, for the search of the log
export const keysOf = (raw) => {
  const p = parse(raw)
  return [p.msh.controlId, ...idsOf(p).map((x) => x.id), ...idsOf(p, 'MRG', 1).map((x) => x.id), valueOf(p, 'PV1-19')].filter(Boolean)
}

// a copy of the text with fields changed: setFields(text, { 'MSH-3': 'MULESOFT' }). Values are raw HL7 text.
export function setFields(text, changes) {
  const p = parse(text)
  if (!p.ok) return text
  for (const [path, value] of Object.entries(changes)) {
    const m = /^([A-Z0-9]{3})-(\d+)$/.exec(path)
    const seg = m && p.segments.find((x) => x.name === m[1])
    if (!seg) continue
    const n = Number(m[2])
    while (seg.fields.length <= n) seg.fields.push('')
    seg.fields[n] = value
  }
  return build(p)
}
// keeps only the identifier of a type and an assigning authority in PID-3 and MRG-1. An empty type keeps the list.
export function pickIds(text, { type, authority }) {
  if (!word(type) && !word(authority)) return text
  const p = parse(text)
  if (!p.ok) return text
  for (const [seg, n] of [['PID', 3], ['MRG', 1]]) {
    const s = p.segments.find((x) => x.name === seg)
    if (!s?.fields[n]) continue
    const reps = s.fields[n].split(p.d.rep)
    const hit = reps.find((r) => {
      const c = r.split(p.d.comp)
      return (!word(type) || c[4] === word(type)) && (!word(authority) || c[3] === word(authority))
    })
    if (hit) s.fields[n] = hit
  }
  return build(p)
}

// The parsed tree a screen shows: segments, fields with their names, repetitions, components and subcomponents
export function treeOf(text) {
  const p = parse(text)
  if (!p.ok) return { ok: false, error: p.error, segments: [] }
  const counts = {}
  return {
    ok: true,
    d: p.d,
    segments: p.segments.map((seg) => {
      counts[seg.name] = (counts[seg.name] ?? 0) + 1
      return {
        name: seg.name,
        k: counts[seg.name],
        fields: seg.fields
          .map((raw, n) => ({ n, raw }))
          .slice(1)
          .filter((f) => f.raw !== '')
          .map(({ n, raw }) => ({
            n,
            raw,
            name: FIELD_NAMES[seg.name]?.[n] ?? '',
            comps: COMPONENT_NAMES[`${seg.name}-${n}`] ?? [],
            escaped: raw.includes(p.d.esc) && !(seg.name === 'MSH' && n <= 2),
            reps: seg.name === 'MSH' && n <= 2 ? [[raw]] : raw.split(p.d.rep).map((r) => r.split(p.d.comp).map((c) => unescapeHl7(c, p.d).split(p.d.sub).join(' & '))),
          })),
      }
    }),
  }
}

// ---------- validate ----------

// The Validate operation against HL7 v2.5.1 rules of the lab. Each error: { code (table 0357), loc (ERR-2), text,
// reject }: reject is true for errors in MSH, which original mode answers with AR. The rest is content, answered AE.
export function validate(p) {
  if (!p?.ok) return [{ code: 100, loc: 'MSH', text: p?.error ?? 'The message cannot be read', reject: true }]
  const out = []
  const m = p.msh
  const add = (code, loc, text, reject = false) => out.push({ code, loc, text, reject })
  if (m.version !== VERSION) add(203, 'MSH^1^12', `Version ${m.version || '(empty)'} is not supported. This interface takes ${VERSION}`, true)
  if (!SUPPORTED[m.code]) add(200, 'MSH^1^9', `Message type ${m.code || '(empty)'} is not supported`, true)
  else if (!SUPPORTED[m.code].includes(m.event)) add(201, 'MSH^1^9', `Trigger event ${m.event || '(empty)'} of ${m.code} is not supported`, true)
  if (!m.controlId) add(101, 'MSH^1^10', 'Required field MSH-10 Message Control ID is missing', true)
  if (m.processingId && !['P', 'T', 'D'].includes(m.processingId)) add(202, 'MSH^1^11', `Processing ID ${m.processingId} is not supported`, true)
  if (out.length) return out
  const has = (seg) => p.segments.some((x) => x.name === seg)
  if (!has('PID')) add(100, 'PID', 'Required segment PID is missing')
  else {
    if (!idsOf(p).some((x) => x.id)) add(101, 'PID^1^3', 'Required field PID-3 Patient Identifier List is missing')
    const dob = valueOf(p, 'PID-7')
    if (dob && !/^\d{4}(\d{2}(\d{2}(\d{2,6})?)?)?$/.test(dob)) add(102, 'PID^1^7', `PID-7 Date/Time of Birth ${dob} is not a DTM value`)
  }
  if (m.code === 'ADT' && m.event !== 'A40') {
    if (!has('PV1')) add(100, 'PV1', 'Required segment PV1 is missing')
    else if (!PATIENT_CLASS[valueOf(p, 'PV1-2')]) add(103, 'PV1^1^2', `PV1-2 Patient Class ${valueOf(p, 'PV1-2') || '(empty)'} is not in table 0004`)
  }
  if (m.event === 'A40') {
    if (!has('MRG')) add(100, 'MRG', 'Required segment MRG is missing')
    else if (!idsOf(p, 'MRG', 1).some((x) => x.id)) add(101, 'MRG^1^1', 'Required field MRG-1 Prior Patient Identifier List is missing')
  }
  if (m.code === 'ORU') {
    if (!has('OBR')) add(100, 'OBR', 'Required segment OBR is missing')
    segmentsNamed(p, 'OBX').forEach((x, i) => {
      if (x.fields[2] === 'NM' && x.fields[5] !== undefined && x.fields[5] !== '' && !/^[<>]?-?\d+(\.\d+)?$/.test(x.fields[5])) add(102, `OBX^${i + 1}^5`, `OBX-5 value ${unescapeHl7(x.fields[5], p.d)} is not a number, and OBX-2 says NM`)
    })
  }
  return out
}

// ---------- ACK ----------

// An original mode ACK: MSH with sender and receiver swapped, MSA-1 the code and MSA-2 the control ID it answers, and
// for AE and AR an ERR segment with ERR-2 the location, ERR-3 the code of table 0357, ERR-4 the severity E and
// ERR-8 the text for a person.
export function ackOf(p, code, text = '', { errCode, loc, app, facility, ctl, t = 0 } = {}) {
  const m = p?.msh ?? {}
  const c = ['AA', 'AE', 'AR'].includes(code) ? code : 'AE'
  const lines = [
    `MSH|^~\\&|${app ?? (m.receivingApp || 'MULESOFT')}|${facility ?? (m.receivingFacility || FACILITY)}|${m.sendingApp ?? ''}|${m.sendingFacility ?? ''}|${dtm(t)}||ACK^${m.event ?? ''}^ACK|${ctl ?? `ACK${m.controlId ?? ''}`}|P|${VERSION}`,
    `MSA|${c}|${m.controlId ?? ''}`,
  ]
  if (c !== 'AA') {
    const n = Number(errCode ?? 207)
    lines.push(`ERR||${loc ?? ''}|${n}^${ERR_CODES[n] ?? 'Application error'}^HL70357|E||||${escapeHl7(text)}`)
  }
  return { code: c, text, errCode: c === 'AA' ? 0 : Number(errCode ?? 207), errLoc: loc ?? '', raw: lines.join(CR) }
}
// reads an ACK back: { code, controlId, errCode, errLoc, text }
export function readAck(raw) {
  const p = parse(raw)
  const err = repsOf(fieldOf(p, 'ERR', 3), p.d)[0] ?? []
  return { code: fieldOf(p, 'MSA', 1), controlId: fieldOf(p, 'MSA', 2), errCode: Number(err[0] ?? 0), errLoc: fieldOf(p, 'ERR', 2), text: unescapeHl7(fieldOf(p, 'ERR', 8), p.d) || err[1] || '' }
}

// ---------- message builders (for labs and test messages) ----------

const cx = (x) => comp(x.id, '', '', x.authority ?? FACILITY, x.type ?? 'MR')
// An ADT message from Epic. ids: [{ id, authority, type }] for PID-3; prior: the same for MRG-1 of an A40.
export function adtMessage({ event, ctl, t = 0, ids = [], name = [], dob = '', sex = '', address = '', phone = '', cls = 'I', loc = [], attending = [], service = 'MED', visit = '', admit = '', discharge = '', prior, sendingApp = 'EPIC', receivingApp = 'MULESOFT', version = VERSION }) {
  const lines = [`MSH|^~\\&|${sendingApp}|${FACILITY}|${receivingApp}|${FACILITY}|${dtm(t)}||ADT^${event}^${STRUCTURES[event] ?? 'ADT_A01'}|${ctl}|P|${version}`, `EVN|${event}|${dtm(t)}`]
  const pid = ['PID', '1', '', ids.map(cx).join('~'), '', comp(...name), '', dob, sex, '', '', address, '', phone]
  lines.push(pid.join('|').replace(/\|+$/, ''))
  if (event === 'A40') lines.push(`MRG|${(prior ?? []).map(cx).join('~')}`)
  else {
    const pv1 = Array(46).fill('')
    Object.assign(pv1, { 0: 'PV1', 1: '1', 2: cls, 3: comp(...loc), 7: comp(...attending), 10: service, 19: visit, 44: admit, 45: discharge })
    lines.push(pv1.join('|').replace(/\|+$/, ''))
  }
  return lines.join(CR)
}
// An ORU^R01 result from Epic Beaker: tests: [{ code, text, value, units, range, flag }] as LOINC coded OBX
export function oruMessage({ ctl, t = 0, ids = [], name = [], dob = '', sex = '', visit = '', placer = '', filler = '', panel = ['24321-2', 'Basic metabolic panel', 'LN'], tests = [], version = VERSION }) {
  const lines = [
    `MSH|^~\\&|EPIC|${FACILITY}|MULESOFT|${FACILITY}|${dtm(t)}||ORU^R01^ORU_R01|${ctl}|P|${version}`,
    ['PID', '1', '', ids.map(cx).join('~'), '', comp(...name), '', dob, sex].join('|'),
    ['PV1', '1', 'O', ...Array(16).fill(''), visit].join('|'),
    `OBR|1|${placer}|${filler}|${comp(...panel)}|||${dtm(t)}${'|'.repeat(18)}F`,
    ...tests.map((x, i) => `OBX|${i + 1}|${x.type ?? 'NM'}|${comp(x.code, x.text, 'LN')}||${x.raw ?? escapeHl7(x.value)}|${escapeHl7(x.units ?? '')}|${x.range ?? ''}|${x.flag ?? 'N'}|||F|||${dtm(t)}`),
  ]
  return lines.join(CR)
}

// ---------- the system ----------

export function newInterface(extra = {}) {
  return {
    id: 'BVH_ADT_OUT',
    name: 'ADT to MuleSoft',
    type: 'ADT',
    events: ['A01', 'A03', 'A04', 'A08'],
    host: MULE_HOST,
    port: 6670,
    tls: false,
    ackTimeout: 30,
    onAe: 'Continue',
    status: 'Running',
    connected: false,
    since: null,
    ever: false,
    reconnects: 0,
    lastError: null,
    held: false,
    queue: [],
    feed: [],
    n: { sent: 0, AA: 0, AE: 0, AR: 0, timeout: 0, filtered: 0 },
    ...extra,
  }
}
// The Bayview LIS with its patient index. Names and numbers are made up.
export const PATIENTS = {
  880021: { name: ['QUAYSIDE', 'ROWAN'], dob: '19840312', sex: 'F', epi: 'E4410021' },
  880044: { name: ['QUAYSIDE', 'ROWAN'], dob: '19840312', sex: 'F', epi: 'E4410044' },
  880107: { name: ['TIDEWELL', 'ELLIS'], dob: '19570921', sex: 'M', epi: 'E4410107' },
  880153: { name: ['MARLOW', 'JUNO'], dob: '20010604', sex: 'F', epi: 'E4410153' },
  880198: { name: ['BRANTLEY', 'OREN'], dob: '19690117', sex: 'M', epi: 'E4410198' },
  880236: { name: ['FENWICK', 'ISLA'], dob: '19920830', sex: 'F', epi: 'E4410236' },
  880271: { name: ['ASHGROVE', 'DEX'], dob: '19781105', sex: 'M', epi: 'E4410271' },
}
export const patient = (mrn) => ({ mrn: String(mrn), ...PATIENTS[mrn] })
export function newLis(extra = {}) {
  return {
    name: 'Bayview LIS',
    host: LIS_HOST,
    port: LIS_PORT,
    patients: {},
    encounters: [],
    results: [],
    slow: [],
    n: { AA: 0, AE: 0, AR: 0 },
    ...extra,
  }
}
export function newHl7(now = 0, extra = {}) {
  return { created: now, facility: FACILITY, interfaces: [], listeners: {}, lis: newLis(), log: [], errors: [], seq: 1, ctl: 10045000, ...extra }
}
const SYSTEM_KEYS = Object.keys(newHl7())

// The system the open console shows: the ADT interface of Epic waits for a Mule listener, and the log holds a night
function defaultHl7System(now = 0) {
  const h = newHl7(now)
  h.interfaces = [newInterface({ lastError: 'Connection refused' }), newInterface({ id: 'BVH_ORU_OUT', name: 'Results to MuleSoft', type: 'ORU', events: ['R01'], port: 6671, status: 'Stopped' })]
  for (const mrn of ['880021', '880107', '880153']) h.lis.patients[mrn] = { name: PATIENTS[mrn].name.join('^'), dob: PATIENTS[mrn].dob, sex: PATIENTS[mrn].sex, mergedInto: null }
  const t0 = now - 6 * 60 * MINUTE
  const add = (raw, code, leg, mins, text, err) => {
    const p = parse(raw)
    const a = ackOf(p, code, text, { ...err, t: t0 + mins * MINUTE, app: leg === 'LIS' ? 'LIS' : 'MULESOFT' })
    h.log.push({ id: h.seq++, t: t0 + mins * MINUTE, leg, app: 'bayview-adt-nightly', ctl: p.msh.controlId, type: p.msh.type, mrn: mrnOf(p), raw, ack: code, ackRaw: a.raw, status: code, tries: 1 })
  }
  const pt = (mrn) => ({ ids: [{ id: mrn }], name: PATIENTS[mrn].name, dob: PATIENTS[mrn].dob, sex: PATIENTS[mrn].sex })
  add(adtMessage({ event: 'A04', ctl: '10044871', t: t0, ...pt('880153'), cls: 'O', loc: ['OPCLIN', '', '', FACILITY], visit: 'V30012', admit: dtm(t0) }), 'AA', 'BVH_ADT_OUT', 0)
  add(adtMessage({ event: 'A08', ctl: '10044872', t: t0 + 20 * MINUTE, ...pt('880107'), address: comp('12 Pier Row', '', 'Bayview', 'CA', '94000'), cls: 'I', loc: ['4W', '412', 'A', FACILITY], visit: 'V30007', admit: dtm(t0 - 600 * MINUTE) }), 'AA', 'BVH_ADT_OUT', 20)
  add(oruMessage({ ctl: '10044873', t: t0 + 45 * MINUTE, ...pt('880021'), visit: 'V30003', placer: 'ORD5521', filler: 'LAB7731', tests: [{ code: '2345-7', text: 'Glucose', value: '98', units: 'mg/dL', range: '70-99' }] }), 'AA', 'BVH_ORU_OUT', 45)
  add(adtMessage({ event: 'A08', ctl: '10044874', t: t0 + 70 * MINUTE, ids: [{ id: '880999' }], name: ['NOVAK', 'TEST'], cls: 'O', visit: 'V30020' }), 'AE', 'BVH_ADT_OUT', 70, 'Patient 880999 is not on file', { errCode: 204, loc: 'PID^1^3' })
  h.interfaces[0].n = { sent: 3, AA: 2, AE: 1, AR: 0, timeout: 0, filtered: 0 }
  h.interfaces[1].n = { sent: 1, AA: 1, AE: 0, AR: 0, timeout: 0, filtered: 0 }
  h.lis.encounters = [{ visit: 'V30012', mrn: '880153', cls: 'O', loc: 'OPCLIN', status: 'Registered', admit: dtm(t0), discharge: '', t: t0 }]
  return h
}

// fills a missing or placeholder state.hl7, and any key an older save lacks
export function fillHl7(h) {
  if (!h) return defaultHl7System(0)
  if (!h.lis) {
    const base = defaultHl7System(h.created ?? 0)
    for (const k of Object.keys(base)) h[k] ??= base[k]
    return h
  }
  if (SYSTEM_KEYS.some((k) => h[k] === undefined || h[k] === null)) {
    const base = newHl7(h.created ?? 0)
    for (const k of SYSTEM_KEYS) h[k] ??= base[k]
  }
  return h
}
export const isFilled = (h) => Boolean(h?.lis)
export const ifaceOf = (h, id) => (h?.interfaces ?? []).find((x) => x.id === id)
export const entryOf = (h, id) => (h?.log ?? []).find((x) => x.id === Number(id))

// ---------- the log ----------

function logEntry(h, e) {
  const entry = { id: h.seq++, ack: null, ackRaw: '', status: 'Sent', tries: 1, ...e }
  push(h.log, entry, MAX_LOG)
  return entry
}
// the ACK totals of the screen: every ACK an app sent to Epic and every ACK the LIS sent to an app
export function ackCounts(h) {
  const n = { AA: 0, AE: 0, AR: 0, timeout: 0, queued: 0 }
  for (const i of h?.interfaces ?? []) {
    for (const k of ['AA', 'AE', 'AR', 'timeout']) n[k] += i.n?.[k] ?? 0
    n.queued += i.queue?.length ?? 0
  }
  for (const k of ['AA', 'AE', 'AR']) n[k] += h?.lis?.n?.[k] ?? 0
  return n
}
// search by MRN, visit number or control ID; leg and ack narrow it
export function searchLog(h, { text = '', leg = '', ack = '' } = {}) {
  const q = word(text).toUpperCase()
  return [...(h?.log ?? [])]
    .reverse()
    .filter((e) => (!leg || e.leg === leg) && (!ack || (ack === 'none' ? !e.ack : ack === 'timeout' ? e.status === 'timeout' : e.ack === ack)) && (!q || keysOf(e.raw).some((k) => k.toUpperCase() === q) || e.ctl.toUpperCase().includes(q)))
}

// ---------- the Bayview LIS ----------

// lab-made: the LIS takes 0.3 s for a message, and longer in a slow window that a lab sets
const lisMs = (lis, ctl, tries, now) => {
  const w = (lis.slow ?? []).find((x) => now >= x.from && now < x.to)
  return w ? w.min + (hash(`${ctl}:${tries}`) % (w.max - w.min + 1)) : 300
}
const encOf = (lis, visit) => lis.encounters.findLast((e) => e.visit === visit)
const nameText = (p) => repsOf(fieldOf(p, 'PID', 5), p.d)[0]?.slice(0, 2).join('^') ?? ''

// What the LIS does with one message. Lab-made: the LIS reads only the first repetition of PID-3 and MRG-1, and takes
// an identifier only when its assigning authority is BVH. It opens an encounter row for each A01 or A04 it gets.
function lisReceive(lis, p, now) {
  const errs = validate(p)
  if (errs.length) return { code: errs[0].reject ? 'AR' : 'AE', errCode: errs[0].code, loc: errs[0].loc, text: errs[0].text }
  const m = p.msh
  const id = idsOf(p)[0]
  const no = (text, loc = 'PID^1^3') => ({ code: 'AE', errCode: 204, loc, text })
  if (id.authority !== FACILITY) return no(`Patient identifier ${id.id} of assigning authority ${id.authority || '(none)'} is not a Bayview MRN`)
  const mrn = id.id
  const pat = lis.patients[mrn]
  const visit = valueOf(p, 'PV1-19')
  const enc = {
    visit,
    mrn,
    cls: valueOf(p, 'PV1-2'),
    loc: repsOf(fieldOf(p, 'PV1', 3), p.d)[0]?.slice(0, 3).filter(Boolean).join(' ') ?? '',
    admit: valueOf(p, 'PV1-44'),
    discharge: valueOf(p, 'PV1-45'),
  }
  const upsert = () => (lis.patients[mrn] = { name: nameText(p), dob: valueOf(p, 'PID-7'), sex: valueOf(p, 'PID-8'), mergedInto: pat?.mergedInto ?? null })
  if (m.code === 'ORU') {
    if (!pat) return no(`Patient ${mrn} is not on file`)
    const obr = repsOf(fieldOf(p, 'OBR', 4), p.d)[0] ?? []
    for (const x of segmentsNamed(p, 'OBX')) {
      const code = repsOf(x.fields[3] ?? '', p.d)[0] ?? []
      push(lis.results, { mrn, visit, panel: obr[1] ?? '', code: code[0] ?? '', text: code[1] ?? '', value: unescapeHl7(x.fields[5] ?? '', p.d), units: unescapeHl7(x.fields[6] ?? '', p.d), flag: x.fields[8] ?? '', t: now }, MAX_RESULTS)
    }
    return { code: 'AA' }
  }
  switch (m.event) {
    case 'A01':
    case 'A04':
      upsert()
      push(lis.encounters, { ...enc, status: m.event === 'A01' ? 'Admitted' : 'Registered', t: now }, MAX_ENCOUNTERS)
      return { code: 'AA' }
    case 'A08': {
      if (!pat) return no(`Patient ${mrn} is not on file`)
      upsert()
      const e = encOf(lis, visit)
      // an A08 carries the whole visit as Epic has it at the time of the event, so it overwrites the visit
      if (e) Object.assign(e, { cls: enc.cls, loc: enc.loc || e.loc, admit: enc.admit || e.admit, discharge: enc.discharge, status: enc.discharge ? 'Discharged' : enc.cls === 'I' ? 'Admitted' : 'Registered', t: now })
      return { code: 'AA' }
    }
    case 'A03': {
      const e = encOf(lis, visit)
      if (!pat || !e) return no(`Visit ${visit || '(empty)'} of patient ${mrn} is not on file`, pat ? 'PV1^1^19' : 'PID^1^3')
      Object.assign(e, { status: 'Discharged', discharge: enc.discharge || dtm(now), t: now })
      return { code: 'AA' }
    }
    case 'A40': {
      const prior = idsOf(p, 'MRG', 1)[0]
      if (!pat) return no(`Surviving patient ${mrn} is not on file`)
      if (prior.authority !== FACILITY || !lis.patients[prior.id]) return no(`Prior patient identifier ${prior.id} of assigning authority ${prior.authority || '(none)'} is not on file`, 'MRG^1^1')
      lis.patients[prior.id].mergedInto = mrn
      for (const e of lis.encounters) if (e.mrn === prior.id) e.mrn = mrn
      for (const r of lis.results) if (r.mrn === prior.id) r.mrn = mrn
      return { code: 'AA' }
    }
    default:
      return { code: 'AR', errCode: 201, loc: 'MSH^1^9', text: `Trigger event ${m.event} is not supported` }
  }
}

// ---------- connections ----------

const appRunning = (s, name) => (s.apps ?? []).some((a) => a.name === name && a.status === 'Running')
const listenerLive = (s, l, now) => l && appRunning(s, l.app) && now - l.t <= LIVE
// can this interface of Epic reach a listener? { ok, l } or { ok: false, error }
function reach(s, h, i, now) {
  if (i.status !== 'Running') return { ok: false, error: null }
  if (word(i.host).toLowerCase() !== MULE_HOST) return { ok: false, error: `java.net.UnknownHostException: ${i.host || '(empty)'}` }
  const l = h.listeners[String(i.port)]
  if (!listenerLive(s, l, now)) return { ok: false, error: 'java.net.ConnectException: Connection refused' }
  if (i.tls && !l.tls) return { ok: false, error: 'javax.net.ssl.SSLHandshakeException: Remote host terminated the handshake' }
  if (!i.tls && l.tls) return { ok: false, error: 'java.net.SocketException: Connection reset' }
  return { ok: true, l }
}
function connect(h, i, now, r) {
  if (r.ok) {
    if (!i.connected) {
      if (i.ever) i.reconnects++
      Object.assign(i, { connected: true, since: now, ever: true, lastError: null })
    }
  } else if (i.connected || i.lastError !== r.error) Object.assign(i, { connected: false, lastError: r.error })
}
// Epic puts a new message in the queue of its interface; the event filter of the interface drops the rest
function enqueue(i, raw, extra = {}) {
  const p = parse(raw)
  if (!i.events.includes(p.msh.event)) {
    i.n.filtered++
    return false
  }
  push(i.queue, { raw, ctl: p.msh.controlId, tries: 0, due: 0, ...extra }, MAX_QUEUE)
  return true
}

// ---------- the ctx hook ----------

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function hl7Ctx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.hl7 = fillHl7(s.hl7))
  const now = () => s.clock ?? 0
  const acks = new Map()
  let spent = 0
  const ack = (msg, code, text = '', err = {}) => {
    const h = sys()
    const a = ackOf(msg?.parsed ?? parse(msg?.raw ?? ''), code, text, { errCode: err.code ?? err.errCode, loc: err.loc ?? err.errLoc, app: 'MULESOFT', ctl: `MS${h.ctl++}`, t: now() })
    if (msg?.id) acks.set(msg.id, a)
    return a
  }
  return {
    parse,
    read: parse,
    build,
    write: build,
    validate,
    ack,
    listen(cfg = {}, handler = () => null) {
      const h = sys()
      const t = now()
      const port = word(cfg.port)
      if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) return fail(`Invalid MLLP listener port ${port || '(empty)'}`)
      const prev = h.listeners[port]
      if (prev && prev.app !== who && listenerLive(s, prev, t)) return fail(`java.net.BindException: Address already in use: ${port}`) // lab-made: one listener per port
      const fresh = !prev || prev.app !== who || !listenerLive(s, prev, t)
      h.listeners[port] = { app: who, host: word(cfg.host) || '0.0.0.0', port: Number(port), tls: Boolean(cfg.tls), t, since: fresh ? t : prev.since }
      const results = []
      let budget = POLL_BUDGET
      let count = 0
      for (const i of h.interfaces.filter((x) => String(x.port) === port)) {
        const r = reach(s, h, i, t)
        connect(h, i, t, r)
        if (!r.ok) continue
        while (i.queue.length && !i.held && budget > 0 && count < PER_POLL) {
          const q = i.queue[0]
          if (q.due > t) break
          const p = parse(q.raw)
          q.tries++
          i.n.sent++
          count++
          const entry = logEntry(h, { t, leg: i.id, app: who, ctl: p.msh.controlId, type: p.msh.type, mrn: mrnOf(p), raw: q.raw, tries: q.tries, ...(q.resent && { note: 'Resent from the message log' }) })
          const msg = { id: entry.id, controlId: p.msh.controlId, type: p.msh.type, event: p.msh.event, raw: q.raw, parsed: p, iface: i.id, tries: q.tries }
          spent = 0
          let back = null
          try {
            back = handler(msg)
          } catch (e) {
            back = null
            entry.note = `The flow failed: ${e?.message ?? e}`
          }
          const a = back?.raw ? back : acks.get(msg.id)
          const ms = spent + 40
          budget -= ms
          if (!a || ms > i.ackTimeout * 1000) {
            // Epic waits ackTimeout seconds for the ACK, then closes the connection, opens a new one and sends the
            // same message again, with the same MSH-10
            Object.assign(entry, { status: 'timeout', ack: a?.code ?? null, ackRaw: a?.raw ?? '', note: a ? `ACK ${a.code} came after ${Math.round(ms / 1000)} s. Epic closed the connection at ${i.ackTimeout} s and sends the message again.` : `No ACK within ${i.ackTimeout} s. Epic sends the message again.` })
            i.n.timeout++
            i.reconnects++
            i.since = t
            results.push({ id: msg.id, controlId: msg.controlId, late: true, code: a?.code ?? null, ms })
            break
          }
          Object.assign(entry, { status: a.code, ack: a.code, ackRaw: a.raw })
          i.n[a.code]++
          results.push({ id: msg.id, controlId: msg.controlId, code: a.code, ms })
          if (a.code === 'AR') {
            // lab-made Epic setting: an AR is sent again a minute later, three times, then the queue is held
            if (q.tries >= 3) Object.assign(i, { held: true, lastError: `AR three times for ${q.ctl}. The queue is held.` })
            else q.due = t + MINUTE
            break
          }
          i.queue.shift()
          if (a.code === 'AE' && i.onAe === 'Hold') {
            Object.assign(i, { held: true, lastError: `AE for ${q.ctl}. The queue is held.` })
            break
          }
        }
      }
      return { ok: true, ms: POLL_BUDGET - budget, results }
    },
    send(cfg = {}, msg) {
      const h = sys()
      const t = now()
      const host = word(cfg.host).toLowerCase()
      const port = word(cfg.port)
      if (host !== h.lis.host) return fail(`java.net.UnknownHostException: ${host || '(empty)'}`)
      if (port !== String(h.lis.port)) return fail(`java.net.ConnectException: Connection refused: ${host}:${port || '(empty)'}`)
      const text = build(msg)
      const p = parse(text)
      const r = lisReceive(h.lis, p, t)
      const tries = (h.log.filter((e) => e.leg === 'LIS' && e.ctl === p.msh.controlId).length ?? 0) + 1
      const ms = lisMs(h.lis, p.msh.controlId, tries, t)
      spent += ms
      const a = ackOf(p, r.code, r.text ?? '', { errCode: r.errCode, loc: r.loc, app: 'LIS', facility: FACILITY, ctl: `LIS${h.ctl++}`, t })
      h.lis.n[a.code]++
      logEntry(h, { t, leg: 'LIS', app: who, ctl: p.msh.controlId, type: p.msh.type, mrn: mrnOf(p), raw: text, ack: a.code, ackRaw: a.raw, status: a.code, tries })
      return { ok: true, ms, ack: { code: a.code, text: r.text ?? '', errCode: a.errCode, errLoc: a.errLoc, raw: a.raw } }
    },
    park(msg, reason) {
      const h = sys()
      const p = msg?.parsed ?? parse(msg?.raw ?? '')
      push(h.errors, { t: now(), app: who, ctl: p.msh.controlId ?? '', type: p.msh.type ?? '', mrn: mrnOf(p), reason: String(reason ?? ''), raw: msg?.raw ?? build(p) }, MAX_ERRORS)
      return { ok: true }
    },
  }
}

// ---------- the tick ----------

// runs once a lab minute while state.hl7 exists. Changes `s` in place.
export function hl7Tick(s) {
  const h = s?.hl7
  if (!isFilled(h)) return s
  const now = s.clock ?? 0
  for (const [port, l] of Object.entries(h.listeners ?? {})) if (!listenerLive(s, l, now)) delete h.listeners[port]
  for (const i of h.interfaces ?? []) {
    // Epic writes each new message to the queue of the interface, also while the interface is stopped
    while (i.feed?.length && i.feed[0].at <= now) enqueue(i, i.feed.shift().raw)
    connect(h, i, now, reach(s, h, i, now))
  }
  return s
}

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.hl7 = fillHl7(s.hl7)
  const result = fn(s, s.hl7, s.clock ?? 0)
  return { state: s, result }
}
const only = (r) => r.state
export const upgradeHl7 = (state) => (isFilled(state?.hl7) ? state : only(edit(state, () => null)))

const ID_OK = /^[A-Z0-9_]{3,30}$/
// what a form of an interface is missing
export function interfaceProblems(h, form, editing) {
  const out = []
  const id = word(form.id).toUpperCase()
  if (!editing) {
    if (!ID_OK.test(id)) out.push('The interface ID has 3 to 30 letters, digits or _.')
    else if (ifaceOf(h, id)) out.push(`Interface ${id} already exists.`)
  }
  if (!['ADT', 'ORU'].includes(form.type)) out.push('Pick the message type.')
  if (!(form.events ?? []).length) out.push('Pick at least one event.')
  if (!word(form.host)) out.push('Enter the destination host.')
  if (!/^\d+$/.test(word(form.port)) || Number(form.port) < 1 || Number(form.port) > 65535) out.push('The port is a number from 1 to 65535.')
  if (!/^\d+$/.test(word(form.ackTimeout)) || Number(form.ackTimeout) < 5 || Number(form.ackTimeout) > 600) out.push('The ACK timeout is 5 to 600 seconds.')
  return out
}
const formFields = (form) => ({
  name: word(form.name),
  type: form.type,
  events: (form.type === 'ORU' ? ['R01'] : ADT_EVENTS).filter((e) => (form.events ?? []).includes(e)),
  host: word(form.host).toLowerCase(),
  port: Number(form.port),
  tls: Boolean(form.tls),
  ackTimeout: Number(form.ackTimeout),
  onAe: form.onAe === 'Hold' ? 'Hold' : 'Continue',
})
// a new outbound interface of Epic; it starts Stopped
export const createInterface = (state, form) =>
  edit(state, (s, h) => {
    const errs = interfaceProblems(h, form, false)
    if (errs.length) return { ok: false, errors: errs }
    const id = word(form.id).toUpperCase()
    h.interfaces.push(newInterface({ id, ...formFields(form), name: word(form.name) || id, status: 'Stopped' }))
    return { ok: true, id }
  })
export const updateInterface = (state, id, form) =>
  edit(state, (s, h, now) => {
    const i = ifaceOf(h, id)
    if (!i) return { ok: false, errors: [`Interface ${id} does not exist.`] }
    const errs = interfaceProblems(h, form, true)
    if (errs.length) return { ok: false, errors: errs }
    Object.assign(i, formFields(form), { name: word(form.name) || i.name })
    // a changed destination closes the connection; the next minute connects to the new one
    i.connected = false
    connect(h, i, now, reach(s, h, i, now))
    return { ok: true }
  })
export const startInterface = (state, id) =>
  edit(state, (s, h, now) => {
    const i = ifaceOf(h, id)
    if (!i) return false
    Object.assign(i, { status: 'Running', held: false })
    connect(h, i, now, reach(s, h, i, now))
    return true
  })
export const stopInterface = (state, id) =>
  edit(state, (s, h) => {
    const i = ifaceOf(h, id)
    if (!i) return false
    Object.assign(i, { status: 'Stopped', connected: false, lastError: null })
    return true
  })
// a held queue sends again from the message at its head
export const releaseHold = (state, id) =>
  edit(state, (s, h) => {
    const i = ifaceOf(h, id)
    if (!i) return false
    i.held = false
    if (i.queue[0]) Object.assign(i.queue[0], { due: 0, tries: 0 })
    if (/held/.test(i.lastError ?? '')) i.lastError = null
    return true
  })

// Test messages that the Epic interface team sends from Epic. The test patient ZZTEST is made up.
export const TEST_KINDS = { A04: 'A04 register test patient', 'A04 bad': 'A04 without PID-3', A08: 'A08 update test patient', R01: 'ORU^R01 test result' }
export const TEST_MRN = '990001'
export const sendTest = (state, id, kind = 'A04') =>
  edit(state, (s, h, now) => {
    const i = ifaceOf(h, id)
    if (!i) return { ok: false, text: `Interface ${id} does not exist.` }
    const ctl = String(h.ctl++)
    const base = { ctl, t: now, ids: [{ id: TEST_MRN }], name: ['ZZTEST', 'BRIGHTMART'], dob: '19900101', sex: 'U', cls: 'O', loc: ['OPCLIN', '', '', FACILITY], visit: `VT${ctl.slice(-4)}`, admit: dtm(now) }
    const raw =
      kind === 'R01'
        ? oruMessage({ ...base, placer: `ORDT${ctl.slice(-4)}`, filler: `LABT${ctl.slice(-4)}`, tests: [{ code: '2345-7', text: 'Glucose', value: '101', units: 'mg/dL', range: '70-99', flag: 'H' }] })
        : adtMessage({ ...base, event: kind === 'A08' ? 'A08' : 'A04', ...(kind === 'A04 bad' && { ids: [] }) })
    if (!enqueue(i, raw)) return { ok: false, text: `The event filter of ${i.id} does not send this event.` }
    return { ok: true, ctl, text: `Test message ${ctl} is queued on ${i.id}.` }
  })
// Resend from the log: Epic puts the message, with the same MSH-10, at the end of the queue of its interface
export const resend = (state, ids) =>
  edit(state, (s, h) => {
    let n = 0
    for (const x of [].concat(ids)) {
      const e = entryOf(h, x)
      const i = e && ifaceOf(h, e.leg)
      if (!i) continue
      push(i.queue, { raw: e.raw, ctl: e.ctl, tries: 0, due: 0, resent: true }, MAX_QUEUE)
      n++
    }
    return n
  })

// for labs: a filled system and messages that Epic sends at set times
export const feedItem = (at, raw) => ({ at, raw })

// the placeholder the open console seeds: tiny; fillHl7 builds the system on first use
export const defaultHl7 = (now) => ({ created: now })
