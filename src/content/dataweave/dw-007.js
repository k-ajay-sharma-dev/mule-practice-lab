export default {
  id: 'dw-007',
  category: 'dataweave',
  title: 'Parse a SOAP Response into JSON',
  level: 'INTERMEDIATE',
  tags: ['xml', 'soap', 'selectors', 'attributes'],
  estMinutes: 20,
  description: `
A legacy core-banking SOAP service returns accounts. The mobile Experience API needs a simple JSON array.

**Rules**
- Only accounts with \`status="OPEN"\`.
- For each: \`id\` (attribute), \`owner\`, \`balance\` as a **number**, and \`currency\` (attribute of \`Balance\`).
- The response may contain **one or many** accounts — the output must always be an array.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://example.com/accounts">
  <soap:Body>
    <ns:GetAccountsResponse>
      <ns:Account id="A-1" status="OPEN">
        <ns:Owner>Asha Rao</ns:Owner>
        <ns:Balance currency="EUR">1520.40</ns:Balance>
      </ns:Account>
      <ns:Account id="A-2" status="CLOSED">
        <ns:Owner>Ben Ortiz</ns:Owner>
        <ns:Balance currency="EUR">0.00</ns:Balance>
      </ns:Account>
      <ns:Account id="A-3" status="OPEN">
        <ns:Owner>Chen Li</ns:Owner>
        <ns:Balance currency="USD">88.10</ns:Balance>
      </ns:Account>
    </ns:GetAccountsResponse>
  </soap:Body>
</soap:Envelope>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "A-1", "owner": "Asha Rao", "balance": 1520.40, "currency": "EUR" },
  { "id": "A-3", "owner": "Chen Li", "balance": 88.10, "currency": "USD" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Selectors match the local name, so `payload.Envelope.Body` works without declaring namespaces.',
    '`.Account` returns only the **first** match. The multi-value selector `.*Account` returns all of them as an array — even when there is only one.',
    'Attributes are read with `.@name`, e.g. `a.@status` or `a.Balance.@currency`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload.Envelope.Body.GetAccountsResponse.*Account
  filter ($.@status == "OPEN")
  map (a) -> {
    id: a.@id,
    owner: a.Owner,
    balance: a.Balance as Number,
    currency: a.Balance.@currency
  }`,
  explanation:
    'XML values are always strings, so `as Number` is needed for `balance`. Using `.*Account` is the important part: with `.Account` the single-account response would silently return one object instead of an array.',
  tests: [
    {
      name: 'Only one account in the response',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://example.com/accounts">
  <soap:Body><ns:GetAccountsResponse>
    <ns:Account id="B-9" status="OPEN"><ns:Owner>Dana K</ns:Owner><ns:Balance currency="GBP">5</ns:Balance></ns:Account>
  </ns:GetAccountsResponse></soap:Body>
</soap:Envelope>`,
        },
      ],
      expected: '[{ "id": "B-9", "owner": "Dana K", "balance": 5, "currency": "GBP" }]',
    },
  ],
}
