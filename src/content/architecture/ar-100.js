export default {
  id: 'ar-100',
  category: 'architecture',
  title: 'Rollback-Ready Release Design for a Mixed CloudHub 2.0 and Runtime Fabric Estate',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'release', 'rollback', 'cloudhub-2', 'runtime-fabric'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'The pipeline has to roll `pricing-papi` back from 4.2.0 to 4.1.3 on CloudHub 2.0. Which precondition matters most?',
      options: [
        '4.1.3 is a release version, published to Exchange, and the record shows exactly what ran',
        '4.1.3 is a `SNAPSHOT`, so it can be refreshed',
        'The team has the JAR on a build agent',
        'A rollback needs `mule:undeploy` before each deploy',
      ],
      answer: 0,
      explain: 'A rollback is a redeploy of a known version. A `SNAPSHOT` can be overwritten after deployment, so it gives no fixed point to return to.',
    },
    {
      type: 'multi',
      prompt: 'An app on CloudHub 2.0 has to go back from version 4.2.0 to 4.1.3. Which two ways deploy 4.1.3 again?',
      options: [
        'Check out the 4.1.3 tag and run the normal plugin deployment for that environment',
        'Use `runtime-mgr:application:modify` with `--assetVersion` on CloudHub 2.0',
        'Run `mvn clean deploy` with 4.1.3 in the POM and no other parameter',
        'Delete 4.2.0 from Exchange and wait for the platform to fall back',
      ],
      answer: [0, 1],
      explain: 'Redeploying uses the same command as deploying, and the CLI command has an `--assetVersion` flag. Without `muleDeploy`, `mvn clean deploy` only uploads to the repository. Nothing in the docs makes a running app fall back when an asset is deleted.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'During a rollback, an operator adds `--property log.level:DEBUG` to `runtime-mgr:application:modify`. What does the command reference warn about?',
      options: [
        '`--property` replaces all existing properties with the specified property',
        '`--property` adds to the existing properties',
        '`--property` is ignored unless the app is stopped',
        '`--property` sets a secure property',
      ],
      answer: 0,
      explain: 'The reference says it replaces all existing properties, and `--propertiesFile` replaces all properties from a file. This is the same risk as a partial `properties` element in the POM.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Where should the design keep properties so that a rollback is safe?',
      options: [
        'In one owner: a versioned file and secret store that the pipeline sends in full, alongside the app version',
        'Split them: some in the POM and the rest typed into Runtime Manager',
        'Only in the JAR, with passwords in plain text',
        'In a wiki page, for the operator to apply after each deployment',
      ],
      answer: 0,
      explain: 'On CloudHub 2.0, if `properties` or `secureProperties` is present, nothing merges with the Runtime Manager values. With a versioned set, each app version has a matching set of properties to return to.',
    },
    {
      type: 'single',
      prompt: 'Release 4.2.0 of a Mule app changes a database table. A rollback to 4.1.3 redeploys only the application, so the old version must still work with the new schema. Which approach keeps that possible?',
      options: [
        'Add the new column now, and remove the old one in a later release',
        'Drop the old column in the same release, to keep the schema tidy',
        'Rename the old column in place, and update the app to the new name',
        'Rely on the redeploy of 4.1.3 to undo the schema change',
      ],
      answer: 0,
      explain: 'A redeploy changes only the application. If the data has moved on, the old version may no longer work. So make database changes backward compatible: add first, and remove only in a later release. The same thinking covers the rest of a release: keep API changes additive under the same major version, separate the database change from the application change, and record for each release whether rollback is safe and what else must change.',
    },
    {
      type: 'match',
      prompt: 'Match each release risk to the design control.',
      pairs: [
        ['A failed start is reported as success', 'Keep `skipDeploymentVerification` at `false`'],
        ['A rolling update cannot complete on a full fabric', 'Keep capacity for one additional replica'],
        ['The app starts but gives wrong results', 'Smoke tests with real sample requests after deployment'],
        ['A slow app fails the job while it is still starting', 'Set `deploymentTimeout` for that app'],
      ],
      explain: 'Each control covers a different gap. Verification proves that the app started, and only a smoke test shows that it works.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of a Production rollback.',
      items: [
        'Decide to roll back, using the agreed criteria',
        'Check the release record: is rollback safe for this release?',
        'Deploy the previous version with its matching properties',
        'Confirm the running version and run smoke tests',
        'Restore any API Manager changes made for the release',
        'Record the outcome and raise the follow-up',
      ],
      explain: 'The check comes before the action, because some releases cannot be rolled back by a redeploy. Rollback ends with evidence, not with a green job.',
    },
  ],
  description: `
An energy retailer runs **70 Mule applications**: 48 on **CloudHub 2.0** and 22 on **Runtime Fabric** in its own data centre, near the metering systems.

Release frequency has risen to about 25 production deployments per week. Last quarter, three bad releases took 2 to 5 hours to recover, because nobody knew which artifact and settings had been running.

The CIO has set new targets:
- Any release can be reversed within **15 minutes**, or the team knows before releasing that it cannot.
- It is always possible to answer "what was running, with which configuration, at this time?".
- Billing runs overnight, so there must be no downtime during a deployment in that window.
- No personal credentials are used. Azure DevOps remains the CI tool.

Some releases include database changes in the metering schema, and API changes with 30 consumers.

**Questions**
1. Design the release flow from commit to Production, with both targets.
2. What makes a version safe to roll back to? What are the ways to do it?
3. Where do properties and policies live, and how do they roll back?
4. How do you handle releases that include database or API contract changes?
5. What checks prove that a release, or a rollback, worked?
`,
  answerTemplate: `## Release flow

## Rollback mechanism

## Properties and policies

## Database and contract changes

## Verification
`,
  keyPoints: [
    'Build once and publish a release version to Exchange. No SNAPSHOT outside development.',
    'One pipeline template with a profile per target: cloudhub2Deployment or runtimeFabricDeployment.',
    'A rollback is a redeploy of a known version and its matching properties, using the normal pipeline.',
    'A release record ties together app version, commit, properties version, policies, target, time and approver.',
    'Properties have one owner. Partial properties in a redeploy, or --property in the CLI, replace what is there.',
    'Rolling updates keep availability but need capacity for one additional replica.',
    'Backward compatible database and API changes are what make rollback possible.',
    'Verification proves that the app started. Smoke tests prove that it works.',
  ],
  solution: `
**Release flow.**
1. Merge to main: MUnit and coverage run through Maven. A release version is set and a tag is created.
2. Publish once to Exchange with \`mvn clean deploy\`.
3. Deploy to Test with \`mvn mule:deploy\`, using the \`cloudhub2Deployment\` or \`runtimeFabricDeployment\` profile. Run the smoke and contract tests.
4. An approval on the Azure DevOps Production environment.
5. Deploy the same version to Production with a separate Connected App, using \`rolling\`, the default \`updateStrategy\`. Run smoke tests, then write the release record.

The CloudHub 2.0 page gives \`mvn mule:deploy\` for deploying without a rebuild. The Runtime Fabric page gives only \`mvn clean deploy -DmuleDeploy\`, so confirm \`mule:deploy\` on a fabric in a sandbox first.

**Rollback mechanism.** Rollback is a normal deployment of an earlier version, so it uses the same tested path. The docs say that to redeploy you run the same command as you did to deploy, and the platform rewrites the application. A dedicated "Rollback" pipeline takes an app, an environment and a version from the release record, checks out that tag and deploys. On CloudHub 2.0, \`runtime-mgr:application:modify\` with \`--assetVersion\` is a second route. Practise on a schedule: a rollback that nobody has tried is not a 15-minute rollback.

A version is safe to return to if all of these hold: it is a release version, it is still available in Exchange, its properties are known, and the release record has not marked it as unsafe. A \`SNAPSHOT\` fails the first test, because each redeploy takes the latest binaries.

**Properties and policies.**
- Keep non-secret values in version control, one file per app and environment, sent through \`propertiesFile\`. Keep secrets in Azure Key Vault, linked through a variable group, sent through \`secureProperties\`.
- Tag the properties with the release, so a rollback sends the matching set.
- The pipeline is the single owner. On CloudHub 2.0, a deployment with either element does not merge with Runtime Manager values. The Runtime Fabric page does not carry that note, and the note does not mention \`propertiesFile\`, so confirm both in a sandbox and use the same rule.
- Keep policy configuration in the repository and apply it with \`api-mgr:policy:apply\`, using complete configuration files. A rollback of the app does not change policies, so a release that changed them must include the reverse step.

**Database and contract changes.** A redeploy changes only the application.
- Database: use expand and contract. Add the new column in one release, make the app work with both forms, and remove the old form in a later release. Run schema changes separately.
- API: keep changes additive, and deprecate before removing. A breaking change is a new major version that runs beside the old one.
- Mark each release as "redeploy rollback safe" or "forward fix only". The team then knows before release which applies, which is what the CIO asked for.

**Verification.**
- Leave \`skipDeploymentVerification\` at \`false\`, and set \`deploymentTimeout\` for slow apps. The default is \`600000\` milliseconds.
- Check capacity first: \`rolling\` needs one additional replica's worth of resources, which matters most on the fixed-size Runtime Fabric. If \`enforceDeployingReplicasAcrossNodes\` is on, the maximum number of replicas is one less than the number of nodes.
- After deployment, compare the running version with the expected one, and run smoke tests with real sample requests.
- Watch the error rate for a fixed period, with rollback criteria agreed in advance.
`,
  followUps: [
    { q: 'Why not use blue-green for every app?', a: 'It needs duplicate capacity and a way to switch traffic, and a rolling update already gives zero downtime in most cases. Use it where the switch itself must be instant, or where the risk justifies the cost.' },
    { q: 'What if the previous version was removed from Exchange?', a: 'A rollback to it depends on rebuilding from the tag, and usually on a new version number. A soft-deleted version number stays reserved, so publishing it again returns 409 Conflict unless GAV reuse is enabled and that version is hard-deleted. Protect release assets: only a limited group should be able to delete them, and the retention rule should cover the rollback window.' },
    { q: 'How do you roll back a failed Runtime Fabric deployment when the fabric is full?', a: 'Rolling needs one additional replica of resources. If none is free, you need to free capacity first, or accept recreate, which needs no extra resources but terminates replicas first.' },
    { q: 'Should a rollback skip tests to save time?', a: 'It skips no real protection: the version was already tested, and it is not rebuilt. It still needs verification and smoke tests, because the environment may have changed.' },
  ],
}
