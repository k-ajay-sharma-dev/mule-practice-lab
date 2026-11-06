export default {
  id: 'ms-182',
  category: 'mulesoft',
  title: 'Reading a Logger Line and Logging What Helps',
  level: 'BEGINNER',
  tags: ['logging', 'observability', 'correlation-id'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule log line starts with `INFO  2026-03-02 09:15:22,418` and ends with `LoggerMessageProcessor: Order 4512 received`. Which part did the developer type into the Logger?',
      options: [
        '`INFO`',
        '`2026-03-02 09:15:22,418`',
        '`LoggerMessageProcessor`',
        '`Order 4512 received`',
      ],
      answer: 3,
      explain: 'The message is at the end of the line. The level, the time and the name of the class that wrote the line are added for you.',
    },
    {
      type: 'single',
      prompt: 'Two Mule log lines show the same `event:` value and different `processor:` values. What does that tell you?',
      options: [
        'One event was logged at two different steps of the flow',
        'Two separate requests were handled by the same step of the flow',
        'The same log line was written twice because of a logging fault',
        'Two separate apps wrote to one log file at the same moment',
      ],
      answer: 0,
      explain: 'The `event:` value is the correlation ID, a unique id for the Mule event. The `processor:` value shows which step wrote the line. Searching for one `event:` value shows the path of one request.',
    },
    {
      type: 'single',
      prompt: 'An app writes log lines at INFO and above. A developer adds a Logger with the level set to `DEBUG`, and its line never appears. What is the reason?',
      options: [
        'A Logger set to `DEBUG` only writes its line inside Anypoint Studio',
        'The line is below the level the app writes, so it is thrown away',
        'The line is written to a separate file kept for `DEBUG` messages',
        'A Logger set to `DEBUG` only runs when the flow raises an error',
      ],
      answer: 1,
      explain: 'The level on a Logger says how important the line is. The logging setup decides which levels are written, and here `DEBUG` is below the line.',
    },
    {
      type: 'single',
      prompt: 'A warehouse flow fails now and then, and support needs to find one order in the logs. Which Logger message helps most?',
      options: [
        '`Warehouse step reached and finished without any problem`',
        '`Sending the current message on to the warehouse system`',
        '`Order #[payload.orderId] sent to warehouse #[vars.warehouse]`',
        '`Step 3 of the warehouse flow has been completed now`',
      ],
      answer: 2,
      explain: 'A useful line says what happened and to which business record. The other lines read well, but they are the same for every order, so support cannot search them.',
    },
    {
      type: 'single',
      prompt: 'A payment flow logs `#[payload]`, and the payload holds the full card number of the customer. What is the main problem?',
      options: [
        'A Logger can only write text, so the flow fails on a JSON payload',
        'Card numbers are removed from log files, so the line shows nothing',
        'Everyone who can read the logs can now read the card numbers',
        'The Logger changes the payload, so the card number is masked for later steps',
      ],
      answer: 2,
      explain: 'Logs are read by many people and kept for a long time. Log a safe reference such as the payment id, and leave card numbers and other private data out.',
    },
    {
      type: 'single',
      prompt: 'A flow has a Logger saying `Calling warehouse` before an HTTP Request and a Logger saying `Warehouse replied` after it. The log shows the first line for an order, but never the second. Where should you look first?',
      options: [
        'At the step before the first Logger, which must have failed',
        'At the HTTP Request, which did not finish successfully',
        'At the second Logger, which must have a syntax fault',
        'At the HTTP Listener, which must have rejected the order',
      ],
      answer: 1,
      explain: 'The first line proves the flow got that far. The missing second line means the step between them failed or is still waiting. A pair of Loggers around a call shows this at a glance.',
    },
  ],
  description: `
A retailer's support team gets a call: "Order 4512 never reached the warehouse." A developer opens the app log and finds this line.

\`\`\`text
INFO  2026-03-02 09:15:22,418 [[MuleRuntime].uber.03: [orders-api].send-order.CPU_LITE @5a1b2c] [processor: send-order/processors/1; event: eb2b2461-993d-11eb-8a64-4865ee1fd814] org.mule.runtime.core.internal.processor.LoggerMessageProcessor: Order 4512 received
\`\`\`

The line looks long, but only a few parts matter. It was written by a **Logger**, a component that writes a message to the log of the app while the flow runs.

The other lines in the log say things like \`here\` and \`step 3 done\`, which tell the developer nothing about the order.

**Questions**
1. Which parts of the log line matter, and what does each one mean?
2. How can you follow one request through the log?
3. What makes a Logger message useful, and what must stay out of it?
`,
  answerTemplate: `## Parts of the line

## Following one request

## What to log and what to leave out
`,
  keyPoints: [
    'A log line shows the level, the time, the step, the event and, at the end, the message from the Logger.',
    'The event value is the correlation ID. Searching for it shows every line for one request.',
    'A line is only written if its level is at or above the level the app logs at.',
    'Useful messages name the business record and what happened, such as an order number.',
    'Keep card numbers, passwords and other private data out of the logs.',
  ],
  solution: `
**Parts of the line**
| Part | Meaning |
|---|---|
| \`INFO\` | The level of the line |
| \`2026-03-02 09:15:22,418\` | When it was written |
| \`[[MuleRuntime]...]\` | The thread, meaning the worker inside Mule that ran the step |
| \`processor: send-order/processors/1\` | The flow and the step in it |
| \`event: eb2b2461...\` | The correlation ID of the event |
| \`Order 4512 received\` | The message from the Logger |

**Following one request:** copy the \`event:\` value and search the log for it. Every line with that value belongs to the same event.

**What to log:** name the business record and what happened, as in \`Order #[payload.orderId] sent to warehouse\`. The Logger can mix plain text and expressions in one message. A pair of Loggers around a call to another system shows whether the call finished.

**What to leave out:** card numbers, passwords and other private data. Log a safe reference such as an order id instead.
`,
  followUps: [
    {
      q: 'Does adding a Logger change the payload?',
      a: 'No. The Logger reads the event and writes a line. The next step receives the same event.',
    },
    {
      q: 'Where do you change which levels an app writes?',
      a: 'In log4j2.xml, the logging configuration of the app, which sits in src/main/resources.',
    },
    {
      q: 'When would you use the WARN or ERROR level on a Logger?',
      a: 'WARN suits something unusual that the flow can handle, and ERROR suits a failure someone should look at. INFO suits normal business steps, and DEBUG suits detail you only need while looking into a problem.',
    },
  ],
}
