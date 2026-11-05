import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-049',
  category: 'use-cases',
  title: 'API-Led Project 2: Adding a Voice Assistant to an Energy Supplier',
  level: 'BEGINNER',
  tags: ['api-led', 'reuse', 'application-network', 'voice-assistant', 'utilities'],
  estMinutes: 25,
  diagram: {
    task: 'draw the application network after Project 2: the existing web and mobile channels plus the new voice assistant, showing which Experience, Process and System APIs the voice channel reuses (keep the Project 1 API names).',
    checks: [
      { label: 'The voice assistant calls its own new voice Experience API', rule: { type: 'each', of: 'chatbot', edgeTo: { type: 'experience-api', label: ['voice', 'alexa', 'assistant'] } } },
      { label: 'Web, mobile and voice each still enter through an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app', 'chatbot'], min: 3, edgeTo: 'experience-api' } },
      { label: 'The voice Experience API reuses the existing prc-billing-account', rule: { type: 'edge', from: { type: 'experience-api', label: ['voice', 'alexa', 'assistant'] }, to: { type: 'process-api', label: ['billing'] } } },
      { label: 'The voice Experience API reuses the existing prc-meter-reading', rule: { type: 'edge', from: { type: 'experience-api', label: ['voice', 'alexa', 'assistant'] }, to: { type: 'process-api', label: ['meter', 'reading'] } } },
      { label: 'No new Process API — only the two from Project 1', rule: { type: 'node', match: 'process-api', min: 2, max: 2 } },
      { label: 'Next bill date comes from the existing billing System API (minor version)', rule: { type: 'edge', from: { type: 'process-api', label: ['billing'] }, to: { type: 'system-api', label: ['billing'] } } },
      { label: 'Experience APIs never call the SAP System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: { type: 'system-api', label: ['sap', 'isu', 'billing', 'meter'] } } },
      { label: 'SAP IS-U is reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web portal'],
        mob: ['mobile-app', 'Mobile app'],
        voice: ['chatbot', 'Voice platform (Alexa / Google)'],
        ep: ['experience-api', 'exp-customer-portal'],
        emob: ['experience-api', 'exp-customer-mobile'],
        ev: ['experience-api', 'exp-voice-assistant (NEW)'],
        pb: ['process-api', 'prc-billing-account (v1.1)'],
        pm: ['process-api', 'prc-meter-reading'],
        sb: ['system-api', 'sys-sap-isu-billing (v1.1)'],
        sm: ['system-api', 'sys-sap-isu-meters'],
        sid: ['system-api', 'sys-customer-identity'],
        sap: ['erp', 'SAP IS-U'],
        okta: ['identity-provider', 'Okta'],
      },
      [
        'web -> ep', 'mob -> emob', 'voice -> ev', 'ep -> pb', 'ep -> pm', 'emob -> pb', 'emob -> pm', 'ev -> pb', 'ev -> pm', 'ev -> sid',
        'pb -> sb', 'pm -> sm', 'sb -> sap', 'sm -> sap', 'sid -> okta',
      ],
    ),
  },
  description: `
An energy supplier delivered **Project 1** last year: a customer self-service web portal and mobile app. The application network built then is:

| Layer | API | Resources | Consumers today |
|---|---|---|---|
| Experience | exp-customer-portal | \`GET /me/bills\`, \`GET /me/usage\`, \`POST /me/meter-readings\` | Web portal |
| Experience | exp-customer-mobile | \`GET /me/summary\`, \`POST /me/meter-readings\` | Mobile app |
| Process | prc-billing-account | \`GET /accounts/{id}/bills\`, \`GET /accounts/{id}/balance\` | both Experience APIs |
| Process | prc-meter-reading | \`POST /accounts/{id}/readings\` (validates against estimated range, submits) | both Experience APIs |
| System | sys-sap-isu-billing (SAP IS-U) | \`GET /contract-accounts/{id}/invoices\`, \`GET /contract-accounts/{id}/balance\` | prc-billing-account |
| System | sys-sap-isu-meters | \`GET /meters/{id}/estimate\`, \`POST /meters/{id}/readings\` | prc-meter-reading |
| System | sys-customer-identity (Okta) | \`GET /users/{id}\` | Experience APIs |

**Project 2 requirement.** Launch a **voice assistant skill** (Alexa / Google Assistant) so customers can say:
- *"What's my balance?"* Answer in one sentence.
- *"Submit a meter reading of 4 5 2 1 9."* Confirm back.
- *"When is my next bill?"* This is **new**. It needs the next bill date, which no API returns today. SAP IS-U holds it on the contract account's billing schedule.

The voice platform handles account linking with the supplier's identity provider (Okta) over OAuth. Expected volume is small (≤ 5 req/s).

**Questions:**
1. Which existing APIs are reused as-is?
2. Which APIs are new?
3. Which existing APIs change, and does the change need a new **major version**?
4. Show the sequence for "submit a meter reading" via voice.
`,
  answerTemplate: `## Reused as-is

## New APIs

## Changed APIs and versioning

## Interactions & sequence

## Reuse metrics / what this proves

## NFRs
`,
  keyPoints: [
    'Only one new API is strictly required: exp-voice-assistant, shaping short spoken responses for the voice platform.',
    'prc-billing-account, prc-meter-reading and all System APIs are reused; the voice channel inherits their validation and business rules.',
    'The "next bill date" need is met by adding a field/resource to sys-sap-isu-billing and prc-billing-account — a backwards-compatible minor change, not a new major version.',
    'Additive, optional changes (new resource or new field) are non-breaking under semantic versioning; renaming/removing fields or changing types would require v2.',
    'Reuse is measurable: Exchange/API Manager show the new consumer, and Project 2 delivery time drops because most of the network already exists.',
  ],
  solution: `
**Classification**

| API | Status in Project 2 | Why |
|---|---|---|
| exp-customer-portal | Untouched | Not used by voice |
| exp-customer-mobile | Untouched | Not used by voice |
| **exp-voice-assistant** | **NEW** | Voice-specific shaping (short text, SSML-friendly numbers, intent-based resources) |
| prc-billing-account | **Reused + minor change** (v1.1) | Add \`GET /accounts/{id}/next-bill\` (or field \`nextBillDate\`) |
| prc-meter-reading | **Reused as-is** | Same validation rules apply to a spoken reading |
| sys-sap-isu-billing | **Reused + minor change** (v1.1) | Add \`GET /contract-accounts/{id}/billing-schedule\` (reads the IS-U schedule) |
| sys-sap-isu-meters | Reused as-is | — |
| sys-customer-identity | Reused as-is | Map voice account-link token to customer |

**New Experience API: exp-voice-assistant**
- \`GET /me/balance\` → \`{ "speech": "Your balance is 42 pounds 10 in credit." , "amount": 42.10 }\`
- \`GET /me/next-bill\` → next bill date as a spoken sentence.
- \`POST /me/meter-readings\` → submit and confirm.

\`\`\`
 [Web]   [Mobile]    [Voice platform]  <- new channel
   |        |               |
 exp-     exp-        exp-voice-assistant (NEW)         Experience
 portal   mobile            |
   |        |               |
   +--------+-------+-------+
                    v
   prc-billing-account (v1.1)   prc-meter-reading       Process
            |                          |
 sys-sap-isu-billing (v1.1)    sys-sap-isu-meters        System
            |                          |
            +----------[SAP IS-U]------+
\`\`\`

**Sequence — "submit a meter reading of 45219"**
1. Voice platform resolves intent + slot (reading = 45219) and calls exp-voice-assistant \`POST /me/meter-readings\` with the linked-account OAuth token.
2. OAuth 2.0 token enforcement policy validates the token; exp-voice-assistant maps the user to the contract account (via sys-customer-identity or a claim).
3. exp-voice-assistant → prc-meter-reading \`POST /accounts/{id}/readings\` (existing contract).
4. prc-meter-reading → sys-sap-isu-meters: get estimate, validate range, submit reading — **exact same logic as web and mobile**.
5. Response mapped to speech: *"Thanks, I've submitted 45219. Your next bill will use this reading."* If the reading is outside the expected range, the Process API returns its existing business error. The voice API turns it into *"That looks higher than expected — please check and try again."*

**Versioning decisions.**
- Adding a new resource or an **optional** field is backwards-compatible → publish **v1.1** (minor) in Exchange; existing consumers are not affected and keep calling \`/v1\`.
- A major version (v2) would be needed only if the change broke consumers, e.g. renaming \`balance\` to \`amount\` or making a new request field mandatory.

**Reuse proved.** 1 new API, 2 minor updates, 4 APIs reused untouched. Exchange shows exp-voice-assistant as a new consumer of prc-billing-account and prc-meter-reading; API Manager contracts give it its own client ID and SLA tier.

**NFRs.** Voice platforms expect a reply in a few seconds, so set timeouts (e.g. 3 s) and return a friendly fallback sentence on timeout. Log intents but not full meter/account details. Apply a separate rate-limit SLA tier for the voice client app.
`,
  followUps: [
    { q: 'Why not make the voice platform call exp-customer-mobile?', a: 'Its payloads are designed for screens, and coupling the voice skill to it means a mobile change could break voice. A thin dedicated Experience API is cheap because all logic is in the reused Process APIs.' },
    { q: 'Is adding a mandatory query parameter to an existing resource a minor change?', a: 'No — existing consumers would start getting 400 errors. Make it optional with a default, or introduce it in a new major version.' },
    { q: 'How do you show the business the value of reuse?', a: 'Track consumers per API in Exchange/API Manager and compare effort: Project 2 built one API and extended two instead of building a full stack, which is the core argument for API-led connectivity.' },
  ],
}
