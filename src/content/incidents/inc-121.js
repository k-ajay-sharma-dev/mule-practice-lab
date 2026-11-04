export default {
  id: 'inc-121',
  category: 'incidents',
  title: 'All Deploy Jobs Return 401 the Day an Engineer Leaves, Weeks After the Move to Encrypted Maven Settings',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'security', 'mule-maven-plugin'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '08:30:02 INFO  [hr-sync] Account m.okafor disabled in the identity provider (leaver process)', relevant: true, why: 'The timing matches. If the jobs depended on this account, they would fail from now on.' },
      { text: '09:14:27 INFO  [ci] Using settings: /var/jenkins/.m2/settings.xml, settings-security.xml found', relevant: true, why: 'The encrypted settings are in place, so missing files do not explain the failure.' },
      { text: '09:14:30 INFO  [ci] Tests: 58 - Failed: 0 - Errors: 0 - Skipped: 0', relevant: false },
      { text: '09:15:42 INFO  [ci] Effective config: <server>anypoint-deployer</server> <username>m.okafor</username> <password>***</password>', relevant: true, why: 'The deployment block holds a username and password as well as the server ID. The docs say these overwrite the server ID.' },
      { text: '09:15:44 ERROR [ci] Failed to execute goal mule-maven-plugin:deploy: 401 Unauthorized from anypoint.mulesoft.com', relevant: true, why: 'The platform refuses the login, so this is about the identity used, not about the app or the target.' },
      { text: '09:16:03 INFO  [ci] Job invoice-sapi #412 FAILED', relevant: false },
      { text: '09:16:40 INFO  [ci] Publishing to Exchange with server id Repository: 201 Created (billing-papi 2.1.0)', relevant: true, why: 'Publishing works, because it uses a separate server entry for the Exchange repository.' },
      { text: '09:17:11 INFO  [mon] All Production applications healthy', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'The `anypoint-deployer` server entry has a valid encrypted password for a service account. Why does the job fail?',
        options: [
          'A username and password in the deployment configuration overwrite the server ID, so the job has been using the disabled account all along',
          'The master password in `settings-security.xml` expired',
          'Maven cannot decrypt passwords on a Jenkins agent',
          'A `server` entry works only for publishing, not for deployment',
        ],
        answer: 0,
        explain: 'The deployment page warns that the username and password must not be set in the deployment configuration, or they overwrite the defined server ID. The migration looked complete because everything kept working.',
      },
      {
        type: 'single',
        prompt: 'An urgent fix must go out this morning. What is the right immediate action?',
        options: [
          'Remove `username` and `password` from the deployment block in the parent POM and stop passing those parameters, so the server entry applies',
          'Re-enable the leaver\'s account until the end of the quarter',
          'Put the service account password in plain text in the POM',
          'Set `skipDeploymentVerification` to true',
        ],
        answer: 0,
        explain: 'This completes the migration that was intended. Reviving a leaver\'s account breaks the access control, and skipping verification has nothing to do with authentication.',
      },
      {
        type: 'multi',
        prompt: 'Which actions stop this happening again?',
        options: [
          'Move the pipelines to a Connected App with `connectedAppClientId`, `connectedAppClientSecret` and `connectedAppGrantType`',
          'Check `mvn help:effective-pom` for `username` and `password` in deployment blocks as a pipeline step',
          'Delete the old credentials from Jenkins so no job can pass them',
          'Treat a migration as finished only after the old identity has been disabled in a test run',
          'Add a second personal account as a fallback',
        ],
        answer: [0, 1, 2, 3],
        explain: 'A pipeline should not depend on a person. A migration is proved when the old path cannot work and releases still succeed.',
      },
      {
        type: 'order',
        prompt: 'Order the investigation.',
        items: [
          'Confirm that the failure is a 401 from the platform and not a build or target fault',
          'Match the start of the failures to the account being disabled',
          'Read the effective deployment configuration of a failed job',
          'Find the level that still sets username and password',
          'Remove them and rerun one job to prove the server entry works',
        ],
        explain: 'Move from the symptom to the identity actually used, then fix the place that sets it, and prove it with one job.',
      },
    ],
  },
  description: `
## Symptoms
- From 09:15 every Mule deploy job fails with \`401 Unauthorized\`. Across 22 applications, nothing can be released.
- Publishing to Exchange works, and running applications are healthy.
- Six weeks ago the platform team "finished" moving deployments to encrypted Maven settings. All jobs have been green since then.

## Change / Context
- The migration added a service account in the \`anypoint-deployer\` server entry, with \`settings-security.xml\` on the Jenkins agents, and added this line to the parent POM:

\`\`\`xml
<cloudhub2Deployment>
  <server>anypoint-deployer</server>
  <username>$\{anypoint.user}</username>
  <password>$\{anypoint.pass}</password>
  ...
</cloudhub2Deployment>
\`\`\`

- The old \`username\` and \`password\` lines stayed, because nobody thought they mattered. The Jenkins job template still passes \`-Danypoint.user\` and \`-Danypoint.pass\` from an old credential.
- The engineer who owned that credential left the company this morning.

## Logs
\`\`\`
08:30:02 INFO  [hr-sync] Account m.okafor disabled in the identity provider
09:14:27 INFO  [ci] Using settings: /var/jenkins/.m2/settings.xml, settings-security.xml found
09:15:44 ERROR [ci] mule-maven-plugin:deploy: 401 Unauthorized from anypoint.mulesoft.com
09:16:40 INFO  [ci] Publishing to Exchange with server id Repository: 201 Created
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
    'The docs state that username and password in the deployment configuration overwrite the defined server ID.',
    'The jobs stayed green because the personal account still worked, which hid the unfinished migration.',
    'The server element refers to a server entry in settings.xml. It is not the Mule server name.',
    'Exchange publishing and deployment use separate credentials, which is why publishing kept working.',
    'A pipeline should use a Connected App with client_credentials, so a leaver cannot break releases.',
    'Prove a migration by disabling the old identity, not by seeing green jobs.',
  ],
  solution: `
**Diagnosis.** A \`401\` on the deploy goal is about the identity. Build and tests pass, and Exchange publishing passes because it uses its own server entry. The failures start right after the leaver's account is disabled. So check which identity the deploy goal really uses, by reading the effective configuration of a failed job, not by trusting what the migration ticket says.

**Immediate mitigation.**
- Remove \`username\` and \`password\` from the deployment block in the parent POM, and remove \`-Danypoint.user\` and \`-Danypoint.pass\` from the job template.
- Rerun one low-risk job to confirm that the \`anypoint-deployer\` entry works, then release the urgent fix.
- Do not re-enable the leaver's account.

**Root cause.** The deployment page describes the encrypted setup, then notes that the username and password must not be set in the deployment configuration, or they overwrite the defined server ID. The parent POM kept both, so the \`server\` line had no effect. Every deployment for six weeks used the personal account. Disabling it exposed that. The encrypted settings themselves were correct.

**Permanent fix.**
- Replace the service account with a Connected App that acts on its own behalf, using \`connectedAppClientId\`, \`connectedAppClientSecret\` and \`connectedAppGrantType\` set to \`client_credentials\`, with secrets from the Jenkins credentials store.
- The deployment page states that these credentials need the \`Design Center Developer\` scope. Add the others the target needs, and test in a sandbox.
- Delete the old Jenkins credential, and rotate anything that used it.

**Prevention.**
- Add a pipeline check that fails if the effective POM has \`username\` or \`password\` in a deployment block.
- List the owner of each pipeline identity, and include pipelines in the leaver checklist.
- Close credential migrations only after the old identity has been disabled while a real release ran.
`,
  followUps: [
    { q: 'Why did Exchange publishing still work?', a: 'Publishing goes through Maven to the repository in distributionManagement, using the server entry whose id matches that repository. It is separate from the plugin deployment login.' },
    { q: 'What does the server element in the deployment block refer to?', a: 'A Maven server with Anypoint Platform credentials, stored in settings.xml. The docs point out that this is not the Mule server name.' },
    { q: 'Would mvn --encrypt-password have helped here?', a: 'No. Encryption protects the value in settings.xml, and it was working. The issue was that the entry was never used.' },
  ],
}
