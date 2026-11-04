export default {
  id: 'inc-088',
  category: 'incidents',
  title: 'Pipeline Suddenly Fails the MUnit Coverage Gate After a POM Clean-Up That Changed No Flow',
  level: 'INTERMEDIATE',
  tags: ['munit', 'testing', 'coverage', 'ci-cd', 'maven', 'release'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '09:12:03 INFO  [ci] Commit 8f21c4 "chore: remove duplicated plugin config from pom.xml" (1 file changed: pom.xml)', relevant: true, why: 'The only change is in the POM, so no flow or test changed in this build.' },
      { text: '09:13:40 INFO  [ci] Downloading from anypoint-exchange-v3: parent pom com.acme:mule-parent:1.14.0', relevant: false },
      { text: '09:15:22 INFO  [ci] Tests: 46 - Failed: 0 - Errors: 0 - Skipped: 0', relevant: true, why: 'All tests pass. The build is failing on the coverage gate, not on a test.' },
      { text: '09:15:23 INFO  [ci] MUnit Coverage Summary  * Resources: 9 - Flows: 41 - Processors: 318  * Application Coverage: 63.84%', relevant: true, why: 'Below the required 80% set in the parent POM.' },
      { text: '09:15:23 ERROR [ci] Flow: claims-events.xml -> claim-reopened-flow coverage is below defined limit. Required: 60.0% - Current: 00.00%', relevant: true, why: 'Names a flow with no test at all, and the flow-level requirement it misses.' },
      { text: '09:15:23 ERROR [ci] Flow: error-handling.xml -> global-error-handler coverage is below defined limit. Required: 60.0% - Current: 12.50%', relevant: true, why: 'Error handlers are part of the measurement, and these are barely tested.' },
      { text: '09:15:24 ERROR [ci] Failed to execute goal munit-maven-plugin coverage-report: coverage requirements not met', relevant: true, why: 'The gate fails the build, which means failBuild is now true for this project.' },
      { text: '09:15:30 INFO  [ci] Slack notification sent to #claims-integration', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'No flow changed and the previous build passed with the same 46 tests. Why does the gate fail now?',
        options: [
          'The removed child `coverage` block had been overriding the parent, which suppressed its `failBuild` and required levels. Now the parent gate applies for the first time',
          'MUnit lost its cached coverage data when the POM changed',
          'The parent POM was upgraded and raised the thresholds overnight',
          'The new POM makes MUnit run only half of the tests',
        ],
        answer: 0,
        explain: 'The child block uses `combine.self="override"`, which suppresses the parent configuration, so anything it does not repeat falls back to defaults. A required level defaults to -1, meaning no requirement.',
      },
      {
        type: 'single',
        prompt: 'A developer says the app was at 95% in the Studio run they did yesterday, so the pipeline must be wrong. What is the right reply?',
        options: [
          'The `coverage` configuration applies only to Maven runs, so judge the gate from the Maven report in `target/site/munit/coverage/`',
          'Studio is always right, so raise a defect against the Maven plugin',
          'Coverage is random between runs',
          'Studio counts only passed tests',
        ],
        answer: 0,
        explain: 'The docs state these settings apply when you execute tests with the Maven plugin. The HTML and JSON reports list every flow and the lines not covered.',
      },
      {
        type: 'multi',
        prompt: 'The team must get back to a passing, honest build. Which actions are appropriate?',
        options: [
          'Use the coverage report to write real tests for the uncovered flows and error handlers, worst first',
          'Add generated boilerplate flows to `ignoreFlows`, with a reason recorded in review',
          'Keep the parent gate active rather than restoring the child override',
          'Add every flow below the limit to `ignoreFlows`',
          'Run the pipeline with `-DskipTests`',
        ],
        answer: [0, 1, 2],
        explain: 'An ignored flow leaves coverage data and cannot fail the build, so it must be an exception. Skipping tests removes the protection the gate exists for.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm tests pass and only the coverage requirement fails',
          'Compare the child POM before and after with the parent `coverage` configuration',
          'Open the coverage report and list flows and error handlers below the limits',
          'Agree a plan and a time-boxed, recorded exception if a release cannot wait',
          'Add tests with real assertions until the gate passes',
          'Audit other projects for child `coverage` blocks that hide the parent gate',
        ],
        explain: 'Understand why the gate fired, measure the gap, decide openly, close the gap, then look for the same silent bypass elsewhere.',
      },
    ],
  },
  description: `
## Symptoms
- The \`claims-events\` pipeline fails at the test stage. All 46 tests pass, but the build fails on coverage: **63.84%** against a required 80%.
- A hotfix for another app is unaffected, but a release of \`claims-events\` planned for Thursday is now blocked.
- The team says nothing changed: "the last build passed and we have not touched a flow".

## Change / Context
- The platform team publishes a parent POM. Its \`pluginManagement\` section declares the MUnit plugin with this configuration:

\`\`\`xml
<coverage>
  <runCoverage>true</runCoverage>
  <failBuild>true</failBuild>
  <requiredApplicationCoverage>80</requiredApplicationCoverage>
  <requiredFlowCoverage>60</requiredFlowCoverage>
  <formats>
    <format>console</format>
    <format>html</format>
  </formats>
</coverage>
\`\`\`

- Fourteen months ago a developer added this to the \`claims-events\` POM to get an HTML report during an investigation:

\`\`\`xml
<coverage combine.self="override">
  <runCoverage>true</runCoverage>
  <formats>
    <format>html</format>
  </formats>
</coverage>
\`\`\`

- This morning a clean-up commit removed the block as "duplicated plugin config".

## Logs
\`\`\`
09:12:03 INFO  [ci] Commit 8f21c4 "chore: remove duplicated plugin config from pom.xml"
09:15:22 INFO  [ci] Tests: 46 - Failed: 0 - Errors: 0 - Skipped: 0
09:15:23 INFO  [ci] Application Coverage: 63.84%
09:15:23 ERROR [ci] Flow: claims-events.xml -> claim-reopened-flow coverage is below
          defined limit. Required: 60.0% - Current: 00.00%
09:15:24 ERROR [ci] Failed to execute goal munit-maven-plugin coverage-report
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
    'combine.self="override" suppresses the parent configuration, so you must declare everything again. The MUnit page says any child override does this, while standard Maven merges by element name, so check the effective POM.',
    'Without failBuild and required levels, defaults apply: a required level defaults to -1, so nothing fails the build.',
    'The application was always at about this coverage; the clean-up simply made the gate real.',
    'Application coverage can look fine while one flow has none; flow and resource levels catch that.',
    'Coverage settings apply to Maven runs, and the reports in target/site/munit/coverage/ show what is missing.',
    'ignoreFlows and ignoreFiles remove items from the numbers, so reserve them for code that does not need testing.',
  ],
  solution: `
**Diagnosis.** The commit touched only \`pom.xml\`, and all tests pass. The gate failed because of coverage: the application is at 63.84% against 80%, and flows such as \`claim-reopened-flow\` are at 0%. So the question is why it ever passed. Compare the effective plugin configuration before and after the commit, for example with \`mvn help:effective-pom\`, rather than relying on reading the POMs.

**Immediate mitigation.**
- Do not restore the override and do not skip tests.
- Open the HTML report in \`target/site/munit/coverage/\`, and list the flows and handlers below the limit. For scripting, add the \`json\` format to get \`munit-coverage.json\`.
- Tell the release owner that this is a long-standing gap, now visible. If Thursday's release cannot wait, have the platform lead approve a recorded, time-boxed exception, rather than quietly changing the gate.

**Root cause.** The child block used \`combine.self="override"\`, which Maven documents as completely suppressing the parent configuration. The MUnit Maven Plugin page goes further: it says any override suppresses the original and that elements not repeated are not inherited. Maven's own POM reference says the default is a merge by element name, so without that attribute the two sources disagree, and \`mvn help:effective-pom\` is the way to settle it. Here both agree. The child block mentioned only \`runCoverage\` and \`formats\`. So \`failBuild\` and the required levels were dropped, and with no requirement defined a level defaults to -1, which sets no requirement. For fourteen months the project had coverage reports but no gate, and it drifted. Removing the block was correct, but nobody expected the result.

**Permanent fix.**
- Write tests for the uncovered flows and error handlers. The report lists \`error-handler\` entries as well as flows, so handlers count. Focus on behaviour: assert results, error types and calls.
- Exclude only what really needs no test, such as generated boilerplate, with \`ignoreFlows\` or \`ignoreFiles\`, and record why. An ignored flow does not count as coverage data and cannot fail the build.
- Agree a date to return to the normal thresholds if an exception was granted.

**Prevention.**
- Audit every project for child \`<coverage>\` blocks, and require any override to repeat \`failBuild\` and the required levels.
- Enable the \`json\` format, then have the pipeline read \`munit-coverage.json\` and fail or warn if \`requiredApplicationCoverage\` is -1, which reveals a silently disabled gate.
- Treat POM changes to the MUnit plugin as reviewable by the platform team.
- Publish coverage per project, so drift is visible before it becomes a blocked release.
`,
  followUps: [
    { q: 'How can a child project change only the report format without losing the gate?', a: 'Repeat the whole coverage block in the child, including failBuild and the required levels, or set the format in the parent. That is safe either way: the plugin docs say an override replaces the configuration, while standard Maven merges by element name. Confirm the result with mvn help:effective-pom.' },
    { q: 'What does the warning mean when failBuild is false?', a: 'The build passes and the summary shows a WARNING with the level not met and where, for example the flow, the required percentage and the current percentage.' },
    { q: 'Should the gate be per flow or per application?', a: 'Use both. An application average can hide a critical flow at 0%, while a very strict per-flow gate encourages empty tests. Pick thresholds that the team can meet with meaningful tests.' },
  ],
}
