// API Governance: rulesets from Exchange, governance profiles and the conformance of each API version. Pure and import
// free. Lives in state.governance. The rules run over the model that src/raml/parse.js makes, so every function that
// needs a model takes the parser as an argument (parse = parseRaml) and this file keeps no import.
//
// How the lab follows Anypoint API Governance:
// - The rulesets carry the names of the MuleSoft rulesets in Exchange. Their rules here are a small lab set written for
//   RAML, not the full Spectral rules of those assets. The severities are lab choices.
// - A profile selects APIs by filter criteria (all APIs, a category or a tag, and lifecycle states), applies rulesets and
//   names who is notified. An API version is Conformant when it breaks no rule with severity error. Warnings and info
//   show as issues and do not change the status. An API that no profile selects is Not validated.
// - The API layer category is read from the asset tags (System, Process, Experience) and, for an asset without those
//   tags, from its name. Real Exchange keeps categories apart from tags.
// - Conformance is computed when it is read. Real Anypoint validates on publish and on a schedule.
// - "Block publishing" is a lab option. In real Anypoint governance reports conformance and the CLI
//   (anypoint-cli-v4 governance:api:validate) fails a pipeline; it does not stop a Design Center publish.
// - Notifications: the lab sends one mail when a profile with notifications is saved. Real Anypoint mails the
//   recipients when the conformance of an API in the profile changes.

export const SEVERITIES = ['error', 'warning', 'info']
export const LAYERS = ['Experience', 'Process', 'System']
export const LIFECYCLE_STATES = ['development', 'stable', 'deprecated']
export const CLI = 'anypoint-cli-v4 governance:api:validate'

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch']
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const list = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x])
const refName = (x) => (isObj(x) ? Object.keys(x)[0] : x)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// ---------- reading the model ----------

const opsOf = (m) => (m?.resources ?? []).flatMap((r) => METHODS.filter((k) => r.methods[k]).map((k) => ({ path: r.path, method: k, op: r.methods[k] ?? {}, raw: r.raw })))
const where = (o, more = '') => `${o.path} ${o.method.toUpperCase()}${more ? `, ${more}` : ''}`
const codesOf = (o, m) => {
  const own = Object.keys(isObj(o.op.responses) ? o.op.responses : {})
  const fromSchemes = list(o.op.securedBy).map(refName).flatMap((n) => Object.keys(m.schemes?.[n]?.describedBy?.responses ?? {}))
  return new Set([...own, ...fromSchemes].map(String))
}
// a body is either one declaration or a map of media types
function bodiesOf(body) {
  if (body === undefined) return []
  if (isObj(body) && Object.keys(body).some((k) => k.includes('/'))) return Object.entries(body).filter(([k]) => k.includes('/'))
  return [['body', body]]
}
function hasExample(decl, types) {
  const typed = (name) => isObj(types?.[name]) && (types[name].example !== undefined || types[name].examples !== undefined)
  if (decl === null || decl === undefined) return false
  if (typeof decl === 'string') return typed(decl)
  if (!isObj(decl)) return false
  return decl.example !== undefined || decl.examples !== undefined || (typeof decl.type === 'string' && typed(decl.type))
}
const segmentsOf = (path) => path.split('/').filter((x) => x && !x.startsWith('{'))
const VERBS = ['get', 'create', 'update', 'delete', 'remove', 'add', 'set', 'fetch', 'retrieve', 'list', 'evaluate', 'calculate', 'compute', 'process', 'send', 'submit', 'cancel', 'approve', 'validate', 'execute', 'make', 'do', 'post', 'put', 'modify', 'change']
const verbIn = (segment) => segment.toLowerCase().split(/[-_]/).find((w) => VERBS.includes(w))
const baseUriOf = (m) => (m.root.baseUri === undefined ? '' : String(m.root.baseUri))
const issue = (location, message) => ({ location, message })

// ---------- rules ----------

const rule = (id, title, severity, text, check) => ({ id, title, severity, text, check })

const ANYPOINT = [
  rule('resource-names-no-verbs', 'Resource paths use nouns, not verbs', 'error', 'A resource is a thing, so a path such as /promotions/evaluate breaks it. The method says what happens.', (m) =>
    (m.resources ?? []).flatMap((r) => segmentsOf(r.path).filter(verbIn).map((x) => issue(r.path, `The segment "${x}" holds the verb "${verbIn(x)}".`)))),
  rule('resource-paths-kebab-case', 'Resource paths use kebab-case', 'warning', 'Lower case words joined by hyphens, such as /purchase-orders.', (m) =>
    (m.resources ?? []).flatMap((r) => segmentsOf(r.path).filter((x) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(x)).map((x) => issue(r.path, `The segment "${x}" is not kebab-case.`)))),
  rule('base-path-major-version', 'The base path holds the major version', 'warning', 'The baseUri ends with the major version, such as /v1, or with {version}.', (m) => {
    const b = baseUriOf(m)
    if (!b) return [issue('baseUri', 'No baseUri is declared, so the base path has no version.')]
    return /\/v\d+(\/|$)|\{version\}/.test(b) ? [] : [issue('baseUri', `${b} has no major version such as /v1 or {version}.`)]
  }),
  rule('operations-declare-errors', 'Operations declare 4xx and 5xx responses', 'warning', 'Each operation declares at least one client error and one server error response, so consumers know what to handle.', (m) =>
    opsOf(m).flatMap((o) => {
      const codes = [...codesOf(o, m)]
      const miss = [!codes.some((c) => /^4\d\d$/.test(c)) && '4xx', !codes.some((c) => /^5\d\d$/.test(c)) && '5xx'].filter(Boolean)
      return miss.length ? [issue(where(o, 'responses'), `No ${miss.join(' and no ')} response is declared.`)] : []
    })),
]

const OWASP = [
  rule('owasp-api2-authentication', 'API2:2019 Broken User Authentication: operations are secured', 'error', 'A security scheme is declared and every operation is secured by it. securedBy with null allows anonymous calls.', (m) => {
    if (!Object.keys(m.schemes ?? {}).length) return [issue('securitySchemes', 'No security scheme is declared, so no operation is protected.')]
    return opsOf(m).flatMap((o) => {
      const s = list(o.op.securedBy)
      if (!s.length) return [issue(where(o, 'securedBy'), 'The operation is not secured by a security scheme.')]
      return s.some((x) => x === null) ? [issue(where(o, 'securedBy'), 'securedBy holds null, so the operation can be called without authentication.')] : []
    })
  }),
  rule('owasp-api2-api5-auth-responses', 'API2:2019 and API5:2019: operations declare 401 and 403', 'error', 'Each operation declares 401 Unauthorized and 403 Forbidden, in the method or in the describedBy of its security scheme.', (m) =>
    opsOf(m).flatMap((o) => {
      const codes = codesOf(o, m)
      const miss = ['401', '403'].filter((c) => !codes.has(c))
      return miss.length ? [issue(where(o, 'responses'), `Declare the ${miss.join(' and ')} response${miss.length > 1 ? 's' : ''}.`)] : []
    })),
  rule('owasp-api7-https', 'API7:2019 Security Misconfiguration: HTTPS only', 'error', 'The API is served over HTTPS only, through an https baseUri or protocols: [HTTPS].', (m) => {
    const b = baseUriOf(m)
    const protocols = list(m.root.protocols).map((x) => String(x).toUpperCase())
    if (/^http:\/\//i.test(b)) return [issue('baseUri', `${b} uses plain http.`)]
    if (protocols.includes('HTTP')) return [issue('protocols', 'protocols allows HTTP.')]
    if (!b && !protocols.length) return [issue('baseUri', 'Neither baseUri nor protocols declare HTTPS.')]
    return []
  }),
  rule('owasp-api4-rate-limit', 'API4:2019 Lack of Resources and Rate Limiting: 429 is declared', 'warning', 'Each operation declares 429 Too Many Requests, so consumers expect a rate limit.', (m) =>
    opsOf(m).filter((o) => !codesOf(o, m).has('429')).map((o) => issue(where(o, 'responses'), 'No 429 response is declared.'))),
]

const HTTPS = [
  rule('https-base-uri', 'The baseUri uses https', 'error', 'The baseUri is declared and starts with https://.', (m) => {
    const b = baseUriOf(m)
    if (!b) return [issue('baseUri', 'No baseUri is declared.')]
    return /^https:\/\//i.test(b) ? [] : [issue('baseUri', `${b} does not use https.`)]
  }),
  rule('https-protocols', 'Declared protocols are HTTPS only', 'error', 'protocols, where given on the API or on a method, lists HTTPS and nothing else.', (m) => {
    const bad = (p) => list(p).some((x) => String(x).toUpperCase() !== 'HTTPS')
    return [
      ...(bad(m.root.protocols) ? [issue('protocols', `protocols is [${list(m.root.protocols).join(', ')}].`)] : []),
      ...opsOf(m).filter((o) => bad(o.op.protocols)).map((o) => issue(where(o, 'protocols'), `protocols is [${list(o.op.protocols).join(', ')}].`)),
    ]
  }),
]

const EXAMPLES = [
  rule('response-examples', 'Response bodies have examples', 'error', 'Every response body has an example, on the body or on its type.', (m) =>
    opsOf(m).flatMap((o) =>
      Object.entries(isObj(o.op.responses) ? o.op.responses : {}).flatMap(([code, r]) =>
        isObj(r) ? bodiesOf(r.body).filter(([, d]) => !hasExample(d, m.types)).map(([media]) => issue(where(o, `${code}${media === 'body' ? '' : ` ${media}`}`), `The ${code} response body has no example.`)) : [],
      ),
    )),
  rule('request-examples', 'Request bodies have examples', 'error', 'Every request body has an example, on the body or on its type.', (m) =>
    opsOf(m).flatMap((o) => bodiesOf(o.op.body).filter(([, d]) => !hasExample(d, m.types)).map(([media]) => issue(where(o, `body${media === 'body' ? '' : ` ${media}`}`), 'The request body has no example.')))),
]

const DOCS = [
  rule('api-title', 'The API has a title', 'error', 'title is declared and not empty.', (m) => (String(m.root.title ?? '').trim() ? [] : [issue('title', 'The API has no title.')])),
  rule('api-description', 'The API has a description', 'warning', 'description at the root says what the API is for.', (m) => (String(m.root.description ?? '').trim() ? [] : [issue('description', 'The API has no description.')])),
  rule('operation-description', 'Every method has a description', 'warning', 'Each method says what it does.', (m) => opsOf(m).filter((o) => !String(o.op.description ?? '').trim()).map((o) => issue(where(o), 'The method has no description.'))),
  rule('resource-description', 'Every resource has a description', 'info', 'Each resource has a description or a displayName.', (m) =>
    (m.resources ?? []).filter((r) => !String(r.raw?.description ?? r.raw?.displayName ?? '').trim()).map((r) => issue(r.path, 'The resource has no description.'))),
]

export const RULESETS = [
  { name: 'Anypoint Best Practices', publisher: 'MuleSoft', text: 'Design rules that MuleSoft recommends for every API.', rules: ANYPOINT },
  { name: 'OWASP API Security Top 10 2019 Checklist', publisher: 'MuleSoft', text: 'Checks the specification for the risks of the OWASP API Security Top 10 of 2019 that a design can show.', rules: OWASP },
  { name: 'HTTPS Enforcement', publisher: 'MuleSoft', text: 'The API is reached over HTTPS only.', rules: HTTPS },
  { name: 'Required Examples', publisher: 'MuleSoft', text: 'Request and response bodies come with examples, so the mocking service and the documentation work.', rules: EXAMPLES },
  { name: 'API Documentation Best Practices', publisher: 'MuleSoft', text: 'The API, its resources and its methods are described.', rules: DOCS },
]
export const rulesetNamed = (name) => RULESETS.find((r) => r.name === name)

// Runs the rulesets over a model. A null model means the specification has errors and cannot be validated.
export function checkSpec(model, rulesets) {
  if (!model) return [{ ruleset: 'Validation', rule: 'valid-spec', title: 'The specification is valid RAML', severity: 'error', location: 'api.raml', message: 'The specification has errors, so the rules cannot run.' }]
  return list(rulesets).flatMap((name) => {
    const set = rulesetNamed(name)
    return (set?.rules ?? []).flatMap((r) => r.check(model).map((x) => ({ ruleset: set.name, rule: r.id, title: r.title, severity: r.severity, ...x })))
  })
}

// parse results by RAML text, so the 37 APIs of the open console are not parsed again on every render
const CACHE = new Map()
export function modelOf(raml, parse) {
  const key = String(raml ?? '')
  if (CACHE.has(key)) return CACHE.get(key)
  const r = parse(key)
  const model = r.errors.some((e) => !e.file) ? null : r.model
  if (CACHE.size > 400) CACHE.clear()
  CACHE.set(key, model)
  return model
}

// ---------- state ----------

const BASELINE = (now) => ({
  id: 'gp-1', name: 'Brightmart API design baseline', description: 'Design rules for every API of Brightmart. Reports only.', criteria: { by: 'all', value: '', lifecycles: ['development', 'stable'] },
  rulesets: ['Anypoint Best Practices', 'Required Examples', 'API Documentation Best Practices'], notify: false, recipients: '', block: false, created: now,
})
export const defaultGovernance = (now) => ({ created: now, nextId: 2, profiles: [BASELINE(now)] })
// labs start with their own profiles
export const emptyGovernance = (now, profiles = []) => ({ created: now, nextId: 1 + profiles.length, profiles })

// A console saved while this module was a placeholder holds { created }: give it the default profiles.
export function upgradeGovernance(s) {
  if (!s?.governance || Array.isArray(s.governance.profiles)) return s
  return { ...s, governance: defaultGovernance(s.governance.created ?? s.clock ?? 0) }
}
export const profilesOf = (s) => (Array.isArray(s?.governance?.profiles) ? s.governance.profiles : [])
export const profileById = (s, id) => profilesOf(s).find((p) => p.id === id)

// ---------- what a profile selects ----------

export const tagsOf = (s, assetId) => [...new Set((s.assets ?? []).filter((a) => a.assetId === assetId).flatMap((a) => a.tags ?? []))]
export function layerOf(s, assetId, name = '') {
  const tags = tagsOf(s, assetId).map((t) => String(t).toLowerCase())
  const tagged = LAYERS.find((l) => tags.includes(l.toLowerCase()))
  if (tagged) return tagged
  const text = `${assetId} ${name || (s.assets ?? []).findLast((a) => a.assetId === assetId)?.name || ''}`
  if (/system|-sys-|sapi/i.test(text)) return 'System'
  if (/process|-prc-|papi/i.test(text)) return 'Process'
  if (/experience|-exp-|eapi/i.test(text)) return 'Experience'
  return ''
}
export function selects(profile, s, asset) {
  const c = profile.criteria ?? {}
  if (c.lifecycles?.length && !c.lifecycles.includes(asset.lifecycle ?? 'stable')) return false
  if (c.by === 'category') return layerOf(s, asset.assetId, asset.name) === c.value
  if (c.by === 'tag') return tagsOf(s, asset.assetId).some((t) => String(t).toLowerCase() === String(c.value ?? '').trim().toLowerCase())
  return true
}
export const criteriaText = (p) => {
  const c = p.criteria ?? {}
  const what = c.by === 'category' ? `Category API layer: ${c.value}` : c.by === 'tag' ? `Tag: ${c.value}` : 'All APIs'
  return `${what}${c.lifecycles?.length ? `, lifecycle ${c.lifecycles.join(' or ')}` : ''}`
}

// ---------- conformance ----------

// The conformance of one API version: one result for each profile that selects it.
export function conformanceOf(s, asset, parse) {
  const profiles = profilesOf(s).filter((p) => selects(p, s, asset))
  if (!profiles.length) return { status: 'Not validated', profiles: [], issues: [], errors: 0, warnings: 0, infos: 0 }
  const model = modelOf(asset.raml, parse)
  const results = profiles.map((p) => {
    const issues = checkSpec(model, p.rulesets)
    return { profile: p, issues, status: issues.some((i) => i.severity === 'error') ? 'Not conformant' : 'Conformant' }
  })
  const seen = new Set()
  const issues = results.flatMap((r) => r.issues).filter((i) => {
    // the message is part of the key: one path can hold two verb segments, two issues at one location
    const k = `${i.rule}|${i.location}|${i.message}`
    return seen.has(k) ? false : (seen.add(k), true)
  })
  const count = (sev) => issues.filter((i) => i.severity === sev).length
  return { status: results.some((r) => r.status === 'Not conformant') ? 'Not conformant' : 'Conformant', profiles: results, issues, errors: count('error'), warnings: count('warning'), infos: count('info') }
}
export const latestOf = (s, assetId) => (s.assets ?? []).findLast((a) => a.assetId === assetId)
export const versionOf = (s, assetId, version) => (s.assets ?? []).find((a) => a.assetId === assetId && a.version === version)

// One row for each asset, for its newest version
export function apiRows(s, parse) {
  const ids = [...new Set((s.assets ?? []).map((a) => a.assetId))]
  return ids.map((id) => {
    const a = latestOf(s, id)
    return { assetId: id, name: a.name, version: a.version, lifecycle: a.lifecycle ?? 'stable', layer: layerOf(s, id, a.name), ...conformanceOf(s, a, parse) }
  })
}
export function totalsOf(rows) {
  const n = (status) => rows.filter((r) => r.status === status).length
  return { conformant: n('Conformant'), notConformant: n('Not conformant'), notValidated: n('Not validated'), governed: rows.length - n('Not validated'), all: rows.length }
}
// The APIs a profile selects, with their status under that profile alone
export function profileRows(s, profile, parse) {
  return [...new Set((s.assets ?? []).map((a) => a.assetId))].map((id) => latestOf(s, id)).filter((a) => selects(profile, s, a)).map((a) => {
    const issues = checkSpec(modelOf(a.raml, parse), profile.rulesets)
    return { assetId: a.assetId, name: a.name, version: a.version, issues, status: issues.some((i) => i.severity === 'error') ? 'Not conformant' : 'Conformant' }
  })
}

// ---------- profiles ----------

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/
export const recipientsOf = (text) => String(text ?? '').split(/[,;\s]+/).filter(Boolean)
function problemsOf(s, input, id) {
  const errors = []
  const name = String(input.name ?? '').trim()
  if (!name) errors.push('Give the profile a name.')
  if (profilesOf(s).some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) errors.push(`A profile named ${name} exists already.`)
  if (!list(input.rulesets).length) errors.push('Select at least one ruleset.')
  for (const r of list(input.rulesets)) if (!rulesetNamed(r)) errors.push(`${r} is not a ruleset in Exchange.`)
  const c = input.criteria ?? {}
  if (c.by === 'category' && !LAYERS.includes(c.value)) errors.push('Choose the value of the API layer category.')
  if (c.by === 'tag' && !String(c.value ?? '').trim()) errors.push('Give the tag to filter by.')
  if (!list(c.lifecycles).length) errors.push('Select at least one lifecycle state.')
  if (input.notify) {
    const to = recipientsOf(input.recipients)
    if (!to.length) errors.push('Add a recipient for the notifications, or turn them off.')
    for (const x of to) if (!EMAIL.test(x)) errors.push(`${x} is not an email address.`)
  }
  return errors
}
const clean = (input) => ({
  name: String(input.name ?? '').trim(), description: String(input.description ?? '').trim(),
  criteria: { by: ['category', 'tag'].includes(input.criteria?.by) ? input.criteria.by : 'all', value: input.criteria?.by === 'all' ? '' : String(input.criteria?.value ?? '').trim(), lifecycles: LIFECYCLE_STATES.filter((x) => list(input.criteria?.lifecycles).includes(x)) },
  rulesets: RULESETS.map((r) => r.name).filter((n) => list(input.rulesets).includes(n)), notify: Boolean(input.notify), recipients: input.notify ? recipientsOf(input.recipients).join(', ') : '', block: Boolean(input.block),
})
function notifyMail(s, p, parse) {
  if (!p.notify || !parse) return s
  const bad = profileRows(s, p, parse).filter((r) => r.status === 'Not conformant')
  const body = bad.length ? `${plural(bad.length, 'API')} of profile ${p.name} are not conformant: ${bad.map((r) => `${r.assetId} ${r.version} (${plural(r.issues.filter((i) => i.severity === 'error').length, 'error')})`).join(', ')}. Open API Governance to see the rules that failed.` : `Every API of profile ${p.name} is conformant.`
  return { ...s, mail: [...(s.mail ?? []), { t: s.clock, to: p.recipients, subject: `API Governance: ${p.name}`, body, source: 'API Governance' }] }
}
export function createProfile(state, input, parse) {
  const s = upgradeGovernance(state)
  const errors = problemsOf(s, input)
  if (errors.length) return { state, errors }
  const g = s.governance ?? emptyGovernance(s.clock)
  const p = { id: `gp-${g.nextId}`, ...clean(input), created: s.clock }
  return { errors, state: notifyMail({ ...s, governance: { ...g, nextId: g.nextId + 1, profiles: [...g.profiles, p] } }, p, parse), id: p.id }
}
export function updateProfile(state, id, input, parse) {
  const s = upgradeGovernance(state)
  const old = profileById(s, id)
  if (!old) return { state, errors: ['The profile does not exist.'] }
  const errors = problemsOf(s, input, id)
  if (errors.length) return { state, errors }
  const p = { ...old, ...clean(input), updated: s.clock }
  return { errors, state: notifyMail({ ...s, governance: { ...s.governance, profiles: s.governance.profiles.map((x) => (x.id === id ? p : x)) } }, p, parse) }
}
export function deleteProfile(state, id) {
  const s = upgradeGovernance(state)
  return { ...s, governance: { ...s.governance, profiles: profilesOf(s).filter((p) => p.id !== id) } }
}

// ---------- the publish gate (a lab option) ----------

// Errors for a Design Center publish that breaks a rule with severity error of a profile that blocks publishing.
// form is the publish form: assetId, name, version, lifecycle. model is the parsed specification.
export function publishGate(state, form, model) {
  const asset = { assetId: form.assetId, name: form.name, lifecycle: form.lifecycle }
  const out = []
  for (const p of profilesOf(state).filter((x) => x.block && selects(x, state, asset))) {
    const bad = checkSpec(model, p.rulesets).filter((i) => i.severity === 'error')
    if (!bad.length) continue
    out.push(`Governance profile ${p.name} blocks publishing (a lab option): ${plural(bad.length, 'issue')} of rules with severity error.`)
    for (const i of bad) out.push(`${i.ruleset}, ${i.title}. ${i.location}: ${i.message}`)
  }
  return [...new Set(out)]
}

// ---------- the CLI ----------

// What anypoint-cli-v4 governance:api:validate prints for an API in a pipeline. The flags and the layout are a lab
// version of the real command; the exit code is the part that matters: not 0 when a rule with severity error fails.
export function cliRun(s, asset, parse) {
  const c = conformanceOf(s, asset, parse)
  const sets = [...new Set(c.profiles.flatMap((r) => r.profile.rulesets))]
  const lines = [`$ ${CLI} --rulesets "${sets.join(',') || 'none'}" ${asset.assetId}-${asset.version}.zip`]
  if (!sets.length) return { code: 0, lines: [...lines, 'No ruleset selects this API, so nothing was validated.', 'Exit code 0'] }
  lines.push(`Validating ${asset.assetId} ${asset.version} against ${plural(sets.length, 'ruleset')}.`)
  for (const i of c.issues) lines.push(`${i.severity.toUpperCase().padEnd(8)}${i.rule}  ${i.location}  ${i.message}`)
  const code = c.errors ? 1 : 0
  lines.push(`Conformance: ${c.status}. ${plural(c.errors, 'error')}, ${plural(c.warnings, 'warning')}, ${c.infos} info.`, `Exit code ${code}`)
  return { code, lines }
}
