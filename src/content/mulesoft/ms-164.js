export default {
  id: 'ms-164',
  category: 'mulesoft',
  title: 'Cutting a 35-Minute MUnit Stage: Test Tags, Suite Selection, Parallel Jobs, Dynamic Ports and Coverage Reports',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'munit', 'testing', 'coverage'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'Pull requests must run only the tests tagged `smoke`. Which command does the MUnit Maven Plugin page give?',
      options: [
        '`mvn clean test -Dmunit.tags=smoke`',
        '`mvn clean test -Dmunit.test=smoke`',
        '`mvn clean test -Dtags=smoke`',
        '`mvn clean test -Dgroups=smoke`',
      ],
      answer: 0,
      explain: 'A test carries tags in its `tags` attribute, such as `tags="integration,http"`. `munitTags` does the same from the POM, and you can give several tags separated by commas.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'What does `-Dmunit.test=.*orders.*#.*happy.*` select?',
      options: [
        'Tests whose name matches `.*happy.*`, in suites whose file name matches `.*orders.*`',
        'Suites called `happy`, in a folder called `orders`',
        'Flows that match `.*orders.*`, at processors that match `.*happy.*`',
        'Only tests tagged `orders` or `happy`',
      ],
      answer: 0,
      explain: 'The part before `#` is a Java regular expression on the suite file name, relative to `src/test/munit`. The part after it applies to the `name` attribute of the test. Tests in the suite that do not match are flagged as ignored.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The team wants several suites to run in parallel inside one Maven run. Which parameter of the plugin reference turns this on?',
      options: [
        'The reference table lists no such parameter, so parallelism comes from separate CI jobs that each select a share of the suites',
        '`parallelSuites`',
        '`threadCount`',
        '`forkCount`',
      ],
      answer: 0,
      explain: 'None of these appears in the MUnit Maven Plugin Configuration Reference. Separate jobs with `munit.test` or `munit.tags` are the way to split the work, and the dynamic ports feature exists for conflicts between runs.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'One shard selects tests by a tag that no test carries yet. Which statements are correct?',
      options: [
        'By default, MUnit fails the build if no tests run from the discovered suites',
        '`munitFailIfNoTests` set to `false` allows the build to succeed',
        '`-Dmunit.failIfNoTests=false` does the same from the command line',
        'The docs advise using that setting only when no MUnit tests are expected to run',
        '`-DskipTests` also runs this validation and fails the build',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The Maven `skipTests` parameter and the MUnit `skipMunitTests` parameter skip test execution, and they do not run this validation.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Two jobs share an agent and fail with a port binding exception. Match each statement to the feature that it describes.',
      pairs: [
        ['Works only through the MUnit Maven Plugin, not in Studio', '`<dynamicPorts>` in the plugin configuration'],
        ['Works from Maven and Studio, at MUnit suite level, from MUnit 2.2', '`munit:dynamic-port` global element'],
        ['Picks ports from the range 40000 to 50000', 'Plugin selection range'],
        ['Accepts optional `min` and `max` values', 'Port search limits on the global element'],
      ],
      explain: 'Both set a property with the free port. The application must use a placeholder such as `$\{http.port}` for this to help.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about coverage in Maven are correct?',
      options: [
        'The report formats are console, HTML, JSON and SONAR',
        'If a required percentage is not defined, it defaults to -1, which sets no requirement',
        'An ignored flow does not count as coverage data, and does not affect the overall number of message processors',
        'Coverage runs only for EE runtimes',
        'The JSON report goes to `target/surefire-reports/coverage.json`',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The JSON report is at `target/site/munit/coverage/munit-coverage.json`, inside the application path. The Surefire test reports are separate.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The app declares `minMuleVersion` 4.9.0, and production runs a later 4.9 patch. Which runtime do the tests use in Maven unless you change it?',
      options: [
        'The Mule version that corresponds to `minMuleVersion`, which `munit.runtimeversion` can override',
        'Always the latest runtime in the Enterprise repository',
        'The runtime of the Production target',
        'The runtime configured in `armDeployment`',
      ],
      answer: 0,
      explain: 'The deprecated `runtimeVersion` property is still supported, but it shows a warning that asks you to migrate. `runtimeProduct` comes from `requiredProduct` in the same way.',
    },
  ],
  description: `
A travel company has \`booking-papi\`, a large Mule app with 41 suites and 920 tests. The test stage takes 35 minutes, developers have started to skip it, and Jenkins runs two jobs on each agent. The team lead wants:

- A pull request check that takes under 5 minutes.
- A full run on merge, with the current coverage gate of 80%.
- Coverage figures sent to SonarQube, and a JSON summary for the release record.
- The same tests to run in Studio as in Jenkins.

Several things go wrong in the first attempt:

\`\`\`bash
# job 1 and job 2 run at the same time on the same agent
mvn clean test -Dmunit.test=.*orders.*
mvn clean test -Dmunit.test=.*payments.*
# PR job
mvn clean test -Dmunit.tags=smoke -DskipMunitTests=false
\`\`\`

- Both shards sometimes fail at start-up with a port binding exception.
- The \`smoke\` job fails because a new app has no tests with this tag.
- The build log has become too large to read.
- A test passes in Jenkins and fails in Production, and the team finds that MUnit runs on an older runtime than Production.

**Questions**
1. How do you select tests for each pipeline stage?
2. How do you run tests in parallel, and what does that mean for the coverage gate?
3. How do you fix the port conflict so that it also works in Studio?
4. How do you configure coverage for SonarQube and the JSON summary?
5. Which runtime and JVM do the tests use, and how do you align them?
6. How do you keep the build log useful?
`,
  answerTemplate: `## Selecting tests

## Parallel runs and coverage

## Port conflicts

## Coverage reports

## Runtime and JVM

## Build output
`,
  keyPoints: [
    'tags on a test, munit.tags or munitTags to select by tag, with commas for several tags.',
    'munit.test takes a Java regex on the suite file name, plus # and a regex on the test name. Non-matching tests are flagged ignored.',
    'The plugin reference has no parallel parameter. Split the work into CI jobs.',
    'No tests run means a failed build by default. munitFailIfNoTests false changes that, for projects with no tests expected.',
    'dynamicPorts is Maven only, with ports from 40000 to 50000. munit:dynamic-port works in Maven and Studio, with optional min and max.',
    'Coverage: formats console, html, json, sonar. Levels application, resource and flow. EE only.',
    'skipAfterFailure defaults to false. Turn it on for fast feedback.',
    'MUnit uses minMuleVersion by default. munit.runtimeversion overrides it, and jvm defaults to the JVM that runs Maven.',
  ],
  solution: `
**Selecting tests.** Agree on tags, such as \`smoke\`, \`regression\` and \`slow\`, and add them to the \`tags\` attribute:

\`\`\`xml
<munit:test name="create-booking-happy-path" tags="smoke,orders"> ... </munit:test>
\`\`\`

- Pull request: \`mvn clean test -Dmunit.tags=smoke\`.
- Developer debugging: \`-Dmunit.test=.*orders.*#.*happy.*\`, where the first expression matches the suite file name and the second the test name.
- Merge to main: \`mvn clean test\`, with everything.

For fast feedback, set \`skipAfterFailure\` to \`true\` on the pull request job, so that the rest of the tests are skipped after a suite fails. Its default is \`false\`, and the full run should keep it, because you want the complete list of failures. Remove \`-DskipMunitTests=false\`: \`skipMunitTests\` is a plugin parameter that already defaults to \`false\`, so the flag adds noise.

**Parallel runs and coverage.** The plugin reference has no parameter to run suites in parallel inside one run. So parallelism means separate CI jobs, each selecting a share by \`munit.test\` or by tags. A naming convention for suites makes this simple, and the docs suggest one. Keep a check that no suite is left out of all shards: a suite that matches no pattern would silently not run in the sharded job.

Coverage needs care. It measures how much of the application a set of tests executes, and the docs describe no way to merge reports from separate runs. So a shard that runs a third of the tests shows a low figure. Keep \`failBuild\` on the full run, and run shards without the gate, or verify a merging approach yourself before relying on it.

**Port conflicts.** With two jobs on one agent, both apps try to open the same port. The docs describe exactly this: the application fails with a port binding exception. Replace the fixed port with a placeholder first, because a dynamic port only helps a placeholder:

\`\`\`xml
<http:listener-connection host="0.0.0.0" port="$\{http.port}" />
\`\`\`

Then use the global element, which you define in the suite:

\`\`\`xml
<munit:dynamic-port propertyName="http.port" min="6000" max="7000"/>
\`\`\`

The team wants the same behaviour in Studio, so this is better than \`<dynamicPorts>\` in the plugin configuration. That older feature takes ports from \`[40000,50000]\`, and it does not work in Studio.

**Coverage reports.** Add the \`coverage-report\` goal to the execution, and:

\`\`\`xml
<coverage>
  <runCoverage>true</runCoverage>
  <failBuild>true</failBuild>
  <requiredApplicationCoverage>80</requiredApplicationCoverage>
  <requiredResourceCoverage>60</requiredResourceCoverage>
  <requiredFlowCoverage>50</requiredFlowCoverage>
  <formats>
    <format>console</format>
    <format>json</format>
    <format>sonar</format>
  </formats>
</coverage>
\`\`\`

The JSON file is at \`target/site/munit/coverage/munit-coverage.json\`. It has fields such as \`coverage\`, \`flowCount\` and \`processorCount\`, and the release record can use them. \`enableSonarReports\` and \`enableSurefireReports\` both default to \`true\`, with reports under \`target/sonar-reports\` and \`target/surefire-reports\`. Coverage runs only for EE runtimes. Use \`ignoreFlows\` and \`ignoreFiles\` sparingly and in review, because an ignored resource cannot fail the build.

**Runtime and JVM.** By default MUnit runs against the Mule version that matches \`minMuleVersion\`, not against your Production runtime. That explains the failure: the test ran on an older runtime. Set \`munit.runtimeversion\` to the runtime of the target, and treat it as part of the runtime upgrade. The JVM is the one that runs Maven unless you set \`jvm\` or \`-Dmunit.jvm\`, so align this with the Java version of the target too. Extra heap for the tests goes in \`argLines\`.

**Build output.** Set \`redirectTestOutputToFile\` to \`true\`. Each suite's output goes to \`munit.$\{suiteName}-output.txt\` in \`testOutputDirectory\`, by default \`$\{project.build.directory}/munit-reports/output/\`, and the test results stay in the build output. Archive that folder as a job artifact.
`,
  followUps: [
    { q: 'How do you pass test values safely?', a: 'Use systemPropertyVariables or environmentVariables in the plugin. A value passed with -D takes full priority over any other property, so the pipeline can inject it at run time.' },
    { q: 'Can a test be skipped on some runtimes only?', a: 'Yes. The ignore attribute accepts expressions, so a test can be ignored based on the Mule version or the operating system.' },
    { q: 'How do you use a per-environment properties file in tests?', a: 'Load the file with configuration-properties and a placeholder such as $\{mule-env}.properties, then set mule-env in environmentVariables of the plugin. The cookbook uses this to reach a QA endpoint.' },
    { q: 'Why not just skip tests in the PR job?', a: 'Then nothing checks the change until merge. A short tagged run keeps the feedback, and munitFailIfNoTests catches an app that has no tests at all.' },
    { q: 'Are coverage settings available in Studio?', a: 'The plugin settings apply only when running with Maven. The docs say that they do not apply from Studio.' },
  ],
}
