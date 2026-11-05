// Checks the Exchange and CI/CD labs against the Exchange, Mule Maven plugin, MUnit, CloudHub 2.0 and API Manager pages.
// Every failure the labs can show has a test here, and every stated fix is applied and proved.
import assert from 'node:assert/strict'
import {
  advanceDays,
  ASSET_TYPES,
  assets,
  clearUsage,
  compareVersions,
  deleteVersion,
  dependentsOf,
  emptyState,
  findReserved,
  findVersion,
  hardDeleteReserved,
  isSemver,
  newState as newCatalogue,
  nextAvailableVersion,
  parseDependencies,
  publish,
  setGavReuse,
  setLifecycle,
  visibility,
} from '../src/lab/exchange.js'
import {
  ASSET_ID,
  freeReserved,
  isFeatureBuild,
  newConfig,
  newPromotion,
  newState,
  overwriteSnapshot,
  pairing,
  pomPreview,
  promoteInstance,
  rollback,
  running,
  SCENARIOS,
  settle,
  stagesFor,
  startRedeploy,
  startRun,
  step,
  undeploy,
  updateBinding,
} from '../src/lab/pipeline.js'

const api = (extra = {}) => ({ assetId: 'demo-api', typeId: 'rest-api', version: '1.0.0', apiVersion: 'v1', method: 'api', role: 'admin', ...extra })
const app = (extra = {}) => ({ assetId: 'demo-app', typeId: 'mule-application', version: '1.0.0', method: 'maven', role: 'admin', ...extra })

function published(state, input) {
  const result = publish(state, input)
  assert.equal(result.outcome.ok, true, result.outcome.title)
  return result.state
}
const refusedWith = (result, pattern) => {
  assert.equal(result.outcome.ok, false, 'expected a refusal')
  assert.match(`${result.outcome.title} ${result.outcome.cause}`, pattern)
  assert.ok(result.outcome.fix, 'a refusal states a fix')
  return result
}
const accepted = (result) => {
  assert.equal(result.outcome.ok, true, `${result.outcome.title}: ${result.outcome.cause}`)
  return result.state
}

const run = (state, config) => settle(startRun(state, config))
const stageOf = (state, id) => state.runs[0].stages.find((s) => s.id === id)
const config = (patch = {}) => ({ ...newConfig(), ...patch })
const issueOf = (state, id) => stageOf(state, id).issues[0]

const exchangeTests = {
  'asset types: every type on the asset types page is offered'() {
    const names = ASSET_TYPES.map((t) => t.name)
    for (const name of ['REST API', 'SOAP API', 'Connector', 'Template', 'Example', 'Policy', 'Custom', 'API Group', 'API Spec Fragment', 'Mule Application', 'DataWeave Library', 'Ruleset', 'gRPC API']) {
      assert.ok(names.includes(name), name)
    }
  },
  'versions: semantic versions only, compared by number'() {
    assert.ok(isSemver('2.4.6'))
    assert.ok(isSemver('1.0.0-SNAPSHOT'))
    assert.ok(!isSemver('1.0'))
    assert.ok(!isSemver('v1.0.0'))
    assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
    refusedWith(publish(emptyState(), api({ version: '1.0' })), /semantic/)
    published(emptyState(), api({ version: '1.0.0' }))
  },
  'publish: stable is the default state'() {
    const state = published(emptyState(), api())
    assert.equal(findVersion(state, 'demo-api', '1.0.0').lifecycle, 'stable')
  },
  'publish: viewers cannot publish, and a contributor can'() {
    refusedWith(publish(emptyState(), api({ role: 'viewer' })), /Viewers/)
    published(emptyState(), api({ role: 'contributor' }))
  },
  'publish: a long GAV is refused, a shorter one passes'() {
    refusedWith(publish(emptyState(), api({ assetId: 'a'.repeat(220) })), /too long/)
    published(emptyState(), api({ assetId: 'a'.repeat(100) }))
  },
  'publish: an empty asset ID is refused'() {
    refusedWith(publish(emptyState(), api({ assetId: ' ' })), /asset ID/)
  },
  'publish: Maven refuses a type its page does not name, and the API takes it'() {
    const result = refusedWith(publish(emptyState(), api({ method: 'maven' })), /Maven/)
    assert.equal(result.outcome.basis, 'assumed')
    published(emptyState(), api({ method: 'api' }))
  },
  'publish: the portal refuses a Maven type, and Maven takes it'() {
    const connector = { assetId: 'demo-connector', typeId: 'connector', version: '1.0.0', role: 'admin' }
    assert.equal(refusedWith(publish(emptyState(), { ...connector, method: 'portal' }), /dialog/).outcome.basis, 'assumed')
    assert.equal(publish(emptyState(), { assetId: 'my-policy', typeId: 'policy', version: '1.0.0', method: 'portal', role: 'admin' }).outcome.ok, true, 'the page has a Publish new asset procedure for a policy definition')
    published(emptyState(), { ...connector, method: 'maven' })
  },
  'publish: all versions of an asset keep one type'() {
    const state = published(emptyState(), app())
    refusedWith(publish(state, { assetId: 'demo-app', typeId: 'connector', version: '1.1.0', method: 'maven', role: 'admin' }), /same type/)
    published(state, app({ version: '1.1.0' }))
  },
  'publish: a connected app with Exchange Creator can create an asset but not a new version'() {
    const state = published(emptyState(), app({ role: 'connected-creator' }))
    refusedWith(publish(state, app({ version: '1.1.0', role: 'connected-creator' })), /cannot create new versions/)
    published(state, app({ version: '1.1.0', role: 'contributor' }))
  },
  'api version: minor keeps it, a new major raises it'() {
    const state = published(emptyState(), api())
    refusedWith(publish(emptyState(), api({ apiVersion: '' })), /API version/)
    refusedWith(publish(state, api({ version: '1.1.0', apiVersion: 'v2' })), /must not change/)
    published(state, api({ version: '1.1.0', apiVersion: 'v1' }))
    refusedWith(publish(state, api({ version: '2.0.0', apiVersion: 'v1' })), /must also increase/)
    published(state, api({ version: '2.0.0', apiVersion: 'v2' }))
  },
  'republish: a development version is overwritten, keeping tags and type'() {
    let state = published(emptyState(), api({ lifecycle: 'development', file: 'one.zip', keywords: 'a', tags: 'keep' }))
    state = published(state, api({ lifecycle: 'development', file: 'two.zip', keywords: 'b', tags: 'changed' }))
    const version = findVersion(state, 'demo-api', '1.0.0')
    assert.equal(version.file, 'two.zip')
    assert.deepEqual(version.keywords, ['b'])
    assert.deepEqual(version.tags, ['keep'])
    assert.equal(state.versions.length, 1)
  },
  'republish: a stable version gives 409, and the next patch is the fix'() {
    const state = published(emptyState(), api())
    const result = refusedWith(publish(state, api()), /409/)
    assert.equal(result.outcome.code, 409)
    assert.equal(result.outcome.basis, 'docs')
    published(state, api({ version: nextAvailableVersion(state, 'demo-api', 'PATCH') }))
  },
  'republish: a deprecated version is refused too'() {
    const state = accepted(setLifecycle(published(emptyState(), api()), 'demo-api', '1.0.0', 'deprecated'))
    refusedWith(publish(state, api()), /409/)
  },
  'republish: over Maven the refusal is documented but the response is assumed'() {
    const state = published(emptyState(), app())
    const result = refusedWith(publish(state, app()), /409/)
    assert.equal(result.outcome.basis, 'assumed')
    assert.ok(result.outcome.assumption)
  },
  'snapshot: facade v3 gives development, and a repeat overwrites without errors'() {
    let state = published(emptyState(), app({ version: '1.0.0-SNAPSHOT', file: 'one.jar' }))
    assert.equal(findVersion(state, 'demo-app', '1.0.0-SNAPSHOT').lifecycle, 'development')
    state = published(state, app({ version: '1.0.0-SNAPSHOT', file: 'two.jar' }))
    assert.equal(findVersion(state, 'demo-app', '1.0.0-SNAPSHOT').file, 'two.jar')
  },
  'snapshot: facade v1 or v2 gives stable'() {
    const state = published(emptyState(), app({ version: '1.0.0-SNAPSHOT', facade: 2 }))
    assert.equal(findVersion(state, 'demo-app', '1.0.0-SNAPSHOT').lifecycle, 'stable')
  },
  'snapshot: cannot be promoted, and a release version is the fix'() {
    const state = published(emptyState(), app({ version: '1.0.0-SNAPSHOT' }))
    refusedWith(setLifecycle(state, 'demo-app', '1.0.0-SNAPSHOT', 'stable'), /SNAPSHOT/)
    assert.equal(findVersion(published(state, app()), 'demo-app', '1.0.0').lifecycle, 'stable')
  },
  'snapshot: only through Maven in the lab, and development is the fix'() {
    assert.equal(refusedWith(publish(emptyState(), api({ version: '1.0.0-SNAPSHOT' })), /Maven/).outcome.basis, 'assumed')
    published(emptyState(), api({ lifecycle: 'development' }))
  },
  'lifecycle: the three promotions work'() {
    let state = published(emptyState(), api({ lifecycle: 'development' }))
    state = accepted(setLifecycle(state, 'demo-api', '1.0.0', 'stable'))
    state = accepted(setLifecycle(state, 'demo-api', '1.0.0', 'deprecated'))
    state = accepted(setLifecycle(state, 'demo-api', '1.0.0', 'stable'))
    assert.equal(findVersion(state, 'demo-api', '1.0.0').lifecycle, 'stable')
  },
  'lifecycle: no path back to development, and a new version is the fix'() {
    const state = published(emptyState(), api())
    refusedWith(setLifecycle(state, 'demo-api', '1.0.0', 'development'), /no path back/)
    refusedWith(setLifecycle(published(emptyState(), api({ lifecycle: 'development' })), 'demo-api', '1.0.0', 'deprecated'), /cannot change/)
    published(state, api({ version: '1.0.1', lifecycle: 'development' }))
  },
  'lifecycle: only administrators deprecate, and contributors can return to stable'() {
    let state = published(emptyState(), api())
    refusedWith(setLifecycle(state, 'demo-api', '1.0.0', 'deprecated', 'contributor'), /Contributors/)
    refusedWith(setLifecycle(state, 'demo-api', '1.0.0', 'deprecated', 'viewer'), /role/)
    state = accepted(setLifecycle(state, 'demo-api', '1.0.0', 'deprecated', 'admin'))
    accepted(setLifecycle(state, 'demo-api', '1.0.0', 'stable', 'contributor'))
  },
  'visibility: development is hidden outside Exchange, deprecated behaves like stable'() {
    const shown = (version) => Object.fromEntries(visibility(version).map((v) => [v.where, v.shown]))
    const base = { typeId: 'rest-api', version: '1.0.0' }
    assert.deepEqual(shown({ ...base, lifecycle: 'development' }), { 'Exchange catalog': true, 'Public portal': false, 'Studio and API Manager': false, Maven: false })
    assert.deepEqual(shown({ ...base, lifecycle: 'deprecated' }), shown({ ...base, lifecycle: 'stable' }))
    assert.equal(shown({ ...base, lifecycle: 'development', version: '1.0.0-SNAPSHOT' }).Maven, true)
  },
  'visibility: a Mule application does not appear in the catalog'() {
    const shown = visibility({ typeId: 'mule-application', version: '1.0.0', lifecycle: 'stable' })
    assert.equal(shown[0].shown, false)
  },
  'dependencies: a stable version cannot add a development one, and promoting it first is the fix'() {
    let state = published(emptyState(), { assetId: 'frag', typeId: 'api-fragment', version: '1.0.0', method: 'api', role: 'admin', lifecycle: 'development' })
    refusedWith(publish(state, api({ dependencies: ['frag:1.0.0'] })), /cannot depend/)
    state = accepted(setLifecycle(state, 'frag', '1.0.0', 'stable'))
    published(state, api({ dependencies: ['frag:1.0.0'] }))
  },
  'dependencies: an unknown reference is refused'() {
    assert.equal(refusedWith(publish(emptyState(), api({ dependencies: parseDependencies('ghost:1.0.0') })), /not found/).outcome.basis, 'assumed')
  },
  'dependencies: promotion waits for development dependencies, and promoting them is the fix'() {
    let state = newCatalogue()
    refusedWith(setLifecycle(state, 'orders-api', '1.0.0', 'stable'), /common-types:1.0.0/)
    state = accepted(setLifecycle(state, 'common-types', '1.0.0', 'stable'))
    state = accepted(setLifecycle(state, 'orders-api', '1.0.0', 'stable'))
    assert.equal(findVersion(state, 'orders-api', '1.0.0').lifecycle, 'stable')
  },
  'dependencies: changing a development dependency does not regenerate the dependent'() {
    let state = newCatalogue()
    state = published(state, { assetId: 'common-types', typeId: 'api-fragment', version: '1.0.0', method: 'api', role: 'admin', file: 'new.zip' })
    assert.equal(findVersion(state, 'orders-api', '1.0.0').stale, true)
    state = published(state, { assetId: 'orders-api', typeId: 'rest-api', version: '1.0.0', apiVersion: 'v1', method: 'api', role: 'admin', dependencies: ['common-types:1.0.0'] })
    assert.equal(findVersion(state, 'orders-api', '1.0.0').stale, false)
  },
  'delete: a development version is always hard, whatever its age'() {
    const state = advanceDays(published(emptyState(), api({ lifecycle: 'development' })), 90)
    const result = deleteVersion(state, 'demo-api', '1.0.0')
    assert.equal(result.outcome.kind, 'hard')
    published(result.state, api())
  },
  'delete: stable is hard in the first seven days, so the number can be used again'() {
    const state = advanceDays(published(emptyState(), api()), 6)
    const result = deleteVersion(state, 'demo-api', '1.0.0')
    assert.equal(result.outcome.kind, 'hard')
    assert.equal(result.state.reserved.length, 0)
    published(result.state, api())
  },
  'delete: stable is soft after seven days, and republishing gives the documented 409'() {
    const state = advanceDays(published(emptyState(), api()), 7)
    const result = deleteVersion(state, 'demo-api', '1.0.0')
    assert.equal(result.outcome.kind, 'soft')
    assert.ok(result.outcome.assumption, 'the seven day boundary is an assumption')
    assert.ok(findReserved(result.state, 'demo-api', '1.0.0'))
    assert.deepEqual(assets(result.state), [])
    const conflict = refusedWith(publish(result.state, api()), /There is a deleted asset with the same version number\./)
    assert.equal(conflict.outcome.code, 409)
    assert.equal(conflict.outcome.basis, 'docs')
  },
  'delete: a deprecated version follows the stable rule'() {
    const state = advanceDays(accepted(setLifecycle(published(emptyState(), api()), 'demo-api', '1.0.0', 'deprecated')), 30)
    assert.equal(deleteVersion(state, 'demo-api', '1.0.0').outcome.kind, 'soft')
  },
  '409 fix 1: nextAvailableVersion skips the reserved number'() {
    let state = published(emptyState(), api({ version: '2.4.6', apiVersion: 'v2' }))
    state = published(state, api({ version: '2.4.7', apiVersion: 'v2' }))
    state = deleteVersion(advanceDays(state, 10), 'demo-api', '2.4.7').state
    assert.equal(nextAvailableVersion(state, 'demo-api', 'PATCH'), '2.4.8')
    assert.equal(nextAvailableVersion(state, 'demo-api', 'MINOR'), '2.5.0')
    assert.equal(nextAvailableVersion(state, 'demo-api', 'MAJOR'), '3.0.0')
    published(state, api({ version: '2.4.8', apiVersion: 'v2' }))
  },
  '409 fix 2: a higher version of your choice works'() {
    const state = deleteVersion(advanceDays(published(emptyState(), api()), 10), 'demo-api', '1.0.0').state
    published(state, api({ version: '1.5.0' }))
  },
  '409 fix 3: enable GAV reuse, hard-delete, republish; other numbers stay reserved'() {
    let state = published(emptyState(), api())
    state = published(state, api({ version: '1.0.1' }))
    state = advanceDays(state, 10)
    state = deleteVersion(state, 'demo-api', '1.0.0').state
    state = deleteVersion(state, 'demo-api', '1.0.1').state
    refusedWith(hardDeleteReserved(state, 'demo-api', '1.0.0'), /GAV reuse is disabled/)
    refusedWith(setGavReuse(state, true, 'contributor'), /administrator/)
    state = accepted(setGavReuse(state, true))
    refusedWith(hardDeleteReserved(state, 'demo-api', '1.0.0', 'contributor'), /role/)
    state = accepted(hardDeleteReserved(state, 'demo-api', '1.0.0'))
    published(state, api())
    refusedWith(publish(state, api({ version: '1.0.1' })), /deleted asset/)
  },
  'delete: with GAV reuse the option makes it hard whatever the age'() {
    let state = advanceDays(published(emptyState(), api()), 400)
    state = accepted(setGavReuse(state, true))
    assert.equal(deleteVersion(state, 'demo-api', '1.0.0', { allowReuse: true }).outcome.kind, 'hard')
    assert.equal(deleteVersion(state, 'demo-api', '1.0.0', { allowReuse: false }).outcome.kind, 'soft')
  },
  'delete: only administrators delete'() {
    const state = published(emptyState(), api())
    refusedWith(deleteVersion(state, 'demo-api', '1.0.0', { role: 'contributor' }), /role/)
    assert.equal(deleteVersion(state, 'demo-api', '1.0.0', { role: 'admin' }).outcome.ok, true)
  },
  'delete: a warning for dependent assets, and removing them is the fix'() {
    let state = newCatalogue()
    assert.equal(dependentsOf(state, 'common-errors', '1.0.0').length, 1)
    const warned = refusedWith(deleteVersion(state, 'common-errors', '1.0.0'), /dependent assets/)
    assert.equal(warned.outcome.warning, true)
    state = accepted(clearUsage(state, 'payments-api', '1.3.0'))
    state = accepted(deleteVersion(state, 'payments-api', '1.3.0'))
    accepted(deleteVersion(state, 'common-errors', '1.0.0'))
  },
  'delete: a warning for dependent API instances, and removing them is the fix'() {
    let state = newCatalogue()
    refusedWith(deleteVersion(state, 'payments-api', '1.3.0'), /API instances/)
    state = accepted(clearUsage(state, 'payments-api', '1.3.0'))
    accepted(deleteVersion(state, 'payments-api', '1.3.0'))
  },
  'delete: an applied policy cannot be deleted, and removing it from instances is the fix'() {
    let state = newCatalogue()
    refusedWith(deleteVersion(state, 'header-guard', '1.0.0'), /Policy applied/)
    state = accepted(clearUsage(state, 'header-guard', '1.0.0'))
    accepted(deleteVersion(state, 'header-guard', '1.0.0'))
  },
  'purity: actions do not change the state they are given'() {
    const state = newCatalogue()
    const before = JSON.stringify(state)
    publish(state, api())
    setLifecycle(state, 'common-types', '1.0.0', 'stable')
    deleteVersion(state, 'customer-sapi', '3.4.0')
    advanceDays(state, 3)
    assert.equal(JSON.stringify(state), before)
  },
}

const pipelineTests = {
  'pipeline: the default run passes every stage and deploys both environments'() {
    const state = run(newState(), config())
    assert.equal(state.runs[0].result, 'Passed')
    assert.deepEqual(state.runs[0].stages.map((s) => s.status), ['passed', 'passed', 'passed', 'passed', 'passed'])
    assert.equal(state.envs.Sandbox.version, '2.4.0')
    assert.equal(state.envs.Production.version, '2.4.0')
    assert.ok(findVersion(state.exchange, ASSET_ID, '2.4.0'))
  },
  'pipeline: stages run one at a time'() {
    let state = startRun(newState(), config())
    assert.ok(running(state))
    state = step(state)
    assert.equal(stageOf(state, 'build').status, 'passed')
    assert.equal(stageOf(state, 'munit').status, 'pending')
    assert.equal(startRun(state, config()), state, 'a second run waits')
  },
  'pipeline: a failed stage skips the later ones and leaves environments alone'() {
    const state = run(newState(), config({ testsFailing: 1 }))
    assert.equal(stageOf(state, 'munit').status, 'failed')
    assert.equal(stageOf(state, 'publish').status, 'skipped')
    assert.equal(stageOf(state, 'Production').status, 'skipped')
    assert.equal(state.envs.Sandbox.version, '2.3.0')
  },
  'pipeline: every issue states a cause, a fix and a basis'() {
    for (const scenario of SCENARIOS) {
      const state = run(newState(), config(scenario.patch))
      const issues = state.runs[0].stages.flatMap((s) => s.issues)
      assert.ok(issues.length > 0, scenario.id)
      for (const issue of issues) {
        assert.ok(issue.cause && issue.fix, `${scenario.id}: ${issue.title}`)
        assert.ok(['docs', 'assumed'].includes(issue.basis), `${scenario.id}: basis`)
      }
    }
  },
  'pipeline: a version that is not semantic fails at build'() {
    const state = run(newState(), config({ version: '2.4' }))
    assert.equal(stageOf(state, 'build').status, 'failed')
    assert.equal(run(newState(), config({ version: '2.4.0' })).runs[0].result, 'Passed')
  },
  'upload only: the target is unchanged while Exchange has the version (inc-122)'() {
    const state = run(newState(), config({ publishStage: false, deployCommand: 'clean-deploy', deployProduction: false }))
    assert.equal(state.runs[0].result, 'Passed with warnings')
    assert.ok(findVersion(state.exchange, ASSET_ID, '2.4.0'))
    assert.equal(state.envs.Sandbox.version, '2.3.0')
    assert.equal(issueOf(state, 'Sandbox').incident, 'inc-122')
  },
  'upload only: mule:deploy then delivers the published version without a rebuild'() {
    let state = run(newState(), config({ publishStage: false, deployCommand: 'clean-deploy', deployProduction: false }))
    state = settle(startRedeploy(state, config(), 'Sandbox', '2.4.0'))
    assert.equal(state.envs.Sandbox.version, '2.4.0')
  },
  'properties: omitting both elements preserves what is in the environment'() {
    const before = newState().envs.Sandbox.properties
    const state = run(newState(), config())
    assert.deepEqual(state.envs.Sandbox.properties, before)
  },
  'properties: a partial element removes the rest, with no merge (inc-120)'() {
    const state = run(newState(), config({ propertiesMode: 'partial' }))
    assert.deepEqual(Object.keys(state.envs.Sandbox.properties), ['api.id'])
    assert.deepEqual(state.envs.Sandbox.secure, {}, 'properties alone also removes secure properties')
    assert.equal(issueOf(state, 'Sandbox').incident, 'inc-120')
    assert.match(issueOf(state, 'Sandbox').cause, /db\.password/)
  },
  'properties: the previous version keeps serving after the failed update'() {
    const state = run(newState(), config({ propertiesMode: 'partial' }))
    const env = state.envs.Sandbox
    assert.equal(env.status, 'Running')
    assert.equal(env.version, '2.3.0')
    assert.equal(env.configs[0].status, 'Update failed')
  },
  'properties: recreate logs the outage that rolling avoids'() {
    const outage = (state) => stageOf(state, 'Sandbox').logs.some((l) => /not receiving traffic/.test(l.text))
    assert.equal(outage(run(newState(), config({ propertiesMode: 'partial', updateStrategy: 'recreate' }))), true)
    assert.equal(outage(run(newState(), config({ propertiesMode: 'partial' }))), false)
  },
  'properties: redeploying the older version does not bring the values back'() {
    let state = run(newState(), config({ propertiesMode: 'partial' }))
    state = settle(startRedeploy(state, config({ propertiesMode: 'partial' }), 'Sandbox', '2.3.0'))
    assert.equal(state.runs[0].result, 'Failed')
    state = settle(startRedeploy(state, config(), 'Sandbox', '2.3.0'))
    assert.equal(state.runs[0].result, 'Failed', 'omitting the element keeps the reduced list')
  },
  'properties: the full set is the fix, and omit keeps it afterwards'() {
    let state = run(newState(), config({ propertiesMode: 'partial' }))
    state = run(state, config({ propertiesMode: 'full', publishStage: false }))
    assert.equal(state.runs[0].result, 'Passed')
    assert.ok('db.host' in state.envs.Sandbox.properties)
    assert.ok('db.password' in state.envs.Sandbox.secure)
    state = settle(startRedeploy(state, config(), 'Sandbox', '2.4.0'))
    assert.equal(state.runs[0].result, 'Passed')
  },
  'verification: a skipped check hides the failed start, and a version check still catches it'() {
    const hidden = run(newState(), config({ propertiesMode: 'partial', skipDeploymentVerification: true }))
    assert.equal(stageOf(hidden, 'Sandbox').status, 'warned')
    assert.equal(hidden.envs.Sandbox.version, '2.3.0')
    const caught = run(newState(), config({ propertiesMode: 'partial', skipDeploymentVerification: true, verifyVersion: true }))
    assert.equal(stageOf(caught, 'Sandbox').status, 'failed')
  },
  'auth: username and password win over the server ID, whichever state the account is in (inc-121)'() {
    const works = run(newState(), config({ deployUserPass: true }))
    assert.equal(stageOf(works, 'Sandbox').status, 'warned')
    assert.match(issueOf(works, 'Sandbox').cause, /overwrite the server ID/)
    const broken = run(newState(), config({ deployUserPass: true, personalAccountActive: false }))
    assert.equal(stageOf(broken, 'Sandbox').status, 'failed')
    assert.equal(stageOf(broken, 'publish').status, 'passed', 'publishing uses its own server entry')
    assert.equal(broken.envs.Sandbox.version, '2.3.0')
  },
  'auth: a disabled personal account does not matter once the lines are gone'() {
    const state = run(newState(), config({ personalAccountActive: false }))
    assert.equal(state.runs[0].result, 'Passed')
  },
  'auth: a Connected App passes with the scope, and the POM shows client_credentials'() {
    assert.equal(run(newState(), config({ authMode: 'connected-app' })).runs[0].result, 'Passed')
    assert.equal(stageOf(run(newState(), config({ authMode: 'connected-app', connectedAppScope: false })), 'Sandbox').status, 'failed')
    assert.match(pomPreview(config({ authMode: 'connected-app' })), /client_credentials/)
  },
  'snapshot: Sandbox accepts it and the guard stops Production (inc-123)'() {
    const state = run(newState(), config({ version: '2.4.0-SNAPSHOT' }))
    assert.equal(stageOf(state, 'Sandbox').status, 'passed')
    assert.equal(stageOf(state, 'Production').status, 'failed')
    assert.equal(state.envs.Production.version, '2.3.0')
    assert.equal(findVersion(state.exchange, ASSET_ID, '2.4.0-SNAPSHOT').lifecycle, 'development')
  },
  'snapshot: republishing it passes, because it is overwritten without errors'() {
    let state = run(newState(), config({ version: '2.4.0-SNAPSHOT', deployProduction: false }))
    state = run(state, config({ version: '2.4.0-SNAPSHOT', deployProduction: false }))
    assert.equal(stageOf(state, 'publish').status, 'passed')
    assert.equal(findVersion(state.exchange, ASSET_ID, '2.4.0-SNAPSHOT').build, state.runs[0].build)
  },
  'snapshot: an unrelated redeploy picks up what another branch published'() {
    const unguarded = config({ version: '2.4.0-SNAPSHOT', snapshotGuard: false })
    let state = run(newState(), unguarded)
    assert.equal(isFeatureBuild(state.envs.Production.build), false)
    state = overwriteSnapshot(state, '2.4.0-SNAPSHOT')
    assert.equal(isFeatureBuild(state.envs.Production.build), false, 'running replicas do not change by themselves')
    state = settle(startRedeploy(state, unguarded, 'Production', '2.4.0-SNAPSHOT'))
    assert.equal(isFeatureBuild(state.envs.Production.build), true)
  },
  'snapshot: a release version is not changed by another branch'() {
    const state = run(newState(), config())
    assert.equal(overwriteSnapshot(state, '2.4.0'), state)
  },
  'rollback: a SNAPSHOT has no earlier artifact to return to'() {
    const unguarded = config({ version: '2.4.0-SNAPSHOT', snapshotGuard: false })
    let state = run(newState(), unguarded)
    const good = state.envs.Production.applied
    state = run(state, config({ version: '2.5.0' }))
    state = overwriteSnapshot(state, '2.4.0-SNAPSHOT')
    const result = rollback(state, 'Production', good)
    assert.equal(result.outcome.severity, 'warning')
    assert.equal(isFeatureBuild(result.state.envs.Production.build), true)
  },
  'rollback: returns to the earlier version, and the entry moves to the top with its identifier'() {
    let state = run(newState(), config())
    const earlier = 'Production-config-0'
    const result = rollback(state, 'Production', earlier)
    assert.equal(result.outcome.severity, 'success')
    state = result.state
    assert.equal(state.envs.Production.version, '2.3.0')
    assert.equal(state.envs.Production.configs[0].id, earlier)
    assert.equal(state.envs.Production.applied, earlier)
  },
  'rollback: restores the properties a partial element removed'() {
    let state = run(newState(), config({ propertiesMode: 'partial' }))
    assert.equal('db.host' in state.envs.Sandbox.properties, false)
    state = rollback(state, 'Sandbox', 'Sandbox-config-0').state
    assert.equal('db.host' in state.envs.Sandbox.properties, true)
    assert.equal('db.password' in state.envs.Sandbox.secure, true)
    assert.equal(settle(startRedeploy(state, config(), 'Sandbox', '2.3.0')).runs[0].result, 'Passed')
  },
  'rollback: refuses an entry that did not deploy'() {
    const state = run(newState(), config({ propertiesMode: 'partial' }))
    const failed = state.envs.Sandbox.configs[0].id
    assert.match(rollback(state, 'Sandbox', failed).outcome.title, /Only a successful configuration/)
  },
  'rollback: a first deployment that fails has no rollback version, and fixing the fault is the way out'() {
    let state = undeploy(newState(), 'Sandbox')
    state = run(state, config({ deployProduction: false }))
    assert.equal(state.runs[0].result, 'Failed')
    assert.equal(state.envs.Sandbox.status, 'Failed')
    const failed = state.envs.Sandbox.configs[0].id
    assert.match(rollback(state, 'Sandbox', failed).outcome.title, /No rollback version/)
    state = run(state, config({ deployProduction: false, propertiesMode: 'full', publishStage: false }))
    assert.equal(state.envs.Sandbox.status, 'Running')
  },
  'history: keeps the last ten configurations'() {
    let state = newState()
    for (let i = 0; i < 12; i++) state = settle(startRedeploy(state, config(), 'Sandbox', '2.3.0'))
    assert.equal(state.envs.Sandbox.configs.length, 10)
  },
  'coverage: the documented levels and defaults'() {
    const low = { applicationCoverage: 64, lowestFlowCoverage: 0 }
    assert.equal(stageOf(run(newState(), config({ ...low, requiredApplicationCoverage: -1, requiredFlowCoverage: -1 })), 'munit').status, 'passed', '-1 sets no requirement')
    assert.equal(stageOf(run(newState(), config({ ...low, runCoverage: false })), 'munit').status, 'passed')
    const failed = run(newState(), config(low))
    assert.ok(stageOf(failed, 'munit').logs.some((l) => /order-reopened-flow coverage is below defined limit\. Required: 60\.0% - Current: 0\.00%/.test(l.text)))
  },
  'coverage: an ignored flow cannot fail the build, and application coverage still counts'() {
    assert.equal(stageOf(run(newState(), config({ lowestFlowCoverage: 0, ignoreLowestFlow: true })), 'munit').status, 'passed')
    assert.equal(stageOf(run(newState(), config({ lowestFlowCoverage: 0, applicationCoverage: 50, ignoreLowestFlow: true })), 'munit').status, 'failed')
  },
  'publish: a reserved number is freed with GAV reuse, and the same version then passes'() {
    let state = run(newState(), config({ version: '2.2.1' }))
    assert.match(issueOf(state, 'publish').cause, /There is a deleted asset with the same version number\./)
    state = freeReserved(state, '2.2.1').state
    assert.equal(run(state, config({ version: '2.2.1' })).runs[0].result, 'Passed')
  },
  'publish: the next available strategy keeps a repeat run green'() {
    let state = run(newState(), config({ versionStrategy: 'next' }))
    assert.equal(state.runs[0].version, '2.3.1')
    state = run(state, config({ versionStrategy: 'next' }))
    assert.equal(state.runs[0].version, '2.3.2')
    assert.equal(state.runs[0].result, 'Passed')
  },
  'promotion: the label stays and the instance ID changes'() {
    const result = promoteInstance(newState(), newPromotion())
    const [from, to] = [result.state.envs.Sandbox.instance, result.state.envs.Production.instance]
    assert.equal(result.outcome.severity, 'success')
    assert.equal(to.label, from.label)
    assert.notEqual(to.id, from.id)
    assert.deepEqual(to.policies, from.policies)
  },
  'promotion: Include in Promotion options leave items out'() {
    const { state } = promoteInstance(newState(), { ...newPromotion(), includePolicies: false, includeTiers: false, includeAlerts: false })
    assert.deepEqual(state.envs.Production.instance.policies, [])
    assert.deepEqual(state.envs.Production.instance.tiers, [])
    assert.deepEqual(state.envs.Production.instance.alerts, [])
  },
  'promotion: Manage APIs Configuration is required, and granting it is the fix'() {
    assert.match(promoteInstance(newState(), { ...newPromotion(), manageApis: false }).outcome.cause, /Manage APIs Configuration/)
    assert.equal(promoteInstance(newState(), newPromotion()).outcome.severity, 'success')
  },
  'promotion: policies need their permissions, and excluding them also works'() {
    const denied = { ...newPromotion(), managePolicies: false }
    assert.match(promoteInstance(newState(), denied).outcome.cause, /Manage Policies/)
    assert.equal(promoteInstance(newState(), { ...denied, includePolicies: false }).outcome.severity, 'success')
  },
  'promotion: different client providers warn, and removing the policies clears it'() {
    const mismatch = { ...newPromotion(), sameClientProvider: false }
    assert.equal(promoteInstance(newState(), mismatch).outcome.severity, 'warning')
    assert.equal(promoteInstance(newState(), { ...mismatch, includePolicies: false }).outcome.severity, 'success')
  },
  'promotion: an empty source and an occupied target are refused'() {
    const noSource = promoteInstance(newState(), { ...newPromotion(), source: 'Production', target: 'Sandbox' })
    assert.equal(noSource.outcome.severity, 'failure')
    assert.equal(noSource.outcome.basis, 'assumed')
    const twice = promoteInstance(promoteInstance(newState(), newPromotion()).state, newPromotion())
    assert.match(twice.outcome.title, /already has/)
  },
  'promotion: the application is not affected until its ID and credentials are updated'() {
    let state = promoteInstance(newState(), newPromotion()).state
    assert.equal(pairing(state, 'Sandbox').paired, true)
    assert.equal(pairing(state, 'Production').problems.length, 2)
    state = updateBinding(state, 'Production', { apiId: true, credentials: false })
    assert.equal(pairing(state, 'Production').problems.length, 1)
    assert.match(pairing(state, 'Production').problems[0], /client\.id/)
    state = updateBinding(state, 'Production')
    assert.equal(pairing(state, 'Production').paired, true)
  },
  'promotion: a partial properties element after promotion still breaks the app'() {
    let state = updateBinding(promoteInstance(newState(), newPromotion()).state, 'Production')
    state = run(state, config({ propertiesMode: 'partial', version: '2.4.0' }))
    assert.equal(stageOf(state, 'Sandbox').status, 'failed')
    state = run(state, config({ propertiesMode: 'full', publishStage: false }))
    assert.equal(pairing(state, 'Production').paired, true)
    assert.equal(state.runs[0].result, 'Passed')
  },
  'pom preview: shows what each option writes'() {
    assert.doesNotMatch(pomPreview(config()), /<properties>/)
    assert.match(pomPreview(config({ propertiesMode: 'partial' })), /<api\.id>/)
    assert.match(pomPreview(config({ deployUserPass: true })), /<username>/)
    assert.match(pomPreview(config({ skipDeploymentVerification: true })), /skipDeploymentVerification/)
  },
  'stages: options change what the pipeline runs'() {
    assert.deepEqual(stagesFor(config({ publishStage: false, deployProduction: false })).map((s) => s.id), ['build', 'munit', 'Sandbox'])
    assert.match(stagesFor(config({ deployCommand: 'clean-deploy' })).at(-1).command, /^mvn clean deploy -D/)
  },
  'purity: pipeline actions do not change the state they are given'() {
    const state = run(newState(), config())
    const before = JSON.stringify(state)
    run(state, config({ versionStrategy: 'next' }))
    rollback(state, 'Sandbox', 'Sandbox-config-0')
    promoteInstance(state, newPromotion())
    undeploy(state, 'Production')
    assert.equal(JSON.stringify(state), before)
  },
  'storage: state survives a JSON round trip'() {
    const state = run(newState(), config({ propertiesMode: 'partial' }))
    const copy = JSON.parse(JSON.stringify(state))
    assert.equal(run(copy, config({ propertiesMode: 'full', publishStage: false })).runs[0].result, 'Passed')
  },
}

const scenarioTests = Object.fromEntries(
  SCENARIOS.flatMap((scenario) => {
    const broken = () => run(newState(), config(scenario.patch))
    return [
      [
        `scenario ${scenario.id}: shows up at ${scenario.expect.stage} as ${scenario.expect.status}`,
        () => assert.equal(stageOf(broken(), scenario.expect.stage).status, scenario.expect.status),
      ],
      [
        `scenario ${scenario.id}: the fix gives a clean run from the state the failure left`,
        () => {
          const fixed = run(broken(), config({ ...scenario.patch, ...scenario.fix }))
          const problems = fixed.runs[0].stages.flatMap((s) => s.issues.map((i) => i.title))
          assert.equal(fixed.runs[0].result, 'Passed', problems.join('; '))
        },
      ],
    ]
  }),
)

const tests = { ...exchangeTests, ...pipelineTests, ...scenarioTests }

let failed = 0
for (const [name, test] of Object.entries(tests)) {
  try {
    test()
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL  ${name}\n      ${error.message.split('\n').slice(0, 6).join('\n      ')}`)
  }
}
console.log(failed ? `\n${failed} of ${Object.keys(tests).length} failed.` : `\nAll ${Object.keys(tests).length} platform lab checks pass.`)
process.exit(failed ? 1 : 0)
