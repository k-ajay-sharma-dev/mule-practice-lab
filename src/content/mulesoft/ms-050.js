export default {
  id: 'ms-050',
  category: 'mulesoft',
  title: 'OAS 3 or RAML for an API-Led Programme: Tooling Support, APIkit and Mixed Estates',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'oas', 'raml', 'apikit', 'api-design', 'design-center'],
  estMinutes: 15,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which Anypoint capabilities accept OAS 3.0 specs as well as RAML?',
      options: [
        'API Designer / Anypoint Code Builder',
        'Exchange documentation, console and mocking',
        'APIkit for REST scaffolding and validation',
        'API Manager instances and policies',
      ],
      answer: [0, 1, 2, 3],
      explain: 'All of these support both formats; check the docs for exact OAS minor versions before committing.',
    },
    {
      type: 'match',
      prompt: 'Match each RAML construct to its OAS 3 counterpart.',
      pairs: [
        ['`pageable` trait', 'Reusable `components/parameters` referenced with `$ref`'],
        ['RAML types', 'JSON Schema-style `components/schemas`'],
        ['`collection` resource type', 'A convention enforced by governance rules — no template equivalent'],
        ['RAML Library', 'Shared component files referenced via `$ref`'],
      ],
      explain: 'Traits and resource types have no direct OAS equivalent; reuse in OAS is through components and `$ref`.',
    },
    {
      type: 'single',
      prompt: 'A new OAS-based Orders Process API calls an existing RAML-based System API. What breaks?',
      options: [
        'The Process API cannot call it until the System API is converted',
        'Nothing — layers talk over HTTP, and each app is validated against its own spec',
        'APIkit rejects responses from RAML-based APIs',
        'API Manager cannot manage both in one environment',
      ],
      answer: 1,
      explain: 'The format is a design-time concern. The real cost of a mixed estate is duplicated shared definitions, mitigated with shared JSON Schemas.',
    },
    {
      type: 'single',
      prompt: 'What should happen to the six working RAML System APIs?',
      options: [
        'Rewrite them all in OAS now for consistency',
        'Leave them; convert when they next need a major version',
        'Delete them and rebuild from scratch',
        'Freeze them forever',
      ],
      answer: 1,
      explain: 'Rewriting working APIs just for format adds risk and no value; convert at the next major change.',
    },
    {
      type: 'single',
      prompt: 'You use a tool to convert a RAML spec to OAS. How should you treat the output?',
      options: [
        'As final — conversion is lossless',
        'As a draft: verify examples, `required` flags, enums and descriptions, then re-scaffold and run existing tests',
        'Discard it; conversion never works',
        'Publish it straight to Exchange as a new major',
      ],
      answer: 1,
      explain: 'Automated conversion exists but is not lossless, especially around reused fragments and examples.',
    },
    {
      type: 'single',
      prompt: 'Does the APIkit flow naming convention change for OAS specs?',
      options: [
        'Yes, flows are named by `operationId`',
        'No — flows are still named `method:\\resource-path[:content-type]:config`',
        'Yes, OAS apps need no flows',
        'Only for OAS 3.1',
      ],
      answer: 1,
      explain: 'The router behaves the same, and validation raises the same APIKIT error types regardless of spec language.',
    },
  ],
  description: `
A company is starting an API-led programme on Anypoint. Facts:

- Existing in-house teams already write **OpenAPI 3.0** YAML for non-Mule services and want one standard company-wide.
- The MuleSoft partner who built the first 6 System APIs used **RAML 1.0** with a shared library of traits and resource types.
- External partners will consume Experience APIs through a developer portal and generate SDKs.
- Leadership asks: "Can we standardise on OAS 3 for everything new, and what breaks?"

**Questions**
1. How well does Anypoint support OAS 3 across Design Center, Exchange, APIkit and API Manager?
2. What do you lose (or must redesign) moving from RAML 1.0 to OAS 3 for the shared library?
3. Can the existing RAML System APIs coexist with new OAS Process/Experience APIs?
4. What would you recommend, and how would you handle conversion?
`,
  answerTemplate: `## Anypoint support for OAS 3

## What changes vs RAML

## Coexistence across layers

## Recommendation and conversion
`,
  keyPoints: [
    'API Designer / Code Builder, Exchange, the mocking service, APIkit for REST (scaffolding + validation) and API Manager all accept OAS (2.0 and 3.0) as well as RAML.',
    'RAML traits and resource types have no direct OAS equivalent; OAS reuse is via components ($ref to schemas, parameters, responses, securitySchemes).',
    'Layers communicate over HTTP contracts, so a RAML System API and an OAS Process API coexist without issue — the format is a design-time concern.',
    'OAS has the broader external ecosystem (SDK generators, gateways, linters), which matters most for partner-facing Experience APIs.',
    'Automated conversion exists but is not lossless; review converted specs, especially for reused fragments and examples.',
  ],
  solution: `
**Support across the platform**
| Area | RAML 1.0 | OAS 3.0 |
|---|---|---|
| API Designer / Anypoint Code Builder | Yes | Yes (YAML or JSON) |
| Exchange documentation, console, mocking | Yes | Yes |
| APIkit for REST scaffolding and runtime validation | Yes | Yes |
| API Manager instances, policies | Yes | Yes |
| API Governance rulesets | Yes | Yes |

Check the current docs for exact OAS minor versions supported per tool before committing — support has evolved over time (Exchange, for example, accepts OAS 2.0, 3.0 and 3.1).

**What changes moving to OAS**
- **Traits/resource types**: no equivalent. A paging trait becomes reusable \`components/parameters\` (\`page\`, \`pageSize\`) referenced with \`$ref\` on each operation. A "collection" resource type becomes a convention plus governance rules rather than a template.
- **Types**: RAML types become JSON Schema-style \`components/schemas\`; inheritance and unions map to \`allOf\`/\`oneOf\`.
- **Libraries**: replaced by shared component files referenced via \`$ref\`, or simply shared JSON Schemas. RAML fragments are fully supported as spec dependencies. For OAS the docs disagree: Exchange release notes and the API Designer dependency page list OAS 3.0 components and JSON Schema as fragment types, while an older Exchange page says OAS 3.0 components cannot be imported and managed as dependencies, and Studio does not support OAS 3.0 fragments. Test this with your own tools and plan how the shared files are distributed.
- **Security schemes**: OAS has first-class \`securitySchemes\` (apiKey, http, oauth2, openIdConnect), which external tooling understands well.

**Coexistence**
Each layer calls the next over HTTP. A Process API built from an OAS spec calls a System API built from a RAML spec exactly the same way; APIkit validates each app against its own spec. API Manager, Exchange and monitoring do not care which format describes an instance. The real cost of a mixed estate is **duplicated shared definitions** (a RAML library and an OAS components file for the same error model) — mitigate by keeping core schemas as JSON Schema files that both formats can reference.

**Recommendation**
- Standardise on **OAS 3** for new APIs if the wider company already uses it — one language for reviewers, linting and external SDK generation, especially for partner-facing Experience APIs.
- Do **not** rewrite the six working RAML System APIs just for format; convert them when they next need a major version.
- Rebuild the shared library as an OAS components asset plus JSON Schemas; add governance rules to enforce paging and error conventions that RAML previously enforced via resource types.
- If converting, treat tool output as a draft: verify examples, \`required\` flags, enums and descriptions, then re-scaffold and run the existing MUnit/contract tests.
`,
  followUps: [
    {
      q: 'Does APIkit validate request bodies against OAS schemas the same way as RAML types?',
      a: 'Yes, APIkit for REST validates bodies, query/URI params and headers against the spec and raises the same APIKIT error types (e.g. BAD_REQUEST) regardless of the spec language.',
    },
    {
      q: 'Is the APIkit flow naming convention different for OAS specs?',
      a: 'No. Flows are still named method:\\resource-path[:content-type]:config, so the router behaves the same way.',
    },
    {
      q: 'Why might a partner portal prefer OAS?',
      a: 'Most third-party SDK generators, API gateways and testing tools consume OAS natively, so partners can generate clients and tests without RAML-specific tooling.',
    },
  ],
}
