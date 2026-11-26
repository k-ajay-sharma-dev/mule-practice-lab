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
      prompt: 'A parcel tracking flow starts with an HTTP Listener with default response settings. A Transform Message builds a JSON reply, and a Logger after it is the last step. What does the caller receive?',
      options: [
        'The text written by the Logger, as the last step sets the response',
        'An empty body, as the last step is a Logger and not a Transform',
        'The original request body, as the Listener echoes it back by default',
        'The JSON from the Transform, as the Logger leaves the payload as it is',
      ],
      answer: 3,
      explain: 'By default the Listener sends the payload at the end of the flow as the response body. A Logger reads the event and does not change it, so the JSON built by the Transform goes back. The Logger text goes to the log, not to the caller.',
    },
    {
      type: 'single',
      prompt: 'A shipping company needs a delivery report at 1 AM Paris time every night. A developer sets a Scheduler to a fixed frequency of 24 hours and deploys the app at 15:40. What happens, and what is the fix?',
      options: [
        'It runs near 15:40 each day, so use a cron expression with a `timeZone` set',
        'It waits for midnight and then runs every 24 hours, so add a 1 hour start delay',
        'It runs at 1 AM UTC, so add one hour to the frequency to reach Paris time',
        'It runs at 1 AM, as a 24 hour frequency is counted from midnight',
      ],
      answer: 0,
      explain: 'A fixed frequency counts from the moment the app starts, so the runs fall near 15:40, and a restart moves them again. A start delay only shifts the first run from the start time, not from midnight. A cron expression such as `0 0 1 * * ?` fixes the time of day, and its `timeZone` makes it 1 AM in Paris rather than on the server clock.',
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
      prompt: 'Halfway through a flow, an HTTP Request with default settings calls a carrier API. For an unknown parcel the carrier answers 404, and the flow should reply "unknown parcel" to the customer. What happens at the HTTP Request?',
      options: [
        'The 404 reply becomes the payload, and the next step can check its status',
        'It raises `HTTP:NOT_FOUND`, which an error handler can turn into the reply',
        'It retries the call three times, then hands the last 404 reply to the flow',
        'It raises `HTTP:CONNECTIVITY`, as the carrier could not find the resource',
      ],
      answer: 1,
      explain: 'By default the HTTP Request treats status codes from 200 to 399 as success. A 404 raises `HTTP:NOT_FOUND`, so an On Error Continue for that type can build the "unknown parcel" reply. The 404 only becomes the payload if the response validator is changed to accept it. A connectivity error means the server could not be reached, and there is no automatic retry of a reply.',
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
      a: 'At least one processor that does the work, such as a query or a file write. A Scheduler with nothing after it starts the flow on time but does nothing useful.',
    },
    {
      q: 'What is the difference between a source and an operation?',
      a: 'A source starts a flow when something happens. An operation runs inside a flow and performs an action, such as an API call or a database query.',
    },
  ],
}
