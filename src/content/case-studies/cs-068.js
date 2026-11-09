export default {
  id: 'cs-068',
  category: 'case-studies',
  title: 'Building Materials Distributor Launching a Supplier Portal for ASNs and Invoices',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'partners', 'b2b', 'edi', 'api-management', 'sap', 'onboarding', 'identity'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The 40 largest suppliers already send EDI and do not want to change. What is the best way to include them in the new design?',
      options: [
        'Make them switch to the portal so there is only one channel',
        'Keep their EDI channel and translate it into the same canonical ASN and invoice messages the portal and API produce',
        'Build a separate SAP interface for EDI suppliers so the portal work is not delayed',
        'Ask them to upload their EDI files through the portal web page',
      ],
      answer: 1,
      explain: 'Forcing large suppliers off working EDI wastes goodwill and gains nothing. Translating EDI into the same canonical messages means one set of validation and SAP posting logic for every channel.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which three controls stop one supplier from seeing or changing another supplier\'s data?',
      options: [
        'Take the supplier ID from the signed-in identity or client credentials, never from the request',
        'Filter every purchase order and payment query by that supplier ID in the Process API',
        'Give each supplier its own client ID and contract in API Manager',
        'Hide other suppliers\' purchase order numbers in the portal user interface only',
        'Use one shared API key for all suppliers so access is simple to manage',
      ],
      answer: [0, 1, 2],
      explain: 'Isolation must be enforced on the server from a trusted identity. Hiding data in the user interface does not stop an API call, and a shared key makes every supplier look the same.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A supplier submits an ASN in the portal at 16:55. SAP is in its nightly maintenance window from 17:00 to 18:00. What should the supplier see?',
      options: [
        'An error asking them to try again after 18:00',
        'A confirmation that the ASN was received, with a reference number, while the posting to SAP waits on a queue',
        'A success message only once SAP has posted the inbound delivery',
        'Nothing; the page waits until SAP answers',
      ],
      answer: 1,
      explain: 'Accept, validate and queue the ASN, then post it when SAP returns. The supplier gets a reference at once and later sees the status, so SAP downtime does not block suppliers.',
    },
    {
      type: 'match',
      prompt: 'Match each supplier channel to how it should enter the integration platform.',
      pairs: [
        ['Large supplier sending EDI 856 and 810 over AS2', 'Partner Manager or an AS2 Experience API translating to canonical messages'],
        ['Mid-size supplier whose ERP can call REST', 'Supplier Experience API behind API Manager with client credentials'],
        ['Small supplier with no IT team', 'Supplier portal with user sign-in through the identity provider'],
        ['Supplier that can only export a CSV from its accounting system', 'Upload through the portal, parsed by a file intake flow'],
      ],
      explain: 'Each channel suits a different kind of supplier, but all end up as the same canonical ASN or invoice, so the posting logic to SAP is written once.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for handling a supplier invoice from any channel.',
      items: [
        'Receive the invoice and authenticate the supplier',
        'Check the format and convert it to the canonical invoice',
        'Check that the invoice is not a duplicate of one already received',
        'Match it to the purchase order and goods receipt in SAP (three-way match)',
        'Post the invoice in SAP or route it to accounts payable for review',
        'Publish the status so the supplier can see it in the portal',
      ],
      explain: 'Authenticate first, then normalise, then de-duplicate before any matching. Matching needs the PO and the goods receipt, and the supplier sees the result only after it is posted or sent for review.',
    },
    {
      type: 'single',
      prompt: 'Accounts payable wants to stop suppliers creating invoices for goods that have not been received. Where should this rule live?',
      options: [
        'In each channel adapter, so EDI, API and portal each check it',
        'In the shared invoice Process API, before posting to SAP',
        'In the portal user interface only',
        'Nowhere; SAP will reject the invoice anyway',
      ],
      answer: 1,
      explain: 'A business rule that applies to every channel belongs in the shared Process API. Putting it in each adapter copies it three times, and relying on the user interface misses EDI and API suppliers.',
    },
  ],
  description: `
**Context.** A building materials distributor (timber, insulation, tools, 230 branches) buys from about 2,800 suppliers. SAP S/4HANA handles purchasing, inbound deliveries and accounts payable.

**How suppliers work with the company today**
| Supplier group | Count | Channel |
|---|---|---|
| Large manufacturers | 40 | EDI (850 orders out; 856 ASNs and 810 invoices in) through an old VAN |
| Mid-size suppliers | about 300 | Email purchase orders; paper or PDF invoices |
| Small local suppliers | about 2,400 | Phone, email and paper invoices |

**Problems**
- 70% of deliveries arrive without an ASN, so branch receiving takes 3 times longer.
- Accounts payable keys 9,000 invoices a month by hand; 6% are duplicates or do not match the PO.
- Suppliers phone to ask "when will I be paid?" about 1,500 times a month.

**The programme.** Launch a supplier portal and supplier APIs so every supplier can:
- see and confirm purchase orders
- send ASNs
- send invoices
- see payment status

**Constraints**
- The 40 EDI suppliers must not be forced to change.
- SAP has a nightly maintenance window (17:00 to 18:00) and must not be called by suppliers directly.
- Supplier users sign in through the company's customer identity provider; each supplier sees only its own data.
- Procurement owns supplier onboarding and wants a simple checklist, not a developer per supplier.

**Your task.** Answer the design questions for the supplier integration.
`,
  answerTemplate: `## Channels (EDI, API, portal, file)

## Canonical ASN and invoice messages

## Supplier identity and data isolation

## Posting to SAP and handling downtime

## Onboarding and support
`,
  keyPoints: [
    'Keep EDI for the large suppliers and add an API and a portal; all channels produce the same canonical ASN and invoice.',
    'One invoice Process API and one ASN Process API hold the rules (de-duplication, three-way match) and post to SAP through System APIs.',
    'The supplier ID comes from the identity provider or client credentials, and every query is filtered by it.',
    'Accept and queue submissions so SAP downtime does not affect suppliers, then publish status for the portal.',
    'Onboarding is a checklist owned by procurement: create the identity or client ID, pick the channel, test, go live.',
  ],
  solution: `
**Channels.**
- **EDI suppliers** stay on EDI, moved from the VAN to AS2 (Partner Manager or an AS2 Experience API).
- **Mid-size suppliers** use \`exp-supplier-api\` behind API Manager with client credentials.
- **Small suppliers** use the portal, signing in through the identity provider. A CSV upload covers suppliers that can only export files.

**Canonical messages.** All channels produce a canonical ASN and a canonical invoice. \`prc-supplier-asn\` and \`prc-supplier-invoice\` validate, de-duplicate (supplier + document number) and run the three-way match before posting through \`sys-sap-purchasing-api\` and \`sys-sap-ap-api\`.

**Isolation.** The supplier ID always comes from the token or client application. Process APIs filter every read and write by it, and logs carry it for audit.

**SAP downtime.** Submissions are accepted, validated and put on a queue. Consumers pause during the maintenance window and drain afterwards. Status events update a supplier status store that the portal reads.

**Onboarding.** Procurement runs a checklist: create the supplier in the identity provider or API Manager, link it to the SAP vendor number, pick the channel, send test documents, go live. No code per supplier.

**Results to track.** ASN coverage, invoice touchless rate, duplicate invoices caught and "where is my payment" calls.
`,
  followUps: [
    { q: 'Why not let the portal call SAP directly?', a: 'SAP has a maintenance window and must not be exposed to thousands of suppliers. Queued submissions and System APIs protect SAP and keep the portal working.' },
    { q: 'How do you catch duplicate invoices?', a: 'Check supplier number plus invoice number against invoices already received before matching. Also flag the same amount and date from one supplier within a short period.' },
    { q: 'How would you measure if the portal is working?', a: 'Track the share of deliveries with an ASN, the share of invoices posted without manual work and the number of payment status calls.' },
  ],
}
