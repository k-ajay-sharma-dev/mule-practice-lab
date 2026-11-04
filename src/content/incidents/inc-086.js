export default {
  id: 'inc-086',
  category: 'incidents',
  title: 'New Hires Get Several Laptop Requests From the Workday On Modified Objects Listener',
  level: 'INTERMEDIATE',
  tags: ['workday', 'watermark', 'idempotency', 'duplicates', 'hr', 'onboarding'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-02 06:00:00 INFO  [wd-joiners] On Modified Objects: objectType=WORKERS watermarkEnabled=false frequency=15 MINUTES', relevant: true, why: 'The listener runs with the default of false, so Mule does not filter items it has already received.' },
      { text: '2026-11-02 06:15:04 INFO  [wd-joiners] Worker 21877 received, ticket REQ-55102 created (laptop)', relevant: false },
      { text: '2026-11-02 06:30:04 INFO  [wd-joiners] Worker 21877 received, ticket REQ-55119 created (laptop)', relevant: true, why: 'The same worker is processed again with no new business event, and a second ticket is created.' },
      { text: '2026-11-02 06:45:05 INFO  [wd-joiners] Worker 21877 received, ticket REQ-55126 created (laptop)', relevant: true, why: 'A third ticket shows that this repeats, and that the ticket step has no duplicate check.' },
      { text: '2026-11-02 07:00:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-02 07:12:33 INFO  [wd-joiners] Workday response 200, 214 ms', relevant: false },
      { text: '2026-11-02 08:02:10 WARN  [itsm] Asset team: 412 open laptop requests for 58 joiners', relevant: true, why: 'This gives the size of the impact: about seven tickets per joiner.' },
      { text: '2026-11-02 08:05:00 INFO  [runtime] wd-joiners: 1 replica RUNNING, CPU 6%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the repeated tickets?',
        options: [
          'Watermark Enabled is left at its default of false, so an item received more than once is processed more than once, and the ticket step has no duplicate check',
          'Workday created the same worker several times',
          'The app runs on several replicas',
          'The ISU has lost its permission on the Staffing service',
        ],
        answer: 0,
        explain: 'The docs say that with Watermark Enabled set to true, Mule processes an item just once even if it receives it multiple times. The default is false. The log shows one replica and no errors.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Stop the listener flow so no more tickets are created, then enable the watermark and redeploy',
          'Increase the polling frequency to every minute',
          'Delete the worker records in Workday and hire them again',
          'Change the Response Timeout',
        ],
        answer: 0,
        explain: 'Stop the damage first. Faster polling would create more duplicates, and the Workday data is correct.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'Turn on the Watermark option on the source',
          'Make ticket creation idempotent, for example with an Idempotent Message Validator keyed on worker ID and request type',
          'Alert when the number of tickets per day is far above the number of joiners',
          'Test the source over several polling cycles before go-live',
          'Rely on the ITSM team to close duplicates by hand',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The watermark addresses the source, and idempotency protects the side effect with an action that must happen once per joiner.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Confirm from the logs that the same workers are processed in repeated polls',
          'Stop the wd-joiners flow',
          'Enable the watermark and add the idempotency check',
          'Deploy and watch several polling cycles for one test worker',
          'Close the duplicate tickets with the ITSM team, keeping one per joiner',
        ],
        explain: 'Confirm, stop, fix, verify over more than one cycle, and then clean up.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 08:00: the asset team reports **412 open laptop requests for 58 joiners** starting this month. Some joiners have seven or more tickets.
- The tickets were created by the new \`wd-joiners\` integration, which went live at 06:00 this morning.
- The app is healthy with no errors, and Workday data is correct: each joiner exists once.

## Change / Context
- \`wd-joiners\` uses the Workday **On Modified Objects** source with object type \`WORKERS\`, polling every 15 minutes, and creates an ITSM ticket for each worker it receives.
- **Watermark Enabled** was left at its default.
- It runs on one replica. Tests used a single polling cycle and one test worker.

## Logs
\`\`\`
06:00:00 INFO [wd-joiners] On Modified Objects: objectType=WORKERS
                           watermarkEnabled=false frequency=15 MINUTES
06:15:04 INFO [wd-joiners] Worker 21877 received, ticket REQ-55102 created
06:30:04 INFO [wd-joiners] Worker 21877 received, ticket REQ-55119 created
06:45:05 INFO [wd-joiners] Worker 21877 received, ticket REQ-55126 created
08:02:10 WARN [itsm] Asset team: 412 open laptop requests for 58 joiners
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
    'Watermark Enabled on On Modified Objects defaults to false. When true, Mule processes an item just once, even if it receives the item multiple times.',
    'The same worker in repeated polls, with no errors and one replica, points to the source configuration and not to Workday data.',
    'A step with a real-world side effect must be idempotent regardless of the source.',
    'Stop first: faster polling or a restart does not help.',
    'Testing a polling source needs several cycles, not one.',
  ],
  solution: `
**Diagnosis.** The log shows the same worker in successive polls, with no new business event and a new ticket each time. The listener logs \`watermarkEnabled=false\`, and the ticket step creates a ticket for everything it receives. There is one replica, so scaling is not the cause.

**Immediate mitigation.**
- Stop the \`wd-joiners\` flow.
- Turn on the source's Watermark option (the docs give the display name, so check the exact XML attribute in Studio), add the idempotency check and redeploy.
- Watch one test worker over several polling cycles.
- Work with the ITSM team to close the duplicates, keeping the oldest ticket per joiner. Export the list from the app log.

**Root cause.** A polling source was used with its default setting for a flow that has a one-time side effect. The docs say the watermark is what makes Mule process an item once when it receives that item several times. The docs do not say when Workday returns an item again, so the design must not assume that it never does. The tests covered one polling cycle, so they could not show the repeat.

**Permanent fix.**
- Enable the watermark on the source.
- Make ticket creation **idempotent**, for example an Idempotent Message Validator with a persistent object store, keyed on worker ID and request type. A real change to a worker can also arrive as a new item, so the flow should act only on the hire event and not on every modification.

**Prevention.** Run polling sources through several cycles in test. Alert when the ticket count is out of line with the number of joiners. Add a review question for every source: what happens if the same item arrives twice?
`,
  followUps: [
    { q: 'Worker changes also reach this flow. How do you only react to hires?', a: 'Check the hire date or the business process in the worker data, and filter in a Choice. The source fires when an instance is created, modified or deleted, so a later address change would otherwise look like a new item.' },
    { q: 'What does Updated From do?', a: 'It is an optional date in the format yyyy-MM-dd\'T\'HH:mm:ss.SSS on the source. It is not a substitute for the watermark, so test how the two work together in your connector version.' },
    { q: 'Where is the watermark state kept, and what happens after a redeployment?', a: 'The Workday reference does not say, so test it: stop and redeploy in a test environment, and check whether items are received again. The idempotency check protects you either way.' },
  ],
}
