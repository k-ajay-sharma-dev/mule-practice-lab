export default {
  id: 'ms-134',
  category: 'mulesoft',
  title: 'One Pipeline Design on Jenkins, GitHub Actions and Azure DevOps: MUnit Stage, Test Reports and Per-Environment Properties',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'munit', 'testing', 'jenkins', 'github-actions', 'azure-devops', 'properties'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'The CI tool must show MUnit results in its own test view. Where does the MUnit Maven Plugin write the reports it can read?',
      options: [
        '`target/surefire-reports`, in Surefire format, enabled by default',
        '`target/munit-reports/junit`, after adding the Surefire plugin',
        '`target/site/munit/coverage`, in Surefire format',
        'Nowhere: MUnit results exist only in the console',
      ],
      answer: 0,
      explain: 'MUnit has built-in Surefire support and `enableSurefireReports` defaults to true. `target/site/munit/coverage` holds coverage reports, which are a different thing.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A project has no test suites yet, and the build fails at the test step. Which statement is correct?',
      options: [
        '`munitFailIfNoTests` defaults to true, so a build with no suites, or no tests run, fails',
        'MUnit always passes when there are no tests',
        'Coverage fails the build, because 0 tests means 0% coverage',
        '`skipAfterFailure` causes this',
      ],
      answer: 0,
      explain: 'Set it to false only when no tests are expected. `skipTests` and `skipMunitTests` skip execution, and this validation does not run in that case.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which parameters of the MUnit Maven Plugin are documented?',
      options: [
        '`skipMunitTests` skips all MUnit tests and defaults to false',
        '`skipAfterFailure` skips all tests if one fails and defaults to false',
        '`environmentVariables` sets additional environment variables on the test run',
        '`systemPropertyVariables` sets system properties on the test run',
        '`retryFailedTests` reruns failing tests up to three times',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The first four are in the parameters table. The fifth does not appear there.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'A team wants non-secret deployment values in one reviewed file per environment. Which plugin element fits, and what format does it need?',
      options: [
        '`propertiesFile`, in Java properties format with one `key=value` pair per line',
        '`propertiesFile`, in YAML format',
        '`secureProperties`, in JSON format',
        '`properties`, with a `file` attribute',
      ],
      answer: 0,
      explain: 'The reference table describes `propertiesFile` as an alternative to defining properties inline with `properties`.',
    },
    {
      type: 'single',
      prompt: 'An app reads `db.password` from an encrypted properties file with the Secure Configuration Properties module, using the `secure::` prefix. How should the decryption key reach the app?',
      options: [
        'Committed to the repository, next to the encrypted file',
        'Generated fresh at each deployment, separate from the encryption key',
        'Left out, because files in `src/main/resources` decrypt without a key',
        'Passed in at deployment time, through `secureProperties` or an equivalent',
      ],
      answer: 3,
      explain: 'The key is passed in at deployment time, and it must be the exact key used to encrypt the values. Encryption of the file gives no protection if the key is stored beside it. The reference needs the `secure::` prefix, and the prefix works for all values in the file, even if they are not encrypted.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each pipeline need to the feature in each tool.',
      pairs: [
        ['Jenkins: inject a secret into a build step', '`withCredentials`'],
        ['GitHub Actions: require a reviewer before Production', 'A protected environment with required reviewers'],
        ['Azure DevOps: share values and secrets across pipelines', 'A variable group'],
        ['Azure DevOps: provide a `settings.xml` to a job', 'A secure file'],
      ],
      explain: 'The tools differ in name only. Each one gives you a secret store, an approval gate and a place for shared values.',
    },
  ],
  description: `
After a merger, a manufacturing group has three integration teams on three CI tools: **Jenkins** (on-premises), **GitHub Actions** and **Azure DevOps**. Together they run 45 Mule applications on CloudHub 2.0. Each team has its own habits, and audit wants the same controls for every release. Replacing the tools is out of scope for two years.

Current problems:
- The Jenkins team runs with \`-DskipTests\` "to save time", and relies on developers running tests in Studio.
- The GitHub team reads MUnit results from the console log, so test failures are slow to find.
- The Azure team keeps \`dev.yaml\`, \`test.yaml\` and \`prod.yaml\` in the app, with passwords in plain text.
- A secret was printed in a build log last month.

**Questions**
1. Define the stages that must be the same in all three tools.
2. How should MUnit run in the pipeline, and how do results reach the CI tool?
3. How do properties work for each environment, without rebuilding?
4. How do you handle secrets in each tool?
5. How do you express the approval gate in each tool?
`,
  answerTemplate: `## Common stages

## MUnit in the pipeline

## Properties per environment

## Secrets in each tool

## Approval gates
`,
  keyPoints: [
    'Agree the stages and rules once. Each CI tool is only a different syntax for them.',
    'Run MUnit through Maven on every build, and never skip it on the way to a release.',
    'Surefire reports are in target/surefire-reports and are on by default, so the CI tool can publish them.',
    'munitFailIfNoTests defaults to true. skipTests and skipMunitTests skip execution.',
    'Non-secret values go in a config file per environment, or in propertiesFile. Secrets go in secureProperties.',
    'Encrypted values use the secure:: prefix, and the key is passed at deployment time, not stored in the repository.',
    'Use the secret store of each tool, and generate settings.xml at run time or store it as a secret file.',
  ],
  solution: `
**Common stages.** Publish one standard, then implement it in each tool:
1. Build and test: \`mvn clean test\` runs MUnit, with the coverage gate from a shared parent POM.
2. Publish once to Exchange: \`mvn clean deploy\` with a release version.
3. Deploy to Test: \`mvn mule:deploy\` with Test parameters, then a smoke test.
4. Approval.
5. Deploy the same version to Production, then a smoke test.

**MUnit in the pipeline.** Remove \`-DskipTests\` from the release path. It skips MUnit as well, because MUnit uses the same mechanism as Maven. Local Studio runs do not replace it, and coverage settings apply only to Maven runs. Keep \`munitFailIfNoTests\` at its default so that an app with no tests fails. Use \`systemPropertyVariables\` or \`environmentVariables\` for test values, and \`dynamicPorts\` on shared agents.

Surefire reports are written to \`target/surefire-reports\` by default, so each tool can publish them:
- Jenkins: the \`junit\` step, for example \`junit 'target/surefire-reports/*.xml'\`.
- Azure DevOps: the \`PublishTestResults\` task with the JUnit format.
- GitHub Actions: upload the folder as an artifact, or use a marketplace action that publishes a test report.

Publish the reports even when the test step fails, because that is when they matter most.

**Properties per environment.** There are two kinds, and they need different handling.
- Non-secret values are safe in config files such as \`config-test.yaml\`, selected by an \`env\` property, or in a \`propertiesFile\` for the deployment. Nothing requires a rebuild, because the value comes from the deployment.
- Secrets leave the application. Either encrypt the file with the Secure Properties tool and read values with \`secure::\`, passing the key at deployment time. Or set the secret in \`secureProperties\`, which tells CloudHub 2.0 to encrypt it before storing it.

Remove the plain-text passwords from the Azure team's YAML files, and rotate them, because they are in Git history. On CloudHub 2.0, if \`properties\` or \`secureProperties\` is present, the deployment replaces all existing values, so send the full set.

**Secrets in each tool.**
- Jenkins: credentials with \`withCredentials\`, and config file or secret file credentials for \`settings.xml\`.
- GitHub Actions: repository or environment secrets, referenced as \`secrets.NAME\`. Environment secrets are available only to jobs that use that environment.
- Azure DevOps: variable groups, optionally linked to Azure Key Vault, and secure files for \`settings.xml\`.

All three mask known secrets in logs, but masking fails if a value is transformed or printed in another form. So do not echo commands that contain them, and do not run Maven with \`-X\` in a stage that holds secrets.

**Approval gates.**
- Jenkins: an \`input\` step before the Production stage, limited with \`submitter\`.
- GitHub Actions: a protected environment with required reviewers.
- Azure DevOps: approvals and checks on an environment.

Use a separate Connected App for Production, held only in the protected scope, so a job that bypasses the gate has no credentials.
`,
  followUps: [
    { q: 'How do you avoid maintaining the same logic three times?', a: 'Keep the behaviour in the parent POM and in shared scripts that take the same parameters. Each CI tool then has a thin wrapper: a Jenkins shared library, a reusable GitHub workflow or an Azure template.' },
    { q: 'How do you run only a subset of tests in a PR?', a: 'Use -Dmunit.test with a suite regex, or -Dmunit.tags. Keep the full suite on the main branch.' },
    { q: 'Which Java and Mule runtime does MUnit use in the pipeline?', a: 'By default the JVM is the one running Maven, and the runtime version comes from minMuleVersion in mule-artifact.json. munit.runtimeversion changes the runtime. Align these with your target.' },
    { q: 'Why not keep one settings.xml in the repository with placeholders?', a: 'You can, as long as it has no real values and the placeholders resolve from environment variables at run time. Many teams do this, as it keeps the file reviewable.' },
  ],
}
