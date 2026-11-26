export default {
  id: 'ms-215',
  category: 'mulesoft',
  title: 'Async Scope in Production: Fire and Forget, Lost Work and Reliable Alternatives',
  level: 'ADVANCED',
  tags: ['myproject', 'async', 'scopes', 'reliability', 'vm', 'anypoint-mq', 'error-handling', 'banking'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A bank API saves a payment, then sends an audit event inside an Async scope, then returns 201. The audit service takes 2 seconds. How long does the caller wait for the audit call?',
      options: [
        'The full 2 seconds, because the response waits for every step',
        'Not at all on success, but the full 2 seconds if the call fails',
        'The full 2 seconds, plus the time to start a new thread',
        'Not at all, because the flow goes on while the Async scope runs',
      ],
      answer: 3,
      explain: 'The Async scope runs its steps on another thread. The main flow does not wait for it, so the 201 can be sent while the audit call is still running.',
    },
    {
      type: 'single',
      prompt: 'Inside the Async scope, the audit call fails with a timeout. What does the caller see?',
      options: [
        'A 500 error, because the flow error handler catches the timeout',
        'The normal 201, because the Async error never reaches the main flow',
        'A 201 with a warning header that names the failed step',
        'A 504 error, because the timeout passes up to the HTTP Listener',
      ],
      answer: 1,
      explain: 'The main flow has moved on, so the Async error cannot reach its error handler or the response. Handle errors inside the scope, for example with a Try, or the failure is only logged.',
    },
    {
      type: 'single',
      prompt: 'The app is redeployed while 40 audit calls are still running inside Async scopes. What happens to them?',
      options: [
        'They can be lost, because the Async scope keeps its work only in memory',
        'They are saved to disk, and they finish once the new version has started',
        'They are moved to another replica, which picks them up and finishes them',
        'They are replayed by the new version, which reads them from the app log',
      ],
      answer: 0,
      explain: 'An Async scope is a thread in the running app. Nothing is stored, so work that has not finished when the app stops can be lost. Use a persistent queue when every event must arrive.',
    },
    {
      type: 'single',
      prompt: 'The regulator says that every payment must produce an audit event, with no losses. What is the best design?',
      options: [
        'Keep the Async scope and add an Until Successful inside it',
        'Keep the Async scope and set a larger max concurrency on it',
        'Publish the audit event to a persistent queue read by a listener flow',
        'Call the audit service before the payment is saved, so it cannot be skipped',
      ],
      answer: 2,
      explain: 'A persistent queue such as Anypoint MQ keeps the message until a consumer handles it, and the listener can retry and send failures to a dead letter queue. Retrying inside an Async scope still loses everything when the app stops.',
    },
    {
      type: 'single',
      prompt: 'Inside the Async scope, a Set Variable sets `vars.auditId`. A Logger after the scope prints it. What is logged?',
      options: [
        'The new audit id, because the Async scope shares the event',
        'The new audit id, but only if the Async scope finished first',
        'An error, because variables cannot be set inside Async',
        'The value from before the scope, because Async works on a copy',
      ],
      answer: 3,
      explain: 'The Async scope gets a copy of the event. Changes to the payload or variables inside it never come back to the main flow.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the tool that fits it.',
      pairs: [
        ['Warm a cache after a response, where losing a run is fine', 'Async scope'],
        ['Hand work to another flow in the same app through a stored queue, not a thread', 'VM persistent queue'],
        ['Hand work to other apps, with retries and a dead letter queue', 'Anypoint MQ'],
      ],
      explain: 'Async is for work that may be lost. A persistent VM queue keeps messages inside one app or cluster. A message broker such as Anypoint MQ is for work that crosses apps and needs delivery guarantees.',
    },
  ],
  description: `
A bank's Payments API saves each payment and must send an audit event to a separate audit service. A developer wrapped the audit call in an **Async scope** so that customers would not wait for it.

The response time dropped. Two months later, an audit found 312 payments with no audit event. The team found three causes:

- The audit service had timeouts, and nothing reported them.
- Some events were in progress during redeployments.
- During a busy hour, so many audit calls ran at once that the audit service started refusing them.

**Questions**
1. What does the Async scope do, and why did the response time drop?
2. Why were audit events lost, and why did nobody see the errors?
3. How would you redesign the audit sending so that no event is lost?
4. When is an Async scope the right tool?
`,
  answerTemplate: `## What the Async scope does

## Why events were lost

## A redesign with no losses

## When Async is right
`,
  keyPoints: [
    'The Async scope runs its steps on another thread with a copy of the event. The main flow does not wait.',
    'Changes inside Async never return to the main flow, and its errors never reach the main error handler.',
    'Async work lives only in memory, so a stop or redeploy can lose it.',
    'Max concurrency on the Async scope limits how many copies run at once.',
    'For work that must not be lost, publish to a persistent queue and process it in a listener flow with retries and a dead letter queue.',
    'Async fits work where a loss is acceptable, such as cache warming or a best-effort metric.',
  ],
  solution: `
**1. What the Async scope does.** It takes a copy of the event and runs its steps on another thread. The main flow continues at once, so the 201 no longer waited for the audit call.

**2. Why events were lost.**
| Cause | What happened |
|---|---|
| Timeouts | The error was raised inside the Async scope. The main flow had moved on, so the error handler never saw it, and no alert fired. |
| Redeployments | Work in an Async scope is held only in memory. When the app stopped, unfinished calls stopped with it. |
| Busy hour | Every payment started a new audit call at once, so the audit service was flooded. Max concurrency on the scope was not set. |

**3. A redesign with no losses.**
\`\`\`
 Payments flow:  save payment ─► publish audit event to Anypoint MQ ─► 201
 Audit flow:     Anypoint MQ subscriber ─► call audit service
                   success ─► ack
                   failure ─► nack, redelivered later
                   too many failures ─► dead letter queue + alert
\`\`\`
The publish is fast, so the response stays quick. The broker keeps the message until the audit flow acknowledges it. A subscriber can limit how many messages it handles at once, which protects the audit service. To be fully safe, the payment and the event should not be able to disagree, for example by writing the event to an outbox table in the same database transaction as the payment.

**4. When Async is right.** Work where a loss does no harm and nobody needs the result, such as warming a cache or sending a non-critical metric. Even then, put a Try inside the scope to log failures, and set max concurrency so a busy hour cannot start unlimited copies.
`,
  followUps: [
    {
      q: 'Does an Async scope join a transaction that the main flow started?',
      a: 'No. It runs on another thread, outside the transaction. Its work can happen even if the transaction later rolls back, which is another reason to keep critical work out of it.',
    },
    {
      q: 'Would a VM queue have been enough here?',
      a: 'A persistent VM queue stores its messages instead of holding them on a thread, and is a good step up from Async within one app. How it survives a restart depends on the deployment target, so check that for yours. The audit flow then stays in the same app, so it shares its resources and releases. Anypoint MQ fits better when another team or app owns the audit sending.',
    },
    {
      q: 'Is the correlation of the audit event to the payment kept?',
      a: 'Put the payment id in the audit message itself. Do not rely on log correlation alone, because the audit flow may run much later, on a different replica.',
    },
  ],
}
