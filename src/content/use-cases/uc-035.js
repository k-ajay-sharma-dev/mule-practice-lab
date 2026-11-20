import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-035',
  category: 'use-cases',
  title: 'Support Chat Transcripts into the CRM',
  level: 'INTERMEDIATE',
  tags: ['salesforce', 'webhooks', 'pii-masking', 'customer-service', 'attachments'],
  estMinutes: 25,
  diagram: {
    task: 'draw how closed chat conversations get from the chat platform into Salesforce Service Cloud: webhook intake, transcript fetch, masking/matching in a Process API, case and file storage, and the stats-only path for anonymous chats.',
    checks: [
      { label: 'The chat platform webhook lands on a listener / Experience API', rule: { type: 'edge', from: ['chatbot', 'saas', 'external-api'], to: 'experience-api' } },
      { label: 'The webhook only queues the conversation ID (async) and returns 200', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Process API consumes the queue (fetch, mask, match, decide on Case)', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'Transcripts are fetched from the chat platform through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: ['saas', 'external-api'] } },
      { label: 'Salesforce is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Anonymous chats without an email go only to the analytics store as statistics', rule: { type: 'path', from: 'process-api', to: 'data-warehouse' } },
      { label: 'Conversations that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        bot: ['chatbot', 'Chat / chatbot platform (webhook)'],
        hook: ['experience-api', 'exp-chat-closed-webhook'],
        q: ['queue', 'closed-conversations', { maxRedelivery: 30 }],
        dlq: ['dlq', 'closed-conversations-dlq'],
        prc: ['process-api', 'prc-conversation-archive-api'],
        schat: ['system-api', 'sys-chat-platform-api'],
        ssf: ['system-api', 'sys-salesforce-service-api'],
        chat: ['saas', 'Chat platform REST API'],
        sf: ['crm', 'Salesforce Service Cloud'],
        dw: ['data-warehouse', 'Chat statistics store'],
      },
      ['bot -> hook', 'hook ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> schat', 'schat -> chat', 'prc -> ssf', 'ssf -> sf', 'prc -> dw'],
    ),
    simulation: {
      systems: [
        { match: 'crm', latencyMs: 300 },
        { match: 'saas', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'Salesforce is down for 20 minutes',
          about: 'At the evening peak the chat platform closes 1 conversation a second while Salesforce is down for 20 minutes. Every webhook gets its 200 at once, each conversation is tried for 30 minutes, and none is lost or sent to the DLQ.',
          traffic: [{ name: 'closed chats', from: 'chatbot', rps: 1, to: 'crm', kind: 'write' }],
          incidents: [{ down: 'crm', at: 5, forMin: 20 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], backlog: [{ queue: 'queue', maxEnd: 0 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Some transcripts cannot be stored',
          about: 'The chat platform closes 1 conversation a second, and 1 in 100 has a transcript Salesforce rejects every time. Those conversations go to the DLQ, and the others keep flowing.',
          traffic: [{ name: 'closed chats', from: 'chatbot', rps: 1, to: 'crm', kind: 'write', poison: 0.01 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], dlq: { min: 10 }, lost: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 50 }] },
        },
      ],
    },
  },
  description: `
An online bank uses a third-party **live chat / chatbot platform** on its website and app. Service agents work in **Salesforce Service Cloud**. Today, agents copy-paste chat text into cases by hand.

Facts:
- The chat platform sends a **"conversation closed"** webhook with conversation ID; the full transcript (messages, timestamps, bot vs agent, attachments) is fetched via its REST API.
- ~12,000 conversations/day; 70% are handled fully by the bot.
- Requirements:
  - Every conversation of an **identified customer** (logged-in app users) is stored on the customer's record in Salesforce within **5 minutes**.
  - Conversations that the bot **escalated** or tagged "complaint" must create or update a **Case**.
  - **Card numbers, IBANs and passwords** typed by customers must be **masked** before storing.
  - Anonymous website chats are stored only if they contain an email the customer gave voluntarily; otherwise only statistics are kept.
- Attachments (screenshots, PDFs, up to 10 MB) must be kept with the case.
- At the evening peak about 1 conversation closes each second. Salesforce can be down for 20 minutes, and about 1 transcript in 100 is rejected by Salesforce every time.
- The broker redelivers a failed message about once a minute. Every delivery counts toward the redelivery limit, and after the limit the message goes to the DLQ. Good conversations must survive the 20-minute outage, and rejected ones must reach the DLQ for the service team.

**Describe your solution:**
- How do you receive and fetch transcripts?
- How do you link the conversation to the customer and decide on Case creation?
- How and where do you mask sensitive data?
- How do you store transcripts and attachments in Salesforce?
`,
  answerTemplate: `## Receiving and fetching

## Customer identification

## Masking

## Storing in Salesforce

## Errors and duplicates
`,
  keyPoints: [
    'Webhook acknowledged quickly, conversation ID queued, transcript fetched via the chat API by a consumer.',
    'Customer resolved from the authenticated user ID (mapped to the Salesforce Contact/Person Account); anonymous chats handled by the email rule or stats only.',
    'Masking in the integration layer before any storage or logging: regex/Luhn for card numbers, IBAN patterns, password prompts.',
    'Transcript stored as a related record (e.g. a chat transcript/custom object or task) and escalated/complaint chats create or update a Case.',
    'Attachments uploaded as Salesforce Files linked to the case, streaming large files.',
    'Upsert by conversation ID makes webhook retries and re-opened chats safe.',
  ],
  solution: `
**Receiving and fetching.** A webhook endpoint verifies the platform's signature, puts the conversation ID on **Anypoint MQ** and returns 200. A consumer calls the chat API for the transcript and metadata (bot/agent, tags, escalation, customer identity token). Peak throughput is low (~12k/day), so a small consumer pool meets 5 minutes with room to spare.

**Customer identification.**
- App users: the chat carries the authenticated customer ID → look up the **Person Account/Contact** by an external ID field.
- Website anonymous: if the transcript contains an email that the customer entered in the pre-chat form, search Contact by email; no match → store only stats (topic, duration, bot resolution) in the analytics store.

**Masking (before anything is stored or logged).** DataWeave function applied to every message text:
- card numbers: digit sequences of 13–19 digits (allowing spaces/dashes) validated with the **Luhn check**, replaced with e.g. \`**** **** **** 1234\`;
- IBANs: country code + check digits pattern → keep last 4;
- messages following a bot prompt for a password/PIN → fully masked;
- the raw transcript is never written to logs; only conversation ID and counts.

Masking as an independent, unit-tested module (MUnit with many real-world samples) because false negatives are a compliance incident.

**Storing in Salesforce.**
- Transcript → a record linked to the customer (e.g. a Chat Transcript or custom \`Conversation__c\` object) upserted by **conversation ID** as external ID, body as formatted text.
- Escalated or tagged "complaint" → create a **Case** (or update an open case for the same customer and topic in the last 7 days), with the transcript linked.
- Attachments: download from the chat platform as a stream and upload as **ContentVersion** (Salesforce Files) linked to the Case; scan for malware if the bank requires it.

**Errors and duplicates.** Upsert by conversation ID means duplicate webhooks or re-closed chats update the same record. Salesforce limit errors/5xx → the message is redelivered about once a minute, and a redelivery limit of about 30 outlasts a 20-minute outage. Messages still failing after that → DLQ and alert. A daily count reconciliation compares closed conversations with stored transcripts.
`,
  followUps: [
    { q: 'Why mask in Mule rather than in Salesforce?', a: 'Once the data reaches Salesforce it is already stored, indexed and possibly in audit history. Masking before storage (and before logging) keeps sensitive data out of every downstream system.' },
    { q: 'What if a customer is wrongly linked?', a: 'Only link on strong identifiers (authenticated ID or pre-chat email with exact match); ambiguous matches go to a review queue instead of guessing.' },
  ],
}
