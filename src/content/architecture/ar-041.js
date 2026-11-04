export default {
  id: 'ar-041',
  category: 'architecture',
  title: 'Event Schema Evolution and Versioning',
  level: 'ADVANCED',
  tags: ['events', 'schema-evolution', 'versioning', 'compatibility', 'event-driven'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Classify each proposed change to OrderPlaced.',
      pairs: [
        ['Change `total` from a number to `{ amount, currency }`', 'Breaking — type change'],
        ['Add `currency` next to `total`', 'Compatible — additive field'],
        ['Same `customerId` field, new format from the new CRM', 'Semantically breaking — same name, different meaning'],
      ],
      explain: 'Additive optional fields are safe for tolerant readers. Type changes break parsing; a silent format change is the most dangerous because nothing fails loudly.',
    },
    {
      type: 'single',
      prompt: 'How should the new CRM customer id be introduced?',
      options: [
        'Change the format of `customerId` and announce it in an email',
        'Add `customerKey` alongside the legacy `customerId`, let consumers move, and remove the old field in v2',
        'Create a separate CustomerIdChanged event',
        'Encode both ids in `customerId` separated by a pipe',
      ],
      answer: 1,
      explain: 'Running old and new fields side by side lets 9 consumers migrate on their own schedules; removing the old one is a major-version change.',
    },
    {
      type: 'single',
      prompt: 'A Mule consumer validates events against a JSON Schema with `additionalProperties: false`. What happens when `giftWrap` is added?',
      options: [
        'Nothing — new fields are always ignored',
        'Validation rejects the event, turning a compatible additive change into an outage',
        'Mule strips the unknown field automatically',
        'The broker rejects the message',
      ],
      answer: 1,
      explain: 'Consumers must be **tolerant readers**: validate what they need and ignore the rest.',
    },
    {
      type: 'multi',
      prompt: 'A genuine v2 of OrderPlaced is needed. Which practices let old and new versions coexist?',
      options: [
        'Carry `schemaVersion` in the envelope or message headers',
        'Publish v1 and v2 in parallel (separate topic/exchange or event type) during a deprecation period',
        'Track which consumers still read v1 and give partners the longest window',
        'Use an upcaster (e.g. a DataWeave transformation per version) so replayed old events can be read in the new shape',
        'Switch all producers and consumers to v2 in one release weekend',
        'Rewrite the stored analytics events in place',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Consumers on different release cycles (partners update twice a year) rule out a big-bang switch; stored events must stay readable rather than be rewritten.',
    },
    {
      type: 'single',
      prompt: 'How do you stop a producer from accidentally publishing a breaking change?',
      options: [
        'Code review only',
        'A CI check comparing the new schema with the previously published one (in Exchange or a schema registry), failing on breaking changes unless the major version is bumped',
        'Asking consumers to test every release',
        'Publishing schemas only in a wiki',
      ],
      answer: 1,
      explain: 'Automated compatibility checks make breaking changes visible before release; registries enforce modes such as BACKWARD or FULL, and with Exchange a schema-diff step does the same.',
    },
    {
      type: 'single',
      prompt: 'Analytics must replay 30-day-old events with a consumer built for the new schema. Which compatibility does that need?',
      options: [
        'Forward compatibility — old consumers read new events',
        'Backward compatibility — consumers on the new schema can read old events',
        'Neither — replay always uses the original consumer',
        'Only binary compatibility',
      ],
      answer: 1,
      explain: 'Backward compatibility matters for replay; forward compatibility matters when producers upgrade before consumers. Additive optional fields with tolerant readers give both.',
    },
  ],
  description: `
A retailer publishes an **OrderPlaced** event that 9 consumers use (warehouse, invoicing, loyalty, analytics, fraud, CRM, email, two partner feeds). Current payload (v1):

\`\`\`json
{ "orderId": "O-1", "customerId": "C-9", "total": 129.90, "items": [ { "sku": "A1", "qty": 2 } ] }
\`\`\`

New requirements:
1. Multi-currency: \`total\` must carry a currency.
2. Items need a \`unitPrice\` and an optional \`giftWrap\` flag.
3. \`customerId\` will change format when the new CRM goes live.

Constraints:
- Consumers are owned by different teams with different release cycles; partners update at most twice a year.
- Some events are kept for replay (30 days) and analytics stores them forever.
- Some consumers are Mule apps validating against a JSON Schema; others are Java/Python services.

**Questions:**
- Which of these changes are backward compatible and which are breaking?
- How do you evolve the event without breaking 9 consumers?
- How do you version events (where does the version live) and run old and new versions side by side?
- How do you make sure a producer cannot accidentally publish a breaking change?
`,
  answerTemplate: `## Classifying the changes

## Evolution strategy

## Versioning and coexistence

## Governance and enforcement
`,
  keyPoints: [
    'Adding optional fields is backward compatible for tolerant consumers; removing, renaming or changing the type or meaning of a field is breaking.',
    'Changing total from a number to an object is breaking; adding a new field (e.g. totalAmount with currency) alongside the old one keeps compatibility during a transition.',
    'Consumers must be tolerant readers: ignore unknown fields and not use strict schemas that reject additional properties.',
    'The schema version is carried in the event metadata (header/envelope) and breaking versions are published in parallel (new event type, topic or version) until all consumers have migrated.',
    'Schemas live in a shared registry or Exchange with compatibility rules checked in CI, so a breaking change cannot be published silently.',
    'Stored/replayed events mean old versions must remain readable, so upcasting or version-aware consumers are needed.',
  ],
  solution: `
**Classification.**

| Change | Compatible? | Notes |
|---|---|---|
| Change \`total\` to \`{ amount, currency }\` | **Breaking** | Type change |
| Add \`currency\` next to \`total\` | Compatible (additive) | Consumers ignoring it still work; semantics of total must stay the same |
| Add \`unitPrice\`, optional \`giftWrap\` to items | Compatible | If consumers tolerate unknown fields |
| New \`customerId\` format | **Semantically breaking** | Same field name, different meaning/format — the most dangerous kind |

**Evolution strategy.**
- **v1.1 (additive):** add \`currency\`, \`items[].unitPrice\`, \`items[].giftWrap\`. Keep \`total\` meaning "amount in currency".
- **customerId:** do not silently change format. Add \`customerKey\` (new CRM id) alongside \`customerId\` (legacy) during migration; consumers move to the new field; later remove the old one in **v2**.
- Fix Mule consumers that use JSON Schemas with \`additionalProperties: false\` — they turn every additive change into an outage. Tolerant-reader rule: validate what you need, ignore the rest.

**Versioning and coexistence.**
- Envelope with metadata:
\`\`\`json
{ "eventType": "OrderPlaced", "schemaVersion": "1.1", "eventId": "...", "occurredAt": "...", "data": { ... } }
\`\`\`
  or the same as message properties/headers on the broker.
- **Minor** versions (additive) flow on the same queue/topic.
- **Major** version (v2): publish **both** v1 and v2 (separate topic/exchange or event type \`OrderPlaced.v2\`) for a deprecation period. Track which consumers still read v1; switch off when they have migrated. Partners get the longest window.
- Replay/analytics: consumers must handle old versions, or an **upcaster** converts old events to the current shape on read (a DataWeave transformation per version works well).

**Governance.**
- Schemas (JSON Schema/Avro) published in **Exchange** or a schema registry, each consumer listed.
- CI check on the producer compares the new schema with the previous one and fails on breaking changes unless the major version is bumped (schema registries enforce compatibility modes like BACKWARD/FULL; with Exchange do it with a schema-diff step).
- Contract tests: producer tests generate sample events and validate them against the published schema; consumer tests run against published examples.
- Document semantics, not just types (currency, timezone, id formats).
`,
  followUps: [
    { q: 'Why not just version every change as a new topic?', a: 'Every new topic multiplies producers, consumers and monitoring; minor additive changes should not force migrations. Reserve parallel streams for genuinely breaking changes.' },
    { q: 'What is the difference between backward and forward compatibility here?', a: 'Backward compatible: consumers on the new schema can read old events (important for replay). Forward compatible: consumers on the old schema can read new events (important when producers upgrade first). Additive optional fields with tolerant readers give both.' },
  ],
}
