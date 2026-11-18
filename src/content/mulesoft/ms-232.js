export default {
  id: 'ms-232',
  category: 'mulesoft',
  title: 'First Steps When a Deployment Fails: Status, Logs and Common Startup Errors',
  level: 'BEGINNER',
  tags: ['deployment', 'troubleshooting', 'runtime-manager', 'logging', 'properties', 'cloudhub', 'fundamentals', 'logistics'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'Runtime Manager shows that a new deployment failed. Where do you look first?',
      options: [
        'The application log, starting from the first ERROR during startup',
        'The last line of the log only',
        'The API Manager policies',
        'The Exchange page of the app',
      ],
      answer: 0,
      explain: 'The first error usually names the cause. Later errors are often side effects of the first one.',
    },
    {
      type: 'single',
      prompt: 'The startup log says no value was found for the property key `db.password`. The app runs fine in Dev. What is the likely cause?',
      options: [
        'The database is down',
        'The property is not set for this environment, in its properties file or in Runtime Manager',
        'The Mule runtime is too old',
        'The password is wrong',
      ],
      answer: 1,
      explain: 'A missing value stops the app before it ever connects. Compare the properties of this environment with Dev.',
    },
    {
      type: 'single',
      prompt: 'On your laptop, the app fails with an error that the address is already in use on port 8081. What does it mean?',
      options: [
        'The firewall blocks the port',
        'Another app or process already listens on 8081, so this listener cannot open it',
        'The HTTP listener config is missing',
        'The port must be above 9000',
      ],
      answer: 1,
      explain: 'Only one process can listen on a port. Stop the other process, often a second copy of the app, or change the port for local runs.',
    },
    {
      type: 'multi',
      prompt: 'Which are common reasons a Mule app fails to start?',
      options: [
        'A property placeholder with no value in that environment',
        'A wrong key for secure properties, so encrypted values cannot be read',
        'A connector or feature that needs a newer runtime than the target runs',
        'A spelling mistake inside a Logger message',
      ],
      answer: [0, 1, 2],
      explain: 'Missing values, unreadable secrets and version mismatches all stop startup. A typo in a Logger message only shows up as odd log text.',
    },
    {
      type: 'single',
      prompt: 'The app starts in Studio with `env=local` but fails on CloudHub with a missing property error. What should you check?',
      options: [
        'That the env property is set on the deployment, so the right properties file is loaded',
        'That Studio is up to date',
        'That the app has a sub-flow',
        'That the payload is JSON',
      ],
      answer: 0,
      explain: 'Studio runs with your local settings. The deployment needs its own value for the property that picks the file.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to deal with a failed deployment.',
      items: [
        'Read the status and the time of the failure in Runtime Manager',
        'Open the logs and find the first error during startup',
        'Compare the properties and versions with an environment that works',
        'Fix the cause and deploy again',
        'Confirm the app is running and call a test endpoint',
      ],
      explain: 'Read before you change anything, fix one cause at a time, and prove the fix with a real call.',
    },
  ],
  description: `
Corran Freight has moved a shipment tracking app from Dev to Test. The deployment shows a failed status in Runtime Manager. The developer who built the app is on leave, and you have been asked to find out why.

**Questions**
1. Where do you look first, and what do you look for?
2. What are the most common reasons a Mule app fails to start?
3. Why can an app start in Studio and fail on the platform?
4. What steps do you follow, in order?
`,
  answerTemplate: `## Where to look

## Common causes

## Studio works, the platform does not

## Steps
`,
  keyPoints: [
    'Start with the application log and find the first error during startup.',
    'Missing property values are the most common cause between environments.',
    'Secure properties need the right key in each environment.',
    'Version mismatches between the app and the runtime stop startup.',
    'Local settings in Studio hide differences that the deployment must set.',
    'Change one thing at a time and prove the fix with a real call.',
  ],
  solution: `
**1. Where to look.** Open the app in Runtime Manager, check the status and the time, and open its logs. Scroll to the start of the deployment and find the **first** error, with its "caused by" lines. Later errors often follow from the first one, such as flows that could not start because a config failed.

**2. Common causes.**
- A property placeholder with no value in this environment, for example a missing \`db.password\`.
- A wrong secure properties key, so encrypted values cannot be decrypted.
- A port problem, such as a listener on a port already in use on a laptop, or a port the platform does not route to.
- A version mismatch: a connector or feature that needs a newer Mule runtime or Java version than the target.
- A failing connection that the config is set to treat as fatal at startup.

**3. Studio works, the platform does not.** Studio runs with local settings: a run configuration that sets \`env=local\`, a local properties file, your own network. On the platform each of these must be set again. A missing \`env\` value means the wrong file, or no file, is loaded.

**4. Steps.** Read the status and the logs before changing anything. Compare the properties, runtime version and Java version with an environment that works. Fix one cause, deploy again, then confirm the app is running and call one endpoint to prove it.
`,
  followUps: [
    {
      q: 'The logs show the error, but the message is cut off. What do you do?',
      a: 'Download the full log from Runtime Manager or search it in your log tool, and read the whole stack trace. The useful line is often a cause further down.',
    },
    {
      q: 'How can a team stop missing property errors from reaching Test?',
      a: 'Keep one properties file per environment with the same keys, and add a pipeline check that every key in Dev exists in the other files.',
    },
    {
      q: 'The app starts but every call returns 500. Is that a deployment failure?',
      a: 'No, the app deployed. Now look at the error in the log for one failing call, often a connection or a missing value used at runtime.',
    },
  ],
}
