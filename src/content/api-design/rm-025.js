export default {
  id: 'rm-025',
  category: 'api-design',
  title: 'Booking Payments API: A Polymorphic Type with a Discriminator',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'data-types', 'discriminator', 'inheritance', 'travel'],
  estMinutes: 30,
  description: `
A travel booking site takes three kinds of payment: card, bank transfer and wallet. All three share an amount and a currency, but each has its own details. A card needs the last four digits, a transfer needs a reference, and a wallet needs a wallet id.

One body that can take several shapes is called **polymorphic**. Putting every field in one type and making them all optional would allow nonsense, such as a card payment with no card.

RAML solves this with inheritance and a **discriminator**. The base type names a property with \`discriminator\`. Each child type states its value for that property with \`discriminatorValue\`. A reader of the payload looks at that one property and knows which child type applies.

**Requirements**
- Title \`Booking Payments API\`, with JSON as the default media type.
- A base type \`Payment\` with a required string \`paymentType\`, a required number \`amount\` and a required string \`currency\`.
- \`Payment\` uses \`paymentType\` as its discriminator.
- \`CardPayment\` extends \`Payment\`, has the discriminator value \`CARD\`, and adds a required string \`last4\`.
- \`BankTransferPayment\` extends \`Payment\`, has the discriminator value \`BANK_TRANSFER\`, and adds a required string \`reference\`.
- \`WalletPayment\` extends \`Payment\`, has the discriminator value \`WALLET\`, and adds a required string \`walletId\`.
- \`CardPayment\` has an example that fits it.
- \`POST /bookings/{bookingId}/payments\` takes a \`Payment\` body and returns a \`Payment\` with status 201.
- It returns 404 for an unknown booking, and 422 when the payment is well formed but is refused.
`,
  starter: `#%RAML 1.0
title: Booking Payments API
mediaType: application/json

types:
  Payment:
    type: object
    properties:
      amount: number
      currency: string

/bookings:
  /{bookingId}:
`,
  ramlChecks: [
    {
      label: 'The title is Booking Payments API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Booking Payments API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    { label: 'Payment has a required string paymentType', rule: { type: 'prop', typeName: 'Payment', prop: 'paymentType', want: { type: 'string', required: true } } },
    { label: 'Payment uses paymentType as its discriminator', rule: { type: 'typeDecl', name: 'Payment', want: { discriminator: 'paymentType' } } },
    {
      label: 'Payment has a required amount and currency',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Payment', prop: 'amount', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Payment', prop: 'currency', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'CardPayment extends Payment with the value CARD and a required last4',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'CardPayment', extends: 'Payment', want: { discriminatorValue: { is: 'CARD' } } },
          { type: 'prop', typeName: 'CardPayment', prop: 'last4', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'BankTransferPayment extends Payment with the value BANK_TRANSFER and a required reference',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'BankTransferPayment', extends: 'Payment', want: { discriminatorValue: { is: 'BANK_TRANSFER' } } },
          { type: 'prop', typeName: 'BankTransferPayment', prop: 'reference', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'WalletPayment extends Payment with the value WALLET and a required walletId',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'WalletPayment', extends: 'Payment', want: { discriminatorValue: { is: 'WALLET' } } },
          { type: 'prop', typeName: 'WalletPayment', prop: 'walletId', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'CardPayment has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'CardPayment', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'CardPayment', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'POST takes a Payment body', rule: { type: 'body', path: '/bookings/{}/payments', method: 'post', typeIs: 'Payment' } },
    { label: 'POST returns a Payment with status 201', rule: { type: 'response', path: '/bookings/{}/payments', method: 'post', status: '201', typeIs: 'Payment' } },
    {
      label: 'POST returns 404 for an unknown booking and 422 for a refused payment',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings/{}/payments', method: 'post', status: '404' },
          { type: 'response', path: '/bookings/{}/payments', method: 'post', status: '422' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Booking Payments API
mediaType: application/json

types:
  Payment:
    type: object
    discriminator: paymentType
    properties:
      paymentType: string
      amount: number
      currency: string
  CardPayment:
    type: Payment
    discriminatorValue: CARD
    properties:
      last4: string
    example:
      paymentType: CARD
      amount: 240.00
      currency: EUR
      last4: "4242"
  BankTransferPayment:
    type: Payment
    discriminatorValue: BANK_TRANSFER
    properties:
      reference: string
  WalletPayment:
    type: Payment
    discriminatorValue: WALLET
    properties:
      walletId: string

/bookings:
  /{bookingId}:
    /payments:
      post:
        body:
          type: Payment
        responses:
          201:
            body:
              type: Payment
          404:
            description: No booking has this id.
          422:
            description: The payment is well formed but was refused.
`,
  keyPoints: [
    'discriminator goes on the base type and names a property that the base type declares.',
    'discriminatorValue goes on each child. If you leave it out, the value is the name of the type.',
    'Child types inherit properties, so CardPayment also has amount and currency.',
    'A discriminator keeps each shape strict, where one wide type would make every field optional.',
    'Quote a value such as "4242" in an example when the property is a string.',
  ],
  solution: `
\`Payment\` holds what all three share and names the property that tells them apart. Each child adds only its own details, and those details stay required.

The body is declared as \`Payment\`, so a new kind of payment needs a new child type and no change to the resource.

\`discriminatorValue\` matters here because the wire values are \`CARD\` and \`BANK_TRANSFER\`. Without it, callers would have to send \`CardPayment\`, which ties the payload to the name of a type in your contract.

\`422\` fits a payment that is well formed but refused. A \`400\` would suggest the caller sent a broken request.
`,
  followUps: [
    {
      q: 'What is the difference between a discriminator and a union type?',
      a: 'A union, written A | B, says the value fits one of the listed types, and a reader may have to try each. A discriminator names one property that says which type it is, so no trying is needed.',
    },
    {
      q: 'How would you add a fourth payment kind safely?',
      a: 'Add a new child type with its own discriminatorValue. Existing payments keep working. Tell consumers first, though, because a caller that reads payments may not handle the new value.',
    },
    {
      q: 'How would a Mule flow act on the discriminator?',
      a: 'A Choice router can branch on payload.paymentType, with one route per payment kind. Each route calls the right provider.',
    },
  ],
}
