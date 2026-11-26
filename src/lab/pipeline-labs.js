// Guided labs for the CI/CD screen, which looks like a GitHub Actions page. Each lab starts the release pipeline with
// some options set, and its steps read what you did: the pipeline state, the options, the pages you opened, the job
// logs you read and your answers. A step is met by any route that gets there.
import { isSnapshot } from './exchange.js'
import { isFeatureBuild } from './pipeline.js'

const MMP = 'https://docs.mulesoft.com/mule-runtime/latest/mmp-concept'
const CH2 = 'https://docs.mulesoft.com/mule-runtime/latest/deploy-to-cloudhub-2'
const COVERAGE = 'https://docs.mulesoft.com/munit/latest/coverage-maven-concept'

const stageIn = (run, id) => run.stages.find((s) => s.id === id)
const someRun = (s, test) => s.runs.some((r) => r.done && test(r))
const failedAt = (s, id) => someRun(s, (r) => stageIn(r, id)?.status === 'failed')
const passedAt = (s, id) => someRun(s, (r) => stageIn(r, id)?.status === 'passed')
const sawView = (ctx, view) => ctx.seen.views.includes(view)
const sawJob = (ctx, job) => ctx.seen.jobs.includes(job)

export const PIPELINE_LABS = [
  {
    id: 'cicd-first-release',
    title: 'Your first release with GitHub Actions',
    scenario: 'Harbor Foods ships orders-papi 2.4.0 with a GitHub Actions workflow. Run it once and follow the artifact from build to Production.',
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
]

export const pipelineStepDone = (step, i, ctx) => (step.ask ? ctx.answers[i] === step.right : step.done(ctx))
export const pipelineLabDone = (lab, ctx) => lab.steps.every((step, i) => pipelineStepDone(step, i, ctx))
