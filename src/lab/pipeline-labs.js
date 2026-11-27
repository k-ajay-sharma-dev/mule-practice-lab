// Guided labs for the CI/CD screen, which looks like a GitHub Actions page. Each lab starts the release pipeline with
// some options set, and its steps read what you did: the pipeline state, the options, the pages you opened, the job
// logs you read and your answers. A step is met by any route that gets there.
import { isSnapshot } from './exchange.js'
import { isFeatureBuild } from './pipeline.js'
import { coverageSettings, DWL, ERP_REQUEST, mockMatches, munitProject, MUNIT_DOCS, suiteTests, totalFrom, workflowCommands, WORKFLOW } from './pipeline-munit.js'

const MMP = 'https://docs.mulesoft.com/mule-runtime/latest/mmp-concept'
const CH2 = 'https://docs.mulesoft.com/mule-runtime/latest/deploy-to-cloudhub-2'
const COVERAGE = 'https://docs.mulesoft.com/munit/latest/coverage-maven-concept'

const stageIn = (run, id) => run.stages.find((s) => s.id === id)
const someRun = (s, test) => s.runs.some((r) => r.done && test(r))
const failedAt = (s, id) => someRun(s, (r) => stageIn(r, id)?.status === 'failed')
const passedAt = (s, id) => someRun(s, (r) => stageIn(r, id)?.status === 'passed')
const sawView = (ctx, view) => ctx.seen.views.includes(view)
const sawJob = (ctx, job) => ctx.seen.jobs.includes(job)
// runs to Brightmart's own servers: an issue code from pipeline.js, or a deploy that passed through Runtime Manager
const failedWith = (s, code) => someRun(s, (r) => r.stages.some((st) => st.issues.some((i) => i.code === code)))
const hybridPassed = (s, envName, test = () => true) => someRun(s, (r) => r.config.deployTarget === 'hybrid' && stageIn(r, envName)?.status === 'passed' && test(r))
const targetOf = (s, envName, name) => s.envs[envName].targets?.find((t) => t.name === name)

const ON_PREM = 'https://docs.mulesoft.com/mule-runtime/latest/deploy-on-premises'

// runs of the MUnit project (config.munit), and what its files say now
const projectRun = (s, test) => someRun(s, (r) => Boolean(r.config.munit) && test(r))
const munitIssue = (r, code) => r.stages.some((st) => st.issues.some((i) => i.code === code))
const testsOf = (ctx, flow) => (ctx.config.munit ? suiteTests(ctx.config.munit).filter((t) => t.flowRefs.includes(flow) && !t.ignore) : [])
const gateKept = (ctx) => {
  const c = coverageSettings(ctx.config.munit)
  return c.runCoverage && c.failBuild && c.requiredApplicationCoverage >= 80 && !c.ignoreFlows.includes('create-return-flow') && !c.ignoreFiles.includes('returns.xml')
}
// the happy path test of get-order-flow, the one that checks the total
const totalTest = (ctx) => testsOf(ctx, 'get-order-flow').find((t) => !t.expectedErrorType && t.asserts.some((a) => /payload\.total/.test(a.expression ?? '')))
const stillExpects = (t) => t?.asserts.some((a) => /payload\.total/.test(a.expression ?? '') && /equalTo\(\s*107\.5\s*\)/.test(a.is ?? ''))

export const PIPELINE_LABS = [
  {
    id: 'cicd-first-release',
    title: 'Your first release with GitHub Actions',
    scenario: 'Brightmart ships orders-papi 2.4.0 with a GitHub Actions workflow. Run it once and follow the artifact from build to Production.',
    minutes: 8,
    patch: {},
    steps: [
      {
        title: 'Read the workflow options',
        how: 'In the sidebar, open Workflow options. They stand for the inputs and the POM settings that release.yml uses: the version, the MUnit coverage gate, the deploy command and the credentials.',
        done: (ctx) => sawView(ctx, 'options'),
      },
      {
        title: 'Run the workflow',
        how: 'Open Release pipeline in the sidebar and press the green Run workflow button. This is a workflow_dispatch trigger, the same as pressing Run workflow on GitHub.',
        done: (ctx) => ctx.state.runs.length > 0,
      },
      {
        title: 'Wait for every job to finish',
        how: 'Watch the job graph. Each job starts when the one before it passes. A spinner means the job is running. Press Skip to result if you do not want to wait.',
        done: (ctx) => someRun(ctx.state, () => true),
      },
      {
        title: 'Open the Build job log',
        how: 'In the graph, click Build. The dark panel below is the job log. mvn clean package builds the deployable jar, with a build number the later jobs reuse.',
        done: (ctx) => sawJob(ctx, 'build'),
      },
      {
        title: 'Which job lets CloudHub 2.0 deploy the jar?',
        ask: 'CloudHub 2.0 deploys an application from Exchange. Which job puts the jar there?',
        options: ['Build', 'MUnit and coverage', 'Publish to Exchange', 'Deploy to Sandbox'],
        right: 2,
        reason: 'Right. mvn clean deploy publishes the jar to Exchange. mvn mule:deploy then deploys that published artifact without building it again, so Sandbox and Production run the same tested jar.',
      },
      {
        title: 'Check what each environment runs',
        how: 'Open Environments. Sandbox and Production should both run orders-papi 2.4.0 with the same build number, and each deploy adds a line to its configuration history.',
        done: (ctx) => sawView(ctx, 'environments') && ['Sandbox', 'Production'].every((e) => ctx.state.envs[e].version === '2.4.0'),
      },
    ],
    why: 'A release pipeline builds once, tests, publishes the artifact, then deploys that same artifact to each environment. If Production gets a jar that was built again, it is not the one you tested.',
    docs: CH2,
  },
  {
    id: 'cicd-coverage-gate',
    title: 'A green test run with a red job',
    scenario: 'Every MUnit test passes, yet the workflow fails. Find out why, fix it the right way and ship the release.',
    minutes: 8,
    patch: { applicationCoverage: 64, lowestFlowCoverage: 0 },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow on the Release pipeline page and let it finish.',
        done: (ctx) => failedAt(ctx.state, 'munit'),
      },
      {
        title: 'Read the failed job',
        how: 'The run opens on the failed job, MUnit and coverage. Read the Annotations box and the log lines in red.',
        done: (ctx) => sawJob(ctx, 'munit'),
      },
      {
        title: 'Why did the job fail?',
        ask: 'The log says Tests: 46, Failed: 0. Why did the job fail?',
        options: ['One test failed on the build agent', 'Coverage is below the required level and failBuild is true', 'The plugin is declared without extensions', 'Exchange refused the version'],
        right: 1,
        reason: 'Right. The coverage gate failed. With failBuild true, MUnit fails the build when application or flow coverage is below the required level, even when every test passes.',
      },
      {
        title: 'Bring coverage up to the gate',
        how: 'In Workflow options, set Application coverage % to 86 and Lowest flow coverage % to 72. In a real project you get there by writing tests for the flows the coverage report lists. Lowering the required levels or setting failBuild to false hides the gap, so the step does not count that.',
        done: (ctx) => {
          const c = ctx.config
          return c.runCoverage && c.failBuild && c.requiredApplicationCoverage >= 80 && c.requiredFlowCoverage >= 60 && c.applicationCoverage >= c.requiredApplicationCoverage && c.lowestFlowCoverage >= c.requiredFlowCoverage && !c.childOverride && !c.skipTests
        },
      },
      {
        title: 'Run it again and ship',
        how: 'Run the workflow again. Every job should pass, and both environments should run 2.4.0.',
        done: (ctx) => someRun(ctx.state, (r) => r.result === 'Passed' && r.stages.length > 1),
      },
    ],
    why: 'A coverage gate checks how much of the code the tests touch, not whether they pass. Keep failBuild true and the levels in the parent POM, and fix a miss with tests, so the gate keeps its meaning.',
    docs: COVERAGE,
  },
  {
    id: 'cicd-properties',
    title: 'The deploy that wiped the properties',
    scenario: 'A teammate added a properties element with api.id to the deployment block. The next release fails to start in Sandbox. Find the cause and release again.',
    minutes: 10,
    patch: { propertiesMode: 'partial' },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => failedAt(ctx.state, 'Sandbox'),
      },
      {
        title: 'Read the Deploy to Sandbox log',
        how: 'Open the failed job. The log shows which property values the application could not find.',
        done: (ctx) => sawJob(ctx, 'Sandbox'),
      },
      {
        title: 'Why could the app not start?',
        ask: 'Runtime Manager had db.host, db.user and db.password set for Sandbox. Why are they gone?',
        options: ['The database password expired', 'The properties element replaced every value with only what the POM defines', 'Sandbox has no API instance', 'The version is a SNAPSHOT'],
        right: 1,
        reason: 'Right. When the POM has a properties element, CloudHub 2.0 deploys only what the POM defines. There is no merge with the values already in Runtime Manager.',
      },
      {
        title: 'See what Sandbox runs now',
        how: 'Open Environments. The update failed, so Sandbox rolled back to 2.3.0, and the configuration history shows the failed attempt.',
        done: (ctx) => sawView(ctx, 'environments'),
      },
      {
        title: 'Send the full set, or nothing',
        how: 'In Workflow options, set Application properties to Full set in properties and secureProperties, or to Omit both elements so CloudHub 2.0 keeps the values it has.',
        done: (ctx) => ctx.config.propertiesMode !== 'partial',
      },
      {
        title: 'Do not publish 2.4.0 twice',
        how: 'The failed run already published 2.4.0 to Exchange, and a stable version cannot be published again. In Workflow options, clear Separate Publish to Exchange stage, so this run only deploys what is already there.',
        done: (ctx) => ctx.config.publishStage === false,
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Deploy to Sandbox should pass and Sandbox should run 2.4.0 with its database values.',
        done: (ctx) => passedAt(ctx.state, 'Sandbox') && ctx.state.envs.Sandbox.version === '2.4.0' && 'db.host' in ctx.state.envs.Sandbox.properties,
      },
    ],
    why: 'A properties element in the deployment block is the whole list, not a change to it. A pipeline should send every value each time, or none, so a redeploy never removes what the application needs.',
    docs: CH2,
  },
  {
    id: 'cicd-snapshot',
    title: 'A SNAPSHOT on its way to Production',
    scenario: 'The POM still says 2.4.0-SNAPSHOT. The workflow has a guard for that. See why it matters, then release a fixed version.',
    minutes: 10,
    patch: { version: '2.4.0-SNAPSHOT' },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow. Sandbox takes the SNAPSHOT, and the guard stops Promote to Production.',
        done: (ctx) => failedAt(ctx.state, 'Production'),
      },
      {
        title: 'Why stop a SNAPSHOT here?',
        ask: 'Why does the pipeline refuse a SNAPSHOT version for Production?',
        options: ['A SNAPSHOT cannot be published to Exchange', 'A SNAPSHOT can be overwritten after it is deployed, so Production may not run what you tested', 'Production needs more vCores for a SNAPSHOT', 'Exchange deletes a SNAPSHOT after seven days'],
        right: 1,
        reason: 'Right. Anyone who builds the same SNAPSHOT version publishes over it, and each redeploy takes the latest binaries. The name stays the same while the code changes.',
      },
      {
        title: 'Watch a SNAPSHOT change under you',
        how: 'Open Environments. In Sandbox, press Another branch publishes this SNAPSHOT, then press Redeploy 2.4.0-SNAPSHOT. Sandbox now runs a feature branch build with the same version.',
        // the history keeps it after a later release replaces the feature build
        done: (ctx) => ctx.state.envs.Sandbox.configs.some((c) => isFeatureBuild(c.build) && c.status === 'Applied'),
      },
      {
        title: 'Release a fixed version',
        how: 'In Workflow options, set the POM version to 2.4.0, or choose nextAvailableVersion as the version source.',
        done: (ctx) => ctx.config.versionStrategy === 'next' || !isSnapshot(ctx.config.version),
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Promote to Production should pass with a release version.',
        done: (ctx) => someRun(ctx.state, (r) => stageIn(r, 'Production')?.status === 'passed' && !isSnapshot(r.version)),
      },
    ],
    why: 'Release from a fixed version and deploy that same version to every environment. A SNAPSHOT is for work in progress: its content can change while its name stays the same.',
    docs: MMP,
  },
  {
    id: 'cicd-republish',
    title: 'A 409 on publish',
    scenario: 'Someone set the POM back to 2.3.0 to redo a release. The Publish to Exchange job fails with 409 Conflict.',
    minutes: 6,
    patch: { version: '2.3.0' },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => failedAt(ctx.state, 'publish'),
      },
      {
        title: 'Read the annotation',
        how: 'The run opens on Publish to Exchange. Read the Annotations box.',
        done: (ctx) => sawJob(ctx, 'publish'),
      },
      {
        title: 'Why the 409?',
        ask: 'Why does Exchange refuse 2.3.0?',
        options: ['The Connected App has no Exchange scope', '2.3.0 is already published as a stable version, and a stable version cannot be published again', 'The jar is larger than Exchange allows', 'Exchange is down'],
        right: 1,
        reason: 'Right. Exchange keeps a stable version as it is. A version number can be published once, so a new build needs a new number.',
      },
      {
        title: 'See the versions Exchange holds',
        how: 'Open Exchange versions in the sidebar. 2.3.0 is stable, and 2.2.1 is soft deleted and still reserved.',
        done: (ctx) => sawView(ctx, 'exchange'),
      },
      {
        title: 'Let the pipeline pick the next version',
        how: 'In Workflow options, set Version source to nextAvailableVersion (PATCH). The plugin then asks Exchange for the next free number.',
        done: (ctx) => ctx.config.versionStrategy === 'next',
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Publish to Exchange should pass with a new version.',
        done: (ctx) => passedAt(ctx.state, 'publish'),
      },
    ],
    why: 'A published version is fixed. Fix a bad release with a new version, and let the build choose the next free number so two runs never fight over one.',
    docs: 'https://docs.mulesoft.com/exchange/asset-versions',
  },
  {
    id: 'cicd-personal-account',
    title: 'A 401 after someone left the team',
    scenario: 'The deploy job worked for months. Today it fails with 401 Unauthorized. The deployment block has a username and password in it.',
    minutes: 7,
    patch: { deployUserPass: true, personalAccountActive: false },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => failedAt(ctx.state, 'Sandbox'),
      },
      {
        title: 'Read the deploy job',
        how: 'Open Deploy to Sandbox and read the annotation.',
        done: (ctx) => sawJob(ctx, 'Sandbox'),
      },
      {
        title: 'Look at the deployment block',
        how: 'In Workflow options, open "Deployment block these options produce" at the bottom. Find the server entry and the username and password lines.',
        done: (ctx) => sawView(ctx, 'options'),
      },
      {
        title: 'Whose login was it?',
        ask: 'The POM has a server entry and also username and password. Which one did the deploy use?',
        options: ['The server entry, because it comes first', 'The username and password, because they overwrite the server ID', 'Both, one after the other', 'Neither, CloudHub 2.0 needs no login'],
        right: 1,
        reason: 'Right. Username and password in the deployment configuration overwrite the server ID. The job had been logging in with one person\'s account, and that account is now disabled.',
      },
      {
        title: 'Remove the personal login',
        how: 'In Workflow options, clear "username and password also in the deployment block". A Connected App is the better choice for a pipeline, because it belongs to no person.',
        done: (ctx) => !ctx.config.deployUserPass,
      },
      {
        title: 'Do not publish twice',
        how: 'The failed run already published 2.4.0. Clear Separate Publish to Exchange stage.',
        done: (ctx) => ctx.config.publishStage === false,
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Deploy to Sandbox should pass.',
        done: (ctx) => passedAt(ctx.state, 'Sandbox'),
      },
    ],
    why: 'A pipeline should log in with its own identity, such as a Connected App or a service account in settings.xml. A personal login breaks the day that person leaves or changes a password.',
    docs: CH2,
  },
  {
    id: 'cicd-upload-only',
    title: 'Every job is green, nothing changed',
    scenario: 'The release shows green, but Sandbox still runs the old version. The deploy job uses mvn clean deploy.',
    minutes: 7,
    patch: { publishStage: false, deployCommand: 'clean-deploy', deployProduction: false, verifyVersion: true },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow. A version check after the deploy compares what runs with what was built.',
        done: (ctx) => failedAt(ctx.state, 'Sandbox'),
      },
      {
        title: 'Read the deploy job',
        how: 'Open Deploy to Sandbox. The log says BUILD SUCCESS, and the check says the running version does not match.',
        done: (ctx) => sawJob(ctx, 'Sandbox'),
      },
      {
        title: 'What did mvn clean deploy do?',
        ask: 'Without -DmuleDeploy, what does mvn clean deploy do with the Mule Maven plugin?',
        options: ['It deploys to CloudHub 2.0', 'It uploads the jar to the repository in distributionManagement and does not deploy', 'It only runs the tests', 'It deletes the old application'],
        right: 1,
        reason: 'Right. Without muleDeploy the plugin uploads the artifact and the target is never contacted. The job is green because Maven succeeded, not because anything was deployed.',
      },
      {
        title: 'Use the deploy goal',
        how: 'In Workflow options, set Deploy stage command to mvn mule:deploy.',
        done: (ctx) => ctx.config.deployCommand === 'mule-deploy',
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Sandbox should now run 2.4.0, and the version check should pass.',
        done: (ctx) => passedAt(ctx.state, 'Sandbox') && ctx.state.envs.Sandbox.version === '2.4.0',
      },
    ],
    why: 'A green job only says the command succeeded. Check after each deploy that the version running is the one you built, so a job that deploys nothing cannot pass.',
    docs: MMP,
  },
  {
    id: 'cicd-skip-tests',
    title: 'The release that skipped its tests',
    scenario: 'A teammate added -DskipTests to make a slow build faster. The workflow still passes. Find what that costs.',
    minutes: 6,
    patch: { skipTests: true },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => someRun(ctx.state, (r) => stageIn(r, 'munit')?.status === 'warned'),
      },
      {
        title: 'Read the MUnit job',
        how: 'Open MUnit and coverage. It passed with a warning.',
        done: (ctx) => sawJob(ctx, 'munit'),
      },
      {
        title: 'What did skipTests remove?',
        ask: 'What does a release built with -DskipTests lack?',
        options: ['Nothing, the tests ran in the background', 'Any test result and any coverage figure, so the coverage gate never ran', 'Only the coverage report file', 'The jar'],
        right: 1,
        reason: 'Right. skipTests stops MUnit from running, so no test ran and coverage was not measured. The gate cannot fail what it never sees.',
      },
      {
        title: 'Turn the tests back on',
        how: 'In Workflow options, clear Run with -DskipTests. Set Version source to nextAvailableVersion, because 2.4.0 is already published.',
        done: (ctx) => !ctx.config.skipTests && ctx.config.versionStrategy === 'next',
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. MUnit and coverage should pass with no warning.',
        done: (ctx) => passedAt(ctx.state, 'munit'),
      },
    ],
    why: 'Make a slow build faster by fixing slow tests or running them in parallel, not by skipping them. A release with no test evidence should not reach Production.',
    docs: 'https://docs.mulesoft.com/munit/latest/munit-maven-plugin',
  },
  {
    id: 'cicd-connected-app',
    title: 'A Connected App without the right scope',
    scenario: 'The team moved the pipeline from a personal login to a Connected App. The first deploy fails.',
    minutes: 6,
    patch: { authMode: 'connected-app', connectedAppScope: false },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => failedAt(ctx.state, 'Sandbox'),
      },
      {
        title: 'Read the deploy job',
        how: 'Open Deploy to Sandbox and read the annotation.',
        done: (ctx) => sawJob(ctx, 'Sandbox'),
      },
      {
        title: 'What is missing?',
        ask: 'Which access scope does the Connected App need to deploy with the Mule Maven plugin?',
        options: ['Exchange Viewer only', 'Design Center Developer, plus the scopes the target needs', 'Organization Administrator', 'No scope, a client ID is enough'],
        right: 1,
        reason: 'Right. The deploy docs say the Connected App credentials must have the Design Center Developer access scope, plus the scopes the deploy target needs.',
      },
      {
        title: 'Give the Connected App the scope',
        how: 'In Workflow options, tick "Connected App has Design Center Developer". Clear Separate Publish to Exchange stage, because 2.4.0 is already published.',
        done: (ctx) => ctx.config.connectedAppScope && ctx.config.publishStage === false,
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Deploy to Sandbox should pass.',
        done: (ctx) => passedAt(ctx.state, 'Sandbox'),
      },
    ],
    why: 'A Connected App gives a pipeline its own identity. Grant it the scopes the deploy needs and no more, so it works without being an administrator.',
    docs: CH2,
  },
  {
    id: 'cicd-pom-mistakes',
    title: 'Two mistakes in one POM',
    scenario: 'A new project copied its POM from an old template. The build fails, and after that fix something else fails.',
    minutes: 8,
    patch: { pluginExtensions: false, mavenDeployPlugin: true },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => failedAt(ctx.state, 'build'),
      },
      {
        title: 'Fix the plugin declaration',
        how: 'Read the Build annotation. In Workflow options, tick "Plugin has extensions set to true".',
        done: (ctx) => ctx.config.pluginExtensions,
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Build passes now. Watch the next failure.',
        done: (ctx) => failedAt(ctx.state, 'publish'),
      },
      {
        title: 'Why does the publish fail?',
        ask: 'The POM also has maven-deploy-plugin. Why is that a problem?',
        options: ['It makes the jar too large', 'It is not compatible with the Mule Maven plugin, so the docs say not to include it', 'It needs its own Connected App', 'It only works with SNAPSHOT versions'],
        right: 1,
        reason: 'Right. The publishing page says not to include maven-deploy-plugin, because it is not compatible with the Mule Maven plugin that publishes the asset.',
      },
      {
        title: 'Remove maven-deploy-plugin',
        how: 'In Workflow options, clear "POM includes maven-deploy-plugin".',
        done: (ctx) => !ctx.config.mavenDeployPlugin,
      },
      {
        title: 'Run it once more',
        how: 'Run the workflow. Every job should pass.',
        done: (ctx) => someRun(ctx.state, (r) => r.result === 'Passed' && r.stages.length > 1),
      },
    ],
    why: 'The Mule Maven plugin needs extensions set to true and does its own publishing. Old templates often carry plugins that fight with it, so fix one failure and run again to find the next.',
    docs: 'https://docs.mulesoft.com/exchange/to-publish-assets-maven',
  },
  {
    id: 'cicd-rebuild-production',
    title: 'Production got a different jar',
    scenario: 'Every job passes, but the Production deploy has a warning. The deploy command packages the project again.',
    minutes: 6,
    patch: { deployCommand: 'clean-deploy-mule' },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => someRun(ctx.state, (r) => stageIn(r, 'Production')?.status === 'warned'),
      },
      {
        title: 'Read the Production job',
        how: 'Open Promote to Production and read the warning.',
        done: (ctx) => sawJob(ctx, 'Production'),
      },
      {
        title: 'Why does it matter?',
        ask: 'mvn clean deploy -DmuleDeploy packages the project again before it deploys. Why is that a risk for Production?',
        options: ['It is slower', 'The jar in Production may not be the one that was tested in Sandbox', 'It skips the Sandbox deploy', 'It changes the application name'],
        right: 1,
        reason: 'Right. A new build can pick up a changed dependency or a different commit. Deploy the artifact you tested, not a new one.',
      },
      {
        title: 'Deploy without rebuilding',
        how: 'In Workflow options, set Deploy stage command to mvn mule:deploy, and clear Separate Publish to Exchange stage because 2.4.0 is already published.',
        done: (ctx) => ctx.config.deployCommand === 'mule-deploy' && ctx.config.publishStage === false,
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Promote to Production should pass with no warning.',
        done: (ctx) => passedAt(ctx.state, 'Production'),
      },
    ],
    why: 'Build once and promote the same artifact. mvn mule:deploy deploys what is already published, so Sandbox and Production run the same tested jar.',
    docs: CH2,
  },
  {
    id: 'cicd-hybrid-first',
    title: 'Deploy to your own servers with armDeployment',
    scenario: 'Brightmart runs Mule on its own Windows servers. Runtime Manager manages them as server groups: sbx-group in Sandbox and prod-group in Production. Point the workflow at them and follow one release.',
    minutes: 9,
    patch: {},
    steps: [
      {
        title: 'Choose the company servers',
        how: 'In Workflow options, under Deployment target, choose Own servers through Runtime Manager (armDeployment). Open "Deployment block these options produce" at the bottom: the block is now armDeployment, with target, targetType and muleVersion.',
        done: (ctx) => ctx.config.deployTarget === 'hybrid',
      },
      {
        title: 'Find the registered targets',
        how: 'Open Environments. Under Own servers in Runtime Manager, each environment lists its servers, server groups and clusters, with the status and Mule runtime of every server. sbx-group has two Windows servers that both run Mule 4.6.0.',
        done: (ctx) => sawView(ctx, 'environments'),
      },
      {
        title: 'What goes in target?',
        ask: 'The workflow passes -Dtarget=sbx-group. What does target hold in armDeployment?',
        options: ['The Maven server ID from settings.xml', 'The name of the server, server group or cluster in Runtime Manager', 'The Windows host name of one server', 'The environment ID'],
        right: 1,
        reason: 'Right. target is the name of the server, server group or cluster registered in Runtime Manager. It is not the Maven server ID. targetType then says which kind it is: server, serverGroup or cluster.',
      },
      {
        title: 'Run the workflow',
        how: 'Open Release pipeline and press Run workflow. Wait for Promote to Production to pass, or press Skip to result.',
        done: (ctx) => hybridPassed(ctx.state, 'Production'),
      },
      {
        title: 'Read the Deploy to Sandbox log',
        how: 'Open the run and click Deploy to Sandbox. Under the job graph, the path shows who talks to whom. The log shows the call to Runtime Manager and one line for each server.',
        done: (ctx) => sawJob(ctx, 'Sandbox') && hybridPassed(ctx.state, 'Sandbox'),
      },
      {
        title: 'Who opened the connection to the servers?',
        ask: 'The runner is a GitHub-hosted machine on the internet. The servers are in the Brightmart data center. How did the deployment reach them?',
        options: ['The runner connected to each server over a VPN', 'The Runtime Manager agent on each server keeps an outbound connection to the control plane, and the deployment came over it', 'Runtime Manager opened an inbound port on each server', 'The servers download new releases from GitHub'],
        right: 1,
        reason: 'Right. The agent makes an outbound HTTPS connection to Runtime Manager on port 443 and keeps a secure WebSocket on it. The runner only calls the control plane, and the servers need no inbound port.',
      },
      {
        title: 'And if the control plane is down?',
        ask: 'Runtime Manager is unreachable for an hour. What happens to orders-papi on the servers?',
        options: ['It stops at once', 'It keeps serving traffic. New or updated policies wait until the connection returns', 'It restarts every minute', 'It moves to CloudHub 2.0'],
        right: 1,
        reason: 'Right. The hot deployment page says Mule applications keep serving API and integration traffic if Runtime Manager is unreachable, and new or updated policies are not pulled until the connection returns. Deploys, start and stop from Runtime Manager also wait until the agent connects again.',
      },
    ],
    why: 'With armDeployment the pipeline deploys through Runtime Manager, the same as a person in the console. The runner needs HTTPS to Anypoint Platform and nothing else, because each server reaches out to the control plane on its own.',
    docs: ON_PREM,
  },
  {
    id: 'cicd-hybrid-target',
    title: 'Three wrong values in armDeployment',
    scenario: 'A teammate set up the deploy jobs from an old wiki page. The workflow has no Exchange stage: it builds, tests and deploys the jar. The first run fails in Deploy to Sandbox, and so will the next two.',
    minutes: 10,
    patch: { deployTarget: 'hybrid', publishStage: false, sandboxTarget: 'brightmart-sandbox', sandboxTargetType: 'server', muleVersion: '4.8.0' },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish. Read the annotation on Deploy to Sandbox.',
        done: (ctx) => failedWith(ctx.state, 'target-missing'),
      },
      {
        title: 'Use the real target name',
        how: 'Open Environments and find the server group in Sandbox. In Workflow options, set Sandbox target to that name, sbx-group.',
        done: (ctx) => ctx.config.sandboxTarget.trim() === 'sbx-group',
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. The name is right now. Read the next annotation.',
        done: (ctx) => failedWith(ctx.state, 'target-type') || hybridPassed(ctx.state, 'Sandbox'),
      },
      {
        title: 'Which targetType?',
        ask: 'sbx-group is a group of two servers. Which targetType does Runtime Manager expect for it?',
        options: ['server', 'serverGroup', 'cluster', 'servers'],
        right: 1,
        reason: 'Right. targetType takes server, serverGroup or cluster, and it must match the kind of target. A server group is not a cluster: in a group the app instances run in isolation, while cluster nodes share information.',
      },
      {
        title: 'Fix the targetType',
        how: 'In Workflow options, set Sandbox targetType to serverGroup.',
        done: (ctx) => ctx.config.sandboxTargetType === 'serverGroup',
      },
      {
        title: 'Run it once more',
        how: 'Run the workflow. Read the annotation.',
        done: (ctx) => failedWith(ctx.state, 'mule-version') || hybridPassed(ctx.state, 'Sandbox'),
      },
      {
        title: 'What does a muleVersion mismatch do?',
        ask: 'armDeployment says muleVersion 4.8.0 and the servers run Mule 4.6.0. What does the Mule Maven plugin do?',
        options: ['It installs Mule 4.8.0 on the servers', 'It raises an exception and does not download a Mule runtime', 'It deploys and logs a warning', 'It upgrades the Runtime Manager agent'],
        right: 1,
        reason: 'Right. If muleVersion does not match the Mule version on the target, the plugin raises an exception. It never downloads or installs a runtime. A runtime upgrade is work on the servers, and every server in a group must end up on the same version.',
      },
      {
        title: 'Match the runtime',
        how: 'The app is built and tested on Mule 4.6.0. In Workflow options, set muleVersion to 4.6.0.',
        done: (ctx) => ctx.config.muleVersion.trim() === '4.6.0',
      },
      {
        title: 'Ship it',
        how: 'Run the workflow. Both deploy jobs should pass.',
        done: (ctx) => hybridPassed(ctx.state, 'Production'),
      },
    ],
    why: 'target, targetType and muleVersion describe something that already exists in Runtime Manager. Read them from the Servers page, keep one value per environment in the workflow, and let the deploy fail fast when they do not match.',
    docs: ON_PREM,
  },
  {
    id: 'cicd-hybrid-disconnected',
    title: 'The runner got through, the server did not',
    scenario: 'Brightmart gives orders-papi its own Sandbox server, sbx-batch-01, for a load test. The deploy job reaches Runtime Manager and still fails. Nobody touched the workflow.',
    minutes: 8,
    patch: { deployTarget: 'hybrid', publishStage: false, deployProduction: false, sandboxTarget: 'sbx-batch-01', sandboxTargetType: 'server' },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish.',
        done: (ctx) => failedWith(ctx.state, 'target-disconnected'),
      },
      {
        title: 'Read the deploy job',
        how: 'Open Deploy to Sandbox. The log shows that the call to Runtime Manager worked. The annotation says why the deploy stopped there.',
        done: (ctx) => sawJob(ctx, 'Sandbox'),
      },
      {
        title: 'Where is the fault?',
        ask: 'sbx-batch-01 shows Disconnected in Runtime Manager. Where do you fix this?',
        options: ['Give the GitHub runner a VPN into the data center', 'On the server: its agent cannot open its outbound HTTPS connection to the control plane', 'Add a scope to the Connected App', 'Raise deploymentTimeout in the POM'],
        right: 1,
        reason: 'Right. A target must be running before Runtime Manager can deploy to it. The agent reaches out on port 443 to runtime-manager.anypoint.mulesoft.com, so a firewall or proxy that blocks that traffic leaves the server Disconnected. The pipeline cannot fix that.',
      },
      {
        title: 'What about apps already on it?',
        ask: 'Another app already runs on a server that becomes Disconnected. What happens to it?',
        options: ['It stops at once', 'It keeps serving traffic. New or updated policies wait until the connection returns', 'Runtime Manager deletes it', 'It is moved to another server'],
        right: 1,
        reason: 'Right. The hot deployment page says Mule applications keep serving API and integration traffic if Runtime Manager is unreachable, and new or updated policies are not pulled until the connection returns. Deploys, start and stop from Runtime Manager also wait until the agent connects again.',
      },
      {
        title: 'Fix it on the server side',
        how: 'Open Environments. On sbx-batch-01, press Allow outbound HTTPS 443 from this server to the control plane. That stands for the firewall change the network team makes. The server shows Running again.',
        done: (ctx) => targetOf(ctx.state, 'Sandbox', 'sbx-batch-01')?.servers.every((s) => s.status === 'Running'),
      },
      {
        title: 'Run it again',
        how: 'Run the workflow without changing it. Deploy to Sandbox should pass.',
        done: (ctx) => hybridPassed(ctx.state, 'Sandbox', (r) => r.config.sandboxTarget.trim() === 'sbx-batch-01'),
      },
    ],
    why: 'In a hybrid setup the connection always starts from the server. When a server is Disconnected, look at outbound HTTPS 443 from that server, its proxy and the agent, not at the pipeline or the runner.',
    docs: 'https://docs.mulesoft.com/runtime-manager/rtm-agent-whitelists',
  },
  {
    id: 'cicd-hybrid-runner',
    title: 'No VPN and no file copy',
    scenario: 'An old deploy script copies the jar into MULE_HOME/apps on each server. It moved into GitHub Actions and the first run fails. A teammate asks for a VPN from GitHub to the data center.',
    minutes: 10,
    patch: { deployTarget: 'copy', publishStage: false },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Press Run workflow and let it finish. Read the annotation on Deploy to Sandbox.',
        done: (ctx) => failedWith(ctx.state, 'runner-no-route'),
      },
      {
        title: 'Why can the runner not copy?',
        ask: 'Why can the job not reach the file share on HBR-SBX-MULE01?',
        options: ['The jar is too large', 'A GitHub-hosted runner runs on GitHub\'s network, outside the data center', 'The server is Disconnected in Runtime Manager', 'Mule is not installed'],
        right: 1,
        reason: 'Right. A GitHub-hosted runner is a machine outside your network. A file copy needs a route to every server, which is why the script asks for a VPN or a runner inside the data center.',
      },
      {
        title: 'Try a self-hosted runner',
        how: 'In Workflow options, set Deploy jobs run on to Self-hosted runner in the data center. Run the workflow. The jobs pass with a warning.',
        done: (ctx) => someRun(ctx.state, (r) => r.config.deployTarget === 'copy' && r.config.runner === 'self-hosted' && stageIn(r, 'Sandbox')?.status === 'warned'),
      },
      {
        title: 'Compare the two records',
        how: 'Open Environments. sbx-group shows 2.3.0 as the last deployment through Runtime Manager, and a note about the copied file. It did not replace orders-papi. Mule deployed it as a second app named after the file, next to the one Runtime Manager deployed.',
        done: (ctx) => sawView(ctx, 'environments') && Boolean(targetOf(ctx.state, 'Sandbox', 'sbx-group')?.copied),
      },
      {
        title: 'What is wrong with a green copy?',
        ask: 'The app runs. Why is copying into the apps folder still the wrong way on these servers?',
        options: ['Mule cannot hot deploy a jar', 'Runtime Manager manages these servers, and the docs say you cannot then use other deployment and management methods or tools on them', 'The anchor file is missing', 'A self-hosted runner cannot run Maven'],
        right: 1,
        reason: 'Right. Once Runtime Manager manages a server, deploy through Runtime Manager. A copy script also needs a machine inside the data center with write access to every server, which is more to protect.',
      },
      {
        title: 'Deploy through Runtime Manager',
        how: 'In Workflow options, set the deployment target to Own servers through Runtime Manager (armDeployment), and set Deploy jobs run on back to the GitHub-hosted runner.',
        done: (ctx) => ctx.config.deployTarget === 'hybrid' && ctx.config.runner === 'github-hosted',
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. Deploy to Sandbox should pass from the GitHub-hosted runner, with no VPN.',
        done: (ctx) => hybridPassed(ctx.state, 'Sandbox', (r) => r.config.runner === 'github-hosted'),
      },
      {
        title: 'What does the runner need now?',
        ask: 'What network access does the GitHub-hosted runner need for armDeployment?',
        options: ['A VPN to every server', 'Outbound HTTPS to Anypoint Platform, and nothing in the data center', 'An inbound port on each server', 'A file share on every server'],
        right: 1,
        reason: 'Right. The runner calls the control plane. The agent on each server holds its own outbound connection, and inbound connectivity to your network is not required. Remove what the old script copied into the apps folders as well.',
      },
    ],
    why: 'For servers managed by Runtime Manager, the pipeline should deploy through Runtime Manager with armDeployment. Then a GitHub-hosted runner is enough, and the data center keeps every inbound door closed.',
    docs: 'https://docs.mulesoft.com/runtime-manager/deploying-to-your-own-servers',
  },
  {
    id: 'cicd-munit-gate',
    title: 'Green only because the tests were skipped',
    scenario: 'Lee added POST /returns in returns.xml with no tests. Coverage fell to 61% against the 80% gate and the release was blocked. Yesterday Sam added -DskipMunitTests to release.yml and the workflow went green. Make it green the honest way.',
    minutes: 12,
    // every run picks the next free version, so the release the skip let through does not block a later publish
    patch: { munit: munitProject('gate'), versionStrategy: 'next' },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Open Release pipeline and press Run workflow. MUnit and coverage passes with a warning.',
        done: (ctx) => projectRun(ctx.state, (r) => stageIn(r, 'munit')?.issues.some((i) => i.code === 'munit-skipped')),
      },
      {
        title: 'Find what made it green',
        how: 'Open MUnit tests in the sidebar and click .github/workflows/release.yml in the file list. Read the run lines and the last commit above the editor.',
        done: (ctx) => sawView(ctx, `file:${WORKFLOW}`),
      },
      {
        title: 'What did -DskipMunitTests do?',
        ask: 'The MUnit job is green with -DskipMunitTests. What does that green mean?',
        options: ['Every MUnit test passed', 'No MUnit test ran and the coverage gate was never checked, so it means nothing about the code', 'The tests ran but the coverage report was not written', 'Only the slow tests were skipped'],
        right: 1,
        reason: 'Right. skipMunitTests stops the munit-maven-plugin from running at all. No test runs and the coverage gate never sees the new flow. Using it to get a release out is a smell: it hides the problem from everyone who reads a green run.',
      },
      {
        title: 'Remove the skip',
        how: 'In the editor for release.yml, delete -DskipMunitTests from both run lines: mvn -B clean test, and mvn -B -s .maven/settings.xml clean deploy. The deploy goal runs the test phase too.',
        done: (ctx) => Boolean(ctx.config.munit) && !workflowCommands(ctx.config.munit).anySkip,
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. MUnit and coverage now fails: every test passes, and coverage is below the gate.',
        done: (ctx) => projectRun(ctx.state, (r) => stageIn(r, 'munit')?.status === 'failed' && munitIssue(r, 'munit-coverage')),
      },
      {
        title: 'Read the coverage report',
        how: 'On the failed run, the MUnit job shows the MUnit report. Press Coverage report and find the resource and the flow at 0.00%.',
        done: (ctx) => sawView(ctx, 'coverage') && failedWith(ctx.state, 'munit-coverage'),
      },
      {
        title: 'Test the new flow',
        how: "In MUnit tests, click src/main/mule/returns.xml and press Create test for this flow on create-return-flow. Open src/test/munit/returns-test-suite.xml and replace the commented example with a real assertion, such as <munit-tools:assert-that expression=\"#[payload.status]\" is=\"#[MunitTools::equalTo('RECEIVED')]\"/>. Leave the gate in pom.xml as it is.",
        done: (ctx) => Boolean(ctx.config.munit) && gateKept(ctx) && testsOf(ctx, 'create-return-flow').some((t) => t.asserts.length > 0),
      },
      {
        title: 'What does coverage measure?',
        ask: 'A test with no assertion also raised coverage. What does MUnit coverage measure?',
        options: ['That every test checks the result of the flow', 'The share of processors that ran during the tests. It does not show whether a result was checked or that every input case was tried', 'The share of lines of DataWeave that are correct', 'How many flows have a test suite file'],
        right: 1,
        reason: 'Right. Coverage counts the message processors that ran in at least one test. A test that runs a flow and asserts nothing still covers it. Coverage shows what was never run. It does not prove that what ran was checked, so review the assertions as well.',
      },
      {
        title: 'Run it and ship',
        how: 'Run the workflow. MUnit and coverage should pass, and the run should finish as Passed.',
        done: (ctx) => projectRun(ctx.state, (r) => stageIn(r, 'munit')?.status === 'passed' && r.result === 'Passed' && !munitIssue(r, 'munit-skipped')),
      },
    ],
    why: 'A coverage gate only protects a release while it runs. Remove a skip flag the moment it appears, test the new flow with real assertions, and keep failBuild and the levels in the POM, so a green run means the code was tested.',
    docs: MUNIT_DOCS.coverage,
  },
  {
    id: 'cicd-munit-mock',
    title: 'Passes on my laptop, fails in the pipeline',
    scenario: 'Dana wrote a test for get-order-flow and it passed on her laptop over the VPN. In GitHub Actions the MUnit job fails with HTTP:CONNECTIVITY. A refactor of the ERP mapping was merged since then.',
    minutes: 12,
    patch: { munit: munitProject('mock') },
    steps: [
      {
        title: 'Run the workflow',
        how: 'Open Release pipeline and press Run workflow. MUnit and coverage fails.',
        done: (ctx) => projectRun(ctx.state, (r) => stageIn(r, 'munit')?.issues.some((i) => i.code === 'munit-errors' && i.errorTypes?.includes('HTTP:CONNECTIVITY'))),
      },
      {
        title: 'Read the MUnit job',
        how: 'Open the failed MUnit and coverage job. Read the annotation, the MUnit report and the ERROR lines in the log.',
        done: (ctx) => sawJob(ctx, 'munit'),
      },
      {
        title: 'Why must a test not call the ERP?',
        ask: 'The test called the real ERP. Why should a unit test never call a real system?',
        options: ['Real systems are slower, and that is the only reason', 'The result then depends on the network, the data and the other system being up, and the call can change real data. The runner often cannot reach it at all', 'MUnit cannot call HTTP endpoints', 'Real calls do not count as coverage'],
        right: 1,
        reason: 'Right. A unit test should give the same result on any machine. A real call depends on routes, DNS, credentials and data that change, and it can write to a system other people use. The GitHub-hosted runner has no route to erp.brightmart.internal, so the test raised HTTP:CONNECTIVITY.',
      },
      {
        title: 'Mock the ERP request',
        how: "Open MUnit tests and click src/main/mule/orders.xml to read the doc:name and doc:id of Get order from ERP. In src/test/munit/orders-test-suite.xml, inside munit:behavior of get-order-returns-mapped-order, add a munit-tools:mock-when with processor=\"http:request\", a with-attribute on doc:name \"Get order from ERP\" (or its doc:id), and a then-return with <munit-tools:payload value=\"#[{orderId: '1001', status: 'OPEN', amount: 100.00}]\" mediaType=\"application/json\"/>. The get-order-erp-down test shows the same shape.",
        done: (ctx) => {
          const t = totalTest(ctx)
          return Boolean(t?.mocks.some((m) => mockMatches(m, ERP_REQUEST) && m.payload && !m.error && m.where.length > 0))
        },
      },
      {
        title: 'Run it again',
        how: 'Run the workflow. The connectivity error is gone. Read the next failure.',
        done: (ctx) => projectRun(ctx.state, (r) => munitIssue(r, 'munit-failures')),
      },
      {
        title: 'The code or the test?',
        ask: 'The test says: Expected: <107.5> but: was <100.075>. The ERP amount is 100.00 and Brightmart adds 7.5 percent tax. What do you change?',
        options: ['The test: expect 100.075, since that is what the flow returns', 'The code: the mapping adds 0.075 instead of multiplying by 1.075, and the test states the business rule', 'Mark the test ignore="true" until later', 'Lower requiredApplicationCoverage'],
        right: 1,
        reason: 'Right. The test describes the rule: 100.00 plus 7.5 percent is 107.50. The refactor broke the mapping, and the connectivity error had hidden that. Changing the expected value to match the bug would make the test useless.',
      },
      {
        title: 'Fix the mapping',
        how: 'In MUnit tests, open src/main/resources/dw/map-erp-order.dwl and correct the total line to payload.amount * 1.075. Leave the assertion in the test as it is.',
        done: (ctx) => Boolean(ctx.config.munit) && totalFrom(ctx.config.munit.files[DWL], 100) === 107.5 && stillExpects(totalTest(ctx)),
      },
      {
        title: 'Mock or spy?',
        ask: 'What is the difference between mock-when and spy in MUnit?',
        options: ['They are the same processor with two names', 'mock-when replaces the processor and returns what you define. spy lets the real processor run and checks the event before and after it', 'spy replaces the processor, and mock-when only logs it', 'mock-when works only for HTTP, spy for databases'],
        right: 1,
        reason: 'Right. mock-when stops the real processor from running and gives back the payload, attributes or error you set. spy does not replace anything: it runs assertions before and after the real processor. A spy on the ERP request would still call the ERP.',
      },
      {
        title: 'Run it and ship',
        how: 'Run the workflow. MUnit and coverage should pass and the run should finish as Passed.',
        done: (ctx) => projectRun(ctx.state, (r) => stageIn(r, 'munit')?.status === 'passed' && r.result === 'Passed'),
      },
    ],
    why: 'Mock every connector a unit test reaches, by doc:id or doc:name, so the test runs the same on a laptop and on a runner. When a mock then exposes a failing assertion, fix the code the test protects, not the test.',
    docs: MUNIT_DOCS.mock,
  },
]

export const pipelineStepDone = (step, i, ctx) => (step.ask ? ctx.answers[i] === step.right : step.done(ctx))
export const pipelineLabDone = (lab, ctx) => lab.steps.every((step, i) => pipelineStepDone(step, i, ctx))
