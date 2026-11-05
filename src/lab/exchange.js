// Simulates Anypoint Exchange asset versions on a virtual day counter.
// Pure: every action returns { state, outcome } and never changes the state it was given.
// Facts come from the Exchange pages; what those pages do not state carries `basis: 'assumed'`,
// and a rule that is documented but needs a lab decision to run carries an `assumption` sentence.
const DOCS = 'https://docs.mulesoft.com/exchange/'

export const GROUP_ID = 'lab-org-id' // sample organization ID
export const HARD_DELETE_DAYS = 7
export const MAX_GAV_LENGTH = 215
export const LIFECYCLE_STATES = ['development', 'stable', 'deprecated']
export const VERSION_ORDERS = ['MAJOR', 'MINOR', 'PATCH']

const PROMOTIONS = { development: ['stable'], stable: ['deprecated'], deprecated: ['stable'] }

export const PUBLISH_METHODS = [
  { id: 'portal', name: 'Exchange portal (Publish new asset)' },
  { id: 'api', name: 'Exchange API v2' },
  { id: 'maven', name: 'Maven (Exchange Maven Facade API)' },
]

export const ROLES = [
  { id: 'admin', name: 'Exchange Administrators' },
  { id: 'contributor', name: 'Exchange Contributors' },
  { id: 'viewer', name: 'Exchange Viewers' },
  { id: 'connected-creator', name: 'Connected app with Exchange Creator' },
]

// The asset types page lists these. maven: named on the Maven publishing page. portal: named in the Publish new
// asset dialog row of the creation methods table, or given a Publish new asset procedure on that page.
// api: has a consumer-facing API version.
export const ASSET_TYPES = [
  { id: 'rest-api', name: 'REST API', portal: true, api: true },
  { id: 'soap-api', name: 'SOAP API', portal: true, api: true },
  { id: 'http-api', name: 'HTTP API', portal: true, api: true },
  { id: 'async-api', name: 'AsyncAPI specification', portal: true, api: true },
  { id: 'graphql-api', name: 'GraphQL API', portal: true, api: true },
  { id: 'grpc-api', name: 'gRPC API', portal: true, api: true },
  { id: 'api-group', name: 'API Group' },
  { id: 'api-fragment', name: 'API Spec Fragment', portal: true },
  { id: 'connector', name: 'Connector', maven: true },
  { id: 'template', name: 'Template', maven: true },
  { id: 'example', name: 'Example', maven: true },
  { id: 'policy', name: 'Policy', portal: true, maven: true },
  { id: 'mule-application', name: 'Mule Application', maven: true, hidden: true },
  { id: 'custom', name: 'Custom', portal: true, maven: true },
  { id: 'dataweave-library', name: 'DataWeave Library' },
  { id: 'ruleset', name: 'Ruleset', portal: true },
  { id: 'rpa-template', name: 'RPA Template' },
  { id: 'agent', name: 'Agent', portal: true },
  { id: 'agent-network', name: 'Agent Network' },
  { id: 'llm', name: 'LLM', portal: true },
  { id: 'mcp-server', name: 'MCP Server', portal: true },
]

const SEVEN_DAY_NOTE =
  'The docs do not say whether the seven days run from publication or from promotion to stable. The lab counts from publication and treats day 7 as past the first seven days.'
const NEXT_VERSION_NOTE = 'The lab increments the highest version ever used, including reserved ones.'

export const typeOf = (id) => ASSET_TYPES.find((t) => t.id === id)
export const gav = (assetId, version) => `${GROUP_ID}:${assetId}:${version}`
export const isSnapshot = (version) => String(version).endsWith('-SNAPSHOT')
export const parseDependencies = (text) =>
  String(text ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
const words = (text) =>
  String(text ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/
export const isSemver = (version) => SEMVER.test(String(version))
const numbers = (version) => String(version).split(/[-+]/)[0].split('.').map(Number)

export function compareVersions(a, b) {
  const [x, y] = [numbers(a), numbers(b)]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

const accepted = (title, cause, extra = {}) => ({ ok: true, title, cause, fix: null, basis: 'docs', ...extra })
const refused = (title, cause, fix, extra = {}) => ({ ok: false, title, cause, fix, basis: 'docs', docs: `${DOCS}asset-versions`, ...extra })

const record = (fields) => ({
  apiVersion: '',
  dependencies: [],
  keywords: [],
  tags: [],
  file: 'sample-file.zip',
  instances: 0,
  appliedPolicies: 0,
  stale: false,
  method: 'api',
  ...fields,
})

export const emptyState = () => ({ day: 0, gavReuse: false, versions: [], reserved: [], activity: [] })

// sample catalogue: every entry sets up one exercise and is not taken from a real organization
export const newState = () => ({
  ...emptyState(),
  versions: [
    record({ assetId: 'common-types', name: 'Common Types', typeId: 'api-fragment', version: '1.0.0', lifecycle: 'development', publishedDay: -3 }),
    record({ assetId: 'orders-api', name: 'Orders API', typeId: 'rest-api', version: '1.0.0', apiVersion: 'v1', lifecycle: 'development', publishedDay: -2, dependencies: ['common-types:1.0.0'] }),
    record({ assetId: 'customer-sapi', name: 'Customer SAPI', typeId: 'rest-api', version: '3.4.0', apiVersion: 'v3', lifecycle: 'stable', publishedDay: -35 }),
    record({ assetId: 'common-errors', name: 'Common Errors', typeId: 'api-fragment', version: '1.0.0', lifecycle: 'stable', publishedDay: -60 }),
    record({ assetId: 'payments-api', name: 'Payments API', typeId: 'rest-api', version: '1.3.0', apiVersion: 'v1', lifecycle: 'stable', publishedDay: -2, instances: 1, dependencies: ['common-errors:1.0.0'] }),
    record({ assetId: 'header-guard', name: 'Header Guard', typeId: 'policy', version: '1.0.0', lifecycle: 'stable', publishedDay: -20, method: 'maven', appliedPolicies: 1 }),
    record({ assetId: 'orders-app', name: 'orders-app', typeId: 'mule-application', version: '2.3.0', lifecycle: 'stable', publishedDay: -9, method: 'maven' }),
  ],
})

export const findVersion = (state, assetId, version) => state.versions.find((v) => v.assetId === assetId && v.version === version)
export const findReserved = (state, assetId, version) => state.reserved.find((r) => r.assetId === assetId && r.version === version)
export const versionsOf = (state, assetId) => state.versions.filter((v) => v.assetId === assetId).sort((a, b) => compareVersions(b.version, a.version))
export const dependentsOf = (state, assetId, version) => state.versions.filter((v) => v.dependencies.includes(`${assetId}:${version}`))
export const ageOf = (state, version) => state.day - version.publishedDay

export function assets(state) {
  const ids = [...new Set(state.versions.map((v) => v.assetId))].sort()
  return ids.map((assetId) => {
    const versions = versionsOf(state, assetId)
    return { assetId, name: versions[0].name, typeId: versions[0].typeId, versions }
  })
}

// Where a version can be seen or consumed, from the lifecycle and asset types pages.
export function visibility(version) {
  const development = version.lifecycle === 'development'
  const type = typeOf(version.typeId)
  return [
    { where: 'Exchange catalog', shown: !type.hidden, why: type.hidden ? 'Mule applications do not appear in the Exchange UI.' : 'Listed.', basis: 'docs' },
    { where: 'Public portal', shown: !development, why: development ? 'Not shown while in development.' : 'Can be added by an administrator.', basis: 'docs' },
    { where: 'Studio and API Manager', shown: !development, why: development ? 'Products other than Exchange do not consume development versions.' : 'Can be consumed.', basis: 'docs' },
    {
      where: 'Maven',
      shown: !development || isSnapshot(version.version),
      why: development && !isSnapshot(version.version) ? 'A development version that is not a SNAPSHOT cannot be consumed through Maven.' : 'Can be consumed.',
      basis: 'docs',
    },
  ]
}

export function nextAvailableVersion(state, assetId, order = 'PATCH') {
  const used = [...state.versions.filter((v) => v.assetId === assetId), ...state.reserved.filter((r) => r.assetId === assetId)].map((v) => v.version)
  const taken = new Set(used)
  const released = used.filter((v) => !isSnapshot(v)).sort(compareVersions)
  if (released.length === 0) return '1.0.0'
  let [major, minor, patch] = numbers(released.at(-1))
  let candidate
  do {
    if (order === 'MAJOR') [major, minor, patch] = [major + 1, 0, 0]
    if (order === 'MINOR') [minor, patch] = [minor + 1, 0]
    if (order === 'PATCH') patch += 1
    candidate = `${major}.${minor}.${patch}`
  } while (taken.has(candidate))
  return candidate
}

export const nextVersionNote = NEXT_VERSION_NOTE

function log(state, outcome) {
  state.activity = [{ day: state.day, text: outcome.title, ok: outcome.ok, basis: outcome.basis }, ...state.activity].slice(0, 30)
  return { state, outcome }
}

const unchanged = (state, outcome) => ({ state, outcome })

function methodProblem(type, input) {
  const snapshot = isSnapshot(input.version)
  if (input.method === 'maven' && !type.maven) {
    return refused(
      'Maven does not publish this asset type in the lab',
      `The Maven publishing page names connectors, Mule applications, examples, templates, policies and custom assets. ${type.name} is not among them.`,
      'Publish with the Exchange API, or with the Exchange portal where the type allows it.',
      { basis: 'assumed', docs: `${DOCS}to-publish-assets-maven` },
    )
  }
  if (input.method === 'portal' && !type.portal) {
    return refused(
      'The Publish new asset dialog does not create this type in the lab',
      `The creation methods table does not list ${type.name} under the Publish new asset dialog.`,
      'Use Maven or the Exchange API.',
      { basis: 'assumed' },
    )
  }
  if (snapshot && input.method !== 'maven') {
    return refused(
      'SNAPSHOT versions are a Maven feature in the lab',
      'The docs describe SNAPSHOT versions only for the Exchange Maven Facade API. To iterate from the portal or the API, choose the development state with a normal version.',
      'Publish with Maven, or remove -SNAPSHOT and set the lifecycle state to development.',
      { basis: 'assumed' },
    )
  }
  return null
}

function apiVersionProblem(state, type, input) {
  if (!type.api) return null
  if (!String(input.apiVersion ?? '').trim()) {
    return refused('API version is required', 'An API asset needs an API version, the consumer-facing version shown on its detail screen.', 'Enter an API version such as v1.', { docs: `${DOCS}to-change-raml-version` })
  }
  const others = state.versions.filter((v) => v.assetId === input.assetId && v.version !== input.version)
  const major = numbers(input.version)[0]
  const sameMajor = others.find((v) => numbers(v.version)[0] === major)
  const fix = 'Keep the API version for minor and patch updates. Raise it together with a new major version.'
  if (sameMajor && sameMajor.apiVersion !== input.apiVersion) {
    return refused('Version and API version do not agree', `Version ${input.version} is a minor or patch update of ${sameMajor.version}, which has API version ${sameMajor.apiVersion}. The API version must not change.`, fix, { docs: `${DOCS}to-change-raml-version` })
  }
  const otherMajor = others.find((v) => numbers(v.version)[0] !== major && v.apiVersion === input.apiVersion)
  if (otherMajor) {
    return refused('Version and API version do not agree', `Version ${input.version} is a new major version, so the API version must also increase. ${otherMajor.version} already uses ${input.apiVersion}.`, fix, { docs: `${DOCS}to-change-raml-version` })
  }
  return null
}

function dependencyProblem(state, dependencies, lifecycle) {
  for (const dependency of dependencies) {
    const at = dependency.lastIndexOf(':')
    const found = at > 0 ? findVersion(state, dependency.slice(0, at), dependency.slice(at + 1)) : undefined
    if (!found) {
      return refused('Dependency not found', `${dependency} is not an asset version in this catalogue. Write a dependency as assetId:version.`, 'Publish the dependency first, or correct the reference.', { basis: 'assumed' })
    }
    if (lifecycle !== 'development' && found.lifecycle === 'development') {
      return refused(
        'A stable asset cannot depend on a development asset',
        `${dependency} is in the development state, so a stable version cannot add it as a dependency.`,
        'Promote the dependency to stable first, or publish this version in the development state.',
        { docs: `${DOCS}lifecycle` },
      )
    }
  }
  return null
}

const lifecycleFor = (input) => {
  if (input.method !== 'maven') return input.lifecycle ?? 'stable'
  return isSnapshot(input.version) && (input.facade ?? 3) === 3 ? 'development' : 'stable'
}

function conflictWithExisting(existing, input) {
  const maven = input.method === 'maven'
  return refused(
    '409 Conflict: this version already exists',
    `${input.assetId} ${input.version} is ${existing.lifecycle}. Only a development version can be republished with the same group ID, asset ID and version.`,
    `Publish a new version such as the next patch. ${existing.lifecycle === 'stable' ? 'Deleting it does not help: a stable version older than seven days stays reserved.' : ''}`.trim(),
    {
      code: 409,
      basis: maven ? 'assumed' : 'docs',
      docs: `${DOCS}exchange-api`,
      assumption: maven ? 'The docs state the 409 for the REST publication endpoint. The refusal itself is documented for every method, but how a Maven build reports it is not.' : undefined,
    },
  )
}

export function publish(state, input) {
  const type = typeOf(input.typeId)
  const assetId = String(input.assetId ?? '').trim()
  const version = String(input.version ?? '').trim()
  const fields = { ...input, assetId, version, method: input.method ?? 'api' }
  const dependencies = input.dependencies ?? []

  if (input.role === 'viewer') {
    return unchanged(state, refused('Exchange Viewers cannot publish', 'This permission allows viewing and downloading assets only.', 'Publish as an Exchange Contributor or Administrator.', { docs: `${DOCS}to-set-permissions` }))
  }
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(assetId)) {
    return unchanged(state, refused('Enter an asset ID', 'The asset ID identifies the asset inside its group.', 'Use letters, numbers, dots and dashes.', { basis: 'assumed' }))
  }
  if (!isSemver(version)) {
    return unchanged(state, refused('Version is not a semantic version', `"${version}" does not follow major.minor.patch. An asset's version format must use semantic versioning.`, 'Use a version such as 2.4.6.'))
  }
  if (gav(assetId, version).length > MAX_GAV_LENGTH) {
    return unchanged(state, refused('Group ID, asset ID and version are too long', `Combined they may have ${MAX_GAV_LENGTH} characters.`, 'Use a shorter asset ID.'))
  }
  const methodIssue = methodProblem(type, fields)
  if (methodIssue) return unchanged(state, methodIssue)

  const existing = findVersion(state, assetId, version)
  const sibling = state.versions.find((v) => v.assetId === assetId)
  if (sibling && sibling.typeId !== input.typeId && !existing) {
    return unchanged(
      state,
      refused('All versions of an asset have the same type', `${assetId} is a ${typeOf(sibling.typeId).name}. A new version cannot be a ${type.name}.`, 'Keep the type, or publish under a new asset ID.', {
        assumption: 'The docs state the rule. They do not state how a publish that breaks it is refused.',
      }),
    )
  }
  if (findReserved(state, assetId, version)) {
    return unchanged(
      state,
      refused('409 Conflict', 'There is a deleted asset with the same version number.', 'Use nextAvailableVersion, choose a higher version that is not reserved, or enable GAV reuse, hard-delete the version and republish.', {
        code: 409,
      }),
    )
  }
  if (sibling && input.role === 'connected-creator' && !existing) {
    return unchanged(
      state,
      refused('A connected app with Exchange Creator cannot add versions', `${assetId} already exists. Connected apps with this permission cannot create new versions of existing assets.`, 'Give the connected app Exchange Contributors, or use a new asset ID.', {
        docs: `${DOCS}to-set-permissions`,
      }),
    )
  }
  if (existing && existing.lifecycle !== 'development') return unchanged(state, conflictWithExisting(existing, fields))

  const apiIssue = apiVersionProblem(state, type, fields)
  if (apiIssue) return unchanged(state, apiIssue)
  const lifecycle = existing ? 'development' : lifecycleFor(fields)
  const dependencyIssue = dependencyProblem(state, dependencies, lifecycle)
  if (dependencyIssue) return unchanged(state, dependencyIssue)

  const next = structuredClone(state)
  if (existing) return overwrite(next, fields, dependencies)
  next.versions.push(
    record({
      assetId,
      name: input.name || sibling?.name || assetId,
      typeId: input.typeId,
      version,
      apiVersion: input.apiVersion ?? '',
      lifecycle,
      publishedDay: next.day,
      dependencies,
      keywords: words(input.keywords),
      tags: words(input.tags),
      file: input.file || 'sample-file.zip',
      method: fields.method,
    }),
  )
  const hidden = type.hidden ? ' It does not appear in the Exchange catalog, so manage it through the APIs.' : ''
  return log(next, accepted(`Published ${assetId} ${version}`, `The new version is in the ${lifecycle} state.${hidden}`))
}

function overwrite(next, fields, dependencies) {
  const target = findVersion(next, fields.assetId, fields.version)
  target.file = fields.file || target.file
  target.dependencies = dependencies
  target.keywords = words(fields.keywords)
  target.stale = false
  const dependents = dependentsOf(next, fields.assetId, fields.version)
  for (const dependent of dependents) dependent.stale = true
  const waiting = dependents.map((d) => `${d.assetId} ${d.version}`).join(', ')
  const note = dependents.length > 0 ? ` ${waiting} is not regenerated, so its owner must republish it.` : ''
  const asked = fields.method !== 'maven' && fields.lifecycle && fields.lifecycle !== 'development'
  return log(
    next,
    accepted(
      `Overwrote ${fields.assetId} ${fields.version}`,
      `Files, dependencies and keywords were replaced. Asset type, tags, categories, custom fields and documentation pages were kept.${note}`,
      { assumption: asked ? 'The docs do not say whether republishing can change the state. The lab keeps development, so use a promotion.' : undefined, docs: `${DOCS}lifecycle` },
    ),
  )
}

export function setLifecycle(state, assetId, version, target, role = 'admin') {
  const current = findVersion(state, assetId, version)
  if (!current) return unchanged(state, refused('Version not found', `${assetId} ${version} is not in the catalogue.`, 'Choose a listed version.', { basis: 'assumed' }))
  const docs = `${DOCS}lifecycle`
  if (role !== 'admin' && role !== 'contributor') {
    return unchanged(state, refused('This role cannot change a lifecycle state', 'Only Administrators and Contributors can promote an asset version.', 'Act as an Exchange Administrator.', { docs, basis: role === 'viewer' ? 'docs' : 'assumed' }))
  }
  if (isSnapshot(version) && current.lifecycle === 'development') {
    return unchanged(state, refused('A SNAPSHOT cannot be promoted', 'A SNAPSHOT asset is permanently in the development state.', 'Publish a release version, such as the same number without -SNAPSHOT.', { docs: `${DOCS}to-publish-assets-maven` }))
  }
  if (!PROMOTIONS[current.lifecycle].includes(target)) {
    return unchanged(
      state,
      refused(
        `${current.lifecycle} cannot change to ${target}`,
        'The only promotions are development to stable, stable to deprecated, and deprecated to stable. There is no path back to development.',
        'Publish a new version in the development state.',
        { docs },
      ),
    )
  }
  if (target === 'deprecated' && role !== 'admin') {
    return unchanged(state, refused('Contributors cannot deprecate', 'Only Administrators can promote to deprecated. Contributors can only promote to development and stable.', 'Act as an Exchange Administrator.', { docs }))
  }
  if (current.lifecycle === 'development' && target === 'stable') {
    const blocking = current.dependencies.filter((d) => {
      const at = d.lastIndexOf(':')
      return findVersion(state, d.slice(0, at), d.slice(at + 1))?.lifecycle === 'development'
    })
    if (blocking.length > 0) {
      return unchanged(state, refused('Dependencies are still in development', `${blocking.join(', ')} must reach stable before ${assetId} ${version}.`, 'Promote the dependencies to stable first.', { docs }))
    }
  }
  const next = structuredClone(state)
  findVersion(next, assetId, version).lifecycle = target
  const note = target === 'deprecated' ? ' Only the status property differs from stable.' : ''
  const hides = target === 'deprecated' ? 'The asset versions page also says deprecating hides a version. The lab follows the lifecycle page and changes only the status.' : undefined
  return log(next, accepted(`${assetId} ${version} is now ${target}`, `Promoted from ${current.lifecycle}.${note}`, { docs, assumption: hides }))
}

// Exchange Creator covers only assets its holder created, and the lab has no owners, so that refusal is an assumption.
const cannotDelete = (role, docs) =>
  role === 'connected-creator'
    ? refused('This role cannot delete this asset', 'Exchange Creator covers only assets created by the same owner. The lab treats catalogue assets as created by someone else.', 'Act as an Exchange Administrator.', { docs, basis: 'assumed' })
    : refused('This role cannot delete assets', 'Deleting is an Exchange Administrators action.', 'Act as an Exchange Administrator.', { docs })

export function deleteKind(state, version, allowReuse = false) {
  if (state.gavReuse && allowReuse) return 'hard'
  if (version.lifecycle === 'development') return 'hard'
  return ageOf(state, version) < HARD_DELETE_DAYS ? 'hard' : 'soft'
}

export function deleteVersion(state, assetId, version, { role = 'admin', allowReuse = false } = {}) {
  const current = findVersion(state, assetId, version)
  if (!current) return unchanged(state, refused('Version not found', `${assetId} ${version} is not in the catalogue.`, 'Choose a listed version.', { basis: 'assumed' }))
  const docs = `${DOCS}to-delete-asset`
  if (role !== 'admin') {
    return unchanged(state, cannotDelete(role, `${DOCS}to-set-permissions`))
  }
  if (current.appliedPolicies > 0) {
    return unchanged(state, refused('Policy applied to an API instance', `${assetId} is applied to ${current.appliedPolicies} managed API instance(s). A policy asset in that condition cannot be deleted.`, 'Remove the policy from the instances in API Manager, then delete it.', { docs }))
  }
  const stopped = 'The docs say to remove the dependencies first. They do not say whether the warning can be dismissed, so the lab stops here.'
  const dependents = dependentsOf(state, assetId, version)
  if (dependents.length > 0) {
    const names = dependents.map((d) => `${d.assetId} ${d.version}`).join(', ')
    return unchanged(state, refused('Warning: this version has dependent assets', `${names} depends on it.`, 'Remove the dependencies, then delete the version.', { docs, assumption: stopped, warning: true }))
  }
  if (current.instances > 0) {
    return unchanged(state, refused('Warning: this version has dependent API instances', `${current.instances} API instance(s) use ${assetId} ${version}.`, 'Remove the dependencies, then delete the version.', { docs, assumption: stopped, warning: true }))
  }

  const kind = deleteKind(state, current, allowReuse)
  const age = ageOf(state, current)
  const next = structuredClone(state)
  next.versions = next.versions.filter((v) => v !== findVersion(next, assetId, version))
  if (kind === 'soft') next.reserved.push({ assetId, version, typeId: current.typeId, deletedDay: next.day })
  const why = {
    reuse: 'GAV reuse is enabled and the option to reuse was selected, so the age of the version does not matter.',
    development: 'A development version is always hard-deleted.',
    young: `It was ${current.lifecycle} and ${age} day(s) old, inside the first seven days.`,
    old: `It was ${current.lifecycle} and ${age} day(s) old, past the first seven days.`,
  }[state.gavReuse && allowReuse ? 'reuse' : current.lifecycle === 'development' ? 'development' : kind === 'hard' ? 'young' : 'old']
  const result = kind === 'hard' ? 'The version number can be used again.' : 'The GAV stays reserved permanently and nextAvailableVersion skips it.'
  const dated = current.lifecycle !== 'development' && !(state.gavReuse && allowReuse)
  const conflicting = state.gavReuse
    ? 'With GAV reuse enabled the deletion page says an unselected option leaves the GAV unavailable, while the lifecycle page gives the rule used here.'
    : 'The asset deletion page says a GAV cannot be reused while GAV reuse is disabled, while the lifecycle page allows it for hard deletes. The lab follows the lifecycle page.'
  const assumption = kind === 'hard' && !(state.gavReuse && allowReuse) ? `${dated ? `${SEVEN_DAY_NOTE} ` : ''}${conflicting}` : dated ? SEVEN_DAY_NOTE : undefined
  return log(next, accepted(`${kind === 'hard' ? 'Hard delete' : 'Soft delete'} of ${assetId} ${version}`, `${why} ${result} A deleted asset cannot be restored.`, { kind, docs: `${DOCS}lifecycle`, assumption }))
}

export function setGavReuse(state, enabled, role = 'admin') {
  if (role !== 'admin') {
    return unchanged(state, refused('Only an administrator can change this setting', 'Admins choose how asset owners delete asset versions, under Settings, Asset Deletion & Connected Apps Management.', 'Act as an Exchange Administrator.', { docs: `${DOCS}managing-asset-deletion` }))
  }
  const next = structuredClone(state)
  next.gavReuse = enabled
  return log(next, accepted(`GAV reuse ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'Asset owners now see an option to allow reuse when deleting. Numbers already reserved stay reserved until each is hard-deleted.' : 'Asset owners no longer see the option to allow reuse.', { docs: `${DOCS}managing-asset-deletion` }))
}

// DELETE /api/v2/assets/:groupId/:assetId/:version with the header x-delete-type: hard-delete
export function hardDeleteReserved(state, assetId, version, role = 'admin') {
  if (!findReserved(state, assetId, version)) return unchanged(state, refused('This version is not reserved', `${assetId} ${version} is not in the soft-deleted list.`, 'Choose a reserved version.', { basis: 'assumed' }))
  const docs = `${DOCS}to-delete-asset`
  if (role !== 'admin') return unchanged(state, cannotDelete(role, docs))
  if (!state.gavReuse) {
    return unchanged(state, refused('GAV reuse is disabled', 'To make a reserved number available again, an administrator must first enable GAV reuse.', 'Enable GAV reuse, then hard-delete this version.', { docs: `${DOCS}managing-asset-deletion` }))
  }
  const next = structuredClone(state)
  next.reserved = next.reserved.filter((r) => !(r.assetId === assetId && r.version === version))
  return log(next, accepted(`Freed ${assetId} ${version}`, 'Hard-deleting the reserved version makes this one number available. It does not free the other reserved numbers of the asset.', { kind: 'hard', docs: `${DOCS}asset-versions` }))
}

// Stands in for API Manager: removes what blocks a delete in the two exercises that need it.
export function clearUsage(state, assetId, version) {
  const next = structuredClone(state)
  const target = findVersion(next, assetId, version)
  if (!target) return unchanged(state, refused('Version not found', `${assetId} ${version} is not in the catalogue.`, 'Choose a listed version.', { basis: 'assumed' }))
  target.instances = 0
  target.appliedPolicies = 0
  return log(next, accepted(`Removed API Manager usage of ${assetId} ${version}`, 'The lab stands in for API Manager here. No API instance or applied policy refers to this version now.', { basis: 'assumed' }))
}

export function advanceDays(state, days) {
  return { ...structuredClone(state), day: state.day + days }
}
