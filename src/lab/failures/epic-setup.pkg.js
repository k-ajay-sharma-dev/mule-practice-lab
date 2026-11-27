// The sample application of the epic-setup lab. Imports only platform-log.js and the import free Epic engine, so the
// engine can load it without a cycle. It syncs the demographics and vital signs of enrolled patients from Epic.
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { bearer, epicConfig, httpErrorType, httpFailText, searchAll, tokenFailure } from '../platform-epic.js'

export const PATIENT_SYNC = 'bayview-patient-sync'
export const SYNC_FLOW = 'patient-sync-flow'
const API = `${PATIENT_SYNC}-config`
const el = {
  token: { flow: SYNC_FLOW, at: 1, name: 'Request access token', dsl: '<http:request doc:name="Request access token" method="POST" config-ref="Epic_Token_Config" path="/oauth2/token">' },
  patient: { flow: SYNC_FLOW, at: 3, name: 'Search Patient', dsl: '<http:request doc:name="Search Patient" method="GET" config-ref="Epic_FHIR_Config" path="/Patient">' },
  vitals: { flow: SYNC_FLOW, at: 4, name: 'Search vital signs', dsl: '<http:request doc:name="Search vital signs" method="GET" config-ref="Epic_FHIR_Config" path="/Observation">' },
}
const OPTS = { follow: true, retry429: true, tries: 3 }
const tokenLog = (flow, r) => {
  const f = tokenFailure(r)
  return { type: f.type, log: [muleError({ ...el.token, flow, file: PATIENT_SYNC, type: f.type, message: f.message }), ...(f.body ? [line('ERROR', `Token endpoint answered: ${f.body}`)] : [])] }
}
const httpLog = (step, flow, r) => {
  const type = httpErrorType(r.status)
  return { type, log: [muleError({ ...step, flow, file: PATIENT_SYNC, type, message: httpFailText('GET', r.url, r.status) }), line('ERROR', `Epic answered: ${JSON.stringify(r.body)}`)] }
}
// one patient by MRN with every page of its vital signs. Gives { patient, vitals } or { missing } or { fail }.
function syncOne(ctx, token, mrn, flow) {
  const p = searchAll(ctx.epic, token, 'Patient', { identifier: `MRN|${mrn}` }, { ...OPTS, follow: false })
  if (!p.ok) return { fail: httpLog(el.patient, flow, p) }
  const pt = p.entries[0]
  if (!pt) return { missing: true }
  const o = searchAll(ctx.epic, token, 'Observation', { patient: pt.id, category: 'vital-signs', _count: '10' }, OPTS)
  if (!o.ok) return { fail: httpLog(el.vitals, flow, o) }
  return { patient: pt, vitals: o.entries, total: o.total, retries: o.retries }
}

export const PACKAGES = {
  [PATIENT_SYNC]: {
    note: `The patient sync of Harbor Care. Every 15 minutes ${SYNC_FLOW} gets a SMART backend services token from epic.tokenUrl as client epic.clientId (a JWT signed with the key store alias epic.jwt.keyAlias, kid epic.jwt.kid, alg epic.jwt.alg, exp epic.jwt.expSeconds; the key store password is the secure property epic.keystore.password; epic.scopes names the scopes, empty means every scope of the app). It keeps the token in the object store, finds each MRN of sync.mrns at epic.fhirBase and reads every page of its vital signs, waiting the Retry-After of a 429. GET /health gets a token and answers UP or DOWN. GET /patients/{mrn} reads one patient now, and answers 404 for an MRN Bayview does not know.`,
    sample: { method: 'GET', path: '/health' },
    boot: needs('epic.tokenUrl', 'epic.fhirBase', 'epic.clientId', 'epic.jwt.keyAlias', 'epic.jwt.kid', 'epic.keystore.password', 'sync.mrns'),
    schedules: [{ flow: SYNC_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/health') {
        const b = bearer(ctx.epic, epicConfig(ctx.props), null, ctx.now)
        if (!b.ok) {
          const f = tokenLog(`get:\\health:${API}`, b.r)
          return { status: 503, ms: 140, flow: `get:\\health:${API}`, error: f.type, log: f.log, body: '{"status":"DOWN","epic":"Token request failed"}' }
        }
        return { status: 200, ms: 190, flow: `get:\\health:${API}`, body: JSON.stringify({ status: 'UP', epic: { token: 'OK', scope: b.scope } }) }
      }
      const m = path.match(/^\/patients\/([^/]+)$/)
      if (req.method !== 'GET' || !m) return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${PATIENT_SYNC}-main`, body: '{"message":"Resource not found"}' }
      const flow = `get:\\patients\\(mrn):${API}`
      const b = bearer(ctx.epic, epicConfig(ctx.props), null, ctx.now)
      if (!b.ok) {
        const f = tokenLog(flow, b.r)
        return { status: 502, ms: 140, flow, error: f.type, log: f.log, body: '{"message":"Bad gateway: no access token from Epic"}' }
      }
      const r = syncOne(ctx, b.token, m[1], flow)
      if (r.fail) return { status: 502, ms: 300, flow, error: r.fail.type, log: r.fail.log, body: '{"message":"Bad gateway: Epic refused the request"}' }
      if (r.missing) return { status: 404, ms: 180, flow, log: [warn(`Patient ${m[1]}: Bayview Health has no patient with this MRN. Answered 404`)], body: JSON.stringify({ message: `No patient with MRN ${m[1]} at Bayview Health` }) }
      const last = r.vitals[0]
      return { status: 200, ms: 420, flow, body: JSON.stringify({ mrn: m[1], name: r.patient.name?.[0]?.text, birthDate: r.patient.birthDate, vitalSigns: r.vitals.length, latest: last ? { test: last.code.text, value: last.valueQuantity.value, unit: last.valueQuantity.unit, at: last.effectiveDateTime } : null }) }
    },
    run: {
      [SYNC_FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const b = bearer(ctx.epic, epicConfig(props), store.token, now)
        if (!b.ok) {
          const f = tokenLog(SYNC_FLOW, b.r)
          return { ok: false, ms: 200, errorType: f.type, log: f.log }
        }
        const patients = { ...(store.patients ?? {}) }
        const log = []
        let missing = 0
        for (const mrn of String(props['sync.mrns'] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
          const r = syncOne(ctx, b.token, mrn, SYNC_FLOW)
          if (r.fail) return { ok: false, ms: 300 + ctx.epic.elapsed(), errorType: r.fail.type, log: [...log, ...r.fail.log], store: { token: b.keep, patients } }
          if (r.missing) {
            missing++
            log.push(warn(`Patient ${mrn}: Bayview Health has no patient with this MRN`))
            continue
          }
          patients[mrn] = { id: r.patient.id, name: r.patient.name?.[0]?.text, vitals: r.vitals.length, total: r.total, t: now }
          log.push(info(`Patient ${mrn}: ${r.vitals.length} of ${r.total} vital signs synced${r.retries ? `, ${r.retries} ${r.retries === 1 ? 'retry' : 'retries'} after 429` : ''}`))
        }
        log.push(info(`Sync done: ${Object.values(patients).filter((p) => p.t === now).length} patients${missing ? `, ${missing} MRN not found` : ''}${b.cached ? ' (cached access token)' : ''}`))
        return { ok: missing === 0, ms: 400 + ctx.epic.elapsed(), errorType: missing ? 'APP:PATIENT_NOT_FOUND' : null, log, store: { token: b.keep, patients, lastOk: now } } // lab-made error type
      },
    },
  },
}
