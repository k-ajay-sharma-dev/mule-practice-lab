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
        'Publish fragments as versioned Exchange assets and pin each version',
        'Copy the shared types into each API so a change cannot spread',
        'Make every API depend on the latest fragment version, so all stay in step',
        'Keep fragments in a shared Git folder that each API reads',
      ],
      answer: 0,
      explain: 'With semantic versioning and pinned dependencies, consumers upgrade deliberately, and breaking changes go out as a new major version. Copy-pasting is exactly what caused the drift.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A new team writes its API in OAS 3.0 and wants to reuse the `Customer` type from the RAML 1.0 Library fragment that the CoE published to Exchange. What works?',
      options: [
        'Reference the library with `$ref`, as Exchange converts RAML types for OAS specs',
        'Declare the library with `uses:` at the top of the OAS file, as a RAML spec does',
        'Reference only the data types of the library, since only its traits are RAML only',
        'Keep the shared types as JSON Schema files, which RAML and OAS specs can both use',
      ],
      answer: 3,
      explain: 'A spec uses one language, and an OAS spec cannot reference a RAML fragment at all, neither its types nor its traits. Exchange does not convert fragments between languages, and `uses:` is RAML syntax. Types kept as JSON Schema can be used from both kinds of spec, which bridges them.',
    },
    {
      type: 'single',
      prompt: 'A team ports a RAML API that applies a `pageable` trait to 14 GET methods over to OAS 3.0. They want `offset` and `limit` defined once. What do they write?',
      options: [
        'A `pageable` trait under `x-traits`, applied to each GET method with `is:`',
        'A `collection` resource type under `x-resourceTypes` that holds both parameters',
        'Both parameters in `components.parameters`, referenced from each GET with `$ref`',
        'Both parameters once at the root of the file, so every operation inherits them',
      ],
      answer: 2,
      explain: 'OAS reuses parts through `components` (schemas, parameters, responses, securitySchemes) referenced with `$ref`. It has no traits or resource types, and an `x-` extension is only ignored data to tools. OAS can share parameters for all operations of one path, but not for the whole file from its root.',
    },
    {
      type: 'single',
      prompt: 'An API spec is published to Exchange, but nobody has built the implementation yet. A consumer wants to start work now. What can the consumer use?',
      options: [
        'The mocking service and the generated documentation',
        'A CloudHub app that Exchange deployed from the spec',
        'An implementation that APIkit built and deployed by itself',
        'Nothing, because Exchange only stores the spec file',
      ],
      answer: 0,
      explain: 'Publishing gives generated documentation, an API console and a mocking service, so consumers can start before implementation. It also gives a versioned contract for API Manager instances and client access requests. Exchange does not deploy anything. APIkit can scaffold the implementation from the spec, but you still build and deploy it.',
    },
    {
      type: 'single',
      prompt: 'Which change to a shared `Customer` type requires a **new major** version?',
      options: [
        'Making an optional field required',
        'Adding a new optional field with a default value',
        'Adding a new `LoyaltyCard` type to the same library',
        'Marking a field as deprecated in its description, but keeping it',
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
- **Trait** \`pageable\`: standard query params and response headers.
- **ResourceType** \`collection\` / \`item\`: standard GET/POST/PUT/DELETE shapes and error responses.
- **DataType / Library**: \`Customer\`, \`Address\`, \`Error\` types in a \`common-types\` library.
- **Example / NamedExample** fragments for documentation and mocks.
- **SecurityScheme**: e.g. client ID headers or OAuth 2.0.

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

**OAS reuse:** \`components\` (\`schemas\`, \`parameters\`, \`responses\`, \`securitySchemes\`) referenced via \`$ref\`: locally or from external files/Exchange dependencies. There's no direct equivalent of traits/resource types; pagination is a set of reusable \`parameters\` you reference on each operation.

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
