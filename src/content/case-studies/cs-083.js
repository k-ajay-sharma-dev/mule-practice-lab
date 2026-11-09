export default {
  id: 'cs-083',
  category: 'case-studies',
  title: 'Insurer Taking Its Integration Layer Out of PCI DSS Scope',
  level: 'INTERMEDIATE',
  tags: ['insurance', 'payments', 'pci', 'tokenization', 'security', 'logging', 'compliance'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which change removes the most Mule applications from PCI DSS scope in this scenario?',
      options: [
        'Encrypt the Anypoint MQ queues that carry card numbers',
        'Collect card details in the payment provider\'s hosted fields and IVR capture, so Mule only ever receives a token',
        'Mask card numbers in the Mule logs but keep passing them between applications',
        'Move all payment applications to a dedicated CloudHub 2.0 private space',
      ],
      answer: 1,
      explain: 'Systems that store, process or transmit card data are in scope, encrypted or not. If the card number never reaches Mule and only a token does, the Mule apps that handle tokens can leave scope. Encryption, masking and segmentation reduce risk but the apps still handle card data.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which three findings from the audit show card data is spread wider than the payment flow needs?',
      options: [
        'Full card numbers appear in DEBUG logs shipped to the central log platform',
        'The renewal flow puts the card number on an Anypoint MQ queue so a later step can charge it',
        'The CVV is written to the policy admin database "in case the payment is retried"',
        'The payment provider returns a token and the last four digits',
        'The contact centre agents see the policy number during the call',
      ],
      answer: [0, 1, 2],
      explain: 'Logs, queues and databases holding card numbers all bring their platforms into scope, and the CVV must never be stored after authorisation at all. A token with the last four digits, and the policy number, are not card data that needs this protection.',
    },
    {
      type: 'match',
      prompt: 'Match each channel to the way it should capture card details so Mule sees only tokens.',
      pairs: [
        ['Customer website', 'Payment provider hosted fields or iframe'],
        ['Contact centre phone payment', 'DTMF masking: the caller keys digits that go straight to the provider'],
        ['Monthly renewal charge', 'Charge a stored provider token by API'],
        ['Mobile app', 'Payment provider mobile SDK returning a token'],
      ],
      explain: 'In every channel the card number travels from the customer to the provider without passing the insurer\'s systems. Mule then works with tokens and payment references only.',
    },
    {
      type: 'single',
      prompt: 'After tokenisation a Mule app still needs to show the customer which card is on file. What may it store and display?',
      options: [
        'The full card number, encrypted with a key in a secure property',
        'The provider token, the card brand, the expiry month and the last four digits',
        'The first twelve digits, because the last four identify the card',
        'The CVV, masked as three asterisks',
      ],
      answer: 1,
      explain: 'A token plus brand, expiry and last four digits is enough to show "Visa ending 4242" and carries no usable card number. The CVV is never kept after authorisation, and storing the full number encrypted keeps the app in scope.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of the programme to take the integration layer out of scope.',
      items: [
        'Find every place card data flows or rests: apps, queues, logs, databases, files',
        'Introduce provider tokenisation in each channel and switch consumers to tokens',
        'Change renewals to charge stored tokens instead of queued card numbers',
        'Purge stored card numbers and CVVs from databases, queues, logs and backups',
        'Have the QSA confirm the reduced scope and update the network and data flow diagrams',
      ],
      explain: 'You must know where data is before you can remove it. Tokens must be in place before the old data can be purged, and the assessor confirms the new scope at the end with current diagrams.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A developer proposes a DataWeave function that masks card numbers in every log line. Is that enough to keep the logging platform out of scope?',
      options: [
        'Yes, masking in logs is all PCI DSS asks for',
        'It is a useful safety net, but the real fix is that the apps never receive card numbers; masking can miss formats and new fields',
        'No, logs must be switched off for payment apps',
        'Yes, if the log platform is in the same AWS region',
      ],
      answer: 1,
      explain: 'Masking reduces the chance of a leak, but a pattern can miss a card number with spaces or in a new field. Removing card data from the flow is the control that shrinks scope; masking stays as defence in depth.',
    },
  ],
  description: `
**Context.** A home insurer collects 1.4 million card payments a year: new business on the website, monthly instalments, and payments taken by phone in the contact centre.

**How card data flows today**
- The website posts the card form to an Experience API in Mule, which calls the payment provider.
- The IVR reads the digits the caller keys and sends them to a Mule API.
- Monthly renewals: a batch job reads card numbers stored (encrypted) in the policy admin database, puts them on an Anypoint MQ queue, and a Process API charges them.
- A PCI DSS audit found card numbers in DEBUG logs and CVVs in a retry table.

**The result.** 23 Mule applications, the log platform, Anypoint MQ and the policy admin database are all in PCI DSS scope. The annual assessment takes four months and a lot of evidence.

**Goal.** Reduce scope so that, at most, the systems of the payment provider and a minimal set of components handle card data, without changing the customer experience.

**Your task.** Answer the questions about the design choices for reducing scope.
`,
  answerTemplate: `## Where card data flows today

## Capturing cards by channel

## Renewals with tokens

## Logs, queues and data clean-up

## Evidence for the assessor
`,
  keyPoints: [
    'Scope follows the data: any system that stores, processes or transmits card numbers, and what connects to it, is in scope, whether encrypted or not.',
    'Capture card details in provider-hosted components (hosted fields, mobile SDK, DTMF masking in the contact centre) so Mule only receives tokens.',
    'Recurring payments charge a stored provider token; card numbers never go on queues or into the policy database.',
    'CVVs are never stored after authorisation; existing card numbers and CVVs are purged from databases, queues, logs and backups.',
    'Log masking stays as a safety net, and the reduced scope is confirmed with the assessor using updated data flow diagrams.',
  ],
  solution: `
**Diagnosis.** Card numbers pass through Mule in three channels and rest in the database, queues and logs. Encryption does not remove scope; it only protects data that is still in scope.

**Target**
- Website: provider hosted fields. The browser sends the card to the provider and gets a token; the Experience API receives only the token.
- Contact centre: DTMF masking. The caller keys digits into the phone, the telephony service sends them to the provider, and the agent and Mule see a token and the result.
- Mobile: provider SDK.
- Renewals: the policy stores a provider token. The batch job sends charge requests that carry a token and an amount.

**Clean-up.** Migrate stored card numbers to provider tokens with the provider's bulk tokenisation service, then delete them. Drop the CVV retry table. Purge queues and log indexes holding card numbers and set a log masking policy for safety.

**Evidence.** Updated data flow and network diagrams, token-only payload samples, the purge report, and log scans showing no card patterns. Expect the assessed scope to shrink from 23 Mule apps to none, with the provider holding the card data.
`,
  followUps: [
    { q: 'Does encrypting card numbers in Anypoint MQ take the queue out of scope?', a: 'No. The queue still transmits card data, so it stays in scope. Removing card numbers from the messages is what takes it out.' },
    { q: 'Why is a token safe for Mule to handle?', a: 'A provider token cannot be turned back into a card number by the insurer. It is only usable through the provider API with the insurer\'s credentials.' },
    { q: 'What do you do with the card numbers already stored?', a: 'Convert them to tokens with the provider\'s bulk tokenisation service, check the mapping, then delete the originals including backups on their normal expiry.' },
    { q: 'How would you prove to the assessor that logs contain no card numbers?', a: 'Run regular scans of the log indexes for card number patterns with a Luhn check, and keep the reports as evidence.' },
  ],
}
