export default {
  id: 'ms-179',
  category: 'mulesoft',
  title: 'Which Step Changes What: Following a Message Through a Flow',
  level: 'BEGINNER',
  tags: ['mule-event', 'attributes', 'variables', 'flows'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A flow starts with an HTTP Listener and receives `POST /shipments?priority=high` with a JSON body. Right after the Listener, where are the JSON body and the `priority` value?',
      options: [
        'The body is in `attributes` and `priority` is in `payload.queryParams`',
        'The body is in `payload` and `priority` is in `attributes.queryParams`',
        'The body is in `vars` and `priority` is in `attributes.queryParams`',
        'The body and `priority` are both in `payload`, and `attributes` is empty',
      ],
      answer: 1,
      explain: 'The `payload` is the main content of the message, here the JSON body. The `attributes` describe that content, so details of the request such as query parameters and headers live there.',
    },
    {
      type: 'single',
      prompt: 'The payload holds an order. A Set Variable named `orderId` runs with the value `#[payload.id]`. What does the next component find?',
      options: [
        'The payload is now only the order id, and `vars.orderId` holds the same value',
        'The payload is now empty, as the id was moved out of it into `vars.orderId`',
        'The payload is still the whole order, and `vars.orderId` holds the id',
        'The payload is still the whole order, and `attributes.orderId` holds the id',
      ],
      answer: 2,
      explain: 'Set Variable writes to `vars` and leaves the message alone. The value is copied, not moved, so the order in the payload stays complete.',
    },
    {
      type: 'single',
      prompt: 'A Logger with the message `#[payload]` sits between a Transform Message and an HTTP Request. What does the HTTP Request receive as its payload?',
      options: [
        'The payload the Transform Message produced, unchanged by the Logger',
        'The text of the log line, as the Logger turns the payload into a string',
        'An empty payload, as the Logger reads the payload and uses it up',
        'The payload from before the Transform Message, restored by the Logger',
      ],
      answer: 0,
      explain: 'A Logger only reads the event and writes a line to the log. You can add or remove a Logger without changing what the next step receives.',
    },
    {
      type: 'single',
      prompt: 'A flow saves a warehouse code in `vars.warehouse`. Later an HTTP Request with no target variable calls a carrier API and gets a response. What is true after the call?',
      options: [
        'The payload is still the old one, and the response is in `vars.warehouse`',
        'The payload is the response, and `vars.warehouse` has been removed',
        'The payload is still the old one, and `vars.warehouse` has been removed',
        'The payload is the response, and `vars.warehouse` still holds the code',
      ],
      answer: 3,
      explain: 'A target variable is a setting that stores the result in a variable. Without one, the result of the call replaces the message. Variables are separate from the message, so `vars.warehouse` is still there. This is why variables are the place for values you need later.',
    },
    {
      type: 'single',
      prompt: 'A Transform Message replaces the payload with a smaller object that leaves out the `note` field. A step further down the flow needs `note`. What is the best fix?',
      options: [
        'Read `note` from `attributes` further down, where Mule keeps the old payload',
        'Add a Logger before the Transform Message so the value is kept in the event',
        'Add a Set Variable before the Transform Message and read `vars.note` later',
        'Move `note` into the query string of the request that started the flow',
      ],
      answer: 2,
      explain: 'Once the payload is replaced, the old content is gone. Saving the value in a variable first keeps it available, because a Transform Message that writes the payload does not touch `vars`.',
    },
    {
      type: 'match',
      prompt: 'In a shipment flow, match what you need to read to the place you read it from.',
      pairs: [
        ['The JSON body of the current message', '`payload`'],
        ['A header the caller sent to the HTTP Listener', '`attributes`'],
        ['A value you saved yourself earlier in the flow', '`vars`'],
      ],
      explain: 'Content is in `payload`, information about that content is in `attributes`, and anything you choose to keep is in `vars`.',
    },
  ],
  description: `
A shipping company has a flow that books a shipment. It runs these steps in order:

1. **HTTP Listener** receives \`POST /shipments?priority=high\` with a JSON body.
2. **Set Variable** saves the warehouse code as \`warehouse\`.
3. **Logger** writes the shipment id to the log.
4. **Transform Message** builds the JSON the carrier expects.
5. **HTTP Request** sends it to the carrier API.
6. **Transform Message** builds the reply for the caller.

A new developer asks a fair question: at each step, what is in \`payload\`, what is in \`attributes\`, and what is in \`vars\`? A **variable** is a named value you store on the event so you can read it later as \`vars.name\`.

**Questions**
1. Where do the request body and the query parameters sit after the Listener?
2. Which steps change the payload, and which leave it alone?
3. Which values survive the call to the carrier?
`,
  answerTemplate: `## After the Listener

## Steps that change the payload

## What survives the call
`,
  keyPoints: [
    'The payload is the main content of the message. Attributes describe that content, such as the headers and query parameters of a request.',
    'Set Variable writes to vars and leaves the payload as it was.',
    'A Logger only reads the event, so it never changes what the next step receives.',
    'A Transform Message that writes the payload replaces it, so a field you left out is gone.',
    'An HTTP Request with no target variable replaces the message with its result, while vars stay in place.',
  ],
  solution: `
**After the Listener:** the JSON body is in \`payload\`. The query parameter is in \`attributes.queryParams.priority\`. Nothing is in \`vars\` yet.

**Step by step**
| Step | \`payload\` | \`vars\` |
|---|---|---|
| HTTP Listener | Request body | Empty |
| Set Variable | Same as before | Adds \`warehouse\` |
| Logger | Same as before | Same as before |
| Transform Message | The carrier JSON | Same as before |
| HTTP Request | The carrier response | Same as before |
| Transform Message | The reply for the caller | Same as before |

**What survives the call:** \`vars.warehouse\` survives, because variables are separate from the message. The payload and attributes from before the call do not, because the result of the HTTP Request replaces the message.

The working rule: if a later step needs a value, save it in a variable before the step that replaces it.
`,
  followUps: [
    {
      q: 'Why is a value copied by Set Variable still in the payload?',
      a: 'Set Variable stores the result of its expression under a name in vars. It does not remove anything from the message, so the payload stays as it was.',
    },
    {
      q: 'Which is the better place for the caller\'s query parameter if you need it after an HTTP Request?',
      a: 'A variable, set right after the Listener. The attributes of the request are replaced when the HTTP Request returns its result, so reading them later will not find the value.',
    },
    {
      q: 'Is a variable part of the message?',
      a: 'No. The Mule event holds the message and the variables. The message is the payload and its attributes, and the variables sit beside it.',
    },
  ],
}
