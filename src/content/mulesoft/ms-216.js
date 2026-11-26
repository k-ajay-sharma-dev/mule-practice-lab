export default {
  id: 'ms-216',
  category: 'mulesoft',
  title: 'Target Variables: Keeping the Payload While an Operation Runs',
  level: 'BEGINNER',
  tags: ['target-variables', 'variables', 'connectors', 'flow-reference', 'mule-event', 'hospitality'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A hotel booking flow has the booking in the payload. It then calls a loyalty API with an HTTP Request and no target. What is the payload after the request?',
      options: [
        'The booking, because a request result goes to `vars` by default',
        'The loyalty API response, which replaces the booking',
        'An object with both the booking and the response',
        'The booking, with the response added under a new key',
      ],
      answer: 1,
      explain: 'By default an operation writes its result to the payload and its attributes to the attributes. The booking is gone unless it was saved first.',
    },
    {
      type: 'single',
      prompt: 'The same HTTP Request gets `target="loyalty"`. What is true after it runs?',
      options: [
        'The payload is still the booking, and `vars.loyalty` holds the response body',
        'The payload is the response, and `vars.loyalty` holds a copy of the booking',
        'The payload is empty, and `vars.loyalty` holds the response body',
        'The payload and `vars.loyalty` both hold the response body',
      ],
      answer: 0,
      explain: 'With a target, the result goes into the named variable instead of the payload. The payload and attributes stay as they were before the operation.',
    },
    {
      type: 'single',
      prompt: 'You only need the status code of the loyalty call, not the body. What do you set?',
      options: [
        '`target="loyaltyStatus"` only, as a target keeps the status code by default',
        '`target="loyaltyStatus"` with `targetValue="#[attributes.statusCode]"`',
        '`targetValue="#[attributes.statusCode]"` on the request, with no `target` set',
        'A Set Variable before the request with `value="#[attributes.statusCode]"`',
      ],
      answer: 1,
      explain: '`targetValue` is an expression run on the result of the operation. Its default is `#[payload]`. Here it picks the status code from the response attributes. A Set Variable before the request would read the attributes of the earlier step.',
    },
    {
      type: 'single',
      prompt: 'Which `targetValue` keeps both the response body and its attributes in one variable?',
      options: ['`#[payload]`', '`#[attributes]`', '`#[message]`', '`#[vars]`'],
      answer: 2,
      explain: '`message` holds the payload and the attributes together. The variable then has `.payload` and `.attributes`.',
    },
    {
      type: 'multi',
      prompt: 'A hotel flow must keep the booking in the payload while it gathers a loyalty response over HTTP, a room row from the database, and the result of a sub-flow that prices extras. It also builds a short reply text. On which steps can it set `target` so the payload stays the booking? Choose all that apply.',
      options: [
        'The HTTP Request to the loyalty API',
        'The Database Select for the room row',
        'The Flow Reference to the pricing sub-flow',
        'The Set Payload that builds the reply text',
        'The Set Variable that stores the booking ID',
        'The Choice router around the Database Select',
      ],
      answer: [0, 1, 2],
      explain: 'Connector operations and the Flow Reference have `target` and `targetValue`, so each result can go to a variable and the booking stays in the payload. Set Payload has no target, as its whole job is to write the payload. Set Variable has no `target` either: it names its variable with `variableName` and never touches the payload. A Choice router only picks a route and has no `target`, so set it on the Database Select inside the route. To keep the reply text aside, use a Set Variable.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the setting that fits it.',
      pairs: [
        ['Replace the payload with the response', 'No target'],
        ['Keep the payload and save the response body', 'target only'],
        ['Keep the payload and save one header of the response', 'target with targetValue'],
      ],
      explain: 'Leave target out when the response is what the next steps need. Add a target to keep the payload. Add targetValue to keep only part of the result.',
    },
  ],
  description: `
Saltmarsh Hotels has a booking flow. It receives a booking, checks the guest's loyalty tier with an HTTP call, reads the room rate from a database, and then saves the booking with the right discount.

A new developer wrote each call one after another. After the loyalty call, the booking was gone from the payload, so they added three Set Variable steps to copy it back and forth. The flow became hard to read and one copy was wrong.

**Questions**
1. What does an operation do to the payload by default?
2. What do \`target\` and \`targetValue\` change?
3. How would you rewrite the booking flow?
4. When is it better not to use a target?
`,
  answerTemplate: `## Default behaviour

## target and targetValue

## The rewritten flow

## When not to use a target
`,
  keyPoints: [
    'By default an operation puts its result in the payload and its attributes in the attributes.',
    'target names a variable that receives the result instead, and the payload stays as it was.',
    'targetValue is an expression on the result. Its default is #[payload].',
    '#[message] as targetValue keeps the body and the attributes together.',
    'Connector operations and Flow Reference support target. A Logger has no result to store.',
    'Use no target when the next steps need the response as the payload.',
  ],
  solution: `
**1. Default behaviour.** An operation such as an HTTP Request or a Database Select replaces the payload with its result, and its attributes replace the attributes. The booking is lost unless it was saved somewhere first.

**2. target and targetValue.**
| Setting | Effect |
|---|---|
| \`target="tier"\` | The result goes into \`vars.tier\`. Payload and attributes are unchanged. |
| \`targetValue="#[payload.tier]"\` | Only that part of the result is stored. The expression runs on the result of the operation. |
| \`targetValue="#[message]"\` | Body and attributes are stored together. |

**3. The rewritten flow.**
\`\`\`
 HTTP Listener            payload = booking
 HTTP Request  target="tier"  targetValue="#[payload.tier]"
 DB Select     target="rate"  targetValue="#[payload[0].nightlyRate]"
 Transform     booking ++ { tier: vars.tier, rate: vars.rate, discount: ... }
 DB Insert
\`\`\`
The payload is the booking from start to end. Each lookup lands in a variable with a clear name, and no Set Variable is needed to copy things back.

**4. When not to use a target.** When the response is the main data for the next steps, such as a list of orders you will transform, let it become the payload. Variables also live for the rest of the flow and travel through Flow References, so a large response kept in a variable stays in memory longer than you might expect.
`,
  followUps: [
    {
      q: 'If the HTTP Request with a target fails, is the variable set?',
      a: 'No. The operation raised an error, so there is no result to store. The error handler runs, and the variable keeps any value it had before.',
    },
    {
      q: 'Is a target better than a Set Variable after the call?',
      a: 'It saves a step and it keeps the payload, which a Set Variable after the call cannot do, because by then the payload is already replaced. Both put the value in the same kind of variable.',
    },
    {
      q: 'A response is a large stream. Is it safe to keep it in a variable?',
      a: 'It is kept like any payload, so streaming rules still apply. If several later steps read it, it must be repeatable. If you need one field, pick it with targetValue so the variable stays small.',
    },
  ],
}
