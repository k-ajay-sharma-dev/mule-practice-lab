export default {
  id: 'dw-124',
  category: 'dataweave',
  title: 'Remove Repeated Payment Events with distinctBy',
  level: 'BEGINNER',
  tags: ['distinctBy', 'arrays', 'json'],
  estMinutes: 10,
  description: `
A bank receives payment events from a partner. When the partner's connection drops, it sends some events again, so the same \`paymentId\` can appear more than once.

Each payment must be booked only once. Output the same list with one event per \`paymentId\`:

- Keep the **first** event for each \`paymentId\`.
- Keep the original order.
- Leave each event unchanged.

\`distinctBy\` removes repeated items from an array. You tell it what makes two items the same.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "paymentId": "P-100", "amount": 250, "receivedAt": "09:00" },
  { "paymentId": "P-101", "amount": 75, "receivedAt": "09:01" },
  { "paymentId": "P-100", "amount": 250, "receivedAt": "09:05" },
  { "paymentId": "P-102", "amount": 40, "receivedAt": "09:06" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "paymentId": "P-100", "amount": 250, "receivedAt": "09:00" },
  { "paymentId": "P-101", "amount": 75, "receivedAt": "09:01" },
  { "paymentId": "P-102", "amount": 40, "receivedAt": "09:06" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`distinctBy` takes a function that returns the value to compare.',
    'Two events count as the same when their `paymentId` matches, so that is the field to return.',
  ],
  solution: `%dw 2.0
output application/json
---
payload distinctBy (event) -> event.paymentId`,
  explanation: `
\`distinctBy\` works out your value for each item, and keeps an item only if that value has not been seen before. So the first event for \`P-100\` stays, and the repeat at 09:05 is dropped.

Choosing the value is the real decision. In \`payload distinctBy $\`, the \`$\` stands for the current item, so it compares the whole event. That would keep both \`P-100\` events here, because \`receivedAt\` is different, and the payment would be booked twice.

The items themselves don't change. You get the original events back, not the \`paymentId\` values.
`,
  tests: [
    {
      name: 'One payment sent three times',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "paymentId": "P-7", "amount": 10, "receivedAt": "10:00" }, { "paymentId": "P-7", "amount": 10, "receivedAt": "10:02" }, { "paymentId": "P-7", "amount": 10, "receivedAt": "10:04" }]',
        },
      ],
      expected: '[{ "paymentId": "P-7", "amount": 10, "receivedAt": "10:00" }]',
    },
    {
      name: 'No repeats',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "paymentId": "P-8", "amount": 5, "receivedAt": "11:00" }, { "paymentId": "P-9", "amount": 6, "receivedAt": "11:01" }]',
        },
      ],
      expected: '[{ "paymentId": "P-8", "amount": 5, "receivedAt": "11:00" }, { "paymentId": "P-9", "amount": 6, "receivedAt": "11:01" }]',
    },
    {
      name: 'An empty list',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'How do you treat two fields together as the identity?',
      a: 'Return an object from the function: `payload distinctBy (e) -> { id: e.paymentId, amount: e.amount }`. Items are repeats only when both fields match.',
    },
    {
      q: 'Should `abc@shop.com` and `ABC@shop.com` count as the same customer?',
      a: 'They will not by default, because the comparison is case sensitive. Compare a cleaned value instead: `distinctBy (c) -> lower(c.email)`.',
    },
    {
      q: 'How would you keep the last event instead of the first?',
      a: 'Reverse the array, remove repeats, and reverse it back: `(payload[-1 to 0] distinctBy $.paymentId)[-1 to 0]`. Check for an empty list first. `[-1 to 0]` gives `null` on an empty array, so the second one fails.',
    },
  ],
}
