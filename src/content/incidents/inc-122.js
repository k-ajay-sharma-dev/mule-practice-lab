export default {
  id: 'inc-122',
  category: 'incidents',
  title: 'Pipeline Green, Exchange Updated, Fix Not Live: The Deploy Stage That Only Published',
  level: 'BEGINNER',
  tags: ['ci-cd', 'deployment', 'maven', 'exchange', 'mule-maven-plugin', 'jenkins'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '14:02:10 INFO  [ci] Pipeline library mule-release@2.0 loaded (shared step: releaseToTest)', relevant: true, why: 'The pipeline moved to a new shared library, so the commands that run may have changed.' },
      { text: '14:02:31 INFO  [ci] Running: mvn clean deploy -s $SETTINGS', relevant: true, why: 'No muleDeploy parameter. Without it, the plugin uploads to the repository in distributionManagement.' },
      { text: '14:04:02 INFO  [ci] Tests: 74 - Failed: 0 - Errors: 0 - Skipped: 0', relevant: false },
      { text: '14:04:40 INFO  [ci] Uploading to Repository: https://maven.anypoint.mulesoft.com/api/v3/organizations/.../orders-papi-2.4.0-mule-application.jar', relevant: true, why: 'This is an upload to Exchange. There is no line showing a deployment to a target.' },
      { text: '14:04:52 INFO  [ci] BUILD SUCCESS', relevant: true, why: 'The build is truly successful: it did everything it was asked to do.' },
      { text: '14:05:03 INFO  [ci] Stage "Release to Test" finished: SUCCESS', relevant: false },
      { text: '14:31:15 INFO  [rm] orders-papi (Test): running version 2.3.1, last updated 9 days ago', relevant: true, why: 'The target did not change. No deployment reached Runtime Manager.' },
      { text: '14:32:00 INFO  [app] orders-papi: GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why is version 2.4.0 in Exchange but not running in Test?',
        options: [
          'Without `muleDeploy`, the `deploy` goal only uploads to the repository in `distributionManagement`',
          'CloudHub 2.0 takes up to an hour to pick up a new Exchange version',
          'The `target` in the POM is wrong, so the app deployed somewhere else',
          'Stable assets have to be approved in Exchange before they can run',
        ],
        answer: 0,
        explain: 'The docs state that if `muleDeploy` is not set, the plugin uploads the artifacts to the repository. Nothing automatically deploys a version because it appeared in Exchange.',
      },
      {
        type: 'single',
        prompt: 'What is the quickest correct way to get 2.4.0 running in Test?',
        options: [
          'Run `mvn mule:deploy` from the 2.4.0 tag with the Test parameters',
          'Run `mvn clean deploy` again, as it may have been a glitch',
          'Run `mvn mule:undeploy` first, then wait for the platform to install the latest version',
          'Delete version 2.4.0 from Exchange and publish it again',
        ],
        answer: 0,
        explain: 'The version is already published, so only the deployment is missing, and `mule:deploy` does that without a rebuild. Running `mvn clean deploy` again would try to publish the same release version a second time.',
      },
      {
        type: 'multi',
        prompt: 'Which changes would have caught this?',
        options: [
          'After deploying, compare the running version in Runtime Manager with the expected version, and fail if they differ',
          'Name stages after what they do: "Publish to Exchange" and "Deploy to Test"',
          'Add a smoke test that checks a version or build value exposed by the app',
          'Have the shared library reject a deploy stage whose command has neither `-DmuleDeploy` nor `mule:deploy`',
          'Set `skipDeploymentVerification` to true',
        ],
        answer: [0, 1, 2, 3],
        explain: 'A check of the outcome catches a missing step. Skipping verification removes a check, and it would not apply here anyway, because no deployment ran.',
      },
    ],
  },
  description: `
## Symptoms
- QA reports that the fix for a tax rounding defect is not in the Test environment. The ticket says "deployed in 2.4.0".
- The Jenkins pipeline is green, and Exchange shows \`orders-papi\` 2.4.0.
- Runtime Manager shows Test still running 2.3.1, last updated 9 days ago.
- Developers suspect a CloudHub 2.0 delay.

## Change / Context
- Last week the platform team moved 12 pipelines to a new shared Jenkins library.
- The old pipeline had two stages: "Publish" ran \`mvn clean deploy\`, and "Deploy" ran \`mvn mule:deploy\`.
- During review, the two stages looked like duplicates, and they were merged into one shared step called \`releaseToTest\`, which runs \`mvn clean deploy\`.

## Logs
\`\`\`
14:02:31 INFO  [ci] Running: mvn clean deploy -s $SETTINGS
14:04:40 INFO  [ci] Uploading to Repository: .../orders-papi-2.4.0-mule-application.jar
14:04:52 INFO  [ci] BUILD SUCCESS
14:31:15 INFO  [rm] orders-papi (Test): running version 2.3.1, last updated 9 days ago
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The deploy goal has two behaviours. muleDeploy decides whether it deploys to a target or uploads to a repository.',
    'A version in Exchange does not deploy itself. Deployment is a separate action.',
    'BUILD SUCCESS only proves that the commands ran. A pipeline needs a check on the outcome.',
    'mvn mule:deploy deploys without rebuilding, so it is right for a version that is already published.',
    'Publishing the same release version again is not a retry. Publish once, and deploy as often as needed.',
    'The other 11 pipelines moved to the same library have the same gap.',
  ],
  solution: `
**Diagnosis.** Compare what the pipeline ran with what the target shows. The log has one Maven command, with no \`muleDeploy\`, and an upload to the Exchange repository. There is no deployment output. Runtime Manager shows nothing changed for 9 days. It is not a delay: no deployment was requested.

**Immediate mitigation.**
- Run the deploy for 2.4.0 with \`mvn mule:deploy\`, using the Test parameters, from the 2.4.0 tag.
- Tell QA which version is live.
- Check the other 11 pipelines on the new library, and list every application whose running version is behind Exchange.

**Root cause.** The \`deploy\` goal behaves in two ways. The \`muleDeploy\` parameter instructs the plugin to deploy using the deployment strategy in the configuration. If it is not set, the plugin uploads the artifacts to the repository in \`distributionManagement\`. The old pipeline's two stages were not duplicates: \`mvn clean deploy\` published, and \`mvn mule:deploy\` deployed. Merging them removed the deployment, and nothing failed, because uploading is a valid result.

**Permanent fix.** Restore two clear steps in the shared library:
\`\`\`groovy
stage('Publish to Exchange') {
  sh 'mvn clean deploy -s $SETTINGS'
}
stage('Deploy to Test') {
  sh 'mvn mule:deploy -s $SETTINGS -Ddeploy.env=Test'
}
\`\`\`
Keep the release version the same across the stages, and keep \`skipDeploymentVerification\` at its default of \`false\`, so a failed start fails the stage.

**Prevention.**
- After each deployment, read the running version from Runtime Manager, or from the Anypoint CLI, and fail if it does not match.
- Add a smoke test that reads a version or build value from the application.
- Test changes to the shared library on one pipeline, and confirm the outcome on the target before moving the others.
- Name stages after what they do.
`,
  followUps: [
    { q: 'Why not always use mvn clean deploy -DmuleDeploy?', a: 'The application must already be published in Exchange, and that command packages the project again. Publishing once and using mule:deploy for each environment means every environment receives the same artifact.' },
    { q: 'Would deployment verification have caught this?', a: 'No. Verification checks the status of an app after a deployment. Here no deployment was made, so there was nothing to verify.' },
    { q: 'What happens if you run mvn clean deploy twice for a release version?', a: 'You are publishing the same version again. The docs say a SNAPSHOT is overwritten without errors, but they do not promise that for a release version, so do not use a second publish as a retry.' },
  ],
}
