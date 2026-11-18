export default {
  id: 'ms-233',
  category: 'mulesoft',
  title: 'Tracing Module and Correlation IDs: Logging Variables, With CorrelationID and Passing IDs Between Apps',
  level: 'INTERMEDIATE',
  tags: ['tracing-module', 'correlation-id', 'logging', 'log4j2', 'mdc', 'http-request', 'observability', 'travel'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A caller sends the header `X-Correlation-ID: bk-7781-ab` to an HTTP Listener. What does Mule usually use as the correlation ID of the new event?',
      options: ['A new random UUID', 'bk-7781-ab', 'The flow name', 'The listener port'],
      answer: 1,
      explain: 'The HTTP Listener picks up an incoming correlation ID header, so one ID can follow a request across apps.',
    },
    {
      type: 'single',
      prompt: 'Which HTTP Request setting controls whether the correlation ID is sent to the next API?',
      options: ['followRedirects', 'sendCorrelationId', 'responseTimeout', 'sendBodyMode'],
      answer: 1,
      explain: 'sendCorrelationId takes AUTO, ALWAYS or NEVER. Check what AUTO does in your connector version, or set ALWAYS where the ID must travel.',
    },
    {
      type: 'single',
      prompt: 'You want the booking reference in every log line of a flow without adding it to each Logger. What fits?',
      options: [
        'Put it in a flow variable and print vars in every Logger',
        'Set a logging variable with the Tracing module and add it to the log4j2 pattern',
        'Change the correlation ID to the booking reference',
        'Turn on DEBUG logging',
      ],
      answer: 1,
      explain: 'A logging variable is added to the logging context, so a pattern such as %X{bookingRef} prints it on every line from that event.',
    },
    {
      type: 'single',
      prompt: 'A flow loops over 200 bookings and calls a partner for each. You want each booking\'s logs grouped under its own ID. What fits?',
      options: [
        'The With CorrelationID scope around the work for one booking',
        'A new app per booking',
        'A Logger with the payload',
        'An Until Successful scope',
      ],
      answer: 0,
      explain: 'With CorrelationID runs the processors inside it with the correlation ID you give, and the original ID applies again after the scope.',
    },
    {
      type: 'multi',
      prompt: 'Which statements are true?',
      options: [
        'Logging variables appear in the log4j2 context, so the pattern decides where they show',
        'A correlation ID should not hold personal data such as an email address',
        'If each app makes a new correlation ID, one request cannot be followed across apps',
        'The Tracing module removes the need for a log4j2 configuration',
      ],
      answer: [0, 1, 2],
      explain: 'The module adds values to the logging context. The log4j2 file still decides the format and where logs go.',
    },
    {
      type: 'order',
      prompt: 'Order what happens as one request travels from an Experience API to a Process API.',
      items: [
        'The Experience API listener receives the request and its correlation ID',
        'The Experience API logs lines with that ID',
        'Its HTTP Request sends the ID in the X-Correlation-ID header',
        'The Process API listener takes the same ID for its event',
        'Support searches the logs of both apps for the one ID',
      ],
      explain: 'The ID is only useful if every hop reads it and passes it on.',
    },
  ],
  description: `
Tallis Travel runs three Mule apps for bookings: a mobile Experience API, a Process API and a System API in front of the reservation system. When a booking fails, support searches each app's logs by time and guesses which lines belong together. It often takes an hour.

The architect asks for two things: one ID that follows a request through all three apps, and the booking reference on every log line once it is known.

**Questions**
1. Where does a correlation ID come from, and how does it pass between apps?
2. How does the Tracing module add values such as a booking reference to every log line?
3. When would you change the correlation ID inside a flow?
4. What should not go into a correlation ID or a logging variable?
`,
  answerTemplate: `## Where the ID comes from and how it travels

## Logging variables

## Changing the ID inside a flow

## What to keep out
`,
  keyPoints: [
    'The HTTP Listener takes an incoming X-Correlation-ID, or Mule creates a new ID.',
    'The HTTP Request passes the ID on, controlled by sendCorrelationId.',
    'Tracing module logging variables add values to the logging context.',
    'The log4j2 pattern prints them with %X{name}.',
    'With CorrelationID gives the processors inside it a different ID.',
    'Keep personal data out of IDs and logging variables.',
  ],
  solution: `
**1. Where the ID comes from.** Every Mule event has a correlation ID. When a request reaches an HTTP Listener with an \`X-Correlation-ID\` header, Mule uses that value. Without it, Mule creates one. The HTTP Request operation can send the ID to the next API, controlled by \`sendCorrelationId\` with AUTO, ALWAYS or NEVER. Check what AUTO does in your connector version, and set it so all three apps pass the ID along. The mobile app can create the ID itself, so support can ask the user for it.

**2. Logging variables.** The Tracing module's set logging variable operation adds a name and a value to the logging context of the event. Add it to the log4j2 pattern with \`%X{bookingRef}\` and it appears on every line logged for that event, without touching each Logger. Remove or clear logging variables when they no longer apply.

**3. Changing the ID.** In a loop over many bookings, the With CorrelationID scope runs the processors inside it with an ID you choose, such as the parent ID plus the booking number. The logs of each booking can then be found on their own. After the scope, the original ID applies again.

**4. What to keep out.** Correlation IDs and logging variables are written to many places and kept for a long time. Do not use emails, names or card numbers. A booking reference is usually fine. Check this with the privacy rules of your company.
`,
  followUps: [
    {
      q: 'The partner API we call ignores X-Correlation-ID. How do we still link the logs?',
      a: 'Log our correlation ID next to the partner\'s own request or response ID when the call returns. Support can then search the partner by their ID.',
    },
    {
      q: 'Does an Async scope keep the correlation ID?',
      a: 'The event inside the Async scope keeps the same correlation ID, so its log lines can still be linked. Test it in your version, since the work runs after the main flow has moved on.',
    },
    {
      q: 'Should the correlation ID go back to the caller?',
      a: 'Yes, return it in a response header, so a user or partner can quote it to support when something fails.',
    },
  ],
}
