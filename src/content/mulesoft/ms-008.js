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
      prompt: 'How does Until Successful behave in Mule 4 compared with Mule 3?',
      options: [
        'It is synchronous: the event waits for the retries and `MULE:RETRY_EXHAUSTED` is raised at the end',
        'It is still asynchronous and backed by an object store',
        'It was removed; you must use the reconnection strategy',
        'It now retries forever by default',
      ],
      answer: 0,
      explain: 'Mule 4 Until Successful is **synchronous**. If the app relied on Mule 3 asynchronous retries, redesign with a queue (VM/Anypoint MQ) and redelivery.',
    },
    {
      type: 'single',
      prompt: 'The Mule 3 app tunes a flow-level processing strategy and thread profiles. What do you do in Mule 4?',
      options: [
        'Copy them over — the attributes are the same',
        'Remove them; Mule 4 is self-tuning with shared pools, and you limit concurrency with `maxConcurrency`',
        'Replace them with a synchronous processing strategy on every flow',
        'Configure one thread pool per connector in the domain',
      ],
      answer: 1,
      explain: 'Processing strategies and thread profiles no longer exist. Components declare their processing type and the runtime schedules them on shared pools (the UBER pool by default in 4.3+).',
    },
    {
      type: 'multi',
      prompt: 'Which statements about Mule 4 are true and matter for this migration?',
      options: [
        'Connectors are separately versioned modules pulled from Exchange as Maven dependencies',
        'Repeatable streaming is the default',
        'DataWeave 1.0 scripts run unchanged in Mule 4',
        'Applications run with classloader isolation from the runtime and modules',
        'Session variables are still available as `sessionVars`',
      ],
      answer: [0, 1, 3],
      explain: 'DataWeave 2.0 has different syntax (`%dw 2.0`, `output`, `fun`), so 1.0 scripts need conversion. Session variables no longer exist.',
    },
    {
      type: 'single',
      prompt: 'In Mule 4 error handling, what does **On Error Continue** do?',
      options: [
        'Handles the error and completes the owner (flow or Try) as success',
        'Logs the error and rethrows it',
        'Retries the failing processor once',
        'Rolls back the transaction and rethrows',
      ],
      answer: 0,
      explain: 'On Error Continue swallows the error; On Error Propagate rethrows it (and rolls back any transaction).',
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
- **DataWeave 2.0**: \`%dw 2.0\`, \`output\` instead of \`%output\`, changed function names and \`fun\` syntax — 1.0 scripts need conversion.
- **Classloader isolation** between app, runtime and modules; Java code is called with the Java module rather than component classes.
- The MMA (Mule Migration Assistant) can convert much of this, but the output needs manual review.
`,
  followUps: [
    {
      q: 'Can you still call Java from Mule 4, and how?',
      a: 'Yes — with the Java module (New, Invoke, Invoke static) or by calling static methods from DataWeave via java! imports. Classes must be exported/visible to the app through its own classloader.',
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
