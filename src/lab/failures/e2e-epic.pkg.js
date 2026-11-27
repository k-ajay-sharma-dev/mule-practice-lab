// The sample application of the e2e-epic lab. Imports only platform-log.js and the import free Epic engine.
// The care roster sync of Brightmart Care: it reads the enrolled MRNs from the care database, finds each patient at Bayview
// Health over FHIR R4 with a SMART backend services token, reads every page of the vital signs, and upserts one row per
// patient into dbo.care_patients. An MRN that Bayview does not know is marked NOT_FOUND in dbo.care_enrollments, so it is
// kept for a person to fix and the next run picks it up again.
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { BASE, bearer, epicConfig, httpErrorType, httpFailText, PROD_BASE, PROD_TOKEN_URL, searchAll, tokenFailure, TOKEN_URL } from '../platform-epic.js'

export const ROSTER = 'bvh-care-roster-sync'
export const ASSET = 'care-roster-system-api'
export const FLOW = 'roster-sync-flow'
// lab-made: the Database connector reaches a server of the lab by its host name
export const DB_HOSTS = { 'care-sql.brightmart.lab': 'care-sql', 'care-sql-prd.brightmart.lab': 'care-sql-prd' }
export const SEX = { female: 'F', male: 'M', other: 'O', unknown: 'U' }
const API = `${ASSET}-config`
const word = (v) => String(v ?? '').trim()
const json = (x) => JSON.stringify(x)
const el = {
  token: { at: 1, name: 'Request access token', dsl: '<http:request doc:name="Request access token" method="POST" config-ref="Epic_Token_Config" path="/oauth2/token">' },
  enrolled: { at: 2, name: 'Select enrollments', dsl: '<db:select doc:name="Select enrollments" config-ref="Care_Database_Config">' },
  patient: { at: 4, name: 'Search Patient', dsl: '<http:request doc:name="Search Patient" method="GET" config-ref="Epic_FHIR_Config" path="/Patient">' },
  vitals: { at: 5, name: 'Search vital signs', dsl: '<http:request doc:name="Search vital signs" method="GET" config-ref="Epic_FHIR_Config" path="/Observation">' },
  upsert: { at: 7, name: 'Upsert care patient', dsl: '<db:update doc:name="Upsert care patient" config-ref="Care_Database_Config">' },
}
const hash = (text) => {
  let h = 2166136261
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h.toString(16).padStart(8, '0')
}
// the correlation ID that a scheduler run gets, in the shape the platform gives a request
export const runCid = (now) => `${hash(`roster${now}`)}-c7a1-11f1`
export const dbOf = (p) => ({ host: word(p['db.host']), port: word(p['db.port']) || '1433', database: word(p['db.database']), user: word(p['db.user']), password: p['db.password'], maxPoolSize: 2 })
const serverOf = (p) => DB_HOSTS[word(p['db.host']).toLowerCase()] ?? word(p['db.host'])
// the token endpoint and the FHIR base must be the same side of Bayview (lab-made check of the app)
const sideOk = (p) => (word(p['epic.tokenUrl']) === PROD_TOKEN_URL ? word(p['epic.fhirBase']) === PROD_BASE : word(p['epic.fhirBase']) === BASE)

// One run: every enrolled MRN. `tag` puts the correlation ID in front of a log line of a scheduler run.
export function sync(ctx, flow, tag = (t) => t) {
  const { props: p, store, now } = ctx
  const fail = (step, type, message, extra = []) => ({ ok: false, ms: 300 + ctx.epic.elapsed(), errorType: type, log: [muleError({ ...el[step], flow, file: ROSTER, type, message: tag(message) }), ...extra] })
  if (![BASE, PROD_BASE].includes(word(p['epic.fhirBase']))) return fail('patient', 'HTTP:CONNECTIVITY', `HTTP GET on resource '${word(p['epic.fhirBase'])}/Patient' failed: Couldn't connect. java.net.UnknownHostException`)
  const b = bearer(ctx.epic, epicConfig(p), store.token, now)
  if (!b.ok) {
    const f = tokenFailure(b.r)
    return fail('token', f.type, f.message, f.body ? [line('ERROR', tag(`Token endpoint answered: ${f.body}`))] : [])
  }
  if (!sideOk(p)) return { ...fail('patient', 'HTTP:UNAUTHORIZED', httpFailText('GET', `${word(p['epic.fhirBase'])}/Patient`, 401), [line('ERROR', tag('Epic answered: invalid_token. The token comes from the other side of Bayview'))]), store: { token: b.keep } }
  const db = dbOf(p)
  const srv = serverOf(p)
  const rows = ctx.db.select(srv, db, 'SELECT mrn, status FROM dbo.care_enrollments', {})
  if (!rows.ok) return { ...fail('enrolled', rows.errorType ?? 'DB:CONNECTIVITY', rows.text ?? 'Could not read dbo.care_enrollments'), store: { token: b.keep } }
  const log = [info(tag(`Roster sync started: ${rows.rows.length} enrollments in dbo.care_enrollments`))]
  const size = word(p['sync.pageSize']) || '10'
  const done = []
  const missing = []
  for (const r of rows.rows.filter((x) => ['ENROLLED', 'SYNCED'].includes(word(x.status).toUpperCase()))) {
    const mrn = word(r.mrn)
    const pt = searchAll(ctx.epic, b.token, 'Patient', { identifier: `MRN|${mrn}` }, { follow: false, retry429: true })
    if (!pt.ok) return { ...fail('patient', httpErrorType(pt.status), httpFailText('GET', pt.url, pt.status), [line('ERROR', tag(`Epic answered: ${json(pt.body)}`))]), store: { token: b.keep } }
    const res = pt.entries[0]
    if (!res) {
      ctx.db.update(srv, db, 'UPDATE dbo.care_enrollments SET status = :status, note = :note WHERE mrn = :mrn', { status: 'NOT_FOUND', note: 'No patient with this MRN at Bayview Health', mrn })
      missing.push(mrn)
      log.push(warn(tag(`Patient ${mrn}: Bayview Health has no patient with this MRN. Enrollment marked NOT_FOUND for the care team`)))
      continue
    }
    const vit = searchAll(ctx.epic, b.token, 'Observation', { patient: res.id, category: 'vital-signs', _count: size }, { follow: true, retry429: true })
    if (!vit.ok) return { ...fail('vitals', httpErrorType(vit.status), httpFailText('GET', vit.url, vit.status), [line('ERROR', tag(`Epic answered: ${json(vit.body)}`))]), store: { token: b.keep } }
    const hr = vit.entries.filter((o) => o.code?.coding?.[0]?.code === '8867-4').sort((x, y) => String(y.effectiveDateTime).localeCompare(String(x.effectiveDateTime)))[0]
    // the DataWeave mapping of the lab: FHIR Patient and Observation to one row of dbo.care_patients
    const row = { mrn, epic_id: res.id, family_name: res.name?.[0]?.family ?? '', given_name: (res.name?.[0]?.given ?? []).join(' '), birth_date: res.birthDate ?? null, sex: SEX[res.gender] ?? 'U', vital_signs: vit.entries.length, last_heart_rate: hr?.valueQuantity?.value ?? null, synced_at: new Date(Date.UTC(2026, 10, 2) + now).toISOString().slice(0, 19).replace('T', ' ') }
    const up = ctx.db.update(srv, db, 'UPDATE dbo.care_patients SET epic_id = :epic_id, family_name = :family_name, given_name = :given_name, birth_date = :birth_date, sex = :sex, vital_signs = :vital_signs, last_heart_rate = :last_heart_rate, synced_at = :synced_at WHERE mrn = :mrn', row)
    const ins = up.ok && up.affected === 0 ? ctx.db.insert(srv, db, 'INSERT INTO dbo.care_patients (mrn, epic_id, family_name, given_name, birth_date, sex, vital_signs, last_heart_rate, synced_at) VALUES (:mrn, :epic_id, :family_name, :given_name, :birth_date, :sex, :vital_signs, :last_heart_rate, :synced_at)', row) : up
    if (!ins.ok) return { ...fail('upsert', ins.errorType ?? 'DB:QUERY_EXECUTION', ins.text ?? 'The upsert failed'), store: { token: b.keep } }
    if (word(r.status).toUpperCase() !== 'SYNCED') ctx.db.update(srv, db, 'UPDATE dbo.care_enrollments SET status = :status, note = :note WHERE mrn = :mrn', { status: 'SYNCED', note: null, mrn })
    done.push(mrn)
    log.push(info(tag(`Patient ${mrn} (${row.given_name} ${row.family_name}): ${vit.entries.length} of ${vit.total} vital signs in ${vit.pages} page${vit.pages === 1 ? '' : 's'}${vit.retries ? `, ${vit.retries} wait after 429` : ''}. ${up.affected ? 'Updated' : 'Inserted'} in dbo.care_patients`)))
  }
  const skipped = rows.rows.filter((x) => word(x.status).toUpperCase() === 'NOT_FOUND').length - missing.length
  log.push(info(tag(`Roster sync done: ${done.length} upserted, ${missing.length} not found${skipped > 0 ? `, ${skipped} waiting for a fix (NOT_FOUND)` : ''}${b.cached ? ', cached access token' : ''}`)))
  const last = { t: now, synced: done, missing }
  // lab-made error type: the run counts as failed while an MRN is not found, so Message Error Count shows it
  return { ok: missing.length === 0, ms: 400 + ctx.epic.elapsed(), errorType: missing.length ? 'APP:PATIENT_NOT_FOUND' : null, errors: missing.length, log, store: { token: b.keep, last } }
}

export const PACKAGES = {
  [ROSTER]: {
    note: `The care roster sync of Brightmart Care, built on ${ASSET}. Every 15 minutes ${FLOW}, and POST /sync at once, reads dbo.care_enrollments (db.host, db.port, db.database, db.user, secure db.password), gets a SMART backend services token from epic.tokenUrl as epic.clientId (JWT signed with key store alias epic.jwt.keyAlias, kid epic.jwt.kid, secure epic.keystore.password), finds each MRN at epic.fhirBase, follows link next through the vital signs (sync.pageSize per page) and upserts dbo.care_patients. GET /patients/{mrn} reads the row back. An unknown MRN is marked NOT_FOUND.`,
    sample: { method: 'POST', path: '/sync' },
    traced: true,
    boot: needs('epic.tokenUrl', 'epic.fhirBase', 'epic.clientId', 'epic.jwt.keyAlias', 'epic.jwt.kid', 'epic.keystore.password', 'db.host', 'db.database', 'db.user', 'db.password'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      if (req.method === 'POST' && path === '/sync') {
        const r = sync(ctx, `post:\\sync:${API}`)
        if (r.store) ctx.app.store = { ...ctx.app.store, ...r.store }
        const last = r.store?.last
        if (!last) return { status: 502, ms: r.ms, flow: `post:\\sync:${API}`, error: r.errorType, log: r.log, body: json({ message: 'The sync failed. Read the log of the correlation ID' }) }
        return { status: 200, ms: r.ms, flow: `post:\\sync:${API}`, log: r.log, body: json({ upserted: last.synced, notFound: last.missing }) }
      }
      const m = path.match(/^\/patients\/([^/]+)$/)
      if (req.method === 'GET' && m) {
        const flow = `get:\\patients\\(mrn):${API}`
        const r = ctx.db.select(serverOf(ctx.props), dbOf(ctx.props), 'SELECT * FROM dbo.care_patients WHERE mrn = :mrn', { mrn: m[1] })
        if (!r.ok) return { status: 500, ms: 40, flow, error: r.errorType, log: [muleError({ ...el.upsert, flow, file: ROSTER, type: r.errorType, message: r.text })], body: json({ message: 'The care database failed' }) }
        if (!r.rows.length) return { status: 404, ms: 20, flow, body: json({ message: `No care patient with MRN ${m[1]}` }) }
        return { status: 200, ms: 25, flow, body: json(r.rows[0]) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${ASSET}-main`, body: json({ message: 'Resource not found' }) }
    },
    run: {
      [FLOW]: (ctx) => {
        const cid = runCid(ctx.now)
        return sync(ctx, FLOW, (t) => `event:${cid} ${t}`)
      },
    },
  },
}
