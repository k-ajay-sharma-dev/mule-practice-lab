export default {
  id: 'inc-153',
  category: 'incidents',
  title: 'MUnit Stage Returns 401 on Every New Container Agent: The Enterprise Repository Credentials That Never Worked',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'munit', 'testing', 'repositories', 'security', 'build-agents'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '11:02:14 INFO  [ci] Agent pod maven-agent-7xk2 started, workspace and ~/.m2 empty', relevant: true, why: 'Ephemeral agents have no local cache, so every artifact must really be downloaded.' },
      { text: '11:02:40 INFO  [ci] Downloaded from anypoint-exchange: common-types/1.4.0 (raml-fragment)', relevant: true, why: 'Exchange credentials work, so this is not a general network or identity failure.' },
      { text: '11:03:02 INFO  [ci] Downloaded from mulesoft-releases: munit-maven-plugin-3.7.0.jar', relevant: false },
      { text: '11:03:51 INFO  [ci] --- munit-maven-plugin:3.7.0:test (test) @ invoicing-sapi ---', relevant: false },
      { text: '11:03:55 ERROR [ci] Could not transfer artifact from/to MuleRepository (https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/): status code: 401', relevant: true, why: 'The plugin repository called MuleRepository rejects the request as unauthorized.' },
      { text: '11:03:55 ERROR [ci] Failed to resolve the Mule runtime for the test run', relevant: true, why: 'MUnit needs the Enterprise runtime, and Maven gets it from a plugin repository.' },
      { text: '11:04:02 INFO  [ci] settings.xml servers: anypoint-exchange, mule-enterprise', relevant: true, why: 'There is no server entry with the id MuleRepository. The ids must match, so no credentials are sent.' },
      { text: '11:04:30 INFO  [ci] Slack notification sent to #platform-builds', relevant: false },
      { text: '11:09:12 INFO  [ops] Old VM agent build-07: same job passes, ~/.m2 holds the runtime since 2024', relevant: true, why: 'The old agent never needs to download it, which is why the mismatch stayed hidden.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does Maven get a 401 on the new agents?',
        options: [
          'The plugin repository `id` is `MuleRepository` but the `<server>` is `mule-enterprise`. The ids must be the same, so the credentials are not used',
          'Exchange and the Enterprise repository share one login, and it expired',
          'MUnit does not support container agents',
          'The Enterprise repository accepts only Connected Apps',
        ],
        answer: 0,
        explain: 'The MUnit page says to set `id` to the same value as the `<id>` in the `<server>` entry of `settings.xml`. Maven matches them by that id.',
      },
      {
        type: 'single',
        prompt: 'Why did the old agents never show the problem?',
        options: [
          'The runtime was already in their local `.m2`, so nothing needed to be downloaded from the Enterprise repository',
          'Old agents use a different Maven protocol',
          'VM agents are exempt from authentication',
          'The Enterprise repository trusts the old IP addresses',
        ],
        answer: 0,
        explain: 'A warm local repository hides a broken credential, which is standard Maven behaviour. An empty agent is the honest test.',
      },
      {
        type: 'single',
        prompt: 'Which credentials does the Enterprise repository need?',
        options: [
          'Nexus enterprise credentials, which a MuleSoft customer requests from Support',
          'The client ID and secret of a Connected App',
          'Any Anypoint Platform user',
          'No credentials, because it is public',
        ],
        answer: 0,
        explain: 'The Maven Reference says to contact Support and request Nexus enterprise credentials. They are a separate thing from the Exchange login in the same `settings.xml`.',
      },
      {
        type: 'multi',
        prompt: 'Which statements are part of a correct setup?',
        options: [
          'The Enterprise repository is declared as a plugin repository in `pluginRepositories`, because Maven downloads the runtime from a plugin repository',
          'The `<server>` entry has the same `<id>`, and its password comes from the CI secret store',
          'The settings file is generated at build time, and is not stored in the Git repository with real values',
          'The Exchange server entry is unchanged, with its own id',
          'The `nexus-ee` URL is added to `distributionManagement`',
        ],
        answer: [0, 1, 2, 3],
        explain: '`distributionManagement` is where the build publishes, and that is Exchange here. The Enterprise repository is only read.',
      },
      {
        type: 'order',
        prompt: 'Order the investigation.',
        items: [
          'Read which repository returned 401, and find the artifact it was fetching',
          'Compare the repository id with the server ids in the effective settings',
          'Check why the old agents passed, by looking in their local repository',
          'Correct the id, and test on an agent with an empty `.m2`',
          'Add a check of the settings template to the agent image pipeline',
        ],
        explain: 'The error names the repository. Start from there, and not from the credentials that happen to be in the news.',
      },
    ],
  },
  description: `
## Symptoms
- After the move to container based Jenkins agents, the test stage of every Mule project fails.
- The failure is a 401 from the MuleSoft Enterprise repository, at the moment that MUnit starts.
- Projects build and download connectors and API fragments from Exchange without trouble.
- The old VM agents still pass.

## Change / Context
- Each job now runs in a new pod, with no local Maven repository.
- The platform team wrote a new \`settings.xml\` template:

\`\`\`xml
<servers>
  <server>
    <id>anypoint-exchange</id>
    <username>~~~Client~~~</username>
    <password>$\{env.EXCHANGE_CLIENT_ID}~?~$\{env.EXCHANGE_CLIENT_SECRET}</password>
  </server>
  <server>
    <id>mule-enterprise</id>
    <username>$\{env.NEXUS_USER}</username>
    <password>$\{env.NEXUS_PASSWORD}</password>
  </server>
</servers>
\`\`\`

- The parent POM has the Enterprise repository under \`pluginRepositories\`, with \`<id>MuleRepository</id>\`.
- The old VM agents have not downloaded a new runtime for a long time. Their \`settings.xml\` has the same entry, copied by hand from a wiki years ago.

## Logs
\`\`\`
11:03:55 ERROR [ci] Could not transfer artifact from/to MuleRepository
                    (https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/): status code: 401
11:04:02 INFO  [ci] settings.xml servers: anypoint-exchange, mule-enterprise
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
    'Most applications need the Enterprise runtime to run MUnit tests, and Maven downloads it from a plugin repository.',
    'The plugin repository id must be the same as the id of the server entry in settings.xml.',
    'Nexus enterprise credentials come from MuleSoft Support, and are separate from Anypoint Platform logins.',
    'The URL is https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/.',
    'A warm .m2 hides a broken credential, so test on an empty one.',
    'settings.xml holds credentials and is not distributed with a project.',
    'With both global and user settings files, they merge and user settings take precedence.',
    'Skipping tests to get past this removes the gate. Fix the id.',
  ],
  solution: `
**Diagnosis.** Read the error closely. It names the repository: \`MuleRepository\`. The Exchange downloads work, so the network and the agent are fine, and the problem is limited to this one repository. Next, compare ids. The POM says \`MuleRepository\`, and \`settings.xml\` has \`anypoint-exchange\` and \`mule-enterprise\`. Maven looks up credentials by repository id, so it sends none, and the server answers 401.

**Immediate mitigation.** Rename the server in the template to \`MuleRepository\`, or change the id in the parent POM to match. Changing the template is the smaller change, because it does not need a new parent version, and the id \`MuleRepository\` is also what the docs use. Then run one job on an empty agent. Do not add \`-DskipTests\` to get builds moving: the Enterprise runtime is needed for MUnit, and skipping removes the test gate for every release. If a release cannot wait, run it on an old VM agent while you fix the template.

**Root cause.** The MUnit Maven Plugin page says most applications need the Enterprise edition to run MUnit tests, that Maven downloads the Enterprise runtime from a plugin repository, and that you must set \`id\` to the same value as the \`<id>\` in the \`<server>\` entry of \`settings.xml\`. The ids never matched.

The mismatch is old, and the new agents only exposed it. The VM agents had the runtime in their local repository, so no download happened, and a credential that nothing used could stay wrong for years. It would have surfaced there too, on the first MUnit or runtime version that was not in the cache.

**Permanent fix.**

\`\`\`xml
<!-- parent POM -->
<pluginRepositories>
  <pluginRepository>
    <id>MuleRepository</id>
    <name>MuleRepository</name>
    <url>https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/</url>
    <layout>default</layout>
    <releases><enabled>true</enabled></releases>
    <snapshots><enabled>true</enabled></snapshots>
  </pluginRepository>
</pluginRepositories>
\`\`\`

\`\`\`xml
<!-- settings template -->
<server>
  <id>MuleRepository</id>
  <username>$\{env.NEXUS_USER}</username>
  <password>$\{env.NEXUS_PASSWORD}</password>
</server>
\`\`\`

- Keep the Nexus user and password in the CI secret store. If you do not have Nexus enterprise credentials, request them from Support.
- Remember that this repository needs more than credentials: it must appear under \`pluginRepositories\` for the runtime download. The \`repositories\` block in the \`settings.xml\` example on the Maven Reference page serves dependencies.
- If the build uses a corporate repository manager, you can proxy the Enterprise repository there, and hold the credentials in one place. This is a Maven pattern, so check your licence terms and access rules.

**Prevention.**
- Add a canary job that runs \`mvn clean test\` on an empty \`.m2\` whenever the agent image or the settings template changes.
- Keep one settings template in version control, with placeholders only, and generate the file at build time.
- Print the effective settings with secrets masked as a diagnostic step. \`mvn help:effective-settings\` is the standard way.
- List in the runbook which id belongs to which repository, and who owns the credential behind it.
`,
  followUps: [
    { q: 'Is the repository the same as the MuleSoft releases repository?', a: 'No. MuleSoft public repositories, such as https://repository.mulesoft.org/releases/, need no enterprise credentials. The nexus-ee repository is the one that needs them.' },
    { q: 'Could global and user settings conflict?', a: 'Yes. On a system with both, the files are merged, and the user settings take precedence where there are duplicates. A container image can have both, so check the effective result.' },
    { q: 'Can a project run MUnit on Mule Kernel to avoid this?', a: 'runtimeProduct accepts MULE for the Kernel, but an app that needs EE features cannot use it, and coverage runs only for EE runtimes. It is not a fix for a credential problem.' },
    { q: 'Why does Exchange still work?', a: 'It has its own server entry, and the id in the POM repository matches it. Each repository is looked up by its own id.' },
  ],
}
