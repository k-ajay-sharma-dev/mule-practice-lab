export default {
  id: 'inc-028',
  category: 'incidents',
  title: 'Pipeline Deploy Fails After Upgrading the Mule Maven Plugin',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'maven', 'ci-cd', 'versions', 'cloudhub-2'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '[INFO] --- maven-compiler-plugin:compile @ payments-sapi --- BUILD step OK', relevant: false },
      { text: '[INFO] Tests run: 42, Failures: 0, Errors: 0 (MUnit) - payments-sapi', relevant: true, why: 'Build and MUnit are green, so the application code is not the problem; only the deploy goal fails.' },
      { text: '[INFO] Using parent com.corp:mule-parent-pom:5.0.0 (mule-maven-plugin 4.x, target CloudHub 2.0)', relevant: true, why: 'The shared parent POM now brings a new plugin major version and a new deployment target.' },
      { text: '[INFO] --- mule-maven-plugin:deploy (default-deploy) @ payments-sapi ---', relevant: false },
      { text: '[ERROR]   Invalid deployment configuration ... cloudHubDeployment (app POM) and cloudhub2Deployment (parent POM) are both set; only one deployment type is allowed per build', relevant: true, why: 'The app still carries its old cloudHubDeployment block, which conflicts with the CloudHub 2.0 deployment the new parent configures.' },
      { text: '[INFO] Downloading from central: https://repo.maven.apache.org/maven2/... (artifact cache hit)', relevant: false },
      { text: '[ERROR] Deployment failed: the requested runtime version is not available for the target', relevant: true, why: 'Even with a valid block, the pinned old 4.4 patch runtime is not offered on the new target.' },
      { text: '[INFO] Uploading payments-sapi-1.8.3-mule-application.jar to Exchange ... skipped (already exists)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is going wrong?',
        options: [
          'The app POM still uses the old deployment config and a runtime version that the new plugin and CloudHub 2.0 target no longer accept',
          'The bug fix broke the application, which is why the deploy is rejected',
          'The Anypoint credentials used by CI have expired',
          'MUnit coverage dropped below the threshold, so the deploy goal is skipped',
        ],
        answer: 0,
        explain: 'Build and tests are green, so the code is fine. The errors are about the **deploy configuration** (a leftover `cloudHubDeployment` block conflicting with the new CloudHub 2.0 deployment) and then an **unavailable runtime version**: a config/version mismatch, not an app bug or credentials.',
      },
      {
        type: 'single',
        prompt: 'How do you get the urgent bug fix out **now**?',
        options: [
          'Migrate the app to CloudHub 2.0 and a new runtime in the hotfix branch and deploy straight to PROD',
          'Pin the previous plugin version/parent in a hotfix branch (or upload the tested JAR via Runtime Manager under change control) and deploy to the existing environment',
          'Comment out the deploy stage and ask a developer to deploy from Studio',
          'Wait for the platform team to roll back the parent POM for everyone',
        ],
        answer: 1,
        explain: 'Use the last known-good deployment path for the hotfix. Doing a platform migration during an urgent fix adds risk; deploying from a laptop bypasses change control.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Replace the old block with `cloudhub2Deployment` (target, provider, replicas, vCores, credentials from CI secrets)',
          'Move to a currently supported runtime version and run regression tests in DEV/QA first',
          'Version the parent POM with release notes and a deprecation period; run a canary app through the pipeline on shared-config changes',
          'Hard-code the Anypoint username and password in the app pom.xml so deploys never fail on auth',
        ],
        answer: [0, 1, 2],
        explain: 'Migrate the config properly, use a supported runtime and treat shared build config as a versioned product. Credentials never belong in the POM; inject them from CI secrets.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Confirm build and tests pass and only the deploy goal fails',
          'Release the hotfix using the previous plugin version or the tested JAR under change control',
          'Migrate the POM to cloudhub2Deployment and a supported runtime in a separate change',
          'Regression-test in DEV/QA, then deploy to PROD',
          'Agree a versioning and canary process for the shared parent POM',
        ],
        explain: 'Localise the failure, unblock the urgent fix safely, then do the migration properly and stop shared-config changes breaking apps silently.',
      },
    ],
  },
  description: `
## Symptoms
- An urgent bug fix for \`payments-sapi\` cannot be released: the CI deploy stage fails every time.
- The build and MUnit stages are green; only the deploy step fails.
- Developers can still run the app locally in Studio.

## Change / Context
- Last week the platform team updated the shared parent POM: \`mule-maven-plugin\` was bumped to a new major version and the target changed from CloudHub 1.0 to **CloudHub 2.0**.
- \`payments-sapi\` still has its own \`<cloudHubDeployment>\` block in its \`pom.xml\` and \`app.runtime\` pinned to an old 4.4 patch version that is no longer offered for new deployments.

## Logs (CI)
\`\`\`
[INFO] --- mule-maven-plugin:deploy (default-deploy) @ payments-sapi ---
[ERROR] Failed to execute goal org.mule.tools.maven:mule-maven-plugin:deploy (default-deploy) on project payments-sapi:
[ERROR]   Invalid deployment configuration ... cloudHubDeployment and cloudhub2Deployment are both set;
[ERROR]   only one deployment type is allowed per build
[ERROR] -> [Help 1]
--- after replacing the app's block with <cloudhub2Deployment> ---
[ERROR] Deployment failed: the requested runtime version is not available for the target
\`\`\`

## Your tasks
1. What is going wrong?
2. How do you get the urgent fix out?
3. What is the permanent fix?
4. How do you avoid this in future?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The deploy configuration in the app POM no longer matches what the new plugin version and target (CloudHub 2.0) expect.',
    'The pinned runtime version is not available on the target, so even a valid config is rejected.',
    'Immediate: deploy the fix with the previously working plugin version / pipeline, or deploy the built JAR via Runtime Manager under change control.',
    'Permanent fix: migrate to the correct deployment block (e.g. cloudhub2Deployment with target, provider, replicas, vCores) and a supported runtime version, then test in a lower environment.',
    'Prevention: version shared build config deliberately, announce breaking changes, keep a test app in the pipeline, and keep runtime versions on a support schedule.',
  ],
  solution: `
## Diagnosis
Build/tests pass, so the code is fine; the **deploy goal** fails. The parent POM changed the plugin's major version and target platform, but the app still carries its old \`cloudHubDeployment\` configuration, which conflicts with the CloudHub 2.0 deployment. After replacing it, the next error shows the pinned **runtime version is not available** on the new target. It is a configuration/version mismatch, not an application bug.

## Immediate mitigation
Get the bug fix out safely: pin the previous plugin version/parent in a hotfix branch and deploy to the existing environment, or upload the already built and tested JAR through Runtime Manager following change control. Do not try to migrate platforms during an urgent hotfix.

## Root cause
A breaking change to shared build configuration (plugin major version + deployment target) was rolled out without migrating dependent apps, and the app pinned a runtime version that had gone out of availability.

## Permanent fix
- Update the app POM to the deployment block the new plugin expects (for CloudHub 2.0: \`cloudhub2Deployment\` with uri, provider, environment, target, muleVersion, replicas, vCores, credentials from CI secrets).
- Move to a currently supported runtime (and matching Java version), run regression tests in DEV/QA, then deploy to PROD.

## Prevention
- Treat the parent POM as a versioned product: release notes, deprecation period, and apps opt in to the new version.
- Run a canary app through the pipeline when shared config changes.
- Track runtime versions against MuleSoft's support/end-of-life schedule and upgrade proactively.
`,
  followUps: [
    { q: 'Where does the Mule runtime version for a deployment come from?', a: 'From the deployment configuration (e.g. muleVersion in the plugin block) or the Runtime Manager settings; app.runtime in the POM sets the runtime the app is built and tested against, and minMuleVersion in mule-artifact.json the minimum it needs.' },
    { q: 'How do you keep credentials out of the POM?', a: 'Use Connected App client id/secret or tokens injected by the CI tool as masked variables, referenced as Maven properties, never committed to Git.' },
  ],
}
