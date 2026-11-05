export default {
  id: 'ar-113',
  category: 'architecture',
  title: 'Branching, Promotion and Automated Rollback for 55 Apps: One Artifact From Commit to Production on CloudHub 2.0 and Hybrid',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'release', 'branching', 'rollback', 'cloudhub-2', 'hybrid', 'github-actions', 'azure-devops'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'Teams want to release each app when it is ready, about weekly, and long-lived `develop` and `release` branches keep causing merge conflicts. Which branching model suits this best?',
      options: [
        'Short-lived feature branches merged to `main`, a release version tagged from `main`, and a hotfix branch cut from the tag only when needed',
        'One long-lived branch for each environment, with code merged from `dev` to `test` to `prod`',
        'A `develop`, `release` and `main` model with a release branch per sprint for every app',
        'Direct commits to `main` with no pull requests',
      ],
      answer: 0,
      explain: 'With branches per environment, what reaches Production is a new merge result, not what was tested. A tag on one line of history gives a fixed point for each release, and a pull request keeps the review.',
    },
    {
      type: 'single',
      prompt: 'A pipeline publishes Mule apps to Exchange. A `SNAPSHOT` version has passed its tests in the Test environment. Can that same asset become a stable release for Production?',
      options: [
        'Yes. A `SNAPSHOT` that passes Test turns into a stable version',
        'Yes. A `SNAPSHOT` cannot change once it has been published',
        'No. A `SNAPSHOT` stays in `development` and cannot be promoted',
        'No, but an administrator can promote it by hand in Exchange',
      ],
      answer: 2,
      explain: 'A `SNAPSHOT` asset is permanently in the `development` state and cannot be promoted to any other state. Publishing a `SNAPSHOT` again overwrites the asset without any errors, and each update needs a redeployment to refresh the app with the latest binaries. The CloudHub 2.0 page says to avoid them in production, because they can change after deployment. So the build for a release must produce a release version, and that version is what goes through Test and on to Production.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which steps keep the same artifact on its way through the environments?',
      options: [
        'Publish the release version to Exchange once, and on CloudHub 2.0 deploy with `mvn mule:deploy`, which does not rebuild',
        'On CloudHub 2.0, use `runtime-mgr:application:modify` with `--assetVersion`',
        'For hybrid targets, use `mvn mule:deploy -Dmule.artifact=...` with the stored JAR',
        'For hybrid targets, use `runtime-mgr:standalone-application:copy` from Sandbox to Production',
        'Run `mvn clean deploy -DmuleDeploy` in each environment with a different Maven profile',
      ],
      answer: [0, 1, 2, 3],
      explain: '`mvn clean deploy -DmuleDeploy` packages the project again, so each environment gets a new build. Runtime Manager also offers promotion from Sandbox in its console for hybrid apps.',
    },
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each item to the place it belongs in this design.',
      pairs: [
        ['Mule flows, DataWeave, and non-environment defaults', 'The versioned artifact'],
        ['Hostnames, timeouts and the API instance ID for each environment', 'Per-environment configuration, sent at deployment'],
        ['Passwords and client secrets', 'A secret store, injected at deployment'],
        ['Rate limits and other policies', 'API Manager, applied by script from the repository'],
      ],
      explain: 'The artifact stays the same, so everything that differs between environments has to arrive from outside it. Deployment properties rank above application properties.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A new configuration fails to deploy on CloudHub 2.0. What do the docs say the platform does?',
      options: [
        'The status is `Update failed`, and the deployment attempts to roll back to the last successful version of the configuration, though in some situations the rollback might not succeed',
        'It always restores the last version, so no pipeline logic is needed',
        'It stops all replicas until an operator acts',
        'It deletes the application',
      ],
      answer: 0,
      explain: 'The Runtime Fabric page says the same, and adds that on the first deployment no rollback version is defined. A pipeline must read the result, and it cannot assume the old version is back.',
    },
    {
      type: 'single',
      prompt: 'An app on CloudHub 2.0 is updated with the default `rolling` strategy, which updates replicas incrementally. What is true while the update runs?',
      options: [
        'Old and new app versions run at the same time',
        'All replicas stop first, so the app is unavailable',
        'No extra resources are needed for the replicas',
        'A passing smoke test proves that all replicas are new',
      ],
      answer: 0,
      explain: 'Different versions run at the same time until the update completes, so a request can reach either one. Apps must be able to run multiple versions in parallel, so keep API and data changes compatible with the old version, and run smoke tests after the deployment is complete. `rolling` maintains availability, and it needs one additional replica\'s worth of resources.',
    },
    {
      type: 'single',
      prompt: 'The app starts well but error rates jump 10 minutes after a release. Which control applies?',
      options: [
        'A pipeline step that watches agreed signals for a fixed period, and triggers a normal redeploy of the last good version',
        'The platform automatic rollback, which reacts to error rates',
        '`skipDeploymentVerification`',
        '`deploymentTimeout`',
      ],
      answer: 0,
      explain: 'The platform behaviour covers a configuration that failed to deploy. An app that started and is misbehaving counts as deployed, so the trigger must come from your monitoring and your pipeline.',
    },
    {
      type: 'order',
      prompt: 'Order the path of a release.',
      items: [
        'Pull request: tagged MUnit tests and spec checks',
        'Merge to `main`: the full MUnit run and the coverage gate',
        'Tag a release version, and publish it to Exchange once',
        'Deploy to Test with Test configuration, and run smoke tests',
        'Get the Production approval',
        'Deploy the same version with Production configuration',
        'Watch the agreed signals, then record the release',
      ],
      explain: 'Everything before the tag can change. Everything after it only moves one fixed version.',
    },
  ],
  description: `
A hotel group runs **55 Mule applications**, owned by 6 teams: 40 on **CloudHub 2.0**, and 15 on **hybrid server groups** close to the property management systems. Development uses **GitHub Actions**, except one acquired team that stays on **Azure DevOps** for another year.

Today:
- Each team has its own Git model. Two use a branch per environment, and merges between them cause regular surprises in Production.
- Each environment rebuilds the app with a Maven profile, so "the version that passed Test" is a matter of opinion.
- Some apps in Test run \`SNAPSHOT\` versions, and two reached Production by accident last quarter.
- After a failed release, people disagree on whether the platform "rolls back by itself".

Targets from the CTO:
- Any team can release an app on any weekday, without a release train.
- What runs in Production is byte for byte what was tested.
- A bad release is detected and reversed by the pipeline within 15 minutes, with a person only approving.
- Hotfixes do not bring unreleased work with them.

**Questions**
1. Choose a branching model and a versioning rule, and justify them.
2. Design the promotion path, for CloudHub 2.0 and for hybrid.
3. Where does environment-specific configuration live?
4. What does the platform do when a deployment fails, and what must the pipeline do for itself?
5. Design the automated rollback.
6. How do you implement approvals and shared logic in GitHub Actions and in Azure DevOps?
`,
  answerTemplate: `## Branching and versioning

## Promotion path

## Configuration

## Platform behaviour on failure

## Automated rollback

## GitHub Actions and Azure DevOps
`,
  keyPoints: [
    'One main line with short-lived branches. No branch per environment.',
    'A release version comes from a tag. A SNAPSHOT cannot be promoted to any other state, and should not reach Production.',
    'Build once and publish once. Then only move that version: mule:deploy, assetVersion or the stored JAR.',
    'Everything that differs by environment arrives from outside the artifact, and secrets come from a secret store.',
    'On a failed deployment, CloudHub 2.0 and Runtime Fabric attempt to roll back to the last successful configuration, but it might not succeed.',
    'An app that started and misbehaves is not a failed deployment, so a pipeline must detect it and redeploy.',
    'rolling runs two versions at once, so the app and its contracts must tolerate that.',
    'Use protected environments for approvals, and shared workflows or templates for logic.',
  ],
  solution: `
**Branching and versioning.** Use one main line. Feature branches live for days, and merge by pull request with tagged MUnit tests. The version on \`main\` can be \`X.Y.Z-SNAPSHOT\` for development deployments, and a release sets \`X.Y.Z\` and creates a tag. Branches per environment go, because promotion by merge produces a new result in every environment, which is the cause of the surprises in Production.

Hotfix: cut a branch from the tag that is in Production, fix, release \`X.Y.Z+1\`, and merge the fix back to \`main\`. This keeps unreleased work out of it.

\`SNAPSHOT\` rule: the docs say a \`SNAPSHOT\` asset is permanently in \`development\` and cannot be promoted, and the CloudHub 2.0 page says to avoid them in Production. So the pipeline refuses a version with \`SNAPSHOT\` for any environment after development. This is one line of script, and it would have stopped both accidents.

**Promotion path.**
- Publish the release version to Exchange once, with \`mvn clean deploy\` and no \`muleDeploy\`.
- CloudHub 2.0: \`mvn mule:deploy\` from the tag, which deploys without rebuilding, or \`runtime-mgr:application:modify\` with \`--assetVersion\`. Test configuration and Production configuration differ, and the asset does not.
- Hybrid: store the JAR from the build, and use \`mvn mule:deploy -Dmule.artifact=...\` with \`armDeployment\`. The docs say this parameter is valid for CloudHub, standalone, and on-premises deployments. \`runtime-mgr:standalone-application:copy\` and the console's **Get from sandbox** are alternatives. For promotion the hybrid page asks for identical or compatible runtime versions, matching target types, and permissions on both environments.
- Record the checksum of the JAR at build time, and compare it after each deployment to prove the "byte for byte" target.

**Configuration.** Non-secret values go in one reviewed file per app and environment, sent with \`propertiesFile\`. Secrets come from a secret store. API instance IDs are per-environment values, because promotion gives each environment its own ID. The pipeline is the single owner, so a value set by hand does not survive the next deployment. Policies are applied by script from the repository. Remember that on CloudHub 2.0, once \`properties\` or \`secureProperties\` is in the POM, nothing merges with Runtime Manager values.

**Platform behaviour on failure.** Answer the disagreement with the docs:
- On CloudHub 2.0 and Runtime Fabric, if configuration updates fail to deploy, the status is \`Update failed\`, and the deployment attempts to roll back to the last successful version of the configuration. In some situations the rollback might not succeed.
- On a first deployment there is nothing to go back to, and Runtime Fabric says it stays in the failed status.
- The **Config changes** history keeps the last 10 configuration deployments. On both platforms, you can select an earlier one and click **Deploy**.
- During a rolling update, the last successfully deployed configuration is retained until the new one is deployed. A replica that cannot start stays in a restart cycle with backoff, which is why \`deploymentTimeout\` and verification matter.
- The hybrid pages read for this design describe no such automatic behaviour, so for hybrid, assume that the pipeline owns all of it.

So the platform helps with a deployment that fails. It does nothing for a release that deploys well and behaves badly.

**Automated rollback.** It has two triggers:
1. The deployment job fails. Read the actual state, and do not assume. If the old version is not running, deploy it.
2. The deployment succeeds, but the agreed signals go bad within a watch period, such as error rate, latency and a business count from smoke tests or Anypoint Monitoring.

The action is the normal deployment path with the previous version and its matching configuration, read from the release record. A person approves when the pipeline proposes this, and that meets the "only approving" target. Not every release can do this: as in the rollback-ready design, each release must declare whether redeploying the previous version is safe, and API or database changes must be backward compatible. The rolling strategy has the same demand, because two versions run at once during every update.

**GitHub Actions and Azure DevOps.**
- GitHub Actions: put shared logic in reusable workflows called by each repository, so that 55 repositories do not hold 55 copies. Use GitHub Environments for \`test\` and \`production\`, with required reviewers and environment-level secrets. A \`concurrency\` group per app and environment stops two deployments racing.
- Azure DevOps: use YAML templates in a shared repository. Azure DevOps Environments give approvals and checks, and variable groups can link to Azure Key Vault. Exclusive lock checks serve the same purpose as \`concurrency\`.
- In both: the steps are only Maven and CLI commands, so the behaviour lives in the parent POM and shared scripts, and the acquired team can move later without a redesign.
`,
  followUps: [
    { q: 'Why not use a release train?', a: 'It helps when many apps must change together. With API-led, keep contracts compatible, so that apps can release on their own. Use a coordinated release only for a real breaking change.' },
    { q: 'What decides the order when two apps depend on each other?', a: 'Release the provider first with a backward compatible change, then the consumer. If a provider change is breaking, it becomes a new major version that runs beside the old one.' },
    { q: 'When would you use recreate?', a: 'When old and new versions cannot run together, or resources are short. The Runtime Fabric page recommends it for a clustered app when a runtime change alters the Hazelcast version, because a mixed cluster may fail with a serialization error.' },
    { q: 'Does the pipeline need Config changes history at all?', a: 'It is a useful manual fallback, but your release record is the source of truth, because the history keeps only 10 configuration deployments.' },
    { q: 'How do you measure the design?', a: 'Use the usual delivery measures per app: deployment frequency, lead time, change failure rate and time to restore, plus how often an automated rollback was proposed and accepted.' },
  ],
}
