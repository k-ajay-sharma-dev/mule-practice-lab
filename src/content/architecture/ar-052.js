export default {
  id: 'ar-052',
  category: 'architecture',
  title: 'Designing a System API That Hides the System of Record',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'system-api', 'canonical-model', 'pagination', 'sap'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Which data model should `sys-sap-customer-api` expose?',
      options: [
        'The raw SAP structure (KUNNR, \'X\' flags) — zero mapping effort',
        'A cleaned, system-scoped model with business names and standard types, reusing shared canonical types (address, money, error body)',
        'A full enterprise canonical Customer agreed by every department first',
        'Whatever the first consumer asks for',
      ],
      answer: 1,
      explain: 'Raw SoR shapes leak SAP to every consumer; a full enterprise canonical model is expensive and tends to bloat. A cleaned model is the pragmatic default (use the canonical one if it already exists).',
    },
    {
      type: 'match',
      prompt: 'Match each SAP quirk to its translation in the System API.',
      pairs: [
        ['Customer number 0000012345', '"12345" on output, left-padded to 10 on input'],
        ['Empty date 00000000', 'null'],
        ["Flag 'X' or blank", 'true / false'],
        ['RETURN table entry of type E', 'Custom error mapped to 404 / 400 / 409 with the standard error body'],
      ],
      explain: 'All SAP specifics are handled in DataWeave inside the System API so consumers never see them.',
    },
    {
      type: 'single',
      prompt: 'The customer-list BAPI has no native paging. Which approach scales best for `GET /customers`?',
      options: [
        'Fetch every customer and slice in DataWeave',
        'Key-based paging: sort by customer number and select "greater than the last key", exposed as a cursor (`?after=12345`)',
        'Do not offer pagination at all',
        'Cache the whole customer table in memory',
      ],
      answer: 1,
      explain: 'Max-rows + slicing works but its cost grows with page depth; key-based paging stays efficient. Bulk exports should use a batch path instead.',
    },
    {
      type: 'single',
      prompt: 'Basis allows 10 concurrent RFC connections for your user and the API runs on 2 replicas. How do you size the SAP connection pool?',
      options: ['10 per replica', '5 per replica, so the total fits the allowance', '20 per replica to handle peaks', 'Unlimited, SAP will queue'],
      answer: 1,
      explain: 'The limit applies to the SAP user across all replicas, so the per-replica pool must add up to at most 10.',
    },
    {
      type: 'multi',
      prompt: 'Which measures protect SAP?',
      options: [
        'Spike Control / Rate Limiting policy so callers get 429 instead of overloading SAP',
        'Timeouts on the RFC call',
        'Caching code tables and short-TTL customer lookups in Object Store',
        'No blind retries on writes without idempotency',
        'Fetching all customers and filtering in Mule',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Filters should be pushed into the BAPI selection so SAP does the work; pulling everything into Mule multiplies load.',
    },
    {
      type: 'single',
      prompt: 'Why not let each Process API do the SAP-to-clean mapping?',
      options: [
        'Process APIs cannot run DataWeave',
        'Every Process API touching SAP would repeat the mapping and be coupled to SAP; the System API is the one place that knows SAP',
        'Because mapping is faster in System APIs',
        'It is fine — mapping location does not matter',
      ],
      answer: 1,
      explain: 'Containing SAP knowledge in one layer is what makes a SAP change or replacement cheap.',
    },
  ],
  description: `
You must design \`sys-sap-customer-api\` over **SAP ECC** (accessed via BAPIs/RFC with the SAP connector). Known quirks:

- Customer numbers are 10-char zero-padded (\`0000012345\`); dates are \`YYYYMMDD\` strings; empty dates are \`00000000\`.
- Boolean flags are \`'X'\` or blank; country and status are SAP codes.
- The customer-list BAPI has **no native paging**; it returns all matches up to a max-rows parameter.
- SAP errors come back as a \`RETURN\` table with types \`E\`/\`W\`/\`S\`, not as exceptions.
- SAP basis team allows max **10 concurrent RFC connections** for your user.

**Questions:**
1. What should the API contract look like (resources, query parameters, data shape)? Do you expose a **canonical** model or an **SoR-shaped** model? Justify.
2. How do you translate each quirk above?
3. How do you support **pagination and filtering** when the backend does not page?
4. How do you protect SAP?
`,
  answerTemplate: `## Contract

## Canonical vs SoR-shaped

## Translating quirks

## Pagination and filtering

## Protecting SAP
`,
  keyPoints: [
    'The System API exposes clean REST resources with business-friendly names and standard types; SAP field names, padding, flags and codes are mapped in DataWeave inside the System API.',
    'Pragmatic choice: an "SoR-scoped but cleaned" model (entity boundaries of the system, but normalised types and names) or the enterprise canonical model where one exists. A full enterprise canonical model in every System API is costly.',
    'SAP RETURN-table errors are inspected and mapped to proper HTTP statuses (404, 400, 409, 502/503) with a standard error body.',
    'Filters are passed through to the BAPI selection where possible; pagination is offered in the contract and implemented as best-effort (max-rows + slicing, or key-based) when the backend cannot page, with a documented maximum.',
    'SAP is protected with a connection pool/concurrency limit matching the RFC allowance, rate limiting/spike control on the API, timeouts, and caching of slow-changing data.',
  ],
  solution: `
**Contract.**
\`\`\`
GET  /customers?name=&country=&status=&modifiedSince=&page=1&pageSize=50
GET  /customers/{customerId}
GET  /customers/{customerId}/addresses
POST /customers
PATCH /customers/{customerId}
\`\`\`
Response:
\`\`\`json
{ "customerId": "12345", "name": "Acme Ltd", "country": "GB",
  "status": "ACTIVE", "creditBlocked": false,
  "createdDate": "2023-04-11", "lastOrderDate": null }
\`\`\`

**Canonical vs SoR-shaped.**

| Option | Pros | Cons |
|---|---|---|
| Raw SoR-shaped (\`KUNNR\`, \`'X'\`) | Zero mapping effort | Leaks SAP to every consumer; replacing SAP breaks them all |
| Cleaned, system-scoped model | Clear, cheap, consumers protected from SAP quirks | Each System API has its own shape; Process layer still maps between systems |
| Enterprise canonical model | Uniform across systems | Expensive to agree and evolve; "one Customer to rule them all" often bloats |

Recommended: **cleaned, system-scoped** model, reusing shared canonical *types* (address, money, country code, error body) from Exchange fragments. If the organisation already has a canonical Customer, use it for the System API contract. Never raw SoR-shaped.

**Translating quirks (DataWeave in the System API).**
- \`0000012345\` → strip leading zeros on output; left-pad to 10 on input. Consumers never see padding.
- \`YYYYMMDD\` → ISO date; \`00000000\` → \`null\`.
- \`'X'\`/blank → \`true\`/\`false\`.
- SAP country/status codes → ISO country codes and a documented enum (\`ACTIVE\`, \`BLOCKED\`, \`ARCHIVED\`) via a lookup.
- \`RETURN\` table: if any entry has type \`E\` (or \`A\`), raise a custom error (e.g. \`SAP:NOT_FOUND\`, \`SAP:VALIDATION\`) based on message class/number, mapped by the global error handler to 404/400/409; connectivity/timeouts → 503/504 with a standard error body. Warnings (\`W\`) can be logged or passed in a \`warnings\` array.

**Pagination and filtering.**
- **Filters:** pass \`name\`, \`country\`, \`modifiedSince\` through to the BAPI selection parameters, so SAP does the filtering. Do not fetch everything and filter in Mule unless the set is small.
- **Pagination:** the contract offers \`page\`/\`pageSize\` (with a max, e.g. 200). Implementation options:
  1. Call the BAPI with max-rows = page × pageSize and slice in DataWeave — simple, but cost grows with page number; set a maximum page depth.
  2. **Key-based** paging: sort by customer number and use "customer number greater than last key" as a selection — efficient, exposed as a cursor (\`?after=12345\`).
  3. For bulk export use cases, do not use this API — provide a batch/extract path instead.
- Return pagination metadata (\`page\`, \`pageSize\`, \`hasMore\` or \`next\`) consistently, defined once as a trait/fragment.

**Protecting SAP.**
- SAP connector connection pool sized to ≤ 10 per replica — and total across replicas must fit the allowance (e.g. 2 replicas × 5).
- API Manager **Spike Control / Rate Limiting** policy so upstream gets 429 instead of overwhelming SAP.
- Timeouts on the RFC call; no blind retries on writes (idempotency first).
- Cache read-mostly lookups (country/status code tables, customer master by id with short TTL) in Object Store.
`,
  followUps: [
    { q: 'Why not let the Process API do the SAP-to-canonical mapping?', a: 'Then every Process API that touches SAP repeats the same mapping and becomes coupled to SAP. The System API is the one place that knows SAP, so a SAP change or replacement is contained there.' },
    { q: 'Should a System API expose every BAPI field?', a: 'No. Expose what consumers need plus what is plausibly reusable; adding fields later is a non-breaking change, removing them is breaking.' },
    { q: 'Offset pagination or cursor pagination for a System API?', a: 'Cursor/key-based scales better and is stable under concurrent inserts; offset is simpler for UIs that need page numbers. Pick one standard for the organisation and define it in a shared fragment.' },
  ],
}
