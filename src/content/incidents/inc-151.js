export default {
  id: 'inc-151',
  category: 'incidents',
  title: 'Every Publish Stage Fails After a Build Image Refresh: Maven 3.9.12 Meets an Old Exchange Maven Facade URL',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'exchange', 'build-agents', 'mule-maven-plugin'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '07:30:02 INFO  [image] build-agent:2026.11 rolled out to the pool (base OS patches, Maven 3.9.11 -> 3.9.14)', relevant: true, why: 'The change that lines up with the failures: Maven moved past 3.9.12.' },
      { text: '09:12:40 INFO  [ci] Apache Maven 3.9.14, Java version: 17.0.12', relevant: true, why: 'Confirms the Maven version that the failing jobs used.' },
      { text: '09:13:55 INFO  [ci] Tests run: 84, Failures: 0, Errors: 0', relevant: false },
      { text: '09:14:02 INFO  [ci] Uploading to anypoint-exchange: https://maven.anypoint.mulesoft.com/api/v2/organizations/6f1b0a44.../maven/.../returns-papi-3.2.0-mule-application.jar', relevant: true, why: 'The publish uses the v2 Maven Facade URL, and v1 and v2 need sequential file publishing.' },
      { text: '09:14:03 INFO  [ci] Uploading to anypoint-exchange: .../returns-papi-3.2.0.pom', relevant: true, why: 'A second file is uploading at the same moment, which is the parallel publishing behaviour.' },
      { text: '09:14:06 ERROR [ci] Failed to deploy artifacts: Could not transfer artifact ... to anypoint-exchange', relevant: true, why: 'The publish operation fails. The tests, packaging and credentials are not the problem.' },
      { text: '09:14:06 INFO  [ci] Teams notification sent to #returns-dev', relevant: false },
      { text: '09:20:11 INFO  [ci] Job catalog-sapi on project main: the same failure at the upload step', relevant: true, why: 'Many apps fail in the same way, which points to something shared and not to one project.' },
      { text: '09:31:44 INFO  [ci] Job notify-eapi (uses /api/v3/): BUILD SUCCESS', relevant: true, why: 'The one project on v3 still publishes. That separates the two groups and confirms the cause.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What explains the failures?',
        options: [
          'Maven 3.9.12 and later enable parallel file publishing by default, and Maven Facade API v1 and v2 require sequential file publishing',
          'The Connected App secret expired at the same time as the image update',
          'Exchange rejects Java 17 builds',
          'Version 3.2.0 was soft-deleted, so Exchange returns a conflict',
        ],
        answer: 0,
        explain: 'The Exchange page documents this: publishing to a v1 or v2 endpoint with Maven 3.9.12 or later fails. The project on v3 working is the strongest clue.',
      },
      {
        type: 'single',
        prompt: 'An urgent release is waiting. What is the quickest documented way to get all projects publishing, without changing their POMs?',
        options: [
          'Pass `-Daether.connector.basic.parallelPut=false`, or set the property in an always-enabled profile in `settings.xml`',
          'Add `maven-deploy-plugin` to each POM',
          'Set `skipDeploymentVerification` to `true`',
          'Delete the failed assets from Exchange and try again',
        ],
        answer: 0,
        explain: 'A profile in the shared `settings.xml` of the pool, or the flag in the pipeline template, covers every job in one change. The Exchange page warns against `maven-deploy-plugin` next to the Mule Maven plugin.',
      },
      {
        type: 'multi',
        prompt: 'The permanent fix is a move to the v3 Maven Facade. What must the team check?',
        options: [
          'The Mule Maven plugin is 3.5.0 or later, which the page requires for publishing with v3',
          'Parent and children change together, because a parent POM on v2 and a child on v3 fails to deploy',
          '`SNAPSHOT` versions behave differently: with v3 they are in the `development` state, and with v1 and v2 they are `stable`',
          'The REST calls to the Exchange API also move to `/api/v3/`',
        ],
        answer: [0, 1, 2],
        explain: 'The REST Exchange API stays on v2. The v3 applies only to the Maven Facade API, so scripts that call the REST API must not change.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Compare the failing jobs with the project that still works',
          'Confirm the Maven version and the Facade URL from the log',
          'Apply the property in the shared settings, and release the urgent fix',
          'Plan the move of the parent POM and all children to v3',
          'Pin the Maven version in the image, and test image changes on one pipeline first',
        ],
        explain: 'Find what separates the failures from the success, unblock everyone with a small change, and then remove the cause.',
      },
    ],
  },
  description: `
## Symptoms
- From 09:14, all but one of the Mule projects fail at the publish step. The tests pass, and the JAR is built.
- About 30 builds are affected, including an urgent release of \`returns-papi\`.
- No POM, credential or Exchange permission changed.

## Change / Context
- The platform team refreshes the build agent image each month. Today's image includes OS patches and a newer Maven.
- Most projects inherit \`distributionManagement\` from a parent POM created four years ago, with a URL ending \`/api/v2/organizations/$\{org.id}/maven\`.
- \`notify-eapi\` was created last month from a new template that uses \`/api/v3/\`.
- The Mule Maven plugin is 4.9.1 everywhere.

## Logs
\`\`\`
07:30:02 INFO  [image] build-agent:2026.11 rolled out (Maven 3.9.11 -> 3.9.14)
09:14:02 INFO  [ci] Uploading to anypoint-exchange: https://maven.anypoint.mulesoft.com/api/v2/...
09:14:06 ERROR [ci] Failed to deploy artifacts: Could not transfer artifact ...
09:31:44 INFO  [ci] Job notify-eapi (uses /api/v3/): BUILD SUCCESS
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
    'Maven 3.9.12 and later publish files in parallel by default.',
    'Exchange Maven Facade API v1 and v2 need sequential publishing, so the publish fails on those endpoints.',
    'Workarounds: use v3, use ASF Parent POM 37, or set aether.connector.basic.parallelPut to false by flag, .mvn/maven.config or a settings profile.',
    'v3 needs Mule Maven plugin 3.5.0 or later.',
    'Do not mix versions: a parent on v2 and a child on v3 fails to deploy.',
    'SNAPSHOT is development on v3 and stable on v1 and v2, so the move changes behaviour.',
    'v3 is the Maven Facade API. The REST Exchange API stays on v2.',
    'Build images are part of the release path, so treat a tool version change as a change.',
  ],
  solution: `
**Diagnosis.** A wide failure with no code change points to something shared. The image update is the obvious event, and the logs show Maven 3.9.14 and a \`/api/v2/\` URL. The most useful evidence is the exception: \`notify-eapi\` runs on the same image with the same credentials, and it publishes, and its only difference is \`/api/v3/\`.

**Immediate mitigation.** Pick the workaround with the widest reach and the smallest change:
- Add the property to an always-enabled profile in the \`settings.xml\` used by the build agents:

\`\`\`xml
<profiles>
  <profile>
    <id>disable-parallel-put</id>
    <properties>
      <aether.connector.basic.parallelPut>false</aether.connector.basic.parallelPut>
    </properties>
  </profile>
</profiles>
<activeProfiles>
  <activeProfile>disable-parallel-put</activeProfile>
</activeProfiles>
\`\`\`

- Or pass \`-Daether.connector.basic.parallelPut=false\` from the shared pipeline template. A \`.mvn/maven.config\` file does the same for one project.

Rolling the image back to the previous Maven also unblocks you, but it removes the OS patches you were installing. Rerun \`returns-papi\` once the property is in place.

**Root cause.** The Exchange page documents this. Maven 3.9.12 and later enable parallel file publishing by default. The Exchange Maven Facade API v1 and v2 require sequential file publishing and do not support this behaviour. So if you publish to a v1 or v2 endpoint with Maven 3.9.12 or later, the publish operation fails. The old URL was harmless until the tool below it changed.

**Permanent fix.** Move to v3, which is the documented first option, and the FAQ says to use the \`/api/v3/\` URL in \`distributionManagement\`.
- Plugin: v3 needs the Mule Maven plugin 3.5.0 or later, so this team is fine.
- One move: change the parent and its children together. The FAQ says not to mix versions in the same POM, and that a parent POM on v2 and a child on v3 fails to deploy.
- Behaviour: a \`SNAPSHOT\` published through v1 or v2 has the state \`stable\`. Through v3, it is in the \`development\` state permanently. Check that any job that relies on the old state still makes sense.
- Scope: only POMs change. The REST Exchange API stays on v2, so do not edit scripts that call \`/exchange/api/v2/\`.

Once all projects are on v3, remove the workaround, so that nobody depends on it by accident.

**Prevention.**
- Pin the Maven version in the image, and raise it on purpose, with the plugin's supported range in mind. Plugin 4.9.1 lists Maven 3.9.0 to 3.9.15.
- Run a canary: a sample project that goes through publish on each new image before the image reaches the pool.
- Audit old URLs across all POMs, and put the current one in the project template.
`,
  followUps: [
    { q: 'What if you use MuleSoft Government Cloud?', a: 'The page shows v2 URLs for Government Cloud, so moving to v3 may not be an option there. Check it, and use one of the other documented workarounds for parallel publishing.' },
    { q: 'What is ASF Parent POM 37?', a: 'The Exchange page lists upgrading to it as another workaround, because it includes the workaround for parallel publishing. The property is simpler if you do not already use that parent.' },
    { q: 'Would this have failed the deploy stage too?', a: 'The note is about publishing files. A later deploy to CloudHub 2.0 still needs a published asset, so it cannot proceed, but it is the publish that fails.' },
    { q: 'How do you find every old URL quickly?', a: 'Search all repositories for /api/v1/ and /api/v2/ with maven.anypoint.mulesoft.com, and include settings templates and parent POMs.' },
  ],
}
