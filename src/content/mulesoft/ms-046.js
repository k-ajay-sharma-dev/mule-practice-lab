export default {
  id: 'ms-046',
  category: 'mulesoft',
  title: 'Certification-Style Tricky Questions: Rapid-Fire Round',
  level: 'ADVANCED',
  tags: ['certification', 'interview', 'gotchas', 'mule-4'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A Choice router has two `when` routes and **no** `otherwise`. No condition matches. What happens?',
      options: [
        'MULE:ROUTING error is raised',
        'The event passes through unchanged and the flow continues',
        'The first route runs as a fallback',
        'The flow stops silently with a null payload',
      ],
      answer: 1,
      explain: 'In Mule 4 a Choice without `otherwise` simply continues when nothing matches — no error.',
    },
    {
      type: 'single',
      prompt: 'Until Successful with `maxRetries="3"` keeps failing. How many attempts are made, and what error is raised?',
      options: [
        '3 attempts, then the original error',
        '4 attempts (1 + 3 retries), then MULE:RETRY_EXHAUSTED',
        '3 attempts, then MULE:RETRY_EXHAUSTED',
        'It retries forever',
      ],
      answer: 1,
      explain: '`maxRetries` counts retries, not total executions.',
    },
    {
      type: 'single',
      prompt: 'An HTTP Listener flow catches an error with **On Error Continue** and sets an error JSON as payload. No status is configured. What status does the client get?',
      options: ['500', '200', '400', 'Whatever the failing component returned'],
      answer: 1,
      explain: 'On Error Continue marks the flow as successful, so the normal response builder runs. Set `vars.httpStatus` and use it in the response builder.',
    },
    {
      type: 'match',
      prompt: 'Match each scenario to the outcome.',
      pairs: [
        ['Payload after a For Each that set the payload inside the loop', 'The original collection'],
        ['`vars.total` logged after it was set inside an Async scope', 'The value from before the Async'],
        ['A Scheduler every minute on 2 CloudHub 2.0 replicas without clustering', 'Runs twice per minute'],
        ['Policies changed in API Manager, app not redeployed', 'New policies apply'],
      ],
      explain: 'For Each restores the payload; Async works on a copy; each non-clustered replica runs its own scheduler; policies are applied dynamically from API Manager.',
    },
    {
      type: 'single',
      prompt: '`db.host` is in `config.yaml` and also passed as `-Ddb.host=...` at deployment. Which value wins?',
      options: ['The value in config.yaml', 'The system property (-D)', 'Whichever is defined last alphabetically', 'Deployment fails on the conflict'],
      answer: 1,
      explain: 'System/deployment properties override properties from configuration files.',
    },
    {
      type: 'multi',
      prompt: 'Which statements are true in Mule 4?',
      options: [
        'A Batch Aggregator with `size="100"` processes a list of records (when not streaming)',
        'To keep the payload but store the status code of an outbound call, set `target` and `targetValue="#[attributes.statusCode]"`',
        'A sub-flow may contain its own error handler',
        'An inline expression reading `.price` from a payload with no MIME type always works because DataWeave auto-detects JSON',
      ],
      answer: [0, 1],
      explain: 'Sub-flows have no error handler — use a Try or a private flow. DataWeave reads based on MIME type, so an untyped payload must be declared as `application/json` or parsed with `read()`.',
    },
  ],
  description: `
Interviewers and the MuleSoft developer certifications like short scenarios where the "obvious" answer is wrong. Answer each in one or two sentences, **with the reason**.

1. A **Choice** router has two \`when\` routes and **no** \`otherwise\`. No condition matches. What happens?
2. A **For Each** iterates over \`payload.items\` and sets the payload inside the loop. What is the payload after the loop?
3. A flow sets \`vars.total\` inside an **Async** scope. A Logger after the Async logs \`vars.total\`. What is logged?
4. **Until Successful** with \`maxRetries="3"\` keeps failing. How many attempts are made and what error is raised?
5. An HTTP Listener flow catches an error with **On Error Continue** and sets the payload to an error JSON. What status code does the client get if no status is configured?
6. \`#[payload.price * 1.2]\` in a Set Payload, where \`payload\` is a JSON **string** read from a file without a MIME type. What happens?
7. A property \`db.host\` is defined in \`config.yaml\` and also passed as \`-Ddb.host=...\` at deployment. Which value wins?
8. A **Scheduler** runs every minute on an app with **2 CloudHub 2.0 replicas without clustering**. How many times per minute does the job run?
9. A batch job's **Batch Aggregator** with \`size="100"\` — is the aggregator's payload a single record or a list?
10. You need the HTTP status code of an outbound call stored in a variable but also keep the current payload. What do you set?
11. A **sub-flow** contains an error handler. Is that valid?
12. In API Manager, policies changed but the app was not redeployed. Do the new policies apply?
`,
  answerTemplate: `## Answers 1–4

## Answers 5–8

## Answers 9–12
`,
  keyPoints: [
    'Choice without otherwise and no match continues unchanged; For Each restores the original payload; Async changes are not visible to the caller.',
    'Until Successful makes the first attempt plus maxRetries retries, then raises MULE:RETRY_EXHAUSTED.',
    'On Error Continue makes the flow successful, so the listener returns 200 unless you set a status.',
    'System properties override configuration-file properties; schedulers run on every non-clustered replica.',
    'target + targetValue keep the payload while storing selected parts of the result; sub-flows cannot have error handlers; policies apply without redeploying.',
  ],
  solution: `
| # | Answer | Why |
|---|---|---|
| 1 | The event passes through **unchanged**; no error. | In Mule 4 a Choice without \`otherwise\` simply continues when nothing matches. |
| 2 | The **original** payload (the whole collection). | For Each restores the payload after iteration; collect results in a variable if needed. |
| 3 | The value **before** the Async (or null if unset). | Async works on a copy of the event on another thread. |
| 4 | **4 attempts** (1 + 3 retries), then \`MULE:RETRY_EXHAUSTED\`. | maxRetries counts retries, not total executions. |
| 5 | **200** (with the error JSON as body). | On Error Continue marks the flow as successful, so the normal response builder runs. Set \`vars.httpStatus\` and use it in the response builder. |
| 6 | It fails (or does not do what you expect): the value is untyped text/binary, so \`.price\` cannot be selected as a JSON field. | DataWeave reads based on MIME type; declare \`application/json\` on the source or use \`read()\`. |
| 7 | The **system property** (\`-D\`). | System/deployment properties override properties from configuration files. |
| 8 | **Twice** — once per replica. | Without clustering, schedules run on all CloudHub 2.0 replicas independently; with clustering they run on the primary only. CloudHub 1.0 differs: the Scheduler docs say a multi-worker deployment runs it on the primary node only. |
| 9 | A **list** of records (when not in streaming mode). | The aggregator collects records and processes them as a group, e.g. for bulk upserts. |
| 10 | \`target="resp"\` and \`targetValue="#[attributes.statusCode]"\` (or \`#[message]\` to keep both body and attributes). | Target leaves payload and attributes untouched. |
| 11 | **No.** | Sub-flows have no error handler; wrap steps in a Try scope or use a private flow. |
| 12 | **Yes.** | Policies are applied by the runtime from API Manager dynamically; no redeploy is needed. |

**Exam technique:** read every word — "no otherwise", "without clustering", "On Error Continue" — the trap is usually in a single qualifier. When two answers look right, choose the one that reflects Mule 4 behaviour rather than Mule 3 habits (e.g. no inbound/outbound properties, payload restored after For Each).
`,
  followUps: [
    {
      q: 'What does First Successful do differently from Until Successful?',
      a: 'First Successful tries different routes in order until one succeeds (fallback across alternatives); Until Successful retries the same steps with a delay.',
    },
    {
      q: 'What is the difference between Round Robin and Scatter-Gather?',
      a: 'Round Robin sends each event to exactly one route, rotating between them; Scatter-Gather sends a copy of the event to all routes in parallel and aggregates the results.',
    },
    {
      q: 'How are vCores relevant in licensing questions?',
      a: 'Subscriptions are typically sized by capacity such as vCores (or, in newer packaging, by flows/messages); the exact model depends on the contract, so in interviews describe how you would right-size and monitor consumption rather than quoting numbers.',
    },
  ],
}
