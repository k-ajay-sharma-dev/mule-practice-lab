export default {
  id: 'inc-177',
  category: 'incidents',
  title: 'Queued Shipping Labels Vanish on Every Redeploy: a Transient VM Queue',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'vm', 'queues', 'redeploy', 'reliability', 'data-loss'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-09 14:02:11 INFO  [label-app] Order WH-88120 accepted, label request published to VM queue label-requests', relevant: true, why: 'The order was accepted and the work was handed to the VM queue.' },
      { text: '2026-11-09 14:02:11 INFO  [label-app] VM queue label-requests depth=412', relevant: true, why: 'Hundreds of label requests were waiting on the queue.' },
      { text: '2026-11-09 14:02:40 INFO  [runtime-manager] Deployment of label-app 1.8.3 started', relevant: true, why: 'A redeploy restarted the app while the queue held messages.' },
      { text: '2026-11-09 14:03:55 INFO  [label-app] Application started', relevant: false },
      { text: '2026-11-09 14:03:56 INFO  [label-app] VM queue label-requests depth=0', relevant: true, why: 'After the restart the queue is empty. The 412 requests were not processed and are gone.' },
      { text: '2026-11-09 14:04:10 INFO  [label-app] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the waiting label requests disappear?',
        options: [
          'The VM queue is transient, so its messages lived only in the old app’s memory',
          'The VM Listener drained the queue too fast during startup and skipped the carrier call',
          'The new version uses a different queue name, so the old messages are on another queue',
          'The carrier API rejected all 412 requests at once while the app was restarting',
        ],
        answer: 0,
        explain: 'A transient VM queue keeps messages in memory. A redeploy stops the app, and anything still on the queue is lost.',
      },
      {
        type: 'single',
        prompt: 'Which change keeps the messages through a restart?',
        options: [
          'Make the queue persistent, or move the work to a broker such as Anypoint MQ',
          'Give the worker more memory, so that the queue holds more messages',
          'Deploy only at night, when fewer label requests are waiting on the queue',
          'Raise `maxConcurrency` on the VM Listener, so that the queue drains faster',
        ],
        answer: 0,
        explain: 'A persistent queue writes messages to storage, and an external broker keeps them outside the app altogether. More memory, quieter deploy times or faster draining only make the loss smaller.',
      },
      {
        type: 'multi',
        prompt: 'What should happen right away?',
        options: [
          'Find the orders accepted before the deploy that have no label, from the logs or the order database',
          'Request labels again for those orders',
          'Tell the warehouse which parcels are waiting for labels',
          'Redeploy again to clear the queue',
        ],
        answer: [0, 1, 2],
        explain: 'The orders are safe but their labels were never made. Find them, recreate the requests, and keep the warehouse informed. Another redeploy would lose more.',
      },
      {
        type: 'single',
        prompt: 'Why might the team still prefer Anypoint MQ to a persistent VM queue?',
        options: [
          'A VM queue belongs to one app, and how it persists depends on the deployment',
          'A persistent VM queue still loses its messages whenever the app restarts',
          'A VM Listener cannot read from a queue that is set to persistent',
          'Anypoint MQ delivers each message exactly once, and VM queues cannot',
        ],
        answer: 0,
        explain: 'VM queues belong to one app, and how they are stored and shared between replicas depends on where the app runs. An external broker keeps the work outside the app, with a dead letter queue and its own monitoring. Anypoint MQ is at least once, not exactly once.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Stop deploying label-app until the fix is ready',
          'Find and requeue the orders that lost their label requests',
          'Change the queue to persistent or move it to Anypoint MQ',
          'Test a redeploy with messages waiting on the queue',
          'Add a check before deploys that the queue is empty or durable',
        ],
        explain: 'Stop the loss, repair the damage, fix the design, prove it with the exact failing case, then guard the release process.',
      },
    ],
  },
  description: `
## Symptoms
- A warehouse app, \`label-app\`, accepts orders and asks a carrier for shipping labels in the background.
- After each release, some parcels never get a label. Warehouse staff find them hours later.
- The missing labels always belong to orders accepted in the minutes before a deploy.

## Change / Context
- The order flow publishes each label request to a **VM queue** and answers the caller at once.
- A second flow with a **VM Listener** calls the carrier API, which is slow at peak.
- The VM config was copied from a tutorial. The queue type was left as it was.
- Deploys happen during the working day.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-09 14:02:11 INFO  [label-app] VM queue label-requests depth=412
2026-11-09 14:02:40 INFO  [runtime-manager] Deployment of label-app 1.8.3 started
2026-11-09 14:03:56 INFO  [label-app] VM queue label-requests depth=0
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
    'A transient VM queue holds messages in memory only.',
    'A redeploy or crash loses every message still on a transient queue.',
    'A persistent queue keeps messages through a restart of the same app.',
    'For durable work across replicas or app versions, use an external broker such as Anypoint MQ.',
    'Find the affected orders from the logs and request their labels again.',
    'Test deploys with messages waiting, not with an empty queue.',
  ],
  solution: `
**Diagnosis.** The label requests sit on a **transient** VM queue. Transient queues keep messages in memory, so the redeploy at 14:02 dropped the 412 waiting requests.

**Immediate mitigation.**
- Pause deploys of \`label-app\`.
- Find orders accepted before each deploy that have no label, and publish their label requests again.
- Tell the warehouse which parcels are affected.

**Root cause.** The work was made asynchronous to answer callers faster, but the hand-off point was not durable. The queue type from the tutorial suited a demo, not work that must not be lost.

**Permanent fix.**
- Make the queue persistent, so messages survive a restart of the app.
- Better for this case, move the label requests to **Anypoint MQ** with a dead letter queue. The messages then live outside the app, survive any redeploy, and can be shared by several replicas.

**Prevention.** Mark every asynchronous hand-off in design reviews and ask what happens to its messages on a restart. Add a release test that deploys with messages waiting.
`,
  followUps: [
    { q: 'When is a transient VM queue fine?', a: 'When losing the messages on a restart does no harm, for example work that is repeated anyway or can be rebuilt from a source of truth.' },
    { q: 'Does a persistent VM queue remove every risk?', a: 'No. It survives a restart of the same app, but it is still part of that app. For work shared across replicas or that must survive the app being replaced, use an external broker.' },
    { q: 'How would you find the lost orders?', a: 'Compare orders accepted in the window before each deploy with the labels the carrier returned, using the order ID in both logs.' },
    { q: 'Why did the team not see this in testing?', a: 'Tests deployed with an empty queue. The loss only happens when messages are waiting at the moment of the restart.' },
  ],
}
