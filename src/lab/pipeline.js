// Simulates a Mule release pipeline: build, MUnit, publish to Exchange, deploy to Sandbox, promote to Production.
// Pure: every action returns a new state. A run is a list of stages that step() executes one at a time.
// Exchange rules come from exchange.js. Facts come from the Mule Maven plugin, MUnit, CloudHub 2.0 and API Manager
// pages; anything those pages do not state carries `basis: 'assumed'` or an `assumption` sentence.
import { emptyState, findVersion, hardDeleteReserved, isSemver, isSnapshot, nextAvailableVersion, publish, setGavReuse } from './exchange.js'

const MMP = 'https://docs.mulesoft.com/mule-runtime/latest/mmp-concept'
const CH2 = 'https://docs.mulesoft.com/mule-runtime/latest/deploy-to-cloudhub-2'
const COVERAGE = 'https://docs.mulesoft.com/munit/latest/coverage-maven-concept'
const MUNIT = 'https://docs.mulesoft.com/munit/latest/munit-maven-plugin'
const UPDATE = 'https://docs.mulesoft.com/cloudhub-2/ch2-update-apps'
const PROMOTE = 'https://docs.mulesoft.com/api-manager/latest/promote-api-task'
const PUBLISHING = 'https://docs.mulesoft.com/exchange/to-publish-assets-maven'

export const ASSET_ID = 'orders-papi' // sample application
export const ENVIRONMENTS = ['Sandbox', 'Production']
export const REQUIRED_KEYS = ['db.host', 'db.user', 'db.password'] // what the sample application reads at startup
export const MAX_CONFIGS = 10
const MAX_RUNS = 8

export const DEPLOY_COMMANDS = [
  { id: 'mule-deploy', name: 'mvn mule:deploy', note: 'Deploys the published artifact without rebuilding it.' },
  { id: 'clean-deploy-mule', name: 'mvn clean deploy -DmuleDeploy', note: 'Packages the project again, then deploys.' },
  { id: 'clean-deploy', name: 'mvn clean deploy', note: 'No muleDeploy: uploads to the repository in distributionManagement.' },
]

export const PROPERTY_MODES = [
  { id: 'omit', name: 'Omit both elements', note: 'CloudHub 2.0 keeps the properties already in the environment.' },
  { id: 'partial', name: 'properties with api.id only', note: 'Only what the POM defines is deployed. There is no merge.' },
  { id: 'full', name: 'Full set in properties and secureProperties', note: 'The pipeline owns every value.' },
]

export const newConfig = () => ({
  version: '2.4.0',
  versionStrategy: 'fixed',
  pluginExtensions: true,
  mavenDeployPlugin: false,
  testCount: 46,
  testsFailing: 0,
  skipTests: false,
  runCoverage: true,
  failBuild: true,
  requiredApplicationCoverage: 80,
  requiredFlowCoverage: 60,
  childOverride: false,
  applicationCoverage: 86,
  lowestFlowCoverage: 72,
  ignoreLowestFlow: false,
  publishStage: true,
  deployCommand: 'mule-deploy',
  verifyVersion: false,
  skipDeploymentVerification: false,
  updateStrategy: 'rolling',
  propertiesMode: 'omit',
  authMode: 'server',
  deployUserPass: false,
  personalAccountActive: true,
  connectedAppScope: true,
  snapshotGuard: true,
  deployProduction: true,
})

// sample values for the application; they stand for what each environment needs
const sampleValues = (envName) => ({
  properties: { 'db.host': `db.${envName.toLowerCase()}.lab`, 'db.user': 'orders', 'client.id': `${envName.toLowerCase()}-client` },
  secure: { 'db.password': 'sample-value' },
})

function seededEnv(envName, instance) {
  const { properties, secure } = sampleValues(envName)
  const withApi = instance ? { ...properties, 'api.id': instance.id } : { ...properties, 'client.id': 'sandbox-client' }
  return {
    status: 'Running',
    version: '2.3.0',
    build: 'b-1',
    properties: withApi,
    secure,
    applied: `${envName}-config-0`,
    configs: [{ id: `${envName}-config-0`, version: '2.3.0', build: 'b-1', properties: withApi, secure, status: 'Applied' }],
    instance,
  }
}

const sandboxInstance = () => ({
  label: 'orders-papi-v1',
  id: '18800101',
  assetVersion: '2.3.0',
  policies: ['Client ID Enforcement', 'Rate Limiting'],
  tiers: ['Gold'],
  alerts: ['Policy violation'],
})

export function newState() {
  const exchange = emptyState()
  const record = (version, publishedDay) => ({
    assetId: ASSET_ID, name: ASSET_ID, typeId: 'mule-application', version, lifecycle: 'stable', publishedDay, apiVersion: '', dependencies: [], keywords: [], tags: [], file: `${ASSET_ID}-${version}-mule-application.jar`,
    instances: 0, appliedPolicies: 0, stale: false, method: 'maven', build: 'b-1',
  })
  exchange.versions.push(record('2.3.0', -9))
  exchange.reserved.push({ assetId: ASSET_ID, version: '2.2.1', typeId: 'mule-application', deletedDay: -30 })
  return {
    exchange,
    buildSerial: 1,
    configSerial: 0,
    instanceSerial: 18800101,
    runSerial: 0,
    runs: [],
    envs: { Sandbox: seededEnv('Sandbox', sandboxInstance()), Production: seededEnv('Production', null) },
  }
}

const line = (level, text, basis = 'assumed') => ({ level, text, basis })
const issue = (severity, title, cause, fix, extra = {}) => ({ severity, title, cause, fix, basis: 'docs', ...extra })
const failure = (...args) => issue('failure', ...args)
const warning = (...args) => issue('warning', ...args)

const commandName = (id) => DEPLOY_COMMANDS.find((c) => c.id === id).name

export function stagesFor(config) {
  return [
    { id: 'build', name: 'Build', command: 'mvn clean package' },
    { id: 'munit', name: 'MUnit and coverage', command: config.skipTests ? 'mvn test -DskipTests' : 'mvn test' },
    ...(config.publishStage ? [{ id: 'publish', name: 'Publish to Exchange', command: 'mvn clean deploy' }] : []),
    { id: 'Sandbox', name: 'Deploy to Sandbox', command: `${commandName(config.deployCommand)} -Denvironment=Sandbox` },
    ...(config.deployProduction ? [{ id: 'Production', name: 'Promote to Production', command: `${commandName(config.deployCommand)} -Denvironment=Production` }] : []),
  ]
}

function runBuild(state, run) {
  const { config } = run
  if (!config.pluginExtensions) {
    return {
      issues: [failure('The Mule Maven plugin does not work', 'The plugin declaration has no <extensions>true</extensions>. Without it the plugin does not work.', 'Add <extensions>true</extensions> to the mule-maven-plugin declaration.', { docs: MMP, assumption: 'The docs do not give the exact build error.' })],
    }
  }
  if (!isSemver(run.version)) {
    return { issues: [failure('Version is not a semantic version', `"${run.version}" does not follow major.minor.patch, and Exchange requires semantic versioning.`, 'Set a version such as 2.4.0.', { docs: 'https://docs.mulesoft.com/exchange/asset-versions' })] }
  }
  run.build = `b-${++state.buildSerial}`
  return { logs: [line('INFO', `Packaged ${ASSET_ID}-${run.version}-mule-application.jar as build ${run.build}.`)] }
}

function coverageMisses(config) {
  const misses = []
  if (config.requiredApplicationCoverage >= 0 && config.applicationCoverage < config.requiredApplicationCoverage) {
    misses.push(`Application coverage is below defined limit. Required: ${config.requiredApplicationCoverage}.0% - Current: ${config.applicationCoverage}.00%`)
  }
  if (config.requiredFlowCoverage >= 0 && config.lowestFlowCoverage < config.requiredFlowCoverage && !config.ignoreLowestFlow) {
    misses.push(`Flow: orders.xml -> order-reopened-flow coverage is below defined limit. Required: ${config.requiredFlowCoverage}.0% - Current: ${config.lowestFlowCoverage}.00%`)
  }
  return misses
}

function runMunit(state, run) {
  const { config } = run
  if (config.skipTests) {
    return {
      issues: [warning('Tests were skipped', 'skipTests stops MUnit test execution, so no test ran and coverage was not measured. The release has no test evidence.', 'Remove skipTests.', { docs: MUNIT })],
    }
  }
  if (config.testCount <= 0) {
    return { issues: [failure('No MUnit tests ran', 'By default MUnit fails the Maven build if it finds no test suites or if no tests run.', 'Add MUnit tests. Set munitFailIfNoTests to false only when no tests are expected.', { docs: MUNIT })] }
  }
  const logs = [line('INFO', `Tests: ${config.testCount} - Failed: ${config.testsFailing} - Errors: 0 - Skipped: 0`)]
  if (config.testsFailing > 0) {
    return { logs, issues: [failure('MUnit tests failed', `${config.testsFailing} of ${config.testCount} tests failed.`, 'Fix the failing tests. Skipping them removes the protection and does not fix the fault.', { basis: 'assumed' })] }
  }
  if (!config.runCoverage) return { logs: [...logs, line('INFO', 'Coverage is not enabled, so no gate applies.', 'docs')] }
  logs.push(line('INFO', `Application Coverage: ${config.applicationCoverage}.00%`, 'docs'))
  if (config.childOverride) {
    const hidden = coverageMisses(config).length > 0
    const below = hidden ? ` The application is at ${config.applicationCoverage}%, which the parent gate would reject.` : ''
    return {
      logs,
      issues: [warning('The parent coverage gate is switched off', `The child POM overrides the parent coverage block and does not repeat failBuild or the required levels, so defaults apply. A level left undefined is -1, which sets no requirement.${below}`, 'Remove the override, or repeat failBuild and the required levels in it. Check with mvn help:effective-pom.', { docs: MUNIT, incident: 'inc-088' })],
    }
  }
  const misses = coverageMisses(config)
  if (misses.length === 0) return { logs }
  // the coverage page shows only the flow line, and only as the failBuild false warning
  const levels = misses.map((m) => line(config.failBuild ? 'ERROR' : 'WARN', m, config.failBuild || m.startsWith('Application') ? 'assumed' : 'docs'))
  if (!config.failBuild) {
    return { logs: [...logs, ...levels], issues: [warning('Coverage is below the required level', 'failBuild is false, so the summary shows a warning and the build continues.', 'Add real tests for the listed flows, then set failBuild to true.', { docs: COVERAGE })] }
  }
  return {
    logs: [...logs, ...levels],
    issues: [failure('Coverage gate failed', 'All tests pass, but coverage is below the required level and failBuild is true.', 'Write real tests for what the report in target/site/munit/coverage/ lists. Use ignoreFlows only for flows that need no test, because an ignored flow does not count as coverage data.', { docs: COVERAGE, incident: 'inc-088' })],
  }
}

function upload(state, run) {
  const result = publish(state.exchange, { assetId: ASSET_ID, name: ASSET_ID, typeId: 'mule-application', version: run.version, method: 'maven', facade: 3, role: 'contributor', file: `${ASSET_ID}-${run.version}-mule-application.jar` })
  if (!result.outcome.ok) {
    const { title, cause, fix, basis, assumption, docs } = result.outcome
    return { ok: false, issue: failure(title, cause, fix, { basis, assumption, docs, incident: 'inc-098' }) }
  }
  state.exchange = result.state
  const version = findVersion(state.exchange, ASSET_ID, run.version)
  version.build = run.build ?? version.build
  return { ok: true, text: result.outcome.title, cause: result.outcome.cause, overwritten: result.outcome.title.startsWith('Overwrote') }
}

function runPublish(state, run) {
  const { config } = run
  if (config.mavenDeployPlugin) {
    return {
      issues: [failure('maven-deploy-plugin is in the POM', 'The publishing page says not to include maven-deploy-plugin, because it is not compatible with the required Mule Maven plugin.', 'Remove maven-deploy-plugin from the POM and the settings file.', { docs: PUBLISHING, assumption: 'The docs do not describe the failure. The lab shows it as a failed publish.' })],
    }
  }
  const result = upload(state, run)
  if (!result.ok) return { logs: [line('ERROR', `${result.issue.title}: ${result.issue.cause}`, result.issue.basis)], issues: [result.issue] }
  return {
    logs: [line('INFO', `Uploading to Repository: .../${ASSET_ID}-${run.version}-mule-application.jar`), line('INFO', result.overwritten ? 'SNAPSHOT overwritten without any errors.' : result.cause, 'docs')],
  }
}

function authIssue(config) {
  if (config.deployUserPass && !config.personalAccountActive) {
    return failure(
      '401 Unauthorized on the deploy goal',
      'The deployment configuration has username and password, which overwrite the server ID. The job has been using that personal account, and the account is now disabled.',
      'Remove username and password from the deployment configuration and stop passing them, so the server entry applies. Prefer a Connected App for pipelines.',
      { docs: CH2, incident: 'inc-121', assumption: 'The docs state the overwrite. The 401 is the lab showing a refused login.' },
    )
  }
  if (!config.deployUserPass && config.authMode === 'connected-app' && !config.connectedAppScope) {
    return failure('The Connected App is missing a scope', 'The Connected App credentials must have the Design Center Developer access scope.', 'Add the Design Center Developer scope, and the scopes the target needs.', { docs: CH2, assumption: 'The docs state the requirement. They do not describe the failure.' })
  }
  return null
}

function uploadOnly(state, run, envName) {
  const { config } = run
  const result = upload(state, run)
  if (!result.ok) return { issues: [{ ...result.issue, cause: `This stage runs mvn clean deploy, which publishes again. ${result.issue.cause}`, fix: `Use mvn mule:deploy to deploy what is already published. ${result.issue.fix}` }] }
  const env = state.envs[envName]
  const logs = [line('INFO', `Uploading to Repository: .../${ASSET_ID}-${run.version}-mule-application.jar`), line('INFO', 'BUILD SUCCESS. No deployment output: the target was not contacted.')]
  const text = `${envName} still runs ${env.version ?? 'nothing'}. Without muleDeploy the plugin only uploads the artifact to the repository in distributionManagement.`
  const fix = 'Deploy with mvn mule:deploy, or use mvn clean deploy -DmuleDeploy. Name stages after what they do.'
  if (config.verifyVersion) {
    return { logs, issues: [failure('Running version does not match', `The check expected ${run.version}. ${text}`, fix, { docs: MMP, incident: 'inc-122' })] }
  }
  return { logs, issues: [warning('Green stage, nothing deployed', text, `${fix} Add a check that compares the running version with the expected one.`, { docs: MMP, incident: 'inc-122' })] }
}

// What the POM sends, and what the environment then holds. The note on `properties` in the CloudHub 2.0 reference decides this.
function propertiesAfter(config, envName, env) {
  if (config.propertiesMode === 'omit') return { properties: env.properties, secure: env.secure, removed: [] }
  const sent =
    config.propertiesMode === 'full'
      ? (() => {
          const values = sampleValues(envName)
          return { properties: { ...values.properties, ...(env.instance ? { 'api.id': env.instance.id } : {}) }, secure: values.secure }
        })()
      : { properties: { 'api.id': env.instance?.id ?? 'not-set' }, secure: {} }
  const kept = new Set([...Object.keys(sent.properties), ...Object.keys(sent.secure)])
  const removed = [...Object.keys(env.properties), ...Object.keys(env.secure)].filter((k) => !kept.has(k))
  return { ...sent, removed }
}

const missingKeys = ({ properties, secure }) => REQUIRED_KEYS.filter((k) => !(k in properties) && !(k in secure))

function addConfig(state, env, fields) {
  const entry = { id: `config-${++state.configSerial}`, ...fields }
  env.configs = [entry, ...env.configs].slice(0, MAX_CONFIGS)
  return entry
}

function startFailure(state, run, envName, values, missing) {
  const { config } = run
  const env = state.envs[envName]
  const hadRunning = Boolean(env.applied)
  const logs = missing.map((k) => line('ERROR', `Couldn't find configuration property value for key \${${k}}`))
  logs.push(line('ERROR', 'Application failed to start'))
  addConfig(state, env, { version: run.version, build: run.build, properties: values.properties, secure: values.secure, status: hadRunning ? 'Update failed' : 'Failed' })
  env.properties = values.properties
  env.secure = values.secure
  if (hadRunning) {
    if (config.updateStrategy === 'recreate') logs.push(line('WARN', 'Recreate terminated the replicas first, so the application was not receiving traffic during the attempt.', 'docs'))
    logs.push(line('WARN', `Update failed. Rolled back to the last successful version ${env.version}.`, 'docs'))
  } else {
    env.status = 'Failed'
    logs.push(line('WARN', 'This is the first deployment, so no rollback version is defined. The application stays failed.', 'docs'))
  }
  const partial = config.propertiesMode === 'partial' && values.removedAny
  const cause = partial
    ? `The POM has a properties element, so CloudHub 2.0 deployed only what the POM defines and removed the rest: ${values.removed.join(', ')}. The application cannot resolve ${missing.join(', ')}.`
    : `The application reads ${missing.join(', ')} and no value exists in ${envName}.`
  const fix = partial
    ? 'Send the full set of properties and secure properties on every redeploy, or omit both elements so that CloudHub 2.0 preserves existing values. An older version alone does not bring the values back.'
    : 'Send the full set of properties and secure properties, or set them in Runtime Manager and deploy again.'
  const kept = 'The lab keeps the reduced property list on the environment after the automatic rollback, as in inc-120. The docs do not state this.'
  const extra = { docs: CH2, incident: partial ? 'inc-120' : undefined, assumption: partial && hadRunning ? kept : undefined }
  if (config.skipDeploymentVerification) {
    const skipped = warning('Green stage, application did not start', `skipDeploymentVerification is true, so the plugin did not check the status of the deployed app. ${cause}`, `Keep skipDeploymentVerification at its default of false. ${fix}`, { ...extra, docs: MMP })
    return { logs, issues: [skipped] }
  }
  return { logs, issues: [failure('Deployment verification failed', cause, fix, extra)] }
}

function deployTo(state, run, envName) {
  const { config } = run
  const env = state.envs[envName]
  const notes = []
  if (envName === 'Production' && isSnapshot(run.version)) {
    const cause = `${run.version} is a SNAPSHOT. Snapshot assets can change after deployment, so the docs say to avoid deploying them to production.`
    const fix = 'Release from a tag with a fixed version, and deploy that version to every environment.'
    if (config.snapshotGuard) return { issues: [failure('SNAPSHOT blocked before Production', `The pipeline guard stopped this stage. ${cause}`, fix, { docs: CH2, incident: 'inc-123' })] }
    notes.push(warning('SNAPSHOT running in Production', `${cause} Each redeploy refreshes the app with the latest snapshot binaries.`, fix, { docs: CH2, incident: 'inc-123' }))
  }
  const auth = authIssue(config)
  if (auth) return { logs: [line('ERROR', auth.title, 'assumed')], issues: [auth] }
  if (config.deployUserPass) {
    notes.push(warning('The server entry is not in use', 'The deployment configuration sets username and password, and they overwrite the server ID. This deployment logged in with a personal account.', 'Remove username and password from the deployment configuration.', { docs: CH2, incident: 'inc-121' }))
  }
  if (config.deployCommand === 'clean-deploy') {
    const result = uploadOnly(state, run, envName)
    return { ...result, issues: [...notes, ...(result.issues ?? [])] }
  }
  const published = findVersion(state.exchange, ASSET_ID, run.version)
  if (!published) {
    return { issues: [failure('The application is not published in Exchange', `${run.version} is not in Exchange, and deploying to CloudHub 2.0 requires the application to be published there first.`, 'Keep the publish stage, or publish the version before deploying.', { docs: CH2, assumption: 'The docs state the prerequisite. They do not describe the failure.' })] }
  }
  if (envName === 'Production' && config.deployCommand === 'clean-deploy-mule') {
    notes.push(warning('Production was packaged again', 'mvn clean deploy -DmuleDeploy packages the project again, so this may not be the artifact tested in Sandbox.', 'Use mvn mule:deploy to deploy the artifact without rebuilding it.', { docs: CH2, assumption: 'The docs state the rebuild. The risk to a tested artifact is the lab reasoning from it.' }))
  }
  run.build ??= published.build
  const after = propertiesAfter(config, envName, env)
  const values = { ...after, removedAny: after.removed.length > 0 }
  const logs = [line('INFO', `Deploying ${ASSET_ID} ${run.version} to ${envName} (CloudHub 2.0), ${config.updateStrategy} update.`)]
  if (after.removed.length > 0) logs.push(line('WARN', `Removed from ${envName}: ${after.removed.join(', ')}.`, 'docs'))
  const missing = missingKeys(after)
  if (missing.length > 0) {
    const failed = startFailure(state, run, envName, values, missing)
    const issues = [...notes, ...failed.issues]
    if (config.skipDeploymentVerification && config.verifyVersion) {
      issues.push(failure('Running version does not match', `The check expected ${run.version}, and ${envName} runs ${env.version ?? 'nothing'}.`, failed.issues[0].fix, { docs: CH2, basis: 'assumed' }))
    }
    return { logs: [...logs, ...failed.logs], issues }
  }
  const build = published.build
  const entry = addConfig(state, env, { version: run.version, build, properties: after.properties, secure: after.secure, status: 'Applied' })
  Object.assign(env, { status: 'Running', version: run.version, build, properties: after.properties, secure: after.secure, applied: entry.id })
  logs.push(line('INFO', `${ASSET_ID} ${run.version} started in ${envName}.`))
  if (config.skipDeploymentVerification) logs.push(line('WARN', 'Status verification was skipped.', 'docs'))
  return { logs, issues: notes }
}

const RUNNERS = { build: runBuild, munit: runMunit, publish: runPublish }

function finishRun(run) {
  run.done = true
  const statuses = run.stages.map((s) => s.status)
  run.result = statuses.includes('failed') ? 'Failed' : statuses.includes('warned') ? 'Passed with warnings' : 'Passed'
}

export const running = (state) => state.runs[0] && !state.runs[0].done ? state.runs[0] : null

function addRun(state, config, version, stages) {
  const next = structuredClone(state)
  const run = { id: ++next.runSerial, config: structuredClone(config), version, build: null, stages: stages.map((s) => ({ ...s, status: 'pending', logs: [], issues: [] })), done: false, result: null }
  next.runs = [run, ...next.runs].slice(0, MAX_RUNS)
  return next
}

export function startRun(state, config) {
  if (running(state)) return state
  const version = config.versionStrategy === 'next' ? nextAvailableVersion(state.exchange, ASSET_ID, 'PATCH') : String(config.version).trim()
  return addRun(state, config, version, stagesFor(config))
}

// Runs only the deploy step for a version, as rerunning a deployment job does. Nothing is built or published.
export function startRedeploy(state, config, envName, version) {
  if (running(state)) return state
  const stage = { id: envName, name: `Redeploy to ${envName}`, command: `${commandName('mule-deploy')} -Denvironment=${envName}` }
  return addRun(state, { ...config, deployCommand: 'mule-deploy' }, version, [stage])
}

// Executes the next stage. A failed stage stops the run and the stages after it are skipped.
export function step(state) {
  if (!running(state)) return state
  const next = structuredClone(state)
  const run = next.runs[0]
  const at = run.stages.findIndex((s) => s.status === 'pending')
  const stage = run.stages[at]
  const runner = RUNNERS[stage.id] ?? ((s, r) => deployTo(s, r, stage.id))
  const { logs = [], issues = [] } = runner(next, run)
  stage.logs = logs
  stage.issues = issues
  const failed = issues.some((i) => i.severity === 'failure')
  stage.status = failed ? 'failed' : issues.length > 0 ? 'warned' : 'passed'
  if (failed) for (const later of run.stages.slice(at + 1)) later.status = 'skipped'
  if (failed || at === run.stages.length - 1) finishRun(run)
  return next
}

export function settle(state) {
  let next = state
  for (let guard = 0; guard < 20 && running(next); guard++) next = step(next)
  return next
}

// A feature branch building the same POM version publishes over the SNAPSHOT that an environment may run.
export function overwriteSnapshot(state, version) {
  if (!isSnapshot(version) || !findVersion(state.exchange, ASSET_ID, version)) return state
  const next = structuredClone(state)
  const result = publish(next.exchange, { assetId: ASSET_ID, typeId: 'mule-application', version, method: 'maven', facade: 3, role: 'contributor', file: `${ASSET_ID}-${version}-feature.jar` })
  next.exchange = result.state
  findVersion(next.exchange, ASSET_ID, version).build = `b-${++next.buildSerial}-feature`
  return next
}

// True for binaries that came from overwriteSnapshot, so unfinished code can be pointed out.
export function isFeatureBuild(build) {
  return String(build).endsWith('-feature')
}

// Runtime Manager rollback: the chosen configuration moves to the top of the history and keeps its identifier.
export function rollback(state, envName, configId) {
  const env = state.envs[envName]
  const target = env.configs.find((c) => c.id === configId)
  if (!env.applied) {
    return { state, outcome: failure('No rollback version is defined', 'This is the first deployment of the application, so a failed deployment stays failed.', 'Correct the fault and deploy again.', { docs: UPDATE }) }
  }
  if (target?.status !== 'Applied') {
    return { state, outcome: failure('Only a successful configuration can be rolled back to', `${configId ?? 'This entry'} did not deploy successfully.`, 'Choose a configuration with the status Applied.', { docs: UPDATE }) }
  }
  const next = structuredClone(state)
  const nextEnv = next.envs[envName]
  const entry = nextEnv.configs.find((c) => c.id === configId)
  const latest = findVersion(next.exchange, ASSET_ID, entry.version)?.build ?? entry.build
  const changed = isSnapshot(entry.version) && latest !== entry.build
  entry.build = latest
  nextEnv.configs = [entry, ...nextEnv.configs.filter((c) => c !== entry)]
  Object.assign(nextEnv, { status: 'Running', version: entry.version, build: entry.build, properties: entry.properties, secure: entry.secure, applied: entry.id })
  if (changed) {
    return {
      state: next,
      outcome: warning('Rolled back to a version whose content has changed', `${entry.version} was overwritten in Exchange, so the name now points at build ${latest}. There is no earlier artifact under this version to return to.`, 'Rebuild the known good commit with a release version, publish it and deploy it.', { docs: CH2, incident: 'inc-123', assumption: 'The docs state that a redeploy takes the latest snapshot binaries. The lab applies the same to a rollback.' }),
    }
  }
  return {
    state: next,
    outcome: issue('success', `${envName} rolled back to ${entry.id}`, `${ASSET_ID} ${entry.version} runs again, and its entry moved to the top of the history with its original identifier.`, null, { docs: UPDATE, assumption: 'Application property values are part of a configuration, so the lab restores them. The docs do not say this for secure values.' }),
  }
}

export function undeploy(state, envName) {
  const next = structuredClone(state)
  Object.assign(next.envs[envName], { status: 'Not deployed', version: null, build: null, properties: {}, secure: {}, applied: null, configs: [] })
  return next
}

// Frees a reserved number with the third documented way out of the 409.
export function freeReserved(state, version) {
  const enabled = setGavReuse(state.exchange, true, 'admin')
  const result = hardDeleteReserved(enabled.state, ASSET_ID, version, 'admin')
  return { state: { ...state, exchange: result.state }, outcome: result.outcome }
}

export const newPromotion = () => ({
  source: 'Sandbox',
  target: 'Production',
  includePolicies: true,
  includeTiers: true,
  includeAlerts: true,
  manageApis: true,
  managePolicies: true,
  sameClientProvider: true,
})

export function promoteInstance(state, input) {
  const source = state.envs[input.source]?.instance
  const target = state.envs[input.target]
  if (!input.manageApis) {
    return { state, outcome: failure('Permission missing', 'Promoting an API instance needs the Manage APIs Configuration permission.', 'Grant Manage APIs Configuration in the target environment.', { docs: PROMOTE }) }
  }
  if (input.includePolicies && !input.managePolicies) {
    return { state, outcome: failure('Permission missing for policies', 'To promote an entity you must be able to view and manage it. Policies need View Policies and Manage Policies.', 'Grant both permissions, or clear policies from Include in Promotion.', { docs: PROMOTE }) }
  }
  if (!source) return { state, outcome: failure('No API instance in the source environment', `${input.source} has no instance to promote.`, 'Choose the environment that holds the instance.', { basis: 'assumed' }) }
  if (target.instance) return { state, outcome: failure('The target already has this instance', `${input.target} already holds ${target.instance.label}.`, 'Work on the existing instance. The lab allows one instance per environment.', { basis: 'assumed' }) }
  const next = structuredClone(state)
  next.envs[input.target].instance = {
    label: source.label,
    id: String(++next.instanceSerial),
    assetVersion: source.assetVersion,
    policies: input.includePolicies ? source.policies : [],
    tiers: input.includeTiers ? source.tiers : [],
    alerts: input.includeAlerts ? source.alerts : [],
  }
  const instance = next.envs[input.target].instance
  const mismatch = input.includePolicies && !input.sameClientProvider
  const steps = 'The label stayed the same and the API Instance ID changed. The deployed application is not affected: update the API Instance ID and the client ID and secret in it, then review Runtime & Endpoint Configuration.'
  return {
    state: next,
    outcome: mismatch
      ? warning(`Promoted as ${instance.id}, with a policy mismatch risk`, `The environments use different client provider types, so client provider policies may not match. ${steps}`, 'Use the same client provider type in both environments, or delete every client provider policy on the promoted API.', { docs: 'https://docs.mulesoft.com/api-manager/latest/configure-multiple-credential-providers', assumption: 'The names of the Include in Promotion options are not listed in the docs.' })
      : issue('success', `Promoted as ${instance.id}`, steps, null, { docs: PROMOTE, assumption: 'The names of the Include in Promotion options are not listed in the docs.' }),
  }
}

// Whether the application in an environment points at that environment's API instance.
export function pairing(state, envName) {
  const env = state.envs[envName]
  const problems = []
  if (!env.instance) return { paired: false, problems: [`${envName} has no API instance.`] }
  if (env.properties['api.id'] !== env.instance.id) problems.push(`api.id is ${env.properties['api.id'] ?? 'not set'} and the instance ID is ${env.instance.id}.`)
  if (env.properties['client.id'] !== sampleValues(envName).properties['client.id']) problems.push(`client.id is ${env.properties['client.id'] ?? 'not set'}. Each environment has a different client ID and secret.`)
  return { paired: problems.length === 0, problems }
}

// Updates the application as the promotion page instructs. Runtime Manager records it as a new configuration.
export function updateBinding(state, envName, { apiId = true, credentials = true } = {}) {
  const next = structuredClone(state)
  const env = next.envs[envName]
  if (!env.instance || !env.applied) return state
  const properties = { ...env.properties }
  if (apiId) properties['api.id'] = env.instance.id
  if (credentials) properties['client.id'] = sampleValues(envName).properties['client.id']
  const entry = addConfig(next, env, { version: env.version, build: env.build, properties, secure: env.secure, status: 'Applied' })
  env.properties = properties
  env.applied = entry.id
  return next
}

// What the deployment block of the POM looks like with these options, for the learner to read.
export function pomPreview(config) {
  const auth = [
    config.authMode === 'server' ? '  <server>anypoint-deployer</server>' : ['  <connectedAppClientId>${client.id}</connectedAppClientId>', '  <connectedAppClientSecret>${client.secret}</connectedAppClientSecret>', '  <connectedAppGrantType>client_credentials</connectedAppGrantType>'].join('\n'),
    ...(config.deployUserPass ? ['  <username>${anypoint.user}</username>', '  <password>${anypoint.pass}</password>'] : []),
  ]
  const properties = {
    omit: [],
    partial: ['  <properties>', '    <api.id>${api.id}</api.id>', '  </properties>'],
    full: ['  <properties>', '    <db.host>${db.host}</db.host>', '    <db.user>${db.user}</db.user>', '    <client.id>${app.client.id}</client.id>', '    <api.id>${api.id}</api.id>', '  </properties>', '  <secureProperties>', '    <db.password>${db.password}</db.password>', '  </secureProperties>'],
  }[config.propertiesMode]
  return [
    '<cloudhub2Deployment>',
    '  <provider>MC</provider>',
    '  <environment>${environment}</environment>',
    '  <target>${target}</target>',
    `  <applicationName>${ASSET_ID}</applicationName>`,
    '  <replicas>1</replicas>',
    '  <vCores>0.5</vCores>',
    ...auth,
    ...properties,
    ...(config.skipDeploymentVerification ? ['  <skipDeploymentVerification>true</skipDeploymentVerification>'] : []),
    '  <deploymentSettings>',
    `    <updateStrategy>${config.updateStrategy}</updateStrategy>`,
    '  </deploymentSettings>',
    '</cloudhub2Deployment>',
  ].join('\n')
}

// Each scenario breaks the default pipeline one way. `expect` names the stage it shows up in; `fix` is applied on the
// state the broken run left behind, because what a failed run already published stays published.
export const SCENARIOS = [
  { id: 'upload-only', title: 'No muleDeploy: the plugin only uploads', incident: 'inc-122', patch: { publishStage: false, deployCommand: 'clean-deploy', deployProduction: false }, expect: { stage: 'Sandbox', status: 'warned' }, fix: { deployCommand: 'mule-deploy' } },
  { id: 'upload-only-checked', title: 'No muleDeploy, with a running version check', incident: 'inc-122', patch: { publishStage: false, deployCommand: 'clean-deploy', deployProduction: false, verifyVersion: true }, expect: { stage: 'Sandbox', status: 'failed' }, fix: { deployCommand: 'mule-deploy' } },
  { id: 'partial-properties', title: 'A properties element replaces Runtime Manager values', incident: 'inc-120', patch: { propertiesMode: 'partial' }, expect: { stage: 'Sandbox', status: 'failed' }, fix: { propertiesMode: 'full', publishStage: false } },
  { id: 'skipped-verification', title: 'Failed start hidden by skipDeploymentVerification', incident: 'inc-120', patch: { propertiesMode: 'partial', skipDeploymentVerification: true }, expect: { stage: 'Sandbox', status: 'warned' }, fix: { propertiesMode: 'full', skipDeploymentVerification: false, publishStage: false } },
  { id: 'user-overrides-server', title: 'username and password overwrite the server ID', incident: 'inc-121', patch: { deployUserPass: true, personalAccountActive: false }, expect: { stage: 'Sandbox', status: 'failed' }, fix: { deployUserPass: false, publishStage: false } },
  { id: 'hidden-personal-account', title: 'A personal account still works, for now', incident: 'inc-121', patch: { deployUserPass: true }, expect: { stage: 'Sandbox', status: 'warned' }, fix: { deployUserPass: false, publishStage: false } },
  { id: 'snapshot-guard', title: 'SNAPSHOT stopped before Production', incident: 'inc-123', patch: { version: '2.4.0-SNAPSHOT' }, expect: { stage: 'Production', status: 'failed' }, fix: { version: '2.4.0' } },
  { id: 'snapshot-production', title: 'SNAPSHOT reaches Production without a guard', incident: 'inc-123', patch: { version: '2.4.0-SNAPSHOT', snapshotGuard: false }, expect: { stage: 'Production', status: 'warned' }, fix: { version: '2.4.0', snapshotGuard: true } },
  { id: 'coverage-gate', title: 'Coverage gate fails', incident: 'inc-088', patch: { applicationCoverage: 64, lowestFlowCoverage: 0 }, expect: { stage: 'munit', status: 'failed' }, fix: { applicationCoverage: 86, lowestFlowCoverage: 72 } },
  { id: 'coverage-override', title: 'A child POM switches the gate off', incident: 'inc-088', patch: { childOverride: true, applicationCoverage: 64, lowestFlowCoverage: 0 }, expect: { stage: 'munit', status: 'warned' }, fix: { childOverride: false, applicationCoverage: 86, lowestFlowCoverage: 72, versionStrategy: 'next' } },
  { id: 'coverage-warning', title: 'failBuild false only warns', patch: { failBuild: false, applicationCoverage: 64 }, expect: { stage: 'munit', status: 'warned' }, fix: { failBuild: true, applicationCoverage: 86, versionStrategy: 'next' } },
  { id: 'tests-failing', title: 'A test fails', patch: { testsFailing: 2 }, expect: { stage: 'munit', status: 'failed' }, fix: { testsFailing: 0 } },
  { id: 'no-tests', title: 'No MUnit tests run', patch: { testCount: 0 }, expect: { stage: 'munit', status: 'failed' }, fix: { testCount: 46 } },
  { id: 'skip-tests', title: 'Tests skipped', patch: { skipTests: true }, expect: { stage: 'munit', status: 'warned' }, fix: { skipTests: false, versionStrategy: 'next' } },
  { id: 'republish-stable', title: 'Republishing a stable version', incident: 'inc-098', patch: { version: '2.3.0' }, expect: { stage: 'publish', status: 'failed' }, fix: { versionStrategy: 'next' } },
  { id: 'republish-deleted', title: 'Republishing a soft-deleted version', incident: 'inc-098', patch: { version: '2.2.1' }, expect: { stage: 'publish', status: 'failed' }, fix: { versionStrategy: 'next' } },
  { id: 'publish-twice', title: 'mvn clean deploy after a publish stage', incident: 'inc-122', patch: { deployCommand: 'clean-deploy' }, expect: { stage: 'Sandbox', status: 'failed' }, fix: { deployCommand: 'mule-deploy', publishStage: false } },
  { id: 'not-published', title: 'Deploying a version that was never published', patch: { publishStage: false }, expect: { stage: 'Sandbox', status: 'failed' }, fix: { publishStage: true } },
  { id: 'deploy-plugin', title: 'maven-deploy-plugin in the POM', patch: { mavenDeployPlugin: true }, expect: { stage: 'publish', status: 'failed' }, fix: { mavenDeployPlugin: false } },
  { id: 'no-extensions', title: 'Plugin declared without extensions', patch: { pluginExtensions: false }, expect: { stage: 'build', status: 'failed' }, fix: { pluginExtensions: true } },
  { id: 'connected-app-scope', title: 'Connected App without the required scope', patch: { authMode: 'connected-app', connectedAppScope: false }, expect: { stage: 'Sandbox', status: 'failed' }, fix: { connectedAppScope: true, publishStage: false } },
  { id: 'rebuild-production', title: 'Production packaged again', patch: { deployCommand: 'clean-deploy-mule' }, expect: { stage: 'Production', status: 'warned' }, fix: { deployCommand: 'mule-deploy', publishStage: false } },
]
