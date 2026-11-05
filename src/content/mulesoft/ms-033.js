export default {
  id: 'ms-033',
  category: 'mulesoft',
  title: 'Validating Payloads: JSON Schema, XML Schema and the Validation Module',
  level: 'INTERMEDIATE',
  tags: ['validation', 'json-schema', 'xsd', 'apikit'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each Claims Intake channel to the component that validates it against its contract.',
      pairs: [
        ['Partner REST API (RAML)', 'APIkit Router'],
        ['Broker SFTP drop (XSD)', 'XML module validate-schema'],
        ['Internal Kafka topic (JSON Schema)', 'JSON module validate-schema'],
      ],
      explain: 'APIkit validates requests against the RAML types; for non-HTTP channels you call the XML or JSON module `validate-schema` operation explicitly.',
    },
    {
      type: 'match',
      prompt: 'Match each validation to the error type it raises.',
      pairs: [
        ['APIkit request validation', 'APIKIT:BAD_REQUEST'],
        ['JSON module validate-schema', 'JSON:SCHEMA_NOT_HONOURED'],
        ['XML module validate-schema', 'XML-MODULE:SCHEMA_NOT_HONOURED'],
        ['Validation module All scope', 'VALIDATION:MULTIPLE'],
      ],
      explain: 'Knowing the exact types lets you list them in an On Error handler `type` attribute and send each channel to its own response (400 or error queue).',
    },
    {
      type: 'single',
      prompt: 'A claim passes JSON Schema validation but has `incidentDate` in the future. Why did the schema not catch it?',
      options: [
        'JSON Schema validation is disabled by default in Mule',
        'Schemas check structure and types; "not in the future" is a business rule that needs code (Validation module or DataWeave)',
        'Dates are never validated in Mule 4',
        'The Kafka connector strips date fields',
      ],
      answer: 1,
      explain: 'Structural validation and business-rule validation are separate layers. Rules relative to "now" belong in the Validation module or a DataWeave function.',
    },
    {
      type: 'single',
      prompt: 'Why wrap the business-rule checks in the Validation module **All** scope?',
      options: [
        'It runs every validation and raises one VALIDATION:MULTIPLE error with all failures, instead of stopping at the first',
        'It runs the validations in parallel for speed',
        'It turns failures into warnings so the claim still goes through',
        'It is required for `is-true` to work',
      ],
      answer: 0,
      explain: 'The requirement is to return **all** violations at once. Without All, the first failing validator raises and the rest never run.',
    },
    {
      type: 'multi',
      prompt: 'Which practices fit schema files and performance here?',
      options: [
        'Store schemas in `src/main/resources/schemas`, or publish shared contracts as an Exchange asset',
        'Validate once at the entry point, not again in every downstream flow',
        'Re-validate the schema before every connector call to be safe',
        'Keep a private copy of the schema in each consumer so it can drift independently',
      ],
      answer: [0, 1],
      explain: 'A shared, versioned schema keeps producer and consumer aligned, and validating once at the edge avoids repeated full-document parsing.',
    },
    {
      type: 'single',
      prompt: 'What do the APIkit docs say the router validates at runtime?',
      options: [
        'Outgoing responses only',
        'Inbound requests against the API spec, so check response conformance with tests (MUnit, contract tests)',
        'Only 2xx responses',
        'Nothing unless strict validation is enabled',
      ],
      answer: 1,
      explain: 'The docs describe APIkit validating inbound traffic and say nothing about response validation, so do not rely on it. Verify responses with MUnit or contract tests.',
    },
  ],
  description: `
A **Claims Intake** integration receives data from three channels:

| Channel | Format | Contract |
|---|---|---|
| Partner REST API (via APIkit) | JSON | RAML with data types |
| Broker SFTP drop | XML | \`claim-v3.xsd\` from the insurer |
| Internal Kafka topic | JSON | JSON Schema \`claim.schema.json\` |

Bad claims have been reaching the claims system:
- missing policy numbers
- negative amounts
- \`incidentDate\` in the future

The team wants invalid messages rejected early with a clear list of problems:
- Non-HTTP channels: send them to an error queue.
- REST channel: answer with **400**.

**Questions**
1. Which component validates each channel against its contract?
2. Which error types are raised and how do you handle them per channel?
3. Schema validation does not catch "incidentDate in the future". How do you add such business rules and return **all** violations at once?
4. Where should the schema files live and what are the performance considerations?
`,
  answerTemplate: `## Validation per channel

## Error types and handling

## Business rules

## Schema files and performance
`,
  keyPoints: [
    'APIkit validates requests against the RAML/OAS contract and raises APIKIT:BAD_REQUEST, usually mapped to 400.',
    'The JSON module validate-schema operation raises JSON:SCHEMA_NOT_HONOURED; the XML module validate-schema raises XML-MODULE:SCHEMA_NOT_HONOURED.',
    'Structural (schema) validation and business-rule validation are separate layers; the Validation module or DataWeave handles business rules.',
    'The Validation module All scope runs several validations and reports every failure together.',
    'Schemas belong in src/main/resources (or a shared Exchange asset) and should be validated once at the edge, not repeatedly in every flow.',
  ],
  solution: `
**Per channel**
- **REST:** the APIkit Router validates method, path, query params, headers and body against the RAML types. Invalid requests raise \`APIKIT:BAD_REQUEST\`; the scaffolded error handler maps it to **400**.
- **SFTP XML:** \`<xml-module:validate-schema schemas="schemas/claim-v3.xsd"/>\` → \`XML-MODULE:SCHEMA_NOT_HONOURED\`.
- **Kafka JSON:** \`<json:validate-schema schema="schemas/claim.schema.json"/>\` → \`JSON:SCHEMA_NOT_HONOURED\`.

**Handling**
\`\`\`xml
<error-handler>
  <on-error-continue type="JSON:SCHEMA_NOT_HONOURED, XML-MODULE:SCHEMA_NOT_HONOURED, VALIDATION:MULTIPLE">
    <!-- publish original message + error.description to the error queue, then ack -->
  </on-error-continue>
</error-handler>
\`\`\`
For REST, the 400 body should list the problems (\`error.description\` contains the validator messages) in your standard error format.

**Business rules:** schemas check structure and types; rules like "date not in the future" or "amount > 0 for claim type X" need code. Options:
\`\`\`xml
<validation:all>
  <validation:is-true expression="#[payload.amount > 0]" message="amount must be positive"/>
  <validation:is-true expression="#[(payload.incidentDate as Date) &lt;= (now() as Date)]"
                      message="incidentDate cannot be in the future"/>
  <validation:is-not-blank-string value="#[payload.policyNumber]" message="policyNumber is required"/>
</validation:all>
\`\`\`
The All scope executes every validation and raises a single \`VALIDATION:MULTIPLE\` error containing all failures, instead of stopping at the first one. For complex rule sets, a DataWeave function returning a list of violations is often easier to maintain and test.

**Files and performance**
- Store schemas in \`src/main/resources/schemas\`; for shared contracts, publish them as an Exchange asset and add as a dependency so producer and consumer use the same version.
- Validate **once**, at the entry point — not again in every downstream flow.
- Schema validation reads the whole document; for very large XML files consider validating a smaller subset or validating during the streaming transform.
`,
  followUps: [
    {
      q: 'Does APIkit validate the response body too?',
      a: 'The docs describe request validation only and make no statement about responses, so do not rely on it. Check response conformance with tests (MUnit, contract tests).',
    },
    {
      q: 'What is the difference between Validation module errors and Raise Error?',
      a: 'Validation operations check a condition and raise a VALIDATION error with a message if it fails; Raise Error always raises the error type you specify. Both can be mapped and handled the same way.',
    },
    {
      q: 'Can strict APIkit validation reject unknown query params?',
      a: 'Yes, the APIkit configuration has options for strict query parameter and header validation, which reject parameters not declared in the spec.',
    },
  ],
}
