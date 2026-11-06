export default {
  id: 'ms-183',
  category: 'mulesoft',
  title: 'How a Flow Starts: Event Sources',
  level: 'BEGINNER',
  tags: ['flows', 'http-listener', 'scheduler', 'fundamentals'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A parcel tracking flow begins with an HTTP Listener. What does the Listener do when a customer app sends a request?',
      options: [
        'It sends the request on to another API and waits for that API to reply',
        'It writes the request to a queue so that the flow can read it the next day',
        'It receives the request, creates a Mule event and starts the flow',
        'It checks the request and then waits until the next Scheduler run',
      ],
      answer: 2,
      explain: 'A source is the first component of a flow and the thing that starts it. Each request produces a new Mule event, the package of data that travels through the flow.',
    },
    {
      type: 'single',
      prompt: 'A shipping company needs a flow to build a delivery report at 1 AM every night, with no person or system calling it. Which component should start the flow?',
      options: ['Flow Reference', 'Scheduler', 'HTTP Listener', 'Set Payload'],
      answer: 1,
      explain: 'A Scheduler starts a flow on a fixed frequency or a cron schedule, so it needs no caller. An HTTP Listener would wait for a request that never comes.',
    },
    {
      type: 'match',
      prompt: 'Match what should start each flow to the kind of source that fits.',
      pairs: [
        ['A customer app calls `GET /tracking/{id}`', 'HTTP Listener'],
        ['A stock count must run every 15 minutes', 'Scheduler'],
        ['A partner drops a new file into a folder', 'A source from the File connector'],
        ['A message arrives on a JMS queue', 'A source from the JMS connector'],
      ],
      explain: 'Some connectors have sources, also called triggers, that start a flow when something happens in that system. Scheduler is the choice when time is the trigger.',
    },
    {
      type: 'single',
      prompt: 'An app has a flow with no source, and no other flow calls it. What happens to that flow when the app runs?',
      options: [
        'It runs one time when the app starts, then stops',
        'It runs again and again until the app stops',
        'It stops the app from deploying at all',
        'It never runs, as nothing ever starts it',
      ],
      answer: 3,
      explain: 'A flow without a source is a private flow. It is valid, but it only runs when something calls it, for example a Flow Reference in another flow.',
    },
    {
      type: 'single',
      prompt: 'Halfway through a flow, a developer needs to call a carrier API and use the reply. Which component fits?',
      options: [
        'HTTP Request, which calls out to the API and returns its reply',
        'HTTP Listener, which calls out to the API and returns its reply',
        'Scheduler, which calls out to the API when the flow reaches it',
        'Flow Reference, which calls out to the API using its host name',
      ],
      answer: 0,
      explain: 'This mix-up is common. A Listener waits for others to call your app, and it goes at the start of a flow. An HTTP Request is an operation that calls another system from inside a flow.',
    },
    {
      type: 'single',
      prompt: 'A flow starts with a Scheduler, and its last step is a Transform Message that builds a JSON report. Where does the report go when the flow ends?',
      options: [
        'Back to the Scheduler, which saves it in the log of the app',
        'Nowhere, unless a step in the flow sends or saves it',
        'To the caller that started the flow, as an HTTP response',
        'Into the Scheduler, which passes it to the next scheduled run',
      ],
      answer: 1,
      explain: 'An HTTP Listener has a caller waiting, so the result goes back as the response. A Scheduler has no caller, so the flow must save or send the report itself, for example with a File or Email operation.',
    },
  ],
  description: `
A shipping company is planning a small Mule app. It has three jobs:

1. Answer customers who ask where a parcel is, through \`GET /tracking/{id}\`.
2. Build a delivery report at 1 AM every night.
3. Load a file whenever a partner drops one in a folder.

A new developer asks: "Who presses the start button?" Nobody does. Each flow begins with an **event source**, also called a trigger. A source is a component at the start of a flow that waits for something to happen. When it happens, the source creates a **Mule event**, the package of data that travels through the flow, and the flow runs.

**Questions**
1. What does a source do?
2. Which source fits each of the three jobs?
3. What happens to a flow that has no source?
4. How is an HTTP Listener different from an HTTP Request?
`,
  answerTemplate: `## What a source does

## A source for each job

## A flow with no source

## Listener or Request
`,
  keyPoints: [
    'A source is the first component of a flow. It waits for something to happen and creates a Mule event.',
    'HTTP Listener starts a flow when a request arrives. Scheduler starts a flow by time.',
    'Some connectors have sources that start a flow when something happens in their system.',
    'A flow with no source only runs when something calls it, such as a Flow Reference.',
    'An HTTP Listener waits for callers. An HTTP Request calls another system from inside a flow.',
  ],
  solution: `
**What a source does:** it sits at the start of the flow and waits. When its trigger happens, it creates a Mule event and the flow runs. Each trigger gets its own event.

**A source for each job**
| Job | Source |
|---|---|
| \`GET /tracking/{id}\` | HTTP Listener |
| Report at 1 AM | Scheduler |
| New file in a folder | A source from the File connector |

**A flow with no source:** it is a private flow. It deploys without trouble, but it runs only when something calls it, usually a Flow Reference.

**Listener or Request:** the Listener is a source, so it waits for others to call your app. The Request is an operation, so it calls another system from the middle of a flow.

**Where the result goes:** a flow started by an HTTP Listener sends its result back to the caller. A flow started by a Scheduler has no caller, so it must save or send its own result.
`,
  followUps: [
    {
      q: 'What if two triggers need the same logic?',
      a: 'Give each trigger its own small flow, and put the shared logic in a flow that both call with a Flow Reference.',
    },
    {
      q: 'What must follow a Scheduler in a flow?',
      a: 'At least one processor. A Scheduler with nothing after it fails to deploy, and it would have no work to do anyway.',
    },
    {
      q: 'What is the difference between a source and an operation?',
      a: 'A source starts a flow when something happens. An operation runs inside a flow and performs an action, such as an API call or a database query.',
    },
  ],
}
