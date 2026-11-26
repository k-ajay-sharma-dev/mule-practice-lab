export default {
  id: 'ms-008',
  category: 'mulesoft',
  title: 'Mule 3 vs Mule 4: What Actually Changed',
  level: 'BEGINNER',
  tags: ['mule-4', 'migration', 'fundamentals'],
  estMinutes: 15,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each Mule 3 construct to its Mule 4 replacement.',
      pairs: [
        ["`#[message.inboundProperties.'http.query.params'.id]`", '`attributes.queryParams.id`'],
        ['`#[flowVars.orderId]`', '`vars.orderId`'],
        ['Message Enricher', '`target` / `targetValue` on the operation'],
        ['Catch Exception Strategy for `java.net.ConnectException`', 'On Error handler for `HTTP:CONNECTIVITY`'],
      ],
      explain: 'MEL is gone (DataWeave 2.0 everywhere), inbound properties became attributes, enrichment became target variables, and exception strategies became typed error handlers.',
    },
    {
      type: 'single',
      prompt: 'In Mule 3 the app answered its HTTP caller with 202 at once, while Until Successful retried a failed ERP call 5 times, a minute apart. The scope moves to Mule 4 with the same settings. What happens now when the ERP is down?',
      options: [
        'The caller gets 202 at once, and the retries run in the background as before',
        'The flow waits through the retries, so the caller gets no answer until they end',
        'The retries are kept in a persistent object store, so they survive a restart',
        'The flow waits, and the scope retries forever because Mule 4 has no retry limit',
      ],
      answer: 1,
      explain: 'Mule 4 Until Successful is **synchronous**: the event waits through every retry, and when they run out the scope raises `MULE:RETRY_EXHAUSTED`. It keeps nothing in an object store, and `maxRetries` defaults to 5, not forever. If the app relied on Mule 3 asynchronous retries, redesign with a queue (VM/Anypoint MQ) and redelivery.',
    },
    {
      type: 'single',
      prompt: 'The Mule 3 app tunes a flow-level processing strategy and thread profiles. What do you do in Mule 4?',
      options: [
        'Copy them over, since Mule 4 accepts the same attributes',
        'Remove them, and limit concurrency with `maxConcurrency` where needed',
        'Replace them with a synchronous processing strategy on every flow',
        'Configure one dedicated thread pool per connector in the domain',
      ],
      answer: 1,
      explain: 'Processing strategies and thread profiles no longer exist, because Mule 4 is self-tuning. Components declare their processing type and the runtime schedules them on shared pools (the UBER pool by default in 4.3+).',
    },
    {
      type: 'single',
      prompt: 'A Mule 3 app used the FTP transport bundled with the runtime. In the migrated Mule 4 app, how does the FTP connector get into the application?',
      options: [
        'It is already in the Mule 4 runtime, as the FTP transport was in Mule 3',
        'It is copied into the `lib` folder of each runtime that hosts the app',
        'It is added to the `pom.xml` as a versioned dependency from Exchange',
        'It comes with the runtime version, so upgrading Mule upgrades the connector',
      ],
      answer: 2,
      explain: 'In Mule 4, connectors are no longer bundled transports. Each one is a separately versioned module from Exchange, declared as a Maven dependency and packaged inside the application, so it is upgraded on its own release cycle. Nothing goes into a shared runtime `lib` folder, and a runtime upgrade does not change the connector version. Applications also run with classloader isolation from the runtime and modules.',
    },
    {
      type: 'single',
      prompt: 'The Mule 3 flow uses a **Catch Exception Strategy** for `java.net.ConnectException`, so the HTTP caller gets 200 with a fallback message. Which Mule 4 handler keeps that behaviour?',
      options: [
        'On Error Propagate for `HTTP:CONNECTIVITY`, as it also runs its processors first',
        'On Error Continue for `HTTP:CONNECTIVITY`, as it ends the flow as a success',
        'The default error handler, as it maps to the Mule 3 catch strategy',
        'A Try scope with no handler, as Mule 4 catches errors inside Try by default',
      ],
      answer: 1,
      explain: 'A Catch Exception Strategy treated the message as processed, which is what **On Error Continue** does: the flow or Try ends as a success with the handler result, so the Listener sends its normal response. On Error Propagate also runs its processors, but then rethrows the error (and rolls back any transaction), so the caller gets an error response. A Try with no handler and the default error handler both propagate the error.',
    },
  ],
  description: `
Your client still runs 40 Mule 3.9 applications on-prem and plans to migrate them to Mule 4 on CloudHub 2.0. In the kickoff, the client's architect asks you to explain to the team "what is really different, beyond the version number". One of the Mule 3 apps contains:

- MEL expressions such as \`#[message.inboundProperties.'http.query.params'.id]\` and \`#[flowVars.orderId]\`
- A **Choice Exception Strategy** with a **Catch Exception Strategy** for \`java.net.ConnectException\`
- A **Message Enricher** that calls a pricing service
- An **Until Successful** scope (asynchronous by default in Mule 3)
- A flow-level **processing strategy** and thread profile tuning
- DataWeave 1.0 transforms (\`%dw 1.0\`)

**Questions**
1. What replaced MEL, and how would you rewrite the two expressions above in Mule 4?
2. How is error handling different (exception strategies vs error types)?
3. What replaced the Message Enricher?
4. How did Until Successful and the threading model change?
5. Name two other changes that matter for the migration (connectors, streaming, DataWeave, classloading…).
`,
  answerTemplate: `## Expression language

## Error handling

## Message Enricher replacement

## Until Successful and threading

## Other changes that matter
`,
  keyPoints: [
    'MEL is gone; DataWeave 2.0 is the single expression language (e.g. attributes.queryParams.id, vars.orderId).',
    'Exception strategies (Java exception based) are replaced by error handlers (On Error Propagate / On Error Continue) matching typed errors like HTTP:CONNECTIVITY, plus the Try scope.',
    'Message Enricher is replaced by the target / targetValue parameters on operations.',
    'Until Successful is synchronous in Mule 4; processing strategies and thread profiles are replaced by a self-tuning runtime with shared thread pools.',
    'Connectors are separate, versioned modules from Exchange (Maven dependencies); repeatable streaming is the default; DataWeave 2.0 syntax differs from 1.0.',
  ],
  solution: `
**Expression language:** MEL was removed; **DataWeave 2.0** is used for every expression.
- \`message.inboundProperties.'http.query.params'.id\` → \`attributes.queryParams.id\`
- \`flowVars.orderId\` → \`vars.orderId\` (session variables no longer exist).

**Error handling:** Mule 3 matched Java exception classes in Catch/Choice/Rollback exception strategies. Mule 4 uses **error types** (\`NAMESPACE:IDENTIFIER\`, e.g. \`HTTP:CONNECTIVITY\`, \`DB:QUERY_EXECUTION\`) organised in a hierarchy under \`ANY\`. Handlers are **On Error Propagate** (rethrow, roll back) and **On Error Continue** (handle, complete as success). The new **Try** scope gives block-level handling inside a flow. The \`ConnectException\` catch becomes an On Error handler for \`HTTP:CONNECTIVITY\`.

**Message Enricher:** replaced by **target variables**. Any operation can put its result in \`vars.x\` (\`target\`, optionally \`targetValue\`) without touching the current message.

**Until Successful and threading:**
- Mule 4 Until Successful is **synchronous**; the event waits for the retries and \`MULE:RETRY_EXHAUSTED\` is raised at the end. Mule 3 async retries backed by an object store must be redesigned (e.g. VM/Anypoint MQ with redelivery) if you need that behaviour.
- Processing strategies and thread profiles are gone. Mule 4 is self-tuning: components declare their processing type and the runtime schedules them on shared pools (UBER pool by default in 4.3+). You tune with \`maxConcurrency\` instead.

**Other changes**
- **Connectors** are no longer bundled transports; each is a separately versioned module pulled from Exchange as a Maven dependency.
- **Repeatable streaming** by default, so payloads can be read multiple times.
- **DataWeave 2.0**: \`%dw 2.0\`, \`output\` instead of \`%output\`, changed function names and \`fun\` syntax: 1.0 scripts need conversion.
- **Classloader isolation** between app, runtime and modules; Java code is called with the Java module rather than component classes.
- The MMA (Mule Migration Assistant) can convert much of this, but the output needs manual review.
`,
  followUps: [
    {
      q: 'Can you still call Java from Mule 4, and how?',
      a: 'Yes: with the Java module (New, Invoke, Invoke static) or by calling static methods from DataWeave via java! imports. Classes must be exported/visible to the app through its own classloader.',
    },
    {
      q: 'What tool helps migrate Mule 3 apps, and what can it not do?',
      a: 'The Mule Migration Assistant converts project structure, many components and MEL to DataWeave, and produces a report. Custom Java, complex MEL and DataWeave 1.0 edge cases still need manual rework and testing.',
    },
    {
      q: 'Why is repeatable streaming a big deal compared to Mule 3?',
      a: 'In Mule 3 a stream could usually be read once, so developers converted payloads to strings. In Mule 4 the stream is buffered transparently, so multiple processors can read it without manual conversion.',
    },
  ],
}
