export default {
  id: 'inc-123',
  category: 'incidents',
  title: 'A Replica Count Change Ships Unfinished Code to Production: SNAPSHOT Versions Outside Development',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'exchange', 'versioning', 'release', 'runtime-fabric'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: 'Thu 16:41:08 INFO  [ci] feature/split-shipments: mvn clean deploy -> Uploading shipping-papi-1.8.0-SNAPSHOT-mule-application.jar', relevant: true, why: 'A feature branch published to the same SNAPSHOT version that Production runs.' },
      { text: 'Thu 16:41:12 INFO  [ci] Upload complete, no conflict reported', relevant: true, why: 'SNAPSHOT versions are overwritten without errors, so nothing warned the team.' },
      { text: 'Mon 09:00:03 INFO  [ci] Change CHG-5521: scale shipping-papi from 3 to 4 replicas (Production, Runtime Fabric)', relevant: true, why: 'The only intended change was to capacity.' },
      { text: 'Mon 09:00:41 INFO  [ci] mule-maven-plugin:deploy: deploying shipping-papi 1.8.0-SNAPSHOT to Production', relevant: true, why: 'A redeploy with the same version takes the latest snapshot binaries.' },
      { text: 'Mon 09:04:20 INFO  [rm] shipping-papi: 4/4 replicas running', relevant: false },
      { text: 'Mon 09:05:02 INFO  [app] GET /health 200', relevant: false },
      { text: 'Mon 09:11:37 ERROR [app] POST /shipments 400 {"error":"splitPolicy is required"}', relevant: true, why: 'This validation exists only in the unfinished feature, so that code is now in Production.' },
      { text: 'Mon 09:12:00 WARN  [mon] shipping-papi 4xx rate 38% (threshold 2%)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'The change only added a replica. How did the feature code reach Production?',
        options: [
          'The app runs a SNAPSHOT, which was overwritten in Exchange on Thursday. A redeploy of that version takes the latest snapshot binaries',
          'Runtime Fabric upgrades apps to the newest asset in Exchange when a replica is added',
          'The feature branch deployed straight to Production on Thursday',
          'Mule merges feature branches at start-up',
        ],
        answer: 0,
        explain: 'The docs say that each redeploy refreshes the app with the latest snapshot binaries, and that snapshot assets can change after deployment. That is why they say to avoid them in production.',
      },
      {
        type: 'single',
        prompt: 'The release manager asks to roll back to "the version from Friday". What is the problem?',
        options: [
          'The name `1.8.0-SNAPSHOT` now points at the overwritten content, so the good build must be rebuilt from its commit and released under a new version',
          'Nothing: Exchange keeps every SNAPSHOT build, selectable by date',
          'Runtime Fabric cannot roll back a deployment at all',
          'The team must first hard-delete the SNAPSHOT from Exchange',
        ],
        answer: 0,
        explain: 'Running `mvn clean deploy` again overwrites the asset without errors. So there is no earlier artifact under that version to return to.',
      },
      {
        type: 'multi',
        prompt: 'Which statements about SNAPSHOT assets are documented?',
        options: [
          'Publishing with Maven Facade API version 3 and a SNAPSHOT version creates an asset in the `development` state',
          'A SNAPSHOT asset is permanently in `development` and cannot be promoted to another state',
          'Repeating `mvn clean deploy` overwrites the asset without errors',
          'A SNAPSHOT published with Facade API version 1 or 2 has the state `stable`',
          'A SNAPSHOT becomes `stable` once it has run in Production for 30 days',
        ],
        answer: [0, 1, 2, 3],
        explain: 'All four are in the Asset Lifecycle State section of the Exchange Maven page. The state of a SNAPSHOT never changes with use.',
      },
      {
        type: 'multi',
        prompt: 'Which controls would stop this happening again?',
        options: [
          'Fail any Production stage whose project version ends in `-SNAPSHOT`',
          'Release from a tag with a fixed version, and deploy that version to every environment after Dev',
          'Stop feature branches from publishing to the shared version, for example by publishing only from the main branch',
          'Change replica counts in a way that does not depend on rebuilding a version, and review what will be deployed',
          'Ask developers to warn the team before publishing',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Automated rules work on every run. Relying on people to remember is how the SNAPSHOT reached Production.',
      },
    ],
  },
  description: `
## Symptoms
- Since 09:11 on Monday, 38% of \`POST /shipments\` calls to \`shipping-papi\` fail with \`400\` and the message \`splitPolicy is required\`. No client has changed.
- The message comes from a split-shipment feature that is still in development.
- The only Production change today is CHG-5521, which raised replicas from 3 to 4 before a sales peak.

## Change / Context
- \`shipping-papi\` runs on Runtime Fabric. Under deadline pressure two months ago, the team deployed \`1.8.0-SNAPSHOT\` to Production after UAT, and the version in the POM was never changed.
- On Thursday a developer ran the normal feature branch build, which publishes to Exchange. The POM version on the branch was the same.
- The replica change was made by editing \`<replicas>\` and rerunning the production deployment job with the project version.

## Logs
\`\`\`
Thu 16:41:08 INFO  [ci] feature/split-shipments: Uploading shipping-papi-1.8.0-SNAPSHOT-mule-application.jar
Mon 09:00:41 INFO  [ci] deploying shipping-papi 1.8.0-SNAPSHOT to Production
Mon 09:04:20 INFO  [rm] shipping-papi: 4/4 replicas running
Mon 09:11:37 ERROR [app] POST /shipments 400 {"error":"splitPolicy is required"}
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
    'SNAPSHOT versions avoid version increments during development and testing. They are overwritten in Exchange.',
    'Each redeploy takes the latest snapshot binaries, so "the same version" can be different code.',
    'The docs say to avoid deploying snapshot assets to production, because they can change after deployment.',
    'A SNAPSHOT is permanently in the development state and cannot be promoted.',
    'An overwritten SNAPSHOT leaves no earlier artifact to roll back to.',
    'Rollback needs a fixed version, so Production must run only release versions.',
  ],
  solution: `
**Diagnosis.** The error message belongs to unfinished code, so that code is running. The change record only covers replicas, but it reran the deployment. Compare the deployed version with the timeline: Production runs \`1.8.0-SNAPSHOT\`, and that asset was overwritten on Thursday. Health checks are green because the app starts normally, so the problem is the content of the artifact.

**Immediate mitigation.**
- Find the commit that Production ran before Monday, from the UAT sign-off or the build record.
- Build that commit with a release version, such as \`1.8.1\`, publish it to Exchange, and deploy it. This is the quickest path to a known state, because the old SNAPSHOT content no longer exists in Exchange.
- Keep 4 replicas for the sales peak.
- Tell the shipping consumers about the failed period, and reprocess the rejected shipments.

**Root cause.** The docs describe SNAPSHOT assets as a way to avoid raising the version for small changes during development and testing. An asset with a SNAPSHOT version is overwritten when it is published again, and \`mvn clean deploy\` repeated gives no error. Each redeploy refreshes the app with the latest binaries. The docs add that, because snapshot assets can change after deployment, you should avoid deploying them to production. Here the mutable version was in Production for two months. The feature branch overwrote it, and an unrelated redeploy picked it up.

**Permanent fix.**
- Move all Production applications to release versions. The publish of a release version creates an asset in the default \`stable\` state, and a SNAPSHOT can never be promoted to it.
- Separate version numbers by branch, and publish SNAPSHOTs only from main or develop.
- Audit Runtime Manager for any deployment with a version ending in \`-SNAPSHOT\`.

**Prevention.**
- The pipeline fails a Test or Production stage if the version ends in \`-SNAPSHOT\`.
- Use a Maven Enforcer rule in release builds, so that no SNAPSHOT dependency reaches a release.
- For capacity changes, show the version that will be deployed in the change record and compare it with the running version.
- Add a smoke test that sends a real sample request, because \`/health\` did not detect this.
`,
  followUps: [
    { q: 'Is a development state version always a SNAPSHOT?', a: 'No. The docs mention that an asset in the development state that is not a SNAPSHOT version cannot be consumed through Maven. So the SNAPSHOT form is the one to use for Maven-based work.' },
    { q: 'Are SNAPSHOT versions bad?', a: 'No. They are useful in development and testing, because you avoid raising the version for each small change. The rule is about where they run.' },
    { q: 'How would you have made the replica change without a redeploy of new code?', a: 'Pin the deployment to a release version, so that a repeat of the job deploys identical binaries. Then only the setting changes.' },
  ],
}
