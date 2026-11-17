export default {
  id: 'ms-213',
  category: 'mulesoft',
  title: 'For Each in Depth: Collection, Batch Size, Counter, rootMessage and What Comes Back',
  level: 'INTERMEDIATE',
  tags: ['for-each', 'scopes', 'variables', 'error-handling', 'healthcare'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A clinic flow receives `{ "clinicId": "C-4", "appointments": [ ... ] }`. A For Each has its Collection left at the default. The developer expected one pass per appointment, but the loop does not walk the appointments. What is the fix?',
      options: [
        'Set the Collection to `#[payload.appointments]`',
        'Set the Batch Size to the number of appointments',
        'Put a Transform before the loop that writes the object as XML',
        'Replace the For Each with a Flow Reference to a sub-flow',
      ],
      answer: 0,
      explain: 'The Collection defaults to `#[payload]`. Point it at the array you want to walk. Inside the loop, `payload` is then one appointment.',
    },
    {
      type: 'single',
      prompt: 'Inside the loop, each appointment needs the `clinicId` from the original message. How do you read it?',
      options: [
        '`#[payload.clinicId]`, because the loop keeps the whole message in the payload',
        '`#[attributes.clinicId]`, because For Each moves the outer fields there',
        '`#[vars.rootMessage.payload.clinicId]`, from the variable For Each sets',
        '`#[vars.counter.clinicId]`, from the counter of the current item',
      ],
      answer: 2,
      explain: 'For Each stores the message as it was before the loop in a variable, `rootMessage` by default. Copying the value into a variable before the loop also works and is often clearer.',
    },
    {
      type: 'single',
      prompt: 'A For Each walks 3 appointments. After the loop, a Logger prints `payload`. What does it show?',
      options: [
        'The last appointment, because that was the payload of the last pass',
        'The original message payload from before the loop',
        'An array of the payloads each pass produced',
        'Nothing, because For Each clears the payload when it ends',
      ],
      answer: 1,
      explain: 'For Each gives back the payload it started with. To collect results, add them to a variable inside the loop, or use a Transform or Parallel For Each when you need the list of results.',
    },
    {
      type: 'single',
      prompt: 'Inside a For Each, a Set Variable adds each confirmed appointment id to `vars.confirmed`. What is in `vars.confirmed` after the loop?',
      options: [
        'Nothing, because variables set inside the loop are thrown away',
        'Only the id from the first pass, because later passes are copies',
        'Only the id from the last pass, because each pass starts empty',
        'Every id that was added, because the change stays after the loop',
      ],
      answer: 3,
      explain: 'For Each runs in order on the same event, so a variable changed in one pass is seen by the next, and by the steps after the loop. Parallel For Each is different, because its routes work on copies.',
    },
    {
      type: 'match',
      prompt: 'Match each For Each setting to what it does.',
      pairs: [
        ['Batch Size of 50', 'Each pass gets an array of up to 50 items'],
        ['Counter Variable Name', 'Holds the number of the current pass, starting at 1'],
        ['Root Message Variable Name', 'Holds the message from before the loop'],
      ],
      explain: 'Batch Size groups items, which helps when a target takes lists, such as a bulk insert. The counter starts at 1. The root message variable is `rootMessage` unless you rename it.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The 2nd of 5 appointments fails to send, and nothing inside the loop handles the error. What happens to appointments 3 to 5?',
      options: [
        'They are skipped, because the error leaves the loop',
        'They are sent, because For Each logs errors and goes on',
        'They are sent later, because For Each retries the failed item at the end',
        'They are sent in parallel, because the loop changes mode after an error',
      ],
      answer: 0,
      explain: 'An error in a pass ends the For Each, and the error goes to the flow error handling. To carry on, put a Try scope with On Error Continue inside the loop and record the failed item.',
    },
  ],
  description: `
A chain of clinics sends reminder messages for the next day's appointments. A Mule flow receives one message per clinic:

\`\`\`json
{ "clinicId": "C-4", "appointments": [ { "id": "A-1", "phone": "..." }, ... ] }
\`\`\`

A For Each sends one reminder per appointment through an SMS provider. The first version had several problems:

- The loop did not walk the appointments.
- Inside the loop, the developer could not find the \`clinicId\`.
- After the loop, the flow expected a list of results and found the original message.
- One bad phone number stopped every reminder after it.

**Questions**
1. How do you point the loop at the appointments and read the clinic id inside it?
2. What is the payload after the loop, and how do you keep the results?
3. What does an error in one pass do, and how do you let the other reminders go out?
4. When would you set a Batch Size?
`,
  answerTemplate: `## The collection and the clinic id

## After the loop

## Errors in one pass

## Batch Size
`,
  keyPoints: [
    'The Collection defaults to `#[payload]`. Point it at the array, such as `#[payload.appointments]`.',
    'Inside the loop, `payload` is the current item, `vars.counter` counts from 1, and `vars.rootMessage` holds the message from before the loop.',
    'After the loop, the payload is what it was before the loop. Collect results in a variable.',
    'Variables changed inside For Each stay changed after it.',
    'An error in one pass ends the loop. A Try with On Error Continue inside the loop lets the other items go on.',
    'Batch Size hands each pass an array of items, for targets that take lists.',
  ],
  solution: `
**1. The collection and the clinic id.** Set Collection to \`#[payload.appointments]\`. Inside the loop, \`payload\` is one appointment. The clinic id is in \`vars.rootMessage.payload.clinicId\`. A clearer option is a Set Variable \`clinicId\` before the loop, read as \`vars.clinicId\` inside it.

**2. After the loop.** For Each puts the original payload back when it ends. It is a scope for doing things to each item, not for building a new list. Keep results in a variable. Set \`vars.sent\` to \`[]\` before the loop, then inside it use a Set Variable with \`vars.sent ++ [ { id: payload.id, status: "SENT" } ]\`. The change stays after the loop, because For Each runs one pass at a time on the same event.

**3. Errors in one pass.**
\`\`\`
For Each (collection: payload.appointments)
  └─ Try
       ├─ HTTP Request: send SMS
       └─ On Error Continue: add { id, reason } to vars.failed
\`\`\`
Without the Try, the first failure ends the loop and the rest never run. With it, each failure is recorded and the loop moves on. After the loop, \`vars.failed\` can go to a report or a retry queue.

**4. Batch Size.** Set it when the target takes a list, such as an SMS provider with a bulk endpoint or a database bulk insert. With a Batch Size of 50, each pass gets an array of up to 50 appointments, which means far fewer calls.
`,
  followUps: [
    {
      q: 'When would you use Parallel For Each instead?',
      a: 'When the passes are slow and independent, such as one HTTP call each. Parallel For Each runs them at the same time and returns a list of results. Watch the load it puts on the target, and set its max concurrency.',
    },
    {
      q: 'When is Batch Job a better fit than For Each?',
      a: 'For large record sets that need per-record error handling and progress over a long run. A Batch Job splits records into blocks, handles failed records without stopping the job and reports totals at the end.',
    },
    {
      q: 'Can For Each walk the fields of a JSON object?',
      a: 'It walks a collection. To loop over fields, turn them into an array first, for example with `pluck` in the Collection expression, so each pass gets a key and a value.',
    },
  ],
}
