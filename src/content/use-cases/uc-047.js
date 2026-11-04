import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-047',
  category: 'use-cases',
  title: 'API-Led: Account Balance for Mobile App and Chatbot',
  level: 'BEGINNER',
  tags: ['api-led', 'application-network', 'banking', 'experience-api', 'decomposition'],
  estMinutes: 20,
  diagram: {
    task: 'draw the API-led application network for account balances: both channels, their Experience APIs, the Process API, the System APIs and the two back ends.',
    checks: [
      { label: 'The mobile app and the chatbot each call an Experience API', rule: { type: 'each', of: ['mobile-app', 'chatbot'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Each channel has its own Experience API', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Every Experience API goes through the Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The Process API orchestrates the core-banking and customer-profile System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'The mainframe core is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The customer profile DB is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The chatbot reaches core banking end to end', rule: { type: 'path', from: 'chatbot', to: 'legacy' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile banking app'],
        bot: ['chatbot', 'Chatbot platform'],
        em: ['experience-api', 'exp-mobile-banking'],
        eb: ['experience-api', 'exp-chatbot-banking'],
        prc: ['process-api', 'prc-customer-accounts'],
        score: ['system-api', 'sys-core-banking'],
        sprof: ['system-api', 'sys-customer-profile'],
        mf: ['legacy', 'Core banking mainframe (MQ/CICS)'],
        db: ['database', 'Customer profile DB (PostgreSQL)'],
      },
      ['mob -> em', 'bot -> eb', 'em -> prc', 'eb -> prc', 'prc -> score', 'prc -> sprof', 'score -> mf', 'sprof -> db'],
    ),
  },
  description: `
A retail bank wants customers to see their **account balances and last 10 transactions** in two channels. This is the classic interview whiteboard question: *decompose the requirement into an API-led application network.*

| Channel | Who | Needs |
|---|---|---|
| **Mobile banking app** (iOS/Android) | Logged-in customers | All accounts with balance, available balance, last 10 transactions, nicknames |
| **Chatbot** (web + WhatsApp, built on a conversational platform) | Logged-in customers | "What is my balance?" — short text answer for one account, no transaction list |

| Back-end system | Holds | Access |
|---|---|---|
| **Core banking** (mainframe, exposed via an MQ/CICS gateway) | Accounts, ledger balance, available balance, transactions | Request/reply over IBM MQ, ~300 ms |
| **Customer profile DB** (PostgreSQL) | Customer ↔ account links, account nicknames | JDBC |

Facts:
- 1.2 M mobile users; peak **600 balance requests/s** on payday mornings. Chatbot peak ~50 req/s.
- Target: **< 800 ms p95** for mobile, **< 1.5 s** for chatbot.
- A customer must only ever see **their own** accounts.
- The bank plans a **voice assistant** and an **open-banking (PSD2) API** next year.

**Questions:**
1. Which Experience, Process and System APIs do you create? Name them and their main resources.
2. Draw the call sequence for "mobile app shows balances".
3. Where is the "own accounts only" rule enforced?
4. What is reused when the voice assistant arrives?
`,
  answerTemplate: `## Experience APIs

## Process APIs

## System APIs

## Interactions & sequence

## Security (own accounts only)

## Reuse for the next channel

## NFRs
`,
  keyPoints: [
    'One Experience API per channel (exp-mobile-banking, exp-chatbot) shaping payloads for each UI; they hold no business logic.',
    'A Process API (prc-customer-accounts) owns the business view: resolve the customer\'s accounts, fetch balances, merge nicknames.',
    'System APIs wrap each back end in canonical, reusable form: sys-core-banking (hides MQ/CICS) and sys-customer-profile (hides the DB schema).',
    'Customer identity comes from the validated token (JWT sub / customer ID claim), never from a path parameter the client can change; ownership is checked in the Process API.',
    'Caching of balances is limited (seconds) because balances change; the main latency lever is parallel calls and a lean core-banking request.',
    'The voice assistant reuses the Process and System APIs unchanged and only adds a new Experience API.',
  ],
  solution: `
**API inventory**

| Layer | API | Key resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-mobile-banking** | \`GET /me/accounts\`, \`GET /me/accounts/{id}/transactions\` | Mobile-shaped payload (all accounts, formatted amounts, nicknames) | Mobile app |
| Experience | **exp-chatbot-banking** | \`GET /me/balance?account=current\` | Short, text-friendly response (one account, sentence-ready fields) | Chatbot platform |
| Process | **prc-customer-accounts** | \`GET /customers/{customerId}/accounts\`, \`GET /customers/{customerId}/accounts/{accountId}/transactions\` | Resolve customer → accounts, call core banking per account in parallel, merge nicknames, enforce ownership | Both Experience APIs (later: voice, open banking) |
| System | **sys-core-banking** | \`GET /accounts/{accountId}/balance\`, \`GET /accounts/{accountId}/transactions\` | Hides MQ request/reply + copybook format, returns canonical JSON | prc-customer-accounts (and future processes) |
| System | **sys-customer-profile** | \`GET /customers/{id}/accounts\`, \`GET /customers/{id}\` | Hides PostgreSQL schema | prc-customer-accounts |

**Application network**

\`\`\`
   [Mobile app]            [Chatbot platform]
        |                          |
 +--------------------+  +----------------------+
 | exp-mobile-banking |  | exp-chatbot-banking  |   Experience
 +---------+----------+  +----------+-----------+
           |                        |
           +-----------+------------+
                       v
           +-------------------------+
           |  prc-customer-accounts  |                Process
           +-----+-------------+-----+
                 |             |
                 v             v
     +----------------+  +----------------------+
     | sys-core-banking|  | sys-customer-profile |     System
     +-------+--------+  +----------+-----------+
             |                      |
       [Mainframe via MQ]     [PostgreSQL]
\`\`\`

**Call sequence — mobile shows balances**
1. App calls \`GET /me/accounts\` on exp-mobile-banking with the customer's OAuth access token.
2. API Manager policy (**JWT Validation** or **OAuth 2.0 token enforcement**) validates the token; the Experience API reads the customer ID from the token claim.
3. exp-mobile-banking calls prc-customer-accounts \`GET /customers/{customerId}/accounts\` (client ID/secret of the Experience API app).
4. Process API calls sys-customer-profile → list of account IDs + nicknames.
5. Process API calls sys-core-banking \`/balance\` for each account **in parallel** (Scatter-Gather or parallel-for-each), with a 500 ms timeout per call.
6. Process API merges into a canonical \`CustomerAccounts\` model; Experience API maps it to the mobile shape.

**Own-accounts-only.** The customer ID is taken from the **token**, not from a URL the client controls (\`/me/...\` at the Experience layer). For account-level calls the Process API checks that the account ID is in the customer's linked accounts before calling core banking — the rule lives in one place, so every channel gets it for free.

**Reuse.** When the voice assistant comes, the team builds only **exp-voice-banking** (short spoken responses). prc-customer-accounts, sys-core-banking and sys-customer-profile are discovered in **Anypoint Exchange** and reused unchanged. The open-banking API will also reuse them, adding consent checks.

**Error handling and NFRs**
- Core banking timeout for one account → return that account with \`balanceAvailable: false\` rather than failing the whole list.
- Map back-end errors to a consistent error model at each layer (System: technical, Process: business, Experience: channel-friendly message).
- **Rate limiting / Spike Control** on sys-core-banking protects the mainframe gateway; **SLA tiers** per consumer app on the Experience APIs.
- Short cache (e.g. 10–30 s) of the profile/account list is safe; balances themselves are only cached a few seconds, if at all.
- Horizontal scaling (multiple replicas/workers) for 600 req/s; monitor p95 per layer in Anypoint Monitoring.
`,
  followUps: [
    { q: 'With only two channels, isn\'t a Process API overkill?', a: 'If the logic is tiny it can be tempting, but the voice assistant and open-banking API are already planned, and ownership checks belong in one shared place. A thin Process API costs one hop (a few ms) and saves duplicating rules in every Experience API.' },
    { q: 'Should the chatbot call exp-mobile-banking instead of having its own Experience API?', a: 'It could if the payload fit, but the chatbot needs a different shape and different SLAs and release cycles. Separate Experience APIs let each channel evolve without breaking the other.' },
    { q: 'Why not let the Experience API call the mainframe directly for speed?', a: 'That would couple every channel to MQ formats and duplicate the integration logic. The System API hides the mainframe once; extra hops are a small latency cost compared with the core-banking call itself.' },
  ],
}
