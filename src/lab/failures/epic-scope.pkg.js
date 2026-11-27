// The sample application of the epic-scope lab. Imports only platform-log.js and the import free Epic engine, so the
// engine can load it without a cycle. It gives the Harbor Care portal the lab results of a patient from Epic.
import { line, muleError } from '../platform-log.js'
import { bearer, epicConfig, httpErrorType, httpFailText, searchAll, tokenFailure } from '../platform-epic.js'

export const LAB_FEED = 'bayview-labs-feed-papi'
const FLOW = `get:\\patients\\(mrn)\\labs:${LAB_FEED}-config`
const el = {
  token: { flow: FLOW, at: 1, name: 'Request access token', dsl: '<http:request doc:name="Request access token" method="POST" config-ref="Epic_Token_Config" path="/oauth2/token">' },
  patient: { flow: FLOW, at: 2, name: 'Search Patient', dsl: '<http:request doc:name="Search Patient" method="GET" config-ref="Epic_FHIR_Config" path="/Patient">' },
  labs: { flow: FLOW, at: 3, name: 'Search Observation', dsl: '<http:request doc:name="Search Observation" method="GET" config-ref="Epic_FHIR_Config" path="/Observation">' },
}
const fail = (step, r) => {
  const type = httpErrorType(r.status)
  return {
    status: 502,
    ms: 240,
    flow: FLOW,
    error: type,
    log: [muleError({ ...step, file: LAB_FEED, type, message: httpFailText('GET', r.url, r.status) }), line('ERROR', `Epic answered: ${JSON.stringify(r.body)}`)],
    body: '{"message":"Bad gateway: Epic refused the request"}',
  }
}

export const PACKAGES = {
  [LAB_FEED]: {
    note: `The lab results API of the Harbor Care portal. GET /patients/{mrn}/labs asks Epic at Bayview Health for an access token with the scopes in epic.scopes (space separated), finds the patient by MRN and reads its Observations of category laboratory, every page. The token request is a SMART backend services JWT signed with the key store alias epic.jwt.keyAlias, kid epic.jwt.kid. Each request takes a new token (lab-made: the API keeps no token cache).`,
    sample: { method: 'GET', path: '/patients/203711/labs' },
    handle(ctx, req) {
      const m = req.path.split('?')[0].match(/^\/patients\/([^/]+)\/labs$/)
      if (req.method !== 'GET' || !m) return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${LAB_FEED}-main`, body: '{"message":"Resource not found"}' }
      const b = bearer(ctx.epic, epicConfig(ctx.props), null, ctx.now)
      if (!b.ok) {
        const f = tokenFailure(b.r)
        return { status: 502, ms: 120, flow: FLOW, error: f.type, log: [muleError({ ...el.token, file: LAB_FEED, type: f.type, message: f.message }), ...(f.body ? [line('ERROR', `Token endpoint answered: ${f.body}`)] : [])], body: '{"message":"Bad gateway: no access token from Epic"}' }
      }
      const p = searchAll(ctx.epic, b.token, 'Patient', { identifier: `MRN|${m[1]}` }, { follow: false })
      if (!p.ok) return fail(el.patient, p)
      const pt = p.entries[0]
      if (!pt) return { status: 404, ms: 160, flow: FLOW, body: JSON.stringify({ message: `No patient with MRN ${m[1]} at Bayview Health` }) }
      const o = searchAll(ctx.epic, b.token, 'Observation', { patient: pt.id, category: 'laboratory' })
      if (!o.ok) return fail(el.labs, o)
      const labs = o.entries.map((x) => ({ code: x.code.coding[0].code, test: x.code.text, value: x.valueQuantity.value, unit: x.valueQuantity.unit, at: x.effectiveDateTime }))
      return { status: 200, ms: 380, flow: FLOW, body: JSON.stringify({ mrn: m[1], patient: pt.name?.[0]?.text, labs }) }
    },
  },
}
