// The rules for good log lines, shown at the top of the Logging Lab section. Kept apart from the exercises so the
// section page can show it without loading them.
export const GUIDE = `
## How to word a log message

1. **Start with what happened**, in a few words: \`Order received\`, \`SAP order created\`, \`Payment declined\`.
2. **Then the facts, as name=value pairs**: \`orderId=10045 sapDocNo=4500017 durationMs=812\`.
3. **Always add correlationId.** It joins every line of one request, across all your apps.
4. **Use the same names everywhere.** Always \`orderId\`, never \`order_id\` in one flow and \`OrderID\` in another.
5. **For an error**, add \`error.errorType\` and \`error.description\`, and say what happens next: \`next=retry\`, \`next=sent to DLQ\`.
6. **Never log** passwords, tokens or card numbers. Leave out personal data such as email or phone. Log an ID instead.
7. **Not the whole payload at INFO.** It is large, slow and full of personal data. If you need it, use DEBUG in a test environment.
8. **No blame, no shouting.** Other teams read these lines. \`Request rejected: shipTo.country is missing\`, not \`User sent garbage!!!\`.

A good line: \`#["SAP order created orderId=$(vars.orderId) durationMs=$(...) correlationId=$(correlationId)"]\`

## Pick the level

| Level | When | Example |
|---|---|---|
| ERROR | The work failed and someone must act | Order not sent to SAP after 3 attempts |
| WARN | Unexpected, but handled | A retry, a slow call, data that is not as expected, a 400 |
| INFO | Normal events you want in production | Request received, order created, job finished |
| DEBUG | Detail for building or troubleshooting | The payload in dev, each line of a loop |
| TRACE | Even finer detail, rarely used | Every value at every step |

## Where to put loggers

- When a request or message **arrives** (INFO).
- **After each call** to another system, with the status and duration (INFO). The line before the call can be DEBUG.
- In **every error handler** (WARN or ERROR).
- At the **end**, with the result sent back (INFO).
- Inside loops only at DEBUG. After the loop, one INFO line with the count.

## Set a category

\`<logger level="INFO" category="com.acme.orders.sap" message="..." />\`

The category lets operations raise one area to DEBUG in log4j2.xml without flooding the rest.

## Structured logs (JSON)

\`#[output application/json indent=false --- { event: "Order received", orderId: vars.orderId, correlationId: correlationId }]\`

\`indent=false\` keeps one event on one line, which log tools such as Splunk need.
`
