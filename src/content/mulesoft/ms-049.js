export default {
  id: 'ms-049',
  category: 'mulesoft',
  title: 'Shared RAML Libraries and Fragments in Exchange Across System, Process and Experience APIs',
  level: 'ADVANCED',
  tags: ['api-led', 'raml', 'raml-fragments', 'exchange', 'reuse', 'governance'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Why bundle the Error type, `pageable` trait and security scheme into a RAML **Library** rather than separate single fragments?',
      options: [
        'Libraries are the only fragments Exchange accepts',
        'A Library holds many types, traits, resource types and security schemes under a namespace (`uses: common: ...`), avoiding name collisions',
        'Libraries enforce security at runtime',
        'Single fragments cannot be versioned',
      ],
      answer: 1,
      explain: 'A Trait fragment holds exactly one trait and is `!include`d; a Library groups related definitions, and the `common.` namespace keeps them distinct from a spec\'s own `Error` type.',
    },
    {
      type: 'single',
      prompt: 'The team publishes `common-api-lib` 1.1.0. What happens to the 18 specs depending on 1.0.0?',
      options: [
        'They pick up 1.1.0 automatically on the next build',
        'Nothing changes until each spec owner bumps the dependency — specs reference an exact version',
        'Exchange deprecates 1.0.0 and the specs fail to validate',
        'Only specs in the same business group update',
      ],
      answer: 1,
      explain: 'The `exchange_modules` path is pinned to an exact asset version; upgrading is an explicit change.',
    },
    {
      type: 'match',
      prompt: 'Match each library change to its version bump.',
      pairs: [
        ['Add a new optional correlation-ID header trait', 'Minor'],
        ['Rename `pageSize` to `size` in the `pageable` trait', 'Major'],
        ['Fix a typo in a trait description', 'Patch'],
      ],
      explain: 'Renaming or removing, or making something required, can break every API that adopts it — that is a major.',
    },
    {
      type: 'single',
      prompt: 'A team copied the System API `Customer` type into its mobile Experience API and it drifted. What is the best guidance?',
      options: [
        'Always share the System API type everywhere so it cannot drift',
        'Share cross-cutting definitions everywhere, but let Experience APIs define consumer-shaped types and map them — drift is fine only if it is a deliberate consumer view',
        'Ban domain types from all specs',
        'Move the type into API Manager',
      ],
      answer: 1,
      explain: 'Sharing the System type into the Experience layer couples the mobile contract to the CRM\'s shape — exactly what API-led layering prevents.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Order the rollout steps for the common library.',
      items: [
        'Agree the standard in an architecture review and publish `common-api-lib` 1.0.0',
        'Make it mandatory for new specs and add it to the API template',
        'Migrate existing APIs when they next change',
        'Enforce conformance with an API Governance ruleset',
      ],
      explain: 'Adopt in new specs first and migrate existing ones on their next release, so none of the 18 APIs breaks.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Does the `clientIdEnforcement` security scheme in the library enforce client credentials at runtime?',
      options: [
        'Yes, APIkit rejects calls without `client_id`',
        'No — it documents the contract; enforcement comes from API Manager policies or the implementation',
        'Yes, Exchange blocks calls without credentials',
        'Only on CloudHub 2.0',
      ],
      answer: 1,
      explain: 'RAML security schemes describe security; a Client ID Enforcement policy (or OAuth/JWT policy) enforces it.',
    },
  ],
  description: `
Your programme has 18 APIs across three layers. An audit finds:

- Five different error response shapes (\`{error}\`, \`{errors:[...]}\`, \`{message, status}\`...).
- Pagination named \`page/size\` in some System APIs and \`offset/limit\` in others.
- Every spec declares its own copy of a "client-id-required" security scheme.
- One team copied the \`Customer\` type into its Experience API and it has drifted from the System API.

The architect wants a **common API library** in Exchange.

**Questions**
1. Which RAML fragment types and/or a library would you create, and what goes into each?
2. Show a short RAML library and how an API spec consumes it from Exchange.
3. How are fragment versions managed, and what happens when the library changes?
4. Should the \`Customer\` type be shared from System to Experience APIs? Discuss the trade-off.
5. How do you roll this out without breaking 18 existing APIs?
`,
  answerTemplate: `## Fragment and library design

## Library example and consumption

## Versioning the shared assets

## Sharing domain types across layers

## Rollout plan
`,
  keyPoints: [
    'RAML 1.0 fragments (DataType, Trait, ResourceType, SecurityScheme, NamedExample, DocumentationItem, Library...) are published to Exchange as API spec fragment assets.',
    'A Library bundles related types, traits, resource types and security schemes under a namespace (uses: common: ...), avoiding name collisions.',
    'Specs reference fragments by an exchange_modules path pinned to an exact asset version; upgrading is an explicit dependency change, not automatic.',
    'Cross-cutting concerns (errors, paging, security, headers) are safe to share everywhere; domain types are shared carefully because coupling layers defeats API-led isolation.',
    'Roll out with a 1.0.0 library, adopt it in new specs first, and migrate existing APIs on their next minor/major release; enforce with governance rulesets.',
  ],
  solution: `
**What to create** (one library is usually simplest for cross-cutting concerns):

| Asset | Fragment type | Contents |
|---|---|---|
| \`common-api-lib\` | \`#%RAML 1.0 Library\` | \`Error\` type, \`pageable\` trait, standard error responses trait, \`clientIdEnforcement\` security scheme, correlation-ID header trait |
| \`customer-types\` (optional) | \`#%RAML 1.0 DataType\` or Library | Canonical customer types, if the business agrees on one |
| Shared examples | \`#%RAML 1.0 NamedExample\` | Reusable error examples |

\`\`\`raml
#%RAML 1.0 Library
usage: Cross-cutting definitions for all API-led layers
types:
  Error:
    type: object
    properties:
      code: string
      message: string
      correlationId: string
traits:
  pageable:
    queryParameters:
      page:
        type: integer
        minimum: 1
        default: 1
      pageSize:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
  standardErrors:
    responses:
      400:
        body:
          application/json:
            type: Error
      500:
        body:
          application/json:
            type: Error
securitySchemes:
  clientIdEnforcement:
    type: Pass Through
    describedBy:
      headers:
        client_id: string
        client_secret: string
      responses:
        401:
          description: Missing or invalid client credentials
\`\`\`

Consuming it from an Exchange dependency (added in API Designer via "Exchange dependencies"):

\`\`\`raml
#%RAML 1.0
title: Orders Process API
version: v1
uses:
  common: exchange_modules/ORG_ID/common-api-lib/1.0.0/common-api-lib.raml
/orders:
  get:
    is: [ common.pageable, common.standardErrors ]
    securedBy: [ common.clientIdEnforcement ]
\`\`\`

The path is \`exchange_modules/<groupId>/<assetId>/<version>/<file>\`; the group ID is the publishing organisation's (business group's) ID by default, shown here as \`ORG_ID\`. The namespace (\`common.\`) keeps names unique even if the spec has its own \`Error\` type.

**Versioning**
- Fragments are Exchange assets with semantic versions. A spec depends on an **exact version**; publishing \`common-api-lib\` 1.1.0 changes nothing until each spec owner bumps the dependency.
- Additive changes (new optional trait, new optional property) → minor. Renaming/removing or making something required → major, because it can break consumers of every API that adopts it.
- Changing a shared fragment changes the *contract* of each API that upgrades, so the API itself must get the appropriate version bump.

**Sharing domain types across layers**
- Cross-cutting definitions: share everywhere.
- Domain types: sharing \`Customer\` from the System API into the Experience API couples the mobile contract to the CRM's shape — exactly what API-led layering is meant to prevent. Prefer: a canonical type shared between System and Process layers if the organisation genuinely has one, while Experience APIs define their own consumer-shaped types and map in the Process/Experience implementation. The "drift" found in the audit is acceptable only if it is a deliberate consumer view, not an accidental copy.

**Rollout**
1. Agree the standard (error shape, paging names) in an architecture review; publish \`common-api-lib\` 1.0.0.
2. Make it mandatory for new specs; add it to the API template project.
3. Migrate existing APIs when they next change; for a breaking change in error shape that means a new major version or a transition period.
4. Enforce with an API Governance ruleset (e.g. "responses must use the common Error type"), so conformance is visible in Exchange.
`,
  followUps: [
    {
      q: 'Can you use a RAML library from an OAS spec?',
      a: 'No. OAS reuse is done with $ref to components or to JSON Schema files; teams mixing formats usually share JSON Schemas, which both RAML and OAS can reference.',
    },
    {
      q: 'What is the difference between a Trait fragment and a Library?',
      a: 'A Trait fragment contains exactly one trait and is referenced with !include; a Library can hold many types, traits, resource types and security schemes under a namespace via uses.',
    },
    {
      q: 'Does a securityScheme in RAML enforce security at runtime?',
      a: 'No. It documents the contract; enforcement comes from API Manager policies (client ID enforcement, OAuth, JWT) or the implementation.',
    },
  ],
}
