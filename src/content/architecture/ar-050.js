export default {
  id: 'ar-050',
  category: 'architecture',
  title: 'Naming Conventions and Resource Modelling per Layer',
  level: 'BEGINNER',
  tags: ['api-led', 'naming-conventions', 'resource-modelling', 'rest', 'exchange'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A company names Exchange assets with the pattern `<layer>-<system or domain>-<entity>-api`, and only System APIs keep the system name. Its order fulfilment Process API runs on top of SAP. Which asset name follows the standard?',
      options: [
        '`prc-order-fulfilment-api`',
        '`prc-sap-order-fulfilment-api`',
        '`prc-order-fulfilment-api-v2`',
        '`prc-order-fulfilment-api-prod`',
      ],
      answer: 0,
      explain: 'Process names must be backend-agnostic, so "sap" does not belong. The major version belongs in the asset version and base path, and the environment is never part of the asset name. System API names do keep the system, as in `sys-sap-order-api`, and Experience API names show the consumer, as in `exp-mobile-api`.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The Order System API needs a breaking change. How is v2 published?',
      options: [
        'As a new Exchange asset called sys-sap-order-api-v2',
        'As major version 2.0.0 of the same asset, with /api/v2 in the base path',
        'By overwriting 1.x in place',
        'By adding a `version` query parameter',
      ],
      answer: 1,
      explain: 'Semantic versioning on one asset keeps history and consumers together; the major version appears in the base path.',
    },
    {
      type: 'single',
      prompt: 'Where does the environment (dev, qa, prod) appear?',
      options: [
        'In the Exchange asset name',
        'Not in the asset name — API Manager instances are per environment, though deployed app names often get a suffix for uniqueness (sys-sap-order-api-dev)',
        'In every URI path',
        'In the RAML title',
      ],
      answer: 1,
      explain: 'One spec, one asset; the environment is an attribute of the instance and deployment, not of the API design.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which System API resource is modelled best?',
      options: [
        'GET /bapi-salesorder-getlist',
        'GET /getOrders?VBELN=0000012345',
        'GET /orders/{orderId}/lines',
        'POST /orders/query with an SQL body',
      ],
      answer: 2,
      explain: 'Plural nouns, ids in the path and business names. BAPI names and SAP field names belong inside the implementation, not in the contract.',
    },
    {
      type: 'match',
      prompt: 'Match each resource to the layer it belongs to.',
      pairs: [
        ['GET /orders?customerId=&status=&page=', 'System — mirrors the SoR entities, cleanly'],
        ['POST /orders that validates, prices, reserves stock and creates in SAP', 'Process — a business capability'],
        ['GET /me/orders?limit=10', "Experience — the consumer's view, identity from the token"],
      ],
      explain: '`/me` works at the Experience layer because the customer comes from the OAuth token; Process and System resources stay channel-neutral.',
    },
    {
      type: 'single',
      prompt: 'How should "cancel order" be modelled in the Process API?',
      options: ['POST /cancelOrder', 'POST /orders/{orderId}/cancellation', 'GET /orders/{orderId}?action=cancel', 'DELETE /orders'],
      answer: 1,
      explain: 'Non-CRUD actions become sub-resources rather than verbs in the URI; a GET must never change state.',
    },
  ],
  description: `
You are setting standards for a new MuleSoft programme. Teams currently produce names like \`SAPCustomerService\`, \`getOrdersAPI-v2\`, \`mobileapp\`, \`customer_process_new\`.

**Define:**
1. A naming convention for **Exchange assets / API instances / Mule applications** that shows layer, system/domain and entity — with examples for each layer (e.g. \`sys-sap-customer-api\`, \`prc-order-api\`, \`exp-mobile-api\`).
2. How you handle **versions** and **environments** in names (or why you don't).
3. The **resource model** for each layer for an Order domain backed by SAP (orders) and Salesforce (customers): give the main URIs and methods.
4. Two rules that stop System APIs leaking SAP terminology (e.g. \`VBELN\`, \`KUNNR\`, BAPI names) into URIs.
`,
  answerTemplate: `## Naming convention

## Versions and environments

## Resource model per layer

## Keeping SoR terminology out
`,
  keyPoints: [
    'Pattern <layer>-<system or domain>-<entity>-api in lower kebab-case (e.g. sys-sap-order-api, prc-order-fulfilment-api, exp-mobile-api) makes layer and ownership obvious in Exchange and Runtime Manager.',
    'Major version lives in the URI/base path and the asset version, not in the asset name; environment is never part of the asset name (it is an API Manager/Runtime Manager attribute), though the deployed app name may need an env suffix for uniqueness.',
    'System APIs model the system\'s entities as plural noun resources (/orders, /orders/{orderId}/lines) with query parameters for filters; no verbs or BAPI names in URIs.',
    'Process APIs model business capabilities and may use task-style resources for processes (/order-submissions or POST /orders that triggers orchestration).',
    'Experience APIs model the consumer\'s view (/home, /me/orders) and can be screen- or journey-oriented.',
  ],
  solution: `
**Naming convention** (lower kebab-case, consistent across Design Center, Exchange, API Manager and Runtime Manager):

| Layer | Pattern | Examples |
|---|---|---|
| System | \`sys-<system>-<entity-area>-api\` | \`sys-sap-order-api\`, \`sys-sfdc-customer-api\`, \`sys-wms-inventory-api\` |
| Process | \`prc-<business-capability>-api\` | \`prc-order-api\`, \`prc-customer-360-api\`, \`prc-order-fulfilment-api\` |
| Experience | \`exp-<consumer>-<domain?>-api\` | \`exp-mobile-api\`, \`exp-partner-order-api\`, \`exp-web-checkout-api\` |

Some organisations use suffixes (\`customer-sapi\`, \`order-papi\`, \`mobile-eapi\`) — either is fine; **consistency** matters more than the choice. Keep the system name in System APIs (you want to know it wraps SAP) but **not** in Process/Experience names (they must be backend-agnostic).

**Versions and environments.**
- Asset version follows semantic versioning in Exchange (1.2.0); the **major** version appears in the base path: \`/api/v1/orders\`. Do not create \`order-api-v2\` as a separate asset — publish a new major version of the same asset.
- Environment is not part of the API name; API Manager instances are per environment. Deployed application names must often be unique per control plane / domain, so teams commonly suffix the app name: \`sys-sap-order-api-dev\`, \`-qa\`, \`-prod\`.

**Resource model (Order domain).**

\`\`\`
sys-sap-order-api            (System — mirrors the SoR's entities, cleanly)
  GET  /orders?customerId=&status=&fromDate=&page=&pageSize=
  GET  /orders/{orderId}
  GET  /orders/{orderId}/lines
  POST /orders
  PATCH /orders/{orderId}

sys-sfdc-customer-api
  GET  /customers?email=
  GET  /customers/{customerId}

prc-order-api                (Process — business capability)
  POST /orders                 -> validate, price, reserve stock, create in SAP
  GET  /orders/{orderId}       -> order + customer + shipment status aggregated
  POST /orders/{orderId}/cancellation

exp-mobile-api               (Experience — the consumer's view)
  GET  /me/orders?limit=10     -> customer taken from the token, lean payload
  GET  /me/orders/{orderId}
  POST /me/orders
\`\`\`

Notes: plural nouns, IDs in the path, filters/pagination as query parameters, actions that are not CRUD modelled as sub-resources (\`/cancellation\`) instead of verbs (\`/cancelOrder\`). Experience APIs may use \`/me\` because identity comes from the OAuth token.

**Keeping SAP terminology out.**
1. URIs and field names use **business names** (\`orderId\`, \`customerId\`), mapped in the System API's DataWeave from \`VBELN\`/\`KUNNR\`. Reviewed in design review / governance rulesets.
2. **No operation or BAPI names** in the contract (\`/bapi-salesorder-getlist\`); the spec describes resources, and the SAP specifics are an implementation detail inside the System API.

Reusable **RAML fragments / OAS components** (shared data types for \`Order\`, \`Customer\`, error responses, pagination traits) are published to Exchange so every team uses the same shapes.
`,
  followUps: [
    { q: 'Should the Process API be called prc-sap-order-api?', a: 'No. Process APIs must be independent of the backend; putting SAP in the name signals coupling and becomes wrong the day SAP is replaced.' },
    { q: 'How do you enforce naming standards across 20 teams?', a: 'Document them, provide project templates/archetypes, and check them in design reviews and CI; Anypoint API Governance rulesets can also check spec conventions such as kebab-case paths.' },
    { q: 'Is it OK for an Experience API to have screen-oriented resources like /home?', a: 'Yes, in moderation. Experience APIs exist to fit the consumer, and a backend-for-frontend endpoint per screen can reduce round trips on mobile; just keep business logic out of it.' },
  ],
}
