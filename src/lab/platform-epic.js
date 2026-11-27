// Epic at Bayview Health over FHIR R4: patients, encounters, observations, appointments, SMART backend services apps and
// their tokens. Pure and import free. Lives in state.epic. Bayview Health is a fictional hospital and every patient is
// made up.
//
// State shape (state.epic, once filled; the open console seeds only { created } and fillEpic builds the rest on first use):
//   created, base, tokenUrl,
//   apps: [{ clientId, prodId, name, audience, scopes: ['system/Patient.read'], keys: [{ kid, thumb, alg, t }], jwksUrl, t, by }]
//         (the backend app registrations of Bayview, as on the Build Apps page of Epic on FHIR)
//   keystore: [{ alias, kid, thumb, t, jwks }] (lab tool: the signing keys of Brightmart; jwks means published on BRIGHTMART_JWKS)
//   patients: [{ id, mrn, family, given, gender, birthDate }],
//   practitioners: [{ id, name }],
//   encounters: [[id, pid, class, status, start, end, type]],
//   obs: [[id, pid, loinc, value, t]] (the category comes from the LOINC table),
//   appts: [{ id, pid, prac, start, end, status, desc }],
//   tokens: { accessToken: { c, sc: [scopes], exp } }, jtis: { jti: exp },
//   rate: { clientId: [t] }, pages: { cursor: { type, q, c, exp } },
//   audit: [{ t, c, app, m, u, st, ms, why }] (the FHIR calls), tokenLog: [{ t, c, app, kid, alg, jti, exp, st, err, why, sc }]
//   n (counter)
//
// ctx.epic (see epicCtx) for the sample apps:
//   token(cfg)                  POST to the token endpoint: grant_type client_credentials with a client_assertion JWT that the
//                               engine builds from cfg { tokenUrl, clientId, kid, keyAlias, alg, expSeconds, jti, scope,
//                               keystorePassword, aud }. Gives { ok, status, body, headers, ms }.
//   search(token, type, params) a FHIR search. 200 gives a Bundle of type searchset with total and link next.
//   read(token, type, id)       a FHIR read.
//   create(token, type, body)   creates an Appointment. 409 when the practitioner is booked at that time.
//   next(token, url)            the next page of a search, from the url of link next.
//   wait(seconds)               lab-made: the app sleeps, for example the Retry-After of a 429. Later calls happen later.
// A 4xx answer has an OperationOutcome as its body. The app side failure of the key store gives status 0 and an error.

export const ORG = 'Bayview Health'
export const HOST = 'fhir.bayview.example'
export const TOKEN_URL = `https://${HOST}/interconnect-fhir-oauth/oauth2/token`
export const BASE = `https://${HOST}/interconnect-fhir-oauth/api/FHIR/R4`
export const BRIGHTMART_JWKS = 'https://keys.brightmart.example/epic/jwks.json'
export const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
// a made up OID under the Epic root for the MRN of Bayview
export const MRN_SYSTEM = 'urn:oid:1.2.840.114350.1.13.861.1.7.5.737384.14'
export const CAT_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category'
export const KEYSTORE_PASSWORD = 'lab-practice-keystore-26' // a practice value of the lab, not a real secret
export const ALGS = ['RS384', 'ES384']
export const MAX_EXP = 300 // a JWT may expire at most 5 minutes after it is made
export const TOKEN_LIFE = 3600
// lab-made limits: Epic does not publish its rate limits or page sizes
export const RATE = { n: 9, seconds: 10 }
export const DEFAULT_COUNT = 10
export const MAX_COUNT = 20
const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const CLOCK_BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
const MAX_AUDIT = 80
const MAX_TOKENLOG = 40
const MAX_TOKENS = 30
const MAX_PAGES = 30
const PAGE_LIFE = 30 * MINUTE // lab-made

// The SMART scopes a backend app can ask for, with the Epic APIs each stands for. Epic grants the APIs picked on the app;
// the lab shows the SMART v1 scope for each group.
export const SCOPES = [
  ['system/Patient.read', 'Patient.Read (R4), Patient.Search (R4)'],
  ['system/Encounter.read', 'Encounter.Read (R4), Encounter.Search (R4)'],
  ['system/Observation.read', 'Observation.Read (R4), Observation.Search (Vital Signs) (R4), Observation.Search (Labs) (R4)'],
  ['system/Appointment.read', 'Appointment.Read (R4), Appointment.Search (R4)'],
  ['system/Appointment.write', 'Appointment.Create (R4) (lab-made: Epic books through Appointment $book)'],
  ['system/*.read', 'Every read and search API of every resource'],
]
export const SCOPE_NAMES = SCOPES.map((x) => x[0])
export const TYPES = ['Patient', 'Encounter', 'Observation', 'Appointment']

// LOINC codes: [display, unit, low, high, decimals, category]
export const LOINC = {
  '8867-4': ['Heart rate', '/min', 62, 98, 0, 'vital-signs'],
  '9279-1': ['Respiratory rate', '/min', 12, 20, 0, 'vital-signs'],
  '8310-5': ['Body temperature', 'Cel', 36.4, 37.8, 1, 'vital-signs'],
  '59408-5': ['Oxygen saturation in Arterial blood by Pulse oximetry', '%', 93, 99, 0, 'vital-signs'],
  '8480-6': ['Systolic blood pressure', 'mm[Hg]', 106, 148, 0, 'vital-signs'],
  '8462-4': ['Diastolic blood pressure', 'mm[Hg]', 62, 92, 0, 'vital-signs'],
  '29463-7': ['Body weight', 'kg', 54, 104, 1, 'vital-signs'],
  '2345-7': ['Glucose [Mass/volume] in Serum or Plasma', 'mg/dL', 76, 162, 0, 'laboratory'],
  '718-7': ['Hemoglobin [Mass/volume] in Blood', 'g/dL', 11.4, 16.4, 1, 'laboratory'],
  '2160-0': ['Creatinine [Mass/volume] in Serum or Plasma', 'mg/dL', 0.6, 1.4, 2, 'laboratory'],
  '2823-3': ['Potassium [Moles/volume] in Serum or Plasma', 'mmol/L', 3.5, 5.1, 1, 'laboratory'],
  '4548-4': ['Hemoglobin A1c/Hemoglobin.total in Blood', '%', 5.2, 8.4, 1, 'laboratory'],
}
const VITALS = ['8867-4', '9279-1', '8310-5', '59408-5', '8480-6', '8462-4']
const LABS = ['2345-7', '718-7', '2160-0', '2823-3']
const CLASS = { AMB: 'ambulatory', IMP: 'inpatient encounter', EMER: 'emergency' }

// ---------- small helpers ----------

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const hashOf = (seed) => {
  let h = 2166136261
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}
export const b62 = (seed, n = 22) => {
  let out = ''
  for (let i = 0; out.length < n; i++) {
    let h = hashOf(`${seed}:${i}`)
    for (let k = 0; k < 5 && out.length < n; k++, h = Math.floor(h / 62)) out += B62[h % 62]
  }
  return out
}
const unit01 = (seed) => hashOf(seed) / 4294967296
const fhirId = (seed) => `e${b62(seed, 22)}`
const uuidOf = (seed) => {
  const h = b62(seed, 32)
    .split('')
    .map((c) => (B62.indexOf(c) % 16).toString(16))
    .join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
export const thumbOf = (seed) => b62(`thumb:${seed}`, 43)
export const iso = (t) => new Date(CLOCK_BASE + t).toISOString().replace('.000Z', 'Z')
const word = (v) => String(v ?? '').trim()
const push = (list, entry, max) => {
  list.push(entry)
  if (list.length > max) list.splice(0, list.length - max)
}
const next = (y) => (y.n = (y.n ?? 1000) + 1)

export const outcome = (code, text, diagnostics) => ({
  resourceType: 'OperationOutcome',
  issue: [{ severity: 'error', code, details: { text }, ...(diagnostics && { diagnostics }) }],
})

// ---------- the data of Bayview ----------

const PATIENTS = [
  ['203711', 'Tallon', 'Mira', 'female', '1958-03-14'],
  ['203712', 'Ferreby', 'Jonah', 'male', '1971-09-02'],
  ['203713', 'Varrow', 'Priya', 'female', '1984-12-20'],
  ['203714', 'Quint', 'Elias', 'male', '1949-06-30'],
  ['203715', 'Abernath', 'Rosa', 'female', '1966-01-08'],
  ['203716', 'Lindqvar', 'Theo', 'male', '1992-11-11'],
  ['203717', 'Orrin', 'Nadia', 'female', '1977-04-25'],
  ['203718', 'Wystan', 'Caleb', 'male', '2001-07-19'],
]
// inpatients: [mrn, admitted hours ago, vital sign rounds every 6 hours]
const INPATIENTS = [
  ['203711', 46, 8],
  ['203714', 36, 6],
  ['203715', 30, 5],
]
// outpatient visits: [mrn, days ago, labs]
const VISITS = [
  ['203712', 6, ['2345-7', '4548-4']],
  ['203713', 12, []],
  ['203716', 3, []],
  ['203717', 9, LABS],
  ['203718', 20, []],
]
// lab sets of the inpatients: [mrn, hours ago]
const LAB_DRAWS = [
  ['203711', 40],
  ['203711', 16],
  ['203714', 30],
  ['203715', 26],
]

const valueOf = (code, seed) => {
  const [, , lo, hi, dec] = LOINC[code]
  return Number((lo + unit01(seed) * (hi - lo)).toFixed(dec))
}

export function newEpic(now = 0, extra = {}) {
  const y = {
    created: now,
    base: BASE,
    tokenUrl: TOKEN_URL,
    apps: [],
    keystore: [],
    patients: PATIENTS.map(([mrn, family, given, gender, birthDate]) => ({ id: fhirId(`pt${mrn}`), mrn, family, given, gender, birthDate })),
    practitioners: [
      { id: fhirId('pr-hale'), name: 'Imogen Hale, MD' },
      { id: fhirId('pr-brandt'), name: 'Tomas Brandt, MD' },
    ],
    encounters: [],
    obs: [],
    appts: [],
    tokens: {},
    jtis: {},
    rate: {},
    pages: {},
    audit: [],
    tokenLog: [],
    n: 1000,
  }
  const pid = (mrn) => y.patients.find((p) => p.mrn === mrn).id
  const ob = (mrn, code, t) => y.obs.push([fhirId(`ob${mrn}${code}${t}`), pid(mrn), code, valueOf(code, `${mrn}${code}${t}`), t])
  const round = (t) => Math.floor(t / HOUR) * HOUR
  for (const [mrn, ago, rounds] of INPATIENTS) {
    const admit = round(now - ago * HOUR)
    y.encounters.push([fhirId(`en${mrn}i`), pid(mrn), 'IMP', 'in-progress', admit, null, 'Hospital admission'])
    for (let i = 0; i < rounds; i++) for (const code of VITALS) ob(mrn, code, admit + 2 * HOUR + i * 6 * HOUR)
  }
  for (const [mrn, days, labs] of VISITS) {
    const t = round(now - days * DAY) + 2 * HOUR
    y.encounters.push([fhirId(`en${mrn}a`), pid(mrn), 'AMB', 'finished', t, t + 40 * MINUTE, 'Office visit'])
    for (const code of [...VITALS, '29463-7', ...labs]) ob(mrn, code, t + 10 * MINUTE)
  }
  for (const [mrn, ago] of LAB_DRAWS) for (const code of LABS) ob(mrn, code, round(now - ago * HOUR) + 5 * MINUTE)
  y.encounters.push([fhirId('en203711a'), pid('203711'), 'AMB', 'finished', round(now - 30 * DAY) + 3 * HOUR, round(now - 30 * DAY) + 4 * HOUR, 'Office visit'])
  const [hale, brandt] = y.practitioners
  const day = (d, h, m = 0) => Math.floor(now / DAY) * DAY + d * DAY + h * HOUR + m * MINUTE
  y.appts = [
    { id: fhirId('ap1'), pid: pid('203712'), prac: hale.id, start: day(3, 10), end: day(3, 10, 30), status: 'booked', desc: 'Diabetes follow up' },
    { id: fhirId('ap2'), pid: pid('203713'), prac: brandt.id, start: day(1, 14), end: day(1, 14, 20), status: 'booked', desc: 'Annual physical' },
    { id: fhirId('ap3'), pid: pid('203716'), prac: hale.id, start: day(5, 9, 30), end: day(5, 10), status: 'booked', desc: 'Sports injury review' },
  ]
  return Object.assign(y, extra)
}
const SYSTEM_KEYS = Object.keys(newEpic())

// fills a missing or placeholder state.epic, and any key an older save lacks
export function fillEpic(y) {
  if (!y) return newEpic(0)
  if (!y.base) {
    const base = newEpic(y.created ?? 0)
    for (const k of Object.keys(base)) y[k] ??= base[k]
    return y
  }
  if (SYSTEM_KEYS.some((k) => y[k] === undefined || y[k] === null)) {
    const base = newEpic(y.created ?? 0)
    for (const k of SYSTEM_KEYS) y[k] ??= base[k]
  }
  return y
}
export const isFilled = (y) => Boolean(y?.base)

// ---------- lookups ----------

export const appOf = (y, clientId) => (y?.apps ?? []).find((a) => a.clientId === word(clientId))
export const appNamedIn = (y, name) => (y?.apps ?? []).find((a) => a.name === name)
export const keyOf = (y, alias) => (y?.keystore ?? []).find((k) => k.alias === word(alias))
export const patientByMrn = (y, mrn) => (y?.patients ?? []).find((p) => p.mrn === word(mrn))
export const patientById = (y, id) => (y?.patients ?? []).find((p) => p.id === word(id).replace(/^Patient\//, ''))
export const categoryOf = (code) => LOINC[code]?.[5] ?? 'laboratory'
export const obsOf = (y, pid, category) => (y?.obs ?? []).filter((o) => o[1] === pid && (!category || categoryOf(o[2]) === category))
// the public keys Epic has for an app: the uploaded ones and, with a JWK Set URL of Brightmart, the published keys of Brightmart
export const publicKeysOf = (y, a) => [...(a?.keys ?? []), ...(word(a?.jwksUrl) === BRIGHTMART_JWKS ? (y?.keystore ?? []).filter((k) => k.jwks).map((k) => ({ kid: k.kid, thumb: k.thumb, alg: 'RS384', jwks: true })) : [])]
export const publicJwk = (k) => ({ kty: 'RSA', alg: 'RS384', use: 'sig', kid: k.kid, n: `${b62(`n${k.thumb}`, 40)}...`, e: 'AQAB' })
export const grants = (scopes, need) => (scopes ?? []).includes(need) || (need.endsWith('.read') && (scopes ?? []).includes('system/*.read'))

// ---------- FHIR resources ----------

const nameText = (p) => `${p.given} ${p.family}`
export function patientRes(p) {
  return {
    resourceType: 'Patient',
    id: p.id,
    identifier: [{ use: 'usual', type: { text: 'MRN' }, system: MRN_SYSTEM, value: p.mrn }],
    active: true,
    name: [{ use: 'official', text: nameText(p), family: p.family, given: [p.given] }],
    gender: p.gender,
    birthDate: p.birthDate,
  }
}
const subject = (y, pid) => ({ reference: `Patient/${pid}`, display: patientById(y, pid) ? nameText(patientById(y, pid)) : undefined })
function encounterRes(y, e) {
  const [id, pid, cls, status, start, end, type] = e
  return {
    resourceType: 'Encounter',
    id,
    status,
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: cls, display: CLASS[cls] },
    type: [{ text: type }],
    subject: subject(y, pid),
    period: { start: iso(start), ...(end && { end: iso(end) }) },
    serviceProvider: { display: ORG },
  }
}
function observationRes(y, o) {
  const [id, pid, code, value, t] = o
  const [display, unit] = LOINC[code]
  const cat = categoryOf(code)
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    category: [{ coding: [{ system: CAT_SYSTEM, code: cat, display: cat === 'vital-signs' ? 'Vital Signs' : 'Laboratory' }] }],
    code: { coding: [{ system: 'http://loinc.org', code, display }], text: display },
    subject: subject(y, pid),
    effectiveDateTime: iso(t),
    valueQuantity: { value, unit, system: 'http://unitsofmeasure.org', code: unit },
  }
}
function appointmentRes(y, a) {
  const pr = y.practitioners.find((x) => x.id === a.prac)
  return {
    resourceType: 'Appointment',
    id: a.id,
    status: a.status,
    description: a.desc,
    start: iso(a.start),
    end: iso(a.end),
    participant: [
      { actor: subject(y, a.pid), status: 'accepted' },
      { actor: { reference: `Practitioner/${a.prac}`, display: pr?.name }, status: 'accepted' },
    ],
  }
}
const resOf = (y, type, row) => (type === 'Patient' ? patientRes(row) : type === 'Encounter' ? encounterRes(y, row) : type === 'Observation' ? observationRes(y, row) : appointmentRes(y, row))
const rowsOf = (y, type) => (type === 'Patient' ? y.patients : type === 'Encounter' ? y.encounters : type === 'Observation' ? y.obs : y.appts)
const idOfRow = (type, row) => (Array.isArray(row) ? row[0] : row.id)

// ---------- search ----------

// params as an object or a query string. The keys and values are kept as strings.
export function paramsOf(q) {
  if (q && typeof q === 'object') return Object.fromEntries(Object.entries(q).map(([k, v]) => [k, word(v)]))
  const out = {}
  // a stray % in a typed query is kept as it is instead of throwing
  const decode = (v) => {
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }
  for (const part of String(q ?? '').replace(/^\?/, '').split('&')) {
    if (!part) continue
    const i = part.indexOf('=')
    const k = decode(i < 0 ? part : part.slice(0, i))
    out[k] = decode(i < 0 ? '' : part.slice(i + 1)).trim()
  }
  return out
}
const queryText = (q) =>
  Object.entries(q)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
const after = (v) => (v.includes('|') ? v.slice(v.lastIndexOf('|') + 1) : v)
const refId = (v) => word(v).replace(/^Patient\//, '')

// which rows a search matches, or an OperationOutcome for a search Epic refuses
function matchRows(y, type, q) {
  const need = (k) => outcome('required', `Required search parameter missing: ${k}`, `${type}.Search requires ${k}`) // lab-made wording
  if (type === 'Patient') {
    const keys = ['identifier', 'family', 'given', 'name', 'birthdate', '_id']
    if (!keys.some((k) => q[k])) return { error: outcome('required', 'At least one search parameter is required', 'Patient.Search requires identifier, name, family, given, birthdate or _id') } // lab-made wording
    return {
      rows: y.patients.filter((p) => {
        if (q._id && p.id !== q._id) return false
        if (q.identifier) {
          const [sys, val] = q.identifier.includes('|') ? [q.identifier.slice(0, q.identifier.lastIndexOf('|')), after(q.identifier)] : ['', q.identifier]
          if (sys && sys !== MRN_SYSTEM && sys.toUpperCase() !== 'MRN') return false
          if (p.mrn !== val) return false
        }
        const low = (v) => v.toLowerCase()
        if (q.family && !low(p.family).startsWith(low(q.family))) return false
        if (q.given && !low(p.given).startsWith(low(q.given))) return false
        if (q.name && !low(p.family).startsWith(low(q.name)) && !low(p.given).startsWith(low(q.name))) return false
        if (q.birthdate && p.birthDate !== q.birthdate) return false
        return true
      }),
    }
  }
  if (!q.patient) return { error: need('patient') }
  const pid = refId(q.patient)
  if (type === 'Encounter') return { rows: y.encounters.filter((e) => e[1] === pid && (!q.status || e[3] === q.status) && (!q.class || e[2] === q.class)).sort((a, b) => b[4] - a[4]) }
  if (type === 'Appointment') return { rows: y.appts.filter((a) => a.pid === pid && (!q.status || a.status === q.status)).sort((a, b) => a.start - b.start) }
  // Observation: Epic searches by patient and by category or code
  if (!q.category && !q.code) return { error: need('category or code') }
  const cats = q.category ? q.category.split(',').map(after) : null
  const codes = q.code ? q.code.split(',').map(after) : null
  return { rows: y.obs.filter((o) => o[1] === pid && (!cats || cats.includes(categoryOf(o[2]))) && (!codes || codes.includes(o[2]))).sort((a, b) => b[4] - a[4]) }
}

const countOf = (q) => Math.min(MAX_COUNT, Math.max(1, Number(q._count) || DEFAULT_COUNT))
// one page of a search as a Bundle. Lab-made paging links: a cursor and an offset, like a server that keeps the search.
function bundle(y, type, q, offset, now, client, cursorOf) {
  const m = matchRows(y, type, q)
  if (m.error) return { status: 400, body: m.error }
  const count = countOf(q)
  const page = m.rows.slice(offset, offset + count)
  const self = offset ? `${BASE}/${type}?${queryText(q)}&_getpagesoffset=${offset}` : `${BASE}/${type}?${queryText(q)}`
  const link = [{ relation: 'self', url: self }]
  if (offset + count < m.rows.length) {
    const cursor = cursorOf && y.pages[cursorOf] ? cursorOf : b62(`${type}${queryText(q)}${now}${next(y)}`, 16)
    y.pages[cursor] ??= { type, q, c: client, exp: now + PAGE_LIFE }
    const keys = Object.keys(y.pages)
    if (keys.length > MAX_PAGES) for (const k of keys.slice(0, keys.length - MAX_PAGES)) delete y.pages[k]
    link.push({ relation: 'next', url: `${BASE}/${type}?_getpages=${cursor}&_getpagesoffset=${offset + count}&_count=${count}` })
  }
  return {
    status: 200,
    body: {
      resourceType: 'Bundle',
      type: 'searchset',
      total: m.rows.length,
      link,
      entry: page.map((row) => ({ link: [{ relation: 'self', url: `${BASE}/${type}/${idOfRow(type, row)}` }], fullUrl: `${BASE}/${type}/${idOfRow(type, row)}`, resource: resOf(y, type, row), search: { mode: 'match' } })),
    },
  }
}
function readOne(y, type, id) {
  const row = rowsOf(y, type).find((r) => idOfRow(type, r) === word(id))
  return row ? { status: 200, body: resOf(y, type, row) } : { status: 404, body: outcome('not-found', `${type} with ID ${word(id) || '(empty)'} was not found`) }
}
function pageUrl(y, url, now) {
  const [path, qs] = String(url ?? '').split('?')
  const p = paramsOf(qs)
  const c = y.pages[p._getpages]
  if (!path.startsWith(BASE) || !c) return { status: 404, body: outcome('not-found', 'The search session is not known. Run the search again', `_getpages=${p._getpages ?? ''}`) } // lab-made wording
  if (c.exp <= now) return { status: 410, body: outcome('not-found', 'The search session has expired. Run the search again') } // lab-made wording
  return { type: c.type, q: c.q, offset: Math.max(0, Number(p._getpagesoffset) || 0), client: c.c, cursor: p._getpages }
}

// a URL the FHIR browser takes: Patient?identifier=..., Patient/eXyz, or a full URL from a link
export function parseQuery(text) {
  let t = word(text).replace(/^GET\s+/i, '')
  if (t.startsWith(BASE)) t = t.slice(BASE.length)
  t = t.replace(/^\//, '')
  const [path, qs = ''] = t.split('?')
  const [type, id] = path.split('/')
  return { type, id: id ?? '', q: paramsOf(qs), paged: qs.includes('_getpages=') }
}

// ---------- the token endpoint ----------

const tokenErr = (error, description = null) => ({ error, error_description: description })
// Epic answers 400 with error invalid_client and no description; the reason shows only in the Bayview log (lab-made view)
function tokenRequest(s, y, app, cfg, now) {
  const c = word(cfg?.clientId)
  const kid = word(cfg?.kid)
  const alg = word(cfg?.alg) || 'RS384'
  const expSeconds = Number(cfg?.expSeconds ?? MAX_EXP)
  const jti = word(cfg?.jti) || b62(`jti${c}${now}${next(y)}`, 24)
  const entry = { t: now, c, app, kid, alg, jti, exp: now + expSeconds * 1000, st: 200, err: '', why: '', sc: '' }
  const done = (status, body, why = '') => {
    Object.assign(entry, { st: status, err: body.error ?? '', why, sc: body.scope ?? '' })
    push(y.tokenLog, entry, MAX_TOKENLOG)
    return { ok: status === 200, status, body, headers: { 'Content-Type': 'application/json' }, ms: status === 200 ? 180 : 90 }
  }
  // the app side: the private key comes from the key store of the app
  const key = keyOf(y, cfg?.keyAlias)
  if (cfg?.keystorePassword !== KEYSTORE_PASSWORD) return { ok: false, status: 0, error: 'java.io.IOException: Keystore was tampered with, or password was incorrect', ms: 20 }
  if (!key) return { ok: false, status: 0, error: `Alias ${word(cfg?.keyAlias) || '(empty)'} not found in the key store`, ms: 20 } // lab-made wording
  if (word(cfg?.tokenUrl) !== TOKEN_URL) return { ok: false, status: 404, body: '<html><body>404 Not Found</body></html>', error: `No token endpoint at ${word(cfg?.tokenUrl) || '(empty)'}`, ms: 60 }
  if (word(cfg?.grantType || 'client_credentials') !== 'client_credentials') return done(400, tokenErr('unsupported_grant_type'), `grant_type ${cfg.grantType}`)
  if (word(cfg?.assertionType || ASSERTION_TYPE) !== ASSERTION_TYPE) return done(400, tokenErr('invalid_request'), 'client_assertion_type is not jwt-bearer')
  const a = appOf(y, c)
  if (!a) return done(400, tokenErr('invalid_client'), `No backend app has client_id ${c || '(empty)'}`)
  if (!ALGS.includes(alg)) return done(400, tokenErr('invalid_client'), `JWT alg ${alg} is not supported. Sign with RS384 or ES384`)
  if (word(cfg?.aud || TOKEN_URL) !== TOKEN_URL) return done(400, tokenErr('invalid_client'), `aud ${cfg.aud} is not the token endpoint`)
  if (!(expSeconds > 0)) return done(400, tokenErr('invalid_client'), 'The JWT has expired')
  if (expSeconds > MAX_EXP) return done(400, tokenErr('invalid_client'), `exp is ${expSeconds} seconds after now. The limit is 5 minutes`)
  if (y.jtis[jti] && y.jtis[jti] > now) return done(400, tokenErr('invalid_client'), `jti ${jti} was used before. Each JWT needs a new jti`)
  const pub = publicKeysOf(y, a).find((k) => k.kid === kid)
  if (!pub) return done(400, tokenErr('invalid_client'), `No public key with kid ${kid || '(empty)'} on app ${a.name}`)
  // every key of the lab is an RSA key, so an ES384 header never verifies against it
  if (pub.alg && pub.alg !== alg) return done(400, tokenErr('invalid_client'), `The JWT says alg ${alg}, but the key with kid ${kid} is an ${pub.alg} key. The signature does not verify`)
  if (pub.thumb !== key.thumb) return done(400, tokenErr('invalid_client'), `The signature does not verify with the public key of kid ${kid}. The JWT was signed with another private key`)
  y.jtis[jti] = entry.exp
  const asked = word(cfg?.scope).split(/\s+/).filter(Boolean)
  const missing = asked.filter((x) => !a.scopes.includes(x) && !(x.endsWith('.read') && a.scopes.includes('system/*.read')))
  if (missing.length) return done(400, tokenErr('invalid_scope', `The app is not authorized for ${missing.join(' ')}`), `${missing.join(' ')} is not on app ${a.name}`)
  // with no scope parameter Epic grants every API on the app
  const granted = asked.length ? asked : [...a.scopes]
  const tok = b62(`at${c}${now}${next(y)}`, 40)
  y.tokens[tok] = { c, sc: granted, exp: now + TOKEN_LIFE * 1000 }
  const keys = Object.keys(y.tokens)
  if (keys.length > MAX_TOKENS) for (const k of keys.slice(0, keys.length - MAX_TOKENS)) delete y.tokens[k]
  return done(200, { access_token: tok, token_type: 'Bearer', expires_in: TOKEN_LIFE, scope: granted.join(' ') })
}

// ---------- FHIR calls ----------

const NEED = { search: 'read', read: 'read', next: 'read', create: 'write' }
const API_NAME = (type, op, q) => (op === 'create' ? `${type}.Create (R4)` : op === 'read' ? `${type}.Read (R4)` : type === 'Observation' ? `Observation.Search (${categoryOf(after(q?.code ?? '')) === 'vital-signs' || after(q?.category ?? '') === 'vital-signs' ? 'Vital Signs' : 'Labs'}) (R4)` : `${type}.Search (R4)`)
// checks the bearer token, the scope and the rate limit. Gives the token entry or an answer.
function guard(y, token, type, op, q, now) {
  const t = y.tokens[word(token).replace(/^Bearer\s+/i, '')]
  const head = { 'Content-Type': 'application/fhir+json' }
  if (!t || t.exp <= now) return { answer: { status: 401, body: outcome('login', t ? 'The access token has expired' : 'The access token is missing or not valid'), headers: { ...head, 'WWW-Authenticate': `Bearer error="invalid_token"` } } } // lab-made wording
  const need = `system/${type}.${NEED[op]}`
  if (!grants(t.sc, need)) return { t, answer: { status: 403, body: outcome('forbidden', `The client is not authorized for ${API_NAME(type, op, q)}`, `The access token does not grant ${need}`), headers: head } } // lab-made wording
  const list = (y.rate[t.c] = (y.rate[t.c] ?? []).filter((x) => x > now - RATE.seconds * 1000))
  if (list.length >= RATE.n) {
    const wait = Math.max(1, Math.ceil((list[0] + RATE.seconds * 1000 - now) / 1000))
    return { t, answer: { status: 429, body: outcome('throttled', 'Too many requests. Retry later'), headers: { ...head, 'Retry-After': String(wait) } } } // lab-made wording
  }
  list.push(now)
  return { t }
}

function createAppointment(y, body, now) {
  const b = body && typeof body === 'object' ? body : (() => { try { return JSON.parse(body) } catch { return null } })()
  if (!b || b.resourceType !== 'Appointment') return { status: 400, body: outcome('invalid', 'The body is not an Appointment resource') }
  const refs = (b.participant ?? []).map((p) => word(p?.actor?.reference))
  const pid = refs.find((r) => r.startsWith('Patient/'))?.slice(8)
  const prac = refs.find((r) => r.startsWith('Practitioner/'))?.slice(13)
  const start = Date.parse(b.start) - CLOCK_BASE
  const end = Date.parse(b.end) - CLOCK_BASE
  if (!patientById(y, pid)) return { status: 422, body: outcome('processing', `Patient ${pid || '(empty)'} was not found`) }
  if (!y.practitioners.some((p) => p.id === prac)) return { status: 422, body: outcome('processing', `Practitioner ${prac || '(empty)'} was not found`) }
  if (!(start < end)) return { status: 422, body: outcome('invalid', 'start must be before end') }
  // lab-made: the schedule of the practitioner has one patient at a time
  const clash = y.appts.find((a) => a.prac === prac && a.status === 'booked' && a.start < end && start < a.end)
  if (clash) return { status: 409, body: outcome('conflict', 'The time is no longer available. Another appointment is booked in that slot', `Appointment/${clash.id}`) }
  const a = { id: fhirId(`ap${next(y)}`), pid, prac, start, end, status: 'booked', desc: word(b.description) || 'Appointment' }
  y.appts.push(a)
  return { status: 201, body: appointmentRes(y, a), headers: { Location: `${BASE}/Appointment/${a.id}` } }
}

function audit(y, now, client, app, m, u, st, ms, why = '') {
  push(y.audit, { t: now, c: client, app, m, u: u.replace(BASE, ''), st, ms, why }, MAX_AUDIT)
}

// ---------- the ctx hook ----------

// The engine calls this for each run of an app with its draft state: the calls change `s` in place. Nothing is filled
// until the app makes a call.
export function epicCtx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.epic = fillEpic(s.epic))
  let offset = 0
  const now = () => (s.clock ?? 0) + offset
  const answer = (y, r, m, url, client, ms) => {
    offset += ms
    audit(y, now(), client, who, m, url, r.status, ms, r.status >= 400 ? r.body?.issue?.[0]?.details?.text ?? '' : '')
    return { ok: r.status < 300, status: r.status, body: r.body, headers: { 'Content-Type': 'application/fhir+json', ...(r.headers ?? {}) }, ms }
  }
  const call = (token, type, op, q, url, run) => {
    const y = sys()
    if (!TYPES.includes(type)) return answer(y, { status: 400, body: outcome('not-supported', `Resource type ${type || '(empty)'} is not supported`) }, op === 'create' ? 'POST' : 'GET', url, '', 30)
    const g = guard(y, token, type, op, q, now())
    if (g.answer) return answer(y, g.answer, op === 'create' ? 'POST' : 'GET', url, g.t?.c ?? '', g.answer.status === 429 ? 15 : 25)
    return answer(y, run(y), op === 'create' ? 'POST' : 'GET', url, g.t.c, op === 'search' || op === 'next' ? 220 : 120)
  }
  return {
    token(cfg) {
      const y = sys()
      const r = tokenRequest(s, y, who, cfg, now())
      offset += r.ms
      return r
    },
    search(token, type, params) {
      const q = paramsOf(params)
      return call(token, type, 'search', q, `${BASE}/${type}?${queryText(q)}`, (y) => bundle(y, type, q, 0, now(), y.tokens[word(token)]?.c))
    },
    read(token, type, id) {
      return call(token, type, 'read', {}, `${BASE}/${type}/${word(id)}`, (y) => readOne(y, type, id))
    },
    create(token, type, body) {
      if (type !== 'Appointment') return call(token, type, 'create', {}, `${BASE}/${type}`, () => ({ status: 405, body: outcome('not-supported', `${type}.Create is not supported`) }))
      return call(token, type, 'create', {}, `${BASE}/${type}`, (y) => createAppointment(y, body, now()))
    },
    next(token, url) {
      const y = sys()
      const p = pageUrl(y, url, now())
      if (!p.type) return answer(y, p, 'GET', String(url ?? ''), y.tokens[word(token)]?.c ?? '', 30)
      return call(token, p.type, 'next', p.q, String(url), (z) => bundle(z, p.type, p.q, p.offset, now(), p.client, p.cursor))
    },
    wait(seconds) {
      offset += Math.max(0, Number(seconds) || 0) * 1000
      return { ok: true, ms: Math.max(0, Number(seconds) || 0) * 1000 }
    },
    elapsed: () => offset,
  }
}

// ---------- the tick ----------

// runs once a lab minute while state.epic exists. Changes `s` in place: drops what has expired.
export function epicTick(s) {
  const y = s?.epic
  if (!isFilled(y)) return s
  const now = s.clock ?? 0
  for (const [k, v] of Object.entries(y.tokens ?? {})) if (v.exp <= now) delete y.tokens[k]
  for (const [k, v] of Object.entries(y.jtis ?? {})) if (v <= now) delete y.jtis[k]
  for (const [k, v] of Object.entries(y.pages ?? {})) if (v.exp <= now) delete y.pages[k]
  for (const [k, v] of Object.entries(y.rate ?? {})) if (!(v ?? []).some((t) => t > now - RATE.seconds * 1000)) delete y.rate[k]
  return s
}

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.epic = fillEpic(s.epic)
  const result = fn(s, s.epic, s.clock ?? 0)
  return { state: s, result }
}
export const upgradeEpic = (state) => (isFilled(state?.epic) ? state : edit(state, () => null).state)

// Build Apps, Create: a backend app gets its client IDs at once
export const createBackendApp = (state, { name, audience = 'Backend Systems' }) =>
  edit(state, (s, y, now) => {
    const n = word(name)
    if (n.length < 3) return { ok: false, text: 'Enter an application name of at least 3 characters' }
    if (y.apps.some((a) => a.name.toLowerCase() === n.toLowerCase())) return { ok: false, text: `An app named ${n} exists already` }
    if (audience !== 'Backend Systems') return { ok: false, text: 'Only backend apps are part of the lab' }
    const a = { clientId: uuidOf(`np${n}${now}`), prodId: uuidOf(`pr${n}${now}`), name: n, audience, scopes: [], keys: [], jwksUrl: '', t: now, by: 'brightmart.integration' }
    y.apps.push(a)
    return { ok: true, text: `App ${n} created. Non-production client ID ${a.clientId}`, clientId: a.clientId }
  })
export const setAppScopes = (state, clientId, scopes) =>
  edit(state, (s, y) => {
    const a = appOf(y, clientId)
    if (!a) return { ok: false, text: 'No such app' }
    a.scopes = SCOPE_NAMES.filter((x) => scopes.includes(x))
    return { ok: true, text: `Incoming APIs saved: ${a.scopes.join(', ') || 'none'}` }
  })
// upload a public key from the Brightmart key store. In Epic you paste the public key; the lab picks it by kid.
export const addPublicKey = (state, clientId, kid) =>
  edit(state, (s, y, now) => {
    const a = appOf(y, clientId)
    const k = (y.keystore ?? []).find((x) => x.kid === word(kid))
    if (!a || !k) return { ok: false, text: 'Pick a key' }
    if (a.keys.some((x) => x.kid === k.kid)) return { ok: false, text: `A key with kid ${k.kid} is on the app already. Remove it first` }
    a.keys.push({ kid: k.kid, thumb: k.thumb, alg: 'RS384', t: now })
    return { ok: true, text: `Public key ${k.kid} added` }
  })
export const removePublicKey = (state, clientId, kid) =>
  edit(state, (s, y) => {
    const a = appOf(y, clientId)
    if (!a) return { ok: false, text: 'No such app' }
    a.keys = a.keys.filter((x) => x.kid !== kid)
    return { ok: true, text: `Public key ${kid} removed` }
  })
export const setJwksUrl = (state, clientId, url) =>
  edit(state, (s, y) => {
    const a = appOf(y, clientId)
    if (!a) return { ok: false, text: 'No such app' }
    const u = word(url)
    if (u && !/^https:\/\//.test(u)) return { ok: false, text: 'A JWK Set URL must use https' }
    a.jwksUrl = u
    return { ok: true, text: u ? `JWK Set URL saved. Epic reads the keys from ${u}` : 'JWK Set URL removed' }
  })
// lab tool: Brightmart makes a key pair in the key store of the app. Only the public key ever leaves Brightmart.
export const generateKeyPair = (state, { alias, kid }) =>
  edit(state, (s, y, now) => {
    const a = word(alias)
    const k = word(kid) || a
    if (!/^[a-z0-9][a-z0-9._-]{2,40}$/i.test(a)) return { ok: false, text: 'An alias has 3 to 41 letters, digits, dots, _ or -' }
    if (keyOf(y, a)) return { ok: false, text: `Alias ${a} exists already` }
    if (y.keystore.some((x) => x.kid === k)) return { ok: false, text: `Key ID ${k} is in use` }
    y.keystore.push({ alias: a, kid: k, thumb: thumbOf(`${a}${now}${next(y)}`), t: now, jwks: false })
    return { ok: true, text: `RSA 2048 key pair ${a} made, kid ${k}` }
  })
export const setInJwks = (state, alias, on) =>
  edit(state, (s, y) => {
    const k = keyOf(y, alias)
    if (!k) return { ok: false, text: 'No such key' }
    k.jwks = Boolean(on)
    return { ok: true, text: on ? `${k.kid} is published at ${BRIGHTMART_JWKS}` : `${k.kid} is no longer published` }
  })

// the FHIR browser of the Bayview analyst: runs a query without a token or a rate limit, and is not audited (lab tool)
export const browse = (state, text) =>
  edit(state, (s, y, now) => {
    const { type, id, q, paged } = parseQuery(text)
    if (!TYPES.includes(type)) return { status: 400, body: outcome('not-supported', `Resource type ${type || '(empty)'} is not supported`) }
    if (id) return readOne(y, type, id)
    if (paged) {
      const p = pageUrl(y, `${BASE}/${word(text).replace(/^GET\s+/i, '').replace(BASE, '').replace(/^\//, '')}`, now)
      if (!p.type) return p
      return bundle(y, p.type, p.q, p.offset, now, 'browser', p.cursor)
    }
    return bundle(y, type, q, 0, now, 'browser')
  })

// ---------- builders for the labs (they change y in place) ----------

export function seedKey(y, { alias, kid = alias, t = 0, jwks = false }) {
  const k = { alias, kid, thumb: thumbOf(`${alias}${t}`), t, jwks }
  y.keystore.push(k)
  return k
}
export function seedApp(y, { name, scopes = [], kids = [], jwksUrl = '', t = 0 }) {
  const a = { clientId: uuidOf(`np${name}${t}`), prodId: uuidOf(`pr${name}${t}`), name, audience: 'Backend Systems', scopes, keys: [], jwksUrl, t, by: 'brightmart.integration' }
  for (const kid of kids) {
    const k = y.keystore.find((x) => x.kid === kid)
    if (k) a.keys.push({ kid, thumb: k.thumb, alg: 'RS384', t })
  }
  y.apps.push(a)
  return a
}

// ---------- helpers for the sample apps (import free, so a package may use them) ----------

export const epicConfig = (p) => ({
  tokenUrl: p['epic.tokenUrl'],
  clientId: p['epic.clientId'],
  kid: p['epic.jwt.kid'],
  keyAlias: p['epic.jwt.keyAlias'],
  alg: p['epic.jwt.alg'] || 'RS384',
  expSeconds: Number(p['epic.jwt.expSeconds'] || MAX_EXP),
  scope: p['epic.scopes'] ?? '',
  keystorePassword: p['epic.keystore.password'],
})
// lab-made: the HTTP connector has no own error type for 409, 410 and 422, so the lab reports them as BAD_REQUEST
const HTTP_ERRORS = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED', 410: 'BAD_REQUEST', 422: 'BAD_REQUEST', 429: 'TOO_MANY_REQUESTS', 409: 'BAD_REQUEST' }
const REASON = { 400: 'bad request', 401: 'unauthorized', 403: 'forbidden', 404: 'not found', 405: 'method not allowed', 409: 'conflict', 410: 'gone', 422: 'unprocessable entity', 429: 'too many requests' }
// the Mule error type and message of the HTTP Request operation for an answer of Epic
export const httpErrorType = (status) => (status === 0 ? 'MULE:UNKNOWN' : `HTTP:${HTTP_ERRORS[status] ?? 'INTERNAL_SERVER_ERROR'}`)
export const httpFailText = (method, url, status) => `HTTP ${method} on resource '${url}' failed: ${REASON[status] ?? 'internal server error'} (${status}).`
export const BASE_URL = BASE

// A bearer token for an app: the cached one while it has more than a minute left and the config is the same, or a new
// one from the token endpoint. `keep` is what the app puts in its object store.
export function bearer(epic, cfg, cached, now) {
  const key = `${word(cfg.clientId)}|${word(cfg.kid)}|${word(cfg.scope)}`
  if (cached?.key === key && cached.exp - now > MINUTE) return { ok: true, token: cached.at, scope: cached.scope, cached: true, keep: cached }
  const r = epic.token(cfg)
  if (!r.ok) return { ok: false, r }
  return { ok: true, token: r.body.access_token, scope: r.body.scope, keep: { key, at: r.body.access_token, scope: r.body.scope, exp: now + r.body.expires_in * 1000 } }
}
// the log lines and error of a failed token call, the way the HTTP Request operation reports it
export const tokenFailure = (r) =>
  r.status === 0 || r.status === 404
    ? { type: r.status === 404 ? 'HTTP:NOT_FOUND' : 'MULE:UNKNOWN', message: r.status === 404 ? httpFailText('POST', TOKEN_URL, 404) : r.error, body: '' }
    : { type: httpErrorType(r.status), message: httpFailText('POST', TOKEN_URL, r.status), body: JSON.stringify(r.body) }

// What a sample app does with a search: the first page, then link next while `follow` is on. On a 429 it waits the
// Retry-After and tries again up to `tries` times when `retry429` is on. Gives every entry, the total of the Bundle,
// or the failed answer with its URL.
export function searchAll(epic, token, type, params, { follow = true, retry429 = false, tries = 3 } = {}) {
  const out = { ok: true, entries: [], total: 0, pages: 0, retries: 0, waited: 0 }
  const attempt = (fn) => {
    for (let n = 0; ; n++) {
      const r = fn()
      if (r.status !== 429 || !retry429 || n >= tries) return r
      const wait = Math.max(1, Number(r.headers?.['Retry-After']) || 1)
      epic.wait(wait)
      out.retries++
      out.waited += wait
    }
  }
  const q = paramsOf(params)
  let url = `${BASE}/${type}?${queryText(q)}`
  let r = attempt(() => epic.search(token, type, q))
  for (;;) {
    if (!r.ok) return { ...out, ok: false, status: r.status, url, body: r.body, retryAfter: r.headers?.['Retry-After'] }
    out.pages++
    out.total = r.body.total ?? out.total
    out.entries.push(...(r.body.entry ?? []).map((e) => e.resource))
    const nextUrl = (r.body.link ?? []).find((l) => l.relation === 'next')?.url
    if (!follow || !nextUrl) return out
    url = nextUrl
    r = attempt(() => epic.next(token, nextUrl))
  }
}
// the placeholder the open console seeds: tiny; fillEpic builds the system on first use
export const defaultEpic = (now) => ({ created: now })
