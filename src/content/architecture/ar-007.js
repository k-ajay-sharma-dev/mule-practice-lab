import { diagram } from '../../arch/dsl.js'

const CLIENTS = ['mobile-app', 'web-app', 'partner']
const V1 = { type: 'experience-api', label: 'v1' }
const V2 = { type: 'experience-api', label: 'v2' }

export default {
  id: 'ar-007',
  category: 'architecture',
  title: 'API Versioning and Deprecation Strategy',
  level: 'BEGINNER',
  tags: ['versioning', 'deprecation', 'api-lifecycle', 'exchange'],
  estMinutes: 25,
  diagram: {
    task: 'draw v1 and v2 of the Policy Experience API running side by side. Use one Experience API box for each version, with v1 or v2 in its name, and show that both call the same Process API and System API. Connect the mobile app, the broker portal and the partners.',
    checks: [
      { label: 'A Policy Experience API v1 box', rule: { type: 'node', match: V1 } },
      { label: 'A Policy Experience API v2 box', rule: { type: 'node', match: V2 } },
      { label: 'The mobile app, the broker portal and the partners each call the gateway or an Experience API', rule: { type: 'each', of: CLIENTS, min: 3, edgeTo: ['api-gateway', 'experience-api'] } },
      { label: 'The partners can still reach v1 until they migrate', rule: { type: 'path', from: 'partner', to: V1 } },
      { label: 'Clients can reach v2', rule: { type: 'path', from: CLIENTS, to: V2 } },
      { label: 'Every Experience API version calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Both versions share one Process API, so v1 is only an older mapping', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'The Process API calls the System API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api' } },
      { label: 'The System API connects to the policy system', rule: { type: 'each', of: 'system-api', edgeTo: ['legacy', 'database', 'erp', 'saas', 'oracle-db', 'sql-server'] } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'APIs call each other with sync calls', rule: { type: 'lines', from: [...CLIENTS, 'api-gateway', 'experience-api', 'process-api'], to: ['api-gateway', 'experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app (old and new releases)'],
        brk: ['web-app', 'Broker portal'],
        ptn: ['partner', '14 broker partners'],
        gw: ['api-gateway', 'API Manager: separate v1 and v2 instances', { auth: 'client-id' }],
        v1: ['experience-api', 'Policy Experience API v1 (deprecated, Sunset header)'],
        v2: ['experience-api', 'Policy Experience API v2', { vCores: '0.5' }],
        prc: ['process-api', 'prc-policy-api'],
        sys: ['system-api', 'sys-policy-api'],
        pas: ['legacy', 'Policy administration system'],
      },
      ['mob -> gw', 'brk -> gw', 'ptn -> gw', 'gw -> v1', 'gw -> v2', 'v1 -> prc', 'v2 -> prc', 'prc -> sys', 'sys -> pas'],
    ),
    simulation: {
      tests: [
        {
          name: 'Mobile app and broker portal move to v2',
          about: 'The mobile app sends 120 requests a second and the broker portal 30, all to v2. The v2 instance must answer them all, and the APIs stay inside the 1.5 vCore budget.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 120, to: V2 },
            { name: 'brokers', from: 'web-app', rps: 30, to: V2 },
          ],
          expect: { answers: [{ minSuccess: 0.99 }], vCores: { max: 1.5 } },
        },
        {
          name: 'Partners stay on v1',
          about: 'The partners send 15 requests a second to v1 with their registered client IDs, and they are answered. A caller with no client ID sends 5 a second and is refused.',
          traffic: [
            { name: 'partners', from: 'partner', rps: 15, to: V1 },
            { name: 'unknown caller', from: 'partner', rps: 5, to: V1, auth: 'none' },
          ],
          expect: { answers: [{ flow: 'partners', minSuccess: 0.99 }, { flow: 'unknown caller', minRefused: 0.99 }] },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'match',
      prompt: 'Match each proposed change to the version it leads to (current: 1.4.2, /v1).',
      pairs: [
        ['Add an optional riskScore field to the response', 'Minor: 1.5.0, still /v1'],
        ['Rename holderName to a structured holder object', 'Major: v2'],
        ['Fix a typo in the API description', 'Patch: 1.4.3'],
      ],
      explain: 'Adding an optional field is additive, so tolerant clients keep working. Removing or renaming a field breaks existing clients and needs a new major version.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Making `effectiveDate` a required query parameter on search is…',
      options: [
        'Non-breaking, because it only adds a parameter',
        'Breaking, because old requests without it now get 400',
        'Non-breaking, if the Exchange asset gets a new minor version',
        'Breaking only for clients that send no other query parameters',
      ],
      answer: 1,
      explain: 'Old clients send requests without the parameter; making it required turns valid requests into errors. Keeping it optional with a default is the additive alternative.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Where does the version appear?',
      options: [
        'Full semver in the URL, e.g. /policies/v1.5.0',
        'Major version in the URL path; full semver as the Exchange asset version',
        'Major and minor version in the URL, e.g. /policies/v1.5; patch only in Exchange',
        'In the Exchange asset version, with no version segment in the URL',
      ],
      answer: 1,
      explain: 'Only breaking changes should force consumers to change URLs. Minor and patch versions are tracked on the Exchange asset (contract) and never change the URL. A minor version in the URL makes every additive release a URL change for every partner. With no version in the URL, a breaking v2 cannot run next to v1 on its own path.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do you run v1 and v2 side by side at low cost?',
      options: [
        'Fork the whole stack, with separate Process and System APIs for v2',
        'Separate API Manager instances for v1 and v2, both calling the same Process and System APIs',
        'One API instance with a Choice router on a version query parameter',
        'Retire the v1 implementation and let the gateway rewrite v1 paths to v2',
      ],
      answer: 1,
      explain: 'Separate instances give each version its own policies and client contracts. Sharing the lower layers keeps the cost of the old version small: v1 is only an older mapping in the Experience layer. Forking the whole stack doubles the cost for a change that lives only at the edge. One instance with a Choice router cannot give v1 and v2 their own policies, contracts and analytics. A path rewrite sends old requests to v2, whose breaking contract old clients cannot read.',
    },
    {
      type: 'order',
      prompt: 'Put the deprecation steps for v1 in order.',
      items: [
        'Publish v2 and mark v1 as deprecated in Exchange and API Manager',
        'Announce a sunset date aligned to the partners\' release cycle',
        'Return Deprecation and Sunset headers on v1 responses',
        'Use API Manager analytics per client app to contact who still calls v1',
        'Run brown-out tests, then remove the v1 instance',
      ],
      explain: 'A sunset date means little until v2 exists to move to. The Sunset header carries that date, so the date must be set first. Analytics then show who still calls v1 after the notice, and only then is v1 switched off. Partners releasing twice a year need about two release cycles of notice.',
    },
    {
      type: 'single',
      prompt: 'An API used by external partners must replace the field `holderName` with a new `holder` object. The owners want to avoid adding another live major version. What should they do?',
      options: [
        'Add `holder` in v1 and keep `holderName` as deprecated',
        'Rename the field in v1 and publish it as a patch version',
        'Publish v2 with `holder` and retire v1 after a short notice',
        'Replace `holderName` in v1 and announce it in the changelog',
      ],
      answer: 0,
      explain: 'Adding the new field is an additive change, so clients that read the old field keep working. Every URL version is another contract to secure, monitor and support. A policy of at most two live major versions also helps, and so do contract tests in CI that fail a breaking diff without a major bump.',
    },
  ],
  description: `
An insurance company exposes a **Policy Experience API** (\`/policies\`) used by its own mobile app, a broker portal and **14 external broker partners**. The API is published in Exchange as version \`1.4.2\` and the URL is \`https://api.harborline-insurance.example/policies/v1\`.

The product team now wants to:
1. Add an optional \`riskScore\` field to the policy response.
2. Rename \`holderName\` to a structured \`holder { firstName, lastName }\` object.
3. Make \`effectiveDate\` a **required** query parameter on the search endpoint.

Constraints: partners release their software only **twice a year**; the mobile app has users on old versions for months; operations does not want to run many versions forever.

Traffic once v2 is live: the mobile app sends **120 requests a second** and the broker portal **30**, both to v2. The partners still send **15 a second** to v1 until they migrate. Every caller must present a registered **client ID**. The budget for the APIs is **1.5 vCores**.

**Questions:**
- Which of the three changes are breaking, and what version number does each lead to?
- Where does the version live (URL, header, Exchange asset version), and why?
- How do you run v1 and v2 side by side and then retire v1 safely?
`,
  answerTemplate: `## Breaking vs non-breaking changes

## Where the version lives

## Running versions side by side

## Deprecation and retirement plan
`,
  keyPoints: [
    'Adding an optional response field is non-breaking (minor version, e.g. 1.5.0); renaming a field and adding a required parameter are breaking (new major, v2).',
    'Only the major version appears in the URL (/v1, /v2); minor/patch versions are tracked as the Exchange asset version (semantic versioning).',
    'v1 and v2 run as separate API instances in API Manager, ideally backed by the same Process/System APIs so only the Experience mapping differs.',
    'Deprecation is communicated with a dated sunset policy (e.g. 6 to 12 months), Exchange/API Manager deprecation status, and Deprecation/Sunset response headers.',
    'Retirement is driven by data: API analytics show which client apps still call v1, and those owners are contacted before shutdown.',
    'Size each version for its own traffic: v2 carries 150 requests a second and needs 0.5 vCore, while v1 with 15 a second stays on 0.1 vCore. Client ID enforcement on both instances refuses unknown callers.',
  ],
  solution: `
**Breaking vs non-breaking.**
| Change | Breaking? | Result |
|---|---|---|
| Add optional \`riskScore\` | No: tolerant readers ignore unknown fields | Minor: \`1.5.0\`, still \`/v1\` |
| Rename \`holderName\` → \`holder\` object | Yes: existing clients lose a field | Major: \`v2\` |
| Make \`effectiveDate\` required | Yes: old requests now get 400 | Major: \`v2\` (or keep optional with a default in v1) |

A useful trick: avoid breaking changes where you can. For the rename you could *add* \`holder\` in v1 and keep \`holderName\` (deprecated): a minor change. Only bundle into v2 what truly cannot be done additively.

**Where the version lives.**
- **Major version in the URL path** (\`/policies/v2\`). It is visible, routes cleanly at the gateway, shows up in logs and analytics, and is clear for partners. Header- or media-type-based versioning is cleaner in theory but harder for partners and caches.
- **Exchange asset version** uses semver (\`2.0.0\`, \`2.1.0\`) for the contract (RAML/OAS). Minor/patch never change the URL.
- Document a compatibility rule: "within a major version we only add optional fields and endpoints; clients must ignore unknown fields."

**Side by side.** Create a **separate API instance** in API Manager for v2 (own policies, own client contracts). Implementation options: one Mule app serving both base paths, or a second app. Preferably both versions call the **same Process/System APIs**: v1 is only an old mapping in the Experience layer, so the cost of keeping it alive is small.

**Sizing and policies.** Each version is sized for the traffic it carries. v2 takes the mobile app and the broker portal, 150 requests a second, so it gets 0.5 vCore. v1 only serves the 15 partner requests a second, so 0.1 vCore is enough, and the shared Process and System APIs need no copy. That stays well inside the 1.5 vCore budget. Client ID enforcement on the gateway (or on each instance through Autodiscovery) refuses any caller without a registered client ID, and the per-client contracts are what the analytics later use to find who still calls v1.

**Deprecation plan.**
1. Publish v2, mark v1 as **deprecated** in Exchange and in API Manager (stops new client applications from requesting access to v1).
2. Announce a **sunset date** aligned to the partners' release cycle (here ≥ 2 partner releases, ~12 months).
3. Return \`Deprecation\` and \`Sunset\` headers on v1 responses so clients can detect it automatically.
4. Use **API Manager analytics** per client application to see who still calls v1; contact them directly.
5. Brown-out tests (short planned periods of 410/503) near the end, then remove the instance.

**Trade-off.** More versions = more freedom for consumers but more operational cost. A policy of "at most two live majors" keeps the platform manageable.
`,
  followUps: [
    { q: 'Why not version every change with a new URL?', a: 'Every URL version is a separate contract to secure, monitor and support. Additive changes do not break tolerant clients, so they belong in minor versions; only breaking changes justify a new major.' },
    { q: 'A large partner refuses to migrate before the sunset date. What do you do?', a: 'Treat it as a business decision: either extend the date for that client only (keep the instance but block new contracts) with a cost/charge attached, or provide a thin compatibility mapping. Make the exception explicit and time-boxed rather than silently keeping v1 forever.' },
    { q: 'How do you detect accidental breaking changes before release?', a: 'Contract tests in CI: compare the new spec with the published one (diff tooling, governance rulesets) and run consumer-driven or MUnit tests against v1 examples. A breaking diff without a major version bump fails the build.' },
  ],
}
