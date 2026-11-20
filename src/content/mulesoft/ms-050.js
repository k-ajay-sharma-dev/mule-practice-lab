export default {
  id: 'ms-050',
  category: 'mulesoft',
  title: 'OAS 3 or RAML for an API-Led Programme: Tooling Support, APIkit and Mixed Estates',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'oas', 'raml', 'apikit', 'api-design', 'design-center'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A team that already writes OpenAPI (OAS) 3.0 specs asks whether Anypoint tools accept them as well as RAML. What is the correct answer?',
      options: [
        'Yes, API Designer, Exchange, APIkit and API Manager accept both',
        'Only Exchange accepts OAS 3.0, and the other tools need RAML',
        'API Designer and Exchange accept OAS 3.0, but APIkit needs RAML',
        'APIkit accepts OAS 3.0, but API Manager policies need RAML',
      ],
      answer: 0,
      explain: 'All of these support both formats: API Designer and Anypoint Code Builder, Exchange documentation, console and mocking, APIkit for REST scaffolding and validation, and API Manager instances and policies. Check the docs for exact OAS minor versions before committing.',
    },
    {
      type: 'match',
      prompt: 'Match each RAML construct to its OAS 3 counterpart.',
      pairs: [
        ['`pageable` trait', 'Reusable `components/parameters` referenced with `$ref`'],
        ['RAML types', 'JSON Schema-style `components/schemas`'],
        ['`collection` resource type', 'A convention enforced by governance rules (no template equivalent)'],
        ['RAML Library', 'Shared component files referenced via `$ref`'],
      ],
      explain: 'Traits and resource types have no direct OAS equivalent; reuse in OAS is through components and `$ref`.',
    },
    {
      type: 'single',
      prompt: 'A new OAS-based Orders Process API calls an existing RAML-based System API. What breaks?',
      options: [
        'It cannot call it until the System API is converted to OAS',
        'Nothing; each app is validated against its own spec',
        'APIkit in the Process API rejects the RAML API\'s responses',
        'API Manager cannot hold both formats in one environment',
      ],
      answer: 1,
      explain: 'Layers talk over HTTP, and APIkit validates each app against its own spec. The format is a design-time concern. The real cost of a mixed estate is duplicated shared definitions, mitigated with shared JSON Schemas.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What should happen to the six working RAML System APIs?',
      options: [
        'Rewrite them all in OAS now for consistency',
        'Leave them; convert when they next need a major version',
        'Wrap each in an OAS proxy and retire the RAML specs',
        'Convert them with a tool and publish them as patch versions',
      ],
      answer: 1,
      explain: 'Rewriting working APIs only for format adds risk and no value; convert at the next major change. A converted spec is a contract change, not a patch, and a proxy adds a hop without removing the RAML.',
    },
    {
      type: 'single',
      prompt: 'You use a tool to convert a RAML spec to OAS. How should you treat the output?',
      options: [
        'As final, since RAML to OAS conversion is lossless',
        'As a draft to verify and test before publishing',
        'As unusable, because traits make conversion fail',
        'As a new major version to publish to Exchange directly',
      ],
      answer: 1,
      explain: 'Verify examples, `required` flags, enums and descriptions, then re-scaffold and run the existing tests. Automated conversion exists but is not lossless, especially around reused fragments and examples.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Does the APIkit flow naming convention change for OAS specs?',
      options: [
        'Yes, flows are named by each `operationId`',
        'No, they are still named `method:\\path[:type]:config`',
        'Yes, OAS apps route by tag, with one flow per tag',
        'Only for OAS 3.1, which routes by `operationId`',
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
    'Layers communicate over HTTP contracts, so a RAML System API and an OAS Process API coexist without issue; the format is a design-time concern.',
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

Check the current docs for exact OAS minor versions supported per tool before committing. Support has evolved over time (Exchange, for example, accepts OAS 2.0, 3.0 and 3.1).

**What changes moving to OAS**
- **Traits/resource types**: no equivalent. A paging trait becomes reusable \`components/parameters\` (\`page\`, \`pageSize\`) referenced with \`$ref\` on each operation. A "collection" resource type becomes a convention plus governance rules rather than a template.
- **Types**: RAML types become JSON Schema-style \`components/schemas\`; inheritance and unions map to \`allOf\`/\`oneOf\`.
- **Libraries**: replaced by shared component files referenced via \`$ref\`, or shared JSON Schemas. RAML fragments are fully supported as spec dependencies. For OAS the docs disagree: Exchange release notes and the API Designer dependency page list OAS 3.0 components and JSON Schema as fragment types. However, an older Exchange page says OAS 3.0 components cannot be imported and managed as dependencies, and Studio does not support OAS 3.0 fragments. Test this with your own tools and plan how the shared files are distributed.
- **Security schemes**: OAS has first-class \`securitySchemes\` (apiKey, http, oauth2, openIdConnect), which external tooling understands well.

**Coexistence**
Each layer calls the next over HTTP. A Process API built from an OAS spec calls a System API built from a RAML spec exactly the same way; APIkit validates each app against its own spec. API Manager, Exchange and monitoring do not care which format describes an instance. The real cost of a mixed estate is **duplicated shared definitions** (a RAML library and an OAS components file for the same error model). Mitigate this by keeping core schemas as JSON Schema files that both formats can reference.

**Recommendation**
- Standardise on **OAS 3** for new APIs if the wider company already uses it: one language for reviewers, linting and external SDK generation, especially for partner-facing Experience APIs.
- Do **not** rewrite the six working RAML System APIs only for format; convert them when they next need a major version.
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
