export default {
  id: 'ms-022',
  category: 'mulesoft',
  title: 'API Specs: RAML vs OAS, Fragments and Reuse in Exchange',
  level: 'ADVANCED',
  tags: ['raml', 'oas', 'design-center', 'exchange', 'api-design'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each CoE standard to the RAML fragment type.',
      pairs: [
        ['Standard `offset` / `limit` query params on GET methods', 'Trait'],
        ['Standard collection/item shapes for GET/POST/PUT/DELETE', 'ResourceType'],
        ['`Customer`, `Address` and `Error` types under one namespace', 'Library'],
        ['Client ID headers or OAuth 2.0 definition', 'SecurityScheme'],
      ],
      explain: 'Traits add reusable method behaviour (applied with `is: [pageable]`); resource types template whole resources; libraries bundle types under a namespace; security schemes describe auth.',
    },
    {
      type: 'single',
      prompt: 'A team changed a shared type and broke three APIs overnight. What prevents this?',
      options: [
        'Publish fragments to Exchange as versioned assets, pin consumers to a version, and release breaking changes as a new major version',
        'Copy the types into each API so changes cannot spread',
        'Always use the latest fragment version automatically',
        'Store fragments in a shared network folder',
      ],
      answer: 0,
      explain: 'With semantic versioning and pinned dependencies, consumers upgrade deliberately. Copy-pasting is exactly what caused the drift.',
    },
    {
      type: 'single',
      prompt: 'Can an OAS 3.0 spec reference a RAML 1.0 Library fragment from Exchange?',
      options: [
        'No — a spec uses one language and RAML fragments cannot be referenced from OAS (or vice versa)',
        'Yes — Design Center converts it automatically',
        'Yes, with `uses:` in the OAS file',
        'Only for data types, not traits',
      ],
      answer: 0,
      explain: 'You can mix languages **across** APIs, but not share fragments between them; shared types as JSON Schema are one way to bridge both.',
    },
    {
      type: 'single',
      prompt: 'What is the OAS 3.0 mechanism for reusing pagination parameters?',
      options: [
        'Reusable `components.parameters` referenced with `$ref` on each operation',
        'Traits, exactly as in RAML',
        'Resource types',
        'Overlays applied by API Manager',
      ],
      answer: 0,
      explain: 'OAS has `components` (schemas, parameters, responses, securitySchemes) referenced with `$ref`, but no direct equivalent of traits or resource types.',
    },
    {
      type: 'multi',
      prompt: 'What do you get once an API spec is published to Exchange?',
      options: [
        'Generated documentation and an API console',
        'A mocking service so consumers can start before implementation',
        'A versioned contract for API Manager instances and client access requests',
        'Automatic deployment of an implementation to CloudHub',
      ],
      answer: [0, 1, 2],
      explain: 'Exchange does not deploy anything; APIkit can scaffold the implementation from the spec, but you still build and deploy it.',
    },
    {
      type: 'single',
      prompt: 'Which change to a shared `Customer` type requires a **new major** version?',
      options: [
        'Making an optional field required',
        'Adding a new optional field',
        'Adding an example',
        'Improving a description',
      ],
      answer: 0,
      explain: 'Renaming/removing fields or making an optional field required breaks existing consumers. Compatible additions are a minor version.',
    },
  ],
  description: `
Your Integration CoE is defining standards for **60+ APIs** across business groups. Today every team writes its own specs in Design Center:

- Pagination is described differently in each API (\`page/size\`, \`offset/limit\`, \`start/count\`).
- The \`Customer\` and \`Address\` types are copy-pasted and have drifted apart.
- Error responses differ per API.
- Some new teams want to use **OpenAPI 3.0**, while existing APIs are in **RAML 1.0**.
- A team changed a shared type and broke the build of three other APIs overnight.

**Questions**
1. Compare RAML 1.0 and OAS 3.0 in the context of Anypoint Platform. Can you mix them?
2. Which RAML fragment types would you create for pagination, common types and error responses? Sketch a trait.
3. How are fragments published, versioned and consumed? How do you prevent the "overnight break"?
4. What is the equivalent reuse mechanism in OAS 3.0?
5. What do you get "for free" once the spec is in Exchange?
`,
  answerTemplate: `## RAML vs OAS

## Fragments

## Publishing and versioning

## Reuse in OAS

## Benefits of Exchange
`,
  keyPoints: [
    'Anypoint supports both RAML 1.0 and OAS (2.0/3.0) for design, mocking, Exchange and APIkit scaffolding; pick one standard per API, each with trade-offs.',
    'RAML fragment types: Trait (e.g. pageable), ResourceType (collection/item), DataType, Library, Example, SecurityScheme.',
    'Fragments are published to Exchange as versioned assets and added as dependencies in Design Center, pinned to a version.',
    'Semantic versioning: breaking changes require a new major version; consumers upgrade explicitly, preventing surprise breaks.',
    'OAS reuse: components (schemas, parameters, responses) referenced with $ref, including external files/Exchange dependencies.',
    'Exchange gives mocking, documentation/API console, discoverability, and a contract for API Manager/client applications; governance rulesets can check specs.',
  ],
  solution: `
**RAML vs OAS:** both are first-class in Anypoint: API Designer, the mocking service, Exchange portals and APIkit scaffolding support RAML 1.0 and OAS 3.0 (and OAS 2.0). RAML's strengths are its reuse constructs (traits, resource types, libraries) and readability; OAS is the industry standard with broad tooling and familiarity outside MuleSoft. A single API spec uses one language; you can mix *across* APIs, but shared fragments written in RAML can't be referenced from an OAS spec and vice versa. So the CoE should pick a primary standard (or maintain shared types as JSON Schema usable from both).

**Fragments (RAML)**
- **Trait** \`pageable\` — standard query params and response headers.
- **ResourceType** \`collection\` / \`item\` — standard GET/POST/PUT/DELETE shapes and error responses.
- **DataType / Library** — \`Customer\`, \`Address\`, \`Error\` types in a \`common-types\` library.
- **Example / NamedExample** fragments for documentation and mocks.
- **SecurityScheme** — e.g. client ID headers or OAuth 2.0.

\`\`\`yaml
#%RAML 1.0 Trait
queryParameters:
  offset: { type: integer, minimum: 0, default: 0 }
  limit:  { type: integer, minimum: 1, maximum: 200, default: 50 }
responses:
  200:
    headers:
      X-Total-Count: integer
\`\`\`
Applied as \`is: [pageable]\` on a method.

**Publishing and versioning:** fragments are **published to Exchange** as their own assets (\`acme-common-types:1.2.0\`). API specs add them as **dependencies** in Design Center and reference them with \`exchange_modules/...\` paths, pinned to a version. Use **semantic versioning**: compatible additions → minor; breaking changes (renaming/removing fields, making optional required) → **new major**. Consumers upgrade deliberately, so a fragment change can't silently break other APIs. Add API Governance rulesets / reviews to the publishing process.

**OAS reuse:** \`components\` (\`schemas\`, \`parameters\`, \`responses\`, \`securitySchemes\`) referenced via \`$ref\` — locally or from external files/Exchange dependencies. There's no direct equivalent of traits/resource types; pagination is a set of reusable \`parameters\` you reference on each operation.

**Benefits of Exchange:**

- auto-generated documentation and API console
- a **mocking service** so consumers can start before implementation
- discoverability and ratings
- versioned contract for **API Manager** instances and **client application** access requests
- APIkit scaffolding of the implementation from the spec
`,
  followUps: [
    {
      q: 'How do you change an API spec without breaking the running implementation?',
      a: 'Make backward-compatible changes in a minor version, update the APIkit project\'s spec dependency, re-scaffold if needed, and keep the old major version deployed until consumers migrate.',
    },
    {
      q: 'What does APIkit do with the spec at runtime?',
      a: 'The APIkit Router validates requests against the spec (paths, methods, query params, headers, body) and routes to the generated flow, raising APIKIT errors such as BAD_REQUEST or NOT_FOUND when validation fails.',
    },
    {
      q: 'What is the difference between a Library and a DataType fragment?',
      a: 'A DataType fragment defines one type, while a Library bundles several types, traits, resource types, etc. under a namespace (used via uses: and lib.Type), which avoids name collisions.',
    },
  ],
}
