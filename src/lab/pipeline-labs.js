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
]

export const pipelineStepDone = (step, i, ctx) => (step.ask ? ctx.answers[i] === step.right : step.done(ctx))
export const pipelineLabDone = (lab, ctx) => lab.steps.every((step, i) => pipelineStepDone(step, i, ctx))
