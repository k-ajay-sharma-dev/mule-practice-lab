export default {
  id: 'inc-187',
  category: 'incidents',
  title: 'Release Fails Only in Production: a New Property Was Added to the Dev and Test Files but Not Prod',
  level: 'BEGINNER',
  tags: ['configuration', 'properties', 'deployment', 'environments'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '2026-11-18 07:58:40 INFO  [deploy] Deploying shipment-api 3.8.0 to env=prod', relevant: false },
      { text: '2026-11-18 07:59:12 ERROR [shipment-api] Couldn\'t find configuration property value for key ${carrier.timeoutMs}', relevant: true, why: 'The app cannot start because a property it uses has no value in production.' },
      { text: '2026-11-18 07:59:12 ERROR [deploy] Application shipment-api failed to start, previous version 3.7.2 still running', relevant: true, why: 'The old version keeps running, so customers are not affected yet.' },
      { text: '2026-11-18 08:01:03 INFO  [git] config-dev.yaml and config-test.yaml changed in 3.8.0, config-prod.yaml unchanged', relevant: true, why: 'The new key was added to two of the three environment files.' },
      { text: '2026-11-18 08:02:10 INFO  [monitoring] shipment-api 3.7.2 p95=210ms errors=0.1%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the release start in test but fail in production?',
        options: [
          'config-prod.yaml has no carrier.timeoutMs, so the placeholder has no value when the app starts',
          'Production runs a different Mule version',
          'The carrier API is down in production',
          'Production does not allow YAML files',
        ],
        answer: 0,
        explain: 'Each environment loads its own file. The key exists in dev and test only, so the placeholder cannot be resolved in production.',
      },
      {
        type: 'single',
        prompt: 'Are customers affected right now?',
        options: [
          'No. The new version did not start, and the previous version is still serving traffic',
          'Yes, every call fails',
          'Yes, half the calls fail',
          'It cannot be known',
        ],
        answer: 0,
        explain: 'The deploy log says 3.7.2 is still running. That gives time to fix the file and deploy again without a rush.',
      },
      {
        type: 'multi',
        prompt: 'Which are good fixes for the release?',
        options: [
          'Add carrier.timeoutMs to config-prod.yaml with the value agreed for production',
          'Redeploy 3.8.0 after the change',
          'Delete the placeholder from the flow so the app starts',
          'Copy the whole dev file over the prod file',
        ],
        answer: [0, 1],
        explain: 'Add the one missing key and redeploy. Removing the placeholder hides the setting, and copying the dev file would point production at dev systems.',
      },
      {
        type: 'single',
        prompt: 'Which check would have caught this before the release?',
        options: [
          'A build step that fails when the environment files do not hold the same set of keys',
          'More unit tests on DataWeave',
          'A longer deploy timeout',
          'Deploying to production first',
        ],
        answer: 0,
        explain: 'A missing key is a difference between files. A build step that compares the keys finds it in seconds, long before a deploy.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm the previous version is still running and healthy',
          'Add the missing key to the production file',
          'Redeploy and watch the start-up log',
          'Add a build check that compares keys across environment files',
          'Move values that are the same everywhere into one shared file',
        ],
        explain: 'Check impact first, fix and redeploy, then make the mistake hard to repeat.',
      },
    ],
  },
  description: `
## Symptoms
- The release of \`shipment-api\` 3.8.0 worked in dev and test.
- In production the deploy fails, and Runtime Manager shows the app failed to start.

## Change / Context
- 3.8.0 adds a timeout for the carrier call, read from \`\${carrier.timeoutMs}\`.
- The app loads \`config-\${env}.yaml\`. There is one file per environment.
- The developer added the key to the dev and test files.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 07:59:12 ERROR [shipment-api] Couldn't find configuration property value for key \${carrier.timeoutMs}
2026-11-18 07:59:12 ERROR [deploy] Application shipment-api failed to start, previous version 3.7.2 still running
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
    'A placeholder with no value stops the app at start-up.',
    'Each environment file must hold every key the app uses.',
    'Check that the previous version is still serving before you rush.',
    'Add only the missing key. Never copy a dev file over prod.',
    'A build check that compares keys across files catches this early.',
    'Shared values belong in one common file, with environment files holding only what differs.',
  ],
  solution: `
**Diagnosis.** The new key \`carrier.timeoutMs\` is in the dev and test files but not in \`config-prod.yaml\`. The placeholder cannot be resolved, so the app does not start.

**Immediate mitigation.**
- Confirm 3.7.2 is still serving traffic.
- Add the key to the production file with the agreed value and redeploy.

**Root cause.** Three files had to be changed by hand, and one was missed. Nothing compared the files.

**Permanent fix.** Keep values that are the same in every environment in one shared file. Keep only real differences, such as URLs and limits, in the environment files.

**Prevention.** A build step that lists the keys in each environment file and fails when they differ. Review environment files together in the pull request.
`,
  followUps: [
    { q: 'Why did the old version keep running?', a: 'The new version failed to start, so the platform did not switch traffic to it. Check this for your deployment model before you rely on it.' },
    { q: 'Could a default value in the placeholder have hidden the problem?', a: 'Yes. A default makes the app start, but production may then run with a value nobody chose. Use defaults only when any environment may use them.' },
    { q: 'Where should secrets go?', a: 'In secure properties or a secrets store, never in the plain YAML files.' },
    { q: 'How would you write the build check?', a: 'Read each environment file, flatten the keys, and fail if any file is missing a key another file has.' },
  ],
}
