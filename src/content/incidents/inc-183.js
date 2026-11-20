export default {
  id: 'inc-183',
  category: 'incidents',
  title: 'A Database Password Shown in Plain Text in Runtime Manager: Properties Not Declared as Secure',
  level: 'INTERMEDIATE',
  tags: ['security', 'secure-properties', 'runtime-manager', 'cloudhub', 'secrets'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-15 09:12:40 INFO  [audit] User contractor-17 viewed application claims-sync, tab Properties', relevant: true, why: 'Someone with view access opened the properties tab.' },
      { text: '2026-11-15 09:12:40 INFO  [audit] Properties shown: db.user, db.password, api.clientId, env', relevant: true, why: 'db.password is among the properties shown, so its value was visible.' },
      { text: '2026-11-15 09:20:03 INFO  [claims-sync] Application started with 4 properties from Runtime Manager', relevant: false },
      { text: '2026-11-15 09:20:04 INFO  [claims-sync] mule-artifact.json secureProperties: none', relevant: true, why: 'No property was declared secure, so Runtime Manager shows every value.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why could a contractor read the database password?',
        options: [
          'It is not listed under `secureProperties` in `mule-artifact.json`, so it is shown',
          'It is not in an encrypted `.yaml` file, so Runtime Manager shows its value',
          'Runtime Manager hides values only from users without the Viewer role',
          'The Secure Properties config was not added, so the value is not masked',
        ],
        answer: 0,
        explain: 'Properties named in secureProperties in mule-artifact.json are hidden in Runtime Manager. Others are shown in plain text to users who can view the application. An encrypted file or the Secure Properties config protects values in the project, not values typed into Runtime Manager.',
      },
      {
        type: 'multi',
        prompt: 'What should happen right away?',
        options: [
          'Rotate the database password, since it must be treated as exposed',
          'List the users who viewed the properties tab while it was visible',
          'Declare db.password and other secrets as secure and redeploy',
          'Rename the property to dbpw so it is harder to spot',
        ],
        answer: [0, 1, 2],
        explain: 'Once seen, a secret is exposed. Rotate it, find out who saw it, and hide it. Renaming does not hide anything.',
      },
      {
        type: 'single',
        prompt: 'Where should the encrypted values for each environment live in the project?',
        options: [
          'In an encrypted secure properties file per environment, key given at deploy',
          'In one encrypted file for all environments, with the key in the same project',
          'In the POM as Maven properties, encrypted with the Maven master password',
          'In plain `.properties` files per environment, kept out of the Git repository',
        ],
        answer: 0,
        explain: 'Encrypted values in the project, with the key given only at deploy time and kept as a secure property, keep secrets out of plain text everywhere.',
      },
      {
        type: 'single',
        prompt: 'Which check would have caught this before go-live?',
        options: [
          'A pipeline check that every secret-like property name is in `secureProperties`',
          'A pipeline scan that no log line in the test run contains the word password',
          'A pipeline check that the secure properties file decrypts with the deploy key',
          'A smoke test after deploy that the app connects to the database',
        ],
        answer: 0,
        explain: 'A naming rule checked by the pipeline catches a missing secure declaration every time, before anyone can see the value.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Rotate the database password',
          'Declare the secrets as secure and redeploy',
          'Review who viewed the properties while they were visible',
          'Review access: who needs to view production apps',
          'Add a pipeline check for secure property declarations',
        ],
        explain: 'Make the leaked secret useless first, hide the new one, learn who saw it, tighten access, then guard future releases.',
      },
    ],
  },
  description: `
## Symptoms
- During an access review, the security team noticed the production database password of \`claims-sync\` in plain text on its Properties tab in Runtime Manager.
- Several contractors with view access to production could see it.

## Change / Context
- To move faster, the team set credentials as application properties in Runtime Manager instead of using encrypted secure properties files.
- The app's \`mule-artifact.json\` has no \`secureProperties\` list.
- No log line ever printed the password.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-15 09:12:40 INFO  [audit] User contractor-17 viewed application claims-sync, tab Properties
2026-11-15 09:12:40 INFO  [audit] Properties shown: db.user, db.password, api.clientId, env
2026-11-15 09:20:04 INFO  [claims-sync] mule-artifact.json secureProperties: none
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
    'Properties listed in secureProperties in mule-artifact.json are hidden in Runtime Manager.',
    'Other properties are shown in plain text to users who can view the app.',
    'A secret that was visible must be rotated.',
    'Keep encrypted values in secure properties files and give the key only at deploy time.',
    'Limit who can view production applications.',
    'Check secure declarations in the pipeline.',
  ],
  solution: `
**Diagnosis.** The password was set as an application property in Runtime Manager. The app's \`mule-artifact.json\` does not list it under \`secureProperties\`, so Runtime Manager shows its value to anyone who can view the app.

**Immediate mitigation.**
- Rotate the database password now and update the app.
- Declare \`db.password\` and every other secret as secure, and redeploy.
- Use the audit log to list who viewed the properties while they were visible.

**Root cause.** Credentials were moved into Runtime Manager properties for speed, without the secure declaration that hides them. Nothing in the release process checked for it.

**Permanent fix.**
- Keep secrets in an encrypted secure properties file per environment, read through the Secure Properties config.
- Give the encryption key at deploy time as a property that is itself declared secure.
- List every secret name in \`secureProperties\`.

**Prevention.** A pipeline check that fails when a property name contains password, secret or key and is not declared secure. Regular reviews of who can view production apps.
`,
  followUps: [
    { q: 'Does declaring a property secure encrypt it in the project?', a: 'No. It hides the value in Runtime Manager. Encryption in the project comes from secure properties files and the Secure Properties config.' },
    { q: 'Why rotate if nobody misused the password?', a: 'You cannot prove it was not copied. Rotation makes the exposed value useless.' },
    { q: 'Where does the encryption key go?', a: 'In the deployment, as a property declared secure, never in the project or the POM.' },
    { q: 'What else should the access review look at?', a: 'Who can view and change production apps, and whether contractors need that access at all.' },
  ],
}
