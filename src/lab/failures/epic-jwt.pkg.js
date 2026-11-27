// The sample application of the epic-jwt lab. Imports only platform-log.js and the import free Epic engine, so the
// engine can load it without a cycle. It reads the patients of the Brightmart Care roster from Epic at Bayview Health.
import { info, line, muleError } from '../platform-log.js'
import { BASE_URL, bearer, epicConfig, httpErrorType, httpFailText, searchAll, tokenFailure } from '../platform-epic.js'

export const ROSTER = 'bayview-care-roster-sapi'
export const ROSTER_FLOW = 'roster-refresh-flow'
const el = {
  token: { flow: ROSTER_FLOW, at: 1, name: 'Request access token', dsl: '<http:request doc:name="Request access token" method="POST" config-ref="Epic_Token_Config" path="/oauth2/token">' },
  search: { flow: ROSTER_FLOW, at: 3, name: 'Search Patient', dsl: '<http:request doc:name="Search Patient" method="GET" config-ref="Epic_FHIR_Config" path="/Patient">' },
}
const mrnsOf = (p) => String(p['care.mrns'] ?? '').split(',').map((x) => x.trim()).filter(Boolean)

// reads each patient of the roster. Gives the patients, or the failure with its log lines.
function readRoster(ctx, cached) {
  const { props, now } = ctx
  const b = bearer(ctx.epic, epicConfig(props), cached, now)
  if (!b.ok) {
    const f = tokenFailure(b.r)
    return { ok: false, type: f.type, log: [muleError({ ...el.token, file: ROSTER, type: f.type, message: f.message }), ...(f.body ? [line('ERROR', `Token endpoint answered: ${f.body}`)] : [])] }
  }
  const patients = []
  for (const mrn of mrnsOf(props)) {
    const r = searchAll(ctx.epic, b.token, 'Patient', { identifier: `MRN|${mrn}` }, { follow: false })
    if (!r.ok) {
      const type = httpErrorType(r.status)
      return { ok: false, type, keep: b.keep, log: [muleError({ ...el.search, file: ROSTER, type, message: httpFailText('GET', r.url, r.status) })] }
    }
    const p = r.entries[0]
    patients.push(p ? { mrn, id: p.id, name: p.name?.[0]?.text, birthDate: p.birthDate } : { mrn, missing: true })
  }
  return { ok: true, patients, keep: b.keep, cached: b.cached }
}

export const PACKAGES = {
  [ROSTER]: {
    note: `The roster API of Brightmart Care. GET /roster and the flow ${ROSTER_FLOW} (every 5 minutes) read the patients in care.mrns from Epic at Bayview Health over FHIR R4 (${BASE_URL}). Each token request is a SMART backend services call: a JWT signed with the private key of alias epic.jwt.keyAlias from the key store, with kid epic.jwt.kid in its header, sent to epic.tokenUrl as client epic.clientId. The key store password is the secure property epic.keystore.password. The flow keeps the access token in the object store until a minute before it expires.`,
    sample: { method: 'GET', path: '/roster' },
    schedules: [{ flow: ROSTER_FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      if (req.method !== 'GET' || req.path.split('?')[0] !== '/roster') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${ROSTER}-main`, body: '{"message":"Resource not found"}' }
      const r = readRoster(ctx, null)
      if (!r.ok) return { status: 502, ms: 260, flow: `get:\\roster:${ROSTER}-config`, error: r.type, log: r.log, body: '{"message":"Bad gateway: Epic did not answer the roster request"}' }
      return { status: 200, ms: 420, flow: `get:\\roster:${ROSTER}-config`, body: JSON.stringify({ patients: r.patients }) }
    },
    run: {
      [ROSTER_FLOW]: (ctx) => {
        const r = readRoster(ctx, ctx.store.token)
        if (!r.ok) return { ok: false, ms: 300, errorType: r.type, log: r.log, ...(r.keep && { store: { token: r.keep } }) }
        return {
          ok: true,
          ms: 500,
          log: [info(`Roster refreshed: ${r.patients.filter((p) => !p.missing).length} of ${r.patients.length} patients read from Epic${r.cached ? ' (cached access token)' : ''}`)],
          store: { token: r.keep, roster: r.patients.map((p) => p.mrn), lastOk: ctx.now },
        }
      },
    },
  },
}
