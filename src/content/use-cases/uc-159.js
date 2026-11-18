import { diagram } from '../../arch/dsl.js'

const tokens = { type: 'external-api', label: 'token' }
const links = { name: 'link requests', from: 'mobile-app', rps: 300, to: [tokens, 'database'], kind: 'read' }
const downloads = { name: 'statement downloads', from: 'mobile-app', rps: 300, to: 'azure-blob', kind: 'read' }

export default {
  id: 'uc-159',
  category: 'use-cases',
  title: 'Month End Statement Downloads: Mule Hands Out Short Lived Read Links, and the PDFs Go Straight From Azure Blob Storage to the App',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'sas', 'jwt', 'sizing', 'banking', 'mobile'],
  estMinutes: 30,
  diagram: {
    task: 'draw the banking app calling an API gateway that checks tokens, then a statements Experience API. It checks the statement belongs to the customer in the statements database through a System API, and asks the storage token service for a read link through another System API. The app then downloads the PDF directly from Azure Blob Storage.',
    checks: [
      { label: 'The app comes in through the API gateway', rule: { type: 'edge', from: 'mobile-app', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The app downloads statements directly from Azure Blob Storage', rule: { type: 'edge', from: 'mobile-app', to: 'azure-blob' } },
      { label: 'No Mule API fetches the PDFs', rule: { type: 'no-path', from: 'experience-api', to: 'azure-blob' } },
      { label: 'The token service is reached only through a System API', rule: { type: 'only-via', target: tokens, from: 'system-api' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Banking app'],
        gw: ['api-gateway', 'API gateway', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-statements', { vCores: '1' }],
        sysS: ['system-api', 'sys-statements', { vCores: '1' }],
        db: ['database', 'Statements database'],
        sysT: ['system-api', 'sys-storage-tokens', { vCores: '1' }],
        tok: ['external-api', 'Storage token service'],
        blob: ['azure-blob', 'statements container'],
      },
      ['app -> gw', 'gw -> exp', 'exp -> sysS', 'sysS -> db', 'exp -> sysT', 'sysT -> tok', 'app -> blob'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 20 },
        { match: tokens, latencyMs: 30 },
        { match: 'azure-blob', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'Statements day',
          about: 'Customers ask for 300 links a second and download 300 PDFs a second. Links come back within half a second, and no download passes through Mule.',
          traffic: [links, downloads],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'link requests', minSuccess: 0.99, maxMs: 500 }, { flow: 'statement downloads', minSuccess: 0.99 }],
            notReached: [{ flow: 'statement downloads', node: 'experience-api' }],
          },
        },
        {
          name: 'A request without a token',
          about: 'A script asks for links without a customer\'s token. The gateway refuses it and no link is made.',
          traffic: [{ ...links, name: 'no token', rps: 5, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no token', minRefused: 0.99 }], notReached: [{ flow: 'no token', node: tokens }] },
        },
      ],
    },
  },
  description: `
Oakhurst Bank, a fictional bank, publishes monthly statements as PDFs in an **Azure Blob Storage** container. On statements day customers open the **banking app** in large numbers.

Today the app downloads each PDF through Mule, which reads it from storage and passes it on. On statements day the Mule workers ran out of memory and the app failed for an hour.

The architects decided that Mule should only hand out **read links**: shared access signature (SAS) URLs for one blob, read only, valid for 15 minutes. The bank's **storage token service** signs them, so Mule never holds the storage key. The app then downloads straight from storage.

**Numbers**
- On statements day about **300 link requests a second** and **300 downloads a second**.
- The statements database answers in about 20 ms, the token service in 30 ms.
- In this model one vCore serves about 500 requests a second, and the smallest size is 0.1 vCore.

**Questions:**
- Draw the design.
- Why does the PDF not pass through Mule any more?
- What must Mule check before it asks for a link?
- How big must the APIs be for statements day?
`,
  answerTemplate: `## Design

## Downloads

## Checks before a link

## Sizing
`,
  keyPoints: [
    'A read link lets the app fetch one blob straight from storage. Mule handles a few hundred bytes per request instead of whole PDFs.',
    'The link is a credential for its lifetime, so Mule checks first that the statement belongs to the customer in the token, and returns 404 otherwise.',
    'The gateway checks the customer\'s JWT, so only signed-in customers reach the Experience API.',
    'The key that signs links stays in the token service. Mule asks for a link to one blob with read rights and a short life.',
    '300 link requests a second needs more than the smallest size: 1 vCore for the Experience API and each System API leaves room.',
  ],
  solution: `
**Design**
\`\`\`
Banking app ─► API gateway (JWT) ─► exp-statements ─► sys-statements ─► Statements database
     │                                    └─► sys-storage-tokens ─► Storage token service
     └──────────────────────────────────────────────────────────────► statements container (direct download)
\`\`\`

**A link.** The Experience API looks the statement up by its ID and the customer ID from the token. If it is not the customer's, 404. Otherwise it asks for a read link to that blob for 15 minutes and returns \`{ url, expiresAt }\`.

**Downloads.** The app opens the URL. Storage serves the PDF, which it is built to do at scale.

**Sizing.** 300 a second on 0.1 vCore (about 50 a second) would fail most requests. 1 vCore for each of the three APIs serves about 500 a second.

**Logging.** Log the statement and customer IDs, never the link.
`,
  followUps: [
    {
      q: 'What if the token service is down?',
      a: 'No links can be made, so the app shows "try again shortly". Statements are not urgent. The token service needs its own monitoring and two instances.',
    },
    {
      q: 'Could a CDN sit in front of storage?',
      a: 'It can, but each statement is private and read once or twice, so caching gains little. Serving files at this rate is what blob storage is built for.',
    },
  ],
}
