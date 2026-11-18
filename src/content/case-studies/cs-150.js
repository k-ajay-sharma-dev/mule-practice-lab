export default {
  id: 'cs-150',
  category: 'case-studies',
  title: 'Splitting One Shared Mule App With 60 Flows Into Separate Apps Without Downtime',
  level: 'EXPERT',
  tags: ['modernisation', 'refactoring', 'migration', 'ownership', 'deployment'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Sixty flows from five business areas live in one app. How do you decide the new apps?',
      options: [
        'Group flows by business area and owner, and by how often they change, then check the calls between groups',
        'One app per flow',
        'Split alphabetically',
        'Keep one app and add more replicas',
      ],
      answer: 0,
      explain: 'Apps that match owners and change rates can be released alone. Few calls between groups means few new network hops.',
    },
    {
      type: 'single',
      prompt: 'Two groups share a sub-flow and a DataWeave module. What do you do with them?',
      options: [
        'Move shared code into a versioned library both apps use, and keep each copy of behaviour owned by one team',
        'Copy them into both apps and let them drift',
        'Keep everything in one app',
        'Delete the shared code',
      ],
      answer: 0,
      explain: 'A versioned library lets both apps share code without being released together.',
    },
    {
      type: 'multi',
      prompt: 'Which three keep callers working while flows move?',
      options: [
        'Keep the same public paths, and route them at the gateway or load balancer to the new app',
        'Move one group at a time and compare results before switching',
        'Keep the old flow ready to take traffic back',
        'Ask every caller to change URLs on the same day',
      ],
      answer: [0, 1, 2],
      explain: 'Callers should not notice. Routing hides the move, and small steps with a way back keep it safe.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'One group reads a queue that the old app also reads. What risk does a split bring?',
      options: [
        'Both apps consume during the switch, so messages are split between them or handled by the wrong version',
        'The queue becomes faster',
        'The queue is deleted',
        'Nothing changes',
      ],
      answer: 0,
      explain: 'For listeners, switch by stopping the old consumer and starting the new one, or make handling idempotent so either version is safe.',
    },
    {
      type: 'match',
      prompt: 'Match each kind of flow to how it moves.',
      pairs: [
        ['HTTP API flow', 'Same path, routed to the new app at the gateway'],
        ['Queue listener', 'Stop the old consumer, start the new one'],
        ['Scheduler job', 'Disable in the old app, enable in the new one'],
        ['Shared sub-flow', 'Move into a versioned library'],
      ],
      explain: 'Each kind of entry point has its own safe switch.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Map flows, owners, calls and shared code',
        'Agree the target apps with the owners',
        'Move shared code into libraries',
        'Move one group at a time behind routing, with a way back',
        'Remove the moved flows from the old app and retire it at the end',
      ],
      explain: 'Understand, agree, untangle, move in small steps, then clean up.',
    },
  ],
  description: `
**Context.** Over eight years, a distributor built **one Mule app with 60 flows** for orders, stock, pricing, finance and HR. Five teams now change it.

**Facts gathered so far**
- Any change means releasing all 60 flows. Releases happen once a month and often clash.
- A memory problem in one flow has taken down all of them twice this year.
- The app exposes 25 HTTP endpoints, reads 6 queues and runs 9 scheduled jobs.
- Some flows call each other with flow references. A few DataWeave modules are shared.
- Partners call the endpoints through an API gateway.

**Opinions**
- Head of integration: "Teams must release on their own."
- Operations: "No downtime, and no partner changes."
- Finance team: "Our month end jobs must not move during the year-end close."

**Your task.** Plan how to split the app into separate apps safely.
`,
  answerTemplate: `## Decision

## Target apps

## Shared code

## Moving HTTP flows

## Moving listeners and jobs

## Order of moves

## Risks
`,
  keyPoints: [
    'Group flows by business area, owner and rate of change.',
    'Check calls between groups before deciding the split.',
    'Move shared code into versioned libraries.',
    'Keep public paths and route them to the new apps.',
    'Switch listeners and schedulers so only one app runs each at a time.',
    'Move one group at a time, with a way back.',
  ],
  solution: `
**Decision.** Five apps, one per business area and owning team, moved one at a time behind the gateway.

**Target apps.** Orders, stock, pricing, finance and HR. Flow references across groups become API calls or events.

**Shared code.** Shared DataWeave modules and sub-flows go into versioned libraries in Exchange.

**Moving HTTP flows.** The gateway routes each path to the new app when ready. The old flow stays for a quick switch back.

**Moving listeners and jobs.** Stop the queue consumer or scheduler in the old app as you start it in the new one. Make handlers idempotent so an overlap does no harm.

**Order of moves.** Start with a small, low risk group to prove the method. Keep finance jobs where they are until after year end.

**Risks.** Hidden calls between flows, two consumers on one queue, and shared state such as Object Stores used by flows in different groups.
`,
  followUps: [
    { q: 'Why not one app per flow?', a: 'Sixty apps add cost and many network calls. Group by team and change rate instead.' },
    { q: 'What about shared Object Stores?', a: 'Give each store one owning app. Others read the data through that app, or keep their own store.' },
    { q: 'How do you compare old and new before switching?', a: 'Send a copy of traffic to the new app in shadow mode, or compare outputs on test data.' },
    { q: 'How do you know the split worked?', a: 'Teams release on their own, releases are more frequent, and a fault in one app no longer stops the others.' },
  ],
}
