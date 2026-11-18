import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const ask = (statementId, customer) => ({ http: { method: 'GET', path: `/statements/${statementId}/link`, authentication: { principal: customer } } })
const statements = [
  { statement_id: 'ST-2026-10-88120', customer_id: 'CU-55102', blob_name: 'statements/2026/10/CU-55102.pdf' },
  { statement_id: 'ST-2026-10-88121', customer_id: 'CU-55107', blob_name: 'statements/2026/10/CU-55107.pdf' },
]
const tokens = {
  method: 'POST',
  path: '/storage-tokens/v1/read-links',
  respond: { status: 200, body: { url: 'https://files.example.com/statements/2026/10/CU-55102.pdf?sig=redacted', expiresAt: '2026-11-13T10:15:00Z' } },
}

export default {
  id: 'fl-171',
  category: 'flows',
  title: 'Statement Downloads Without Mule in the Middle: Check the Owner, Then Return a 15 Minute Read Link to the Blob',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'sas', 'security', 'authorization', 'http', 'database', 'banking'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The app asks on GET /statements/{statementId}/link', rule: { type: 'source', component: 'http-listener', where: { path: '/statements/{statementId}/link', allowedMethods: 'GET' } } },
    {
      label: 'The statement is looked up for the signed-in customer, not for any customer',
      rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['statements', 'customer_id'] }, inputParameters: 'authentication.principal' } },
    },
    { label: 'Another customer\'s statement, or no statement, gets 404', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '404' } } },
    {
      label: 'The link comes from the token service, and the file itself never passes through Mule',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'choice', where: { path: '/storage-tokens/v1/read-links' } },
          { type: 'absent', component: 'azure-download-blob' },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables: { statements: { key: 'statement_id', rows: statements } } }, http: [tokens] },
    tests: [
      {
        name: 'A customer opens October\'s statement',
        about: 'The statement belongs to CU-55102. The token service is asked for a read link to that one blob, for 15 minutes, and the app gets the link.',
        trigger: ask('ST-2026-10-88120', 'CU-55102'),
        expect: {
          status: 200,
          bodyHas: { url: 'https://files.example.com/statements/2026/10/CU-55102.pdf?sig=redacted', expiresAt: '2026-11-13T10:15:00Z' },
          calls: [{ method: 'POST', path: '/storage-tokens/v1/read-links', count: 1, has: { container: 'statements', blobName: 'statements/2026/10/CU-55102.pdf', permissions: 'r', expiresInMinutes: 15 } }],
        },
      },
      {
        name: 'Someone else\'s statement',
        about: 'CU-55102 changes the ID in the address to a neighbour\'s statement. The answer is 404, as if it did not exist, and no link is made.',
        trigger: ask('ST-2026-10-88121', 'CU-55102'),
        expect: { status: 404, bodyHas: { message: 'Statement not found' }, calls: [{ method: 'POST', path: '/storage-tokens/v1/read-links', count: 0 }] },
      },
      {
        name: 'The token service is down',
        about: 'No link can be made. The app gets 503 and shows "try again shortly".',
        trigger: ask('ST-2026-10-88120', 'CU-55102'),
        overrides: { systems: { http: [{ ...tokens, respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { status: 503 },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'statement-read-link',
      source('http-listener', { path: '/statements/{statementId}/link', allowedMethods: 'GET' }),
      [
        step('db-select', {
          database: 'PostgreSQL',
          sql: 'SELECT blob_name FROM statements WHERE statement_id = :statementId AND customer_id = :customerId',
          inputParameters: '#[{ statementId: attributes.uriParams.statementId, customerId: authentication.principal }]',
          target: 'statement',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(vars.statement)]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '404' }),
              step('set-payload', { value: '#[output application/json --- { message: "Statement not found" }]' }),
            ]),
          ],
          {
            otherwise: [
              step('set-payload', { value: '#[output application/json --- { container: "statements", blobName: vars.statement[0].blob_name, permissions: "r", expiresInMinutes: 15 }]' }),
              step('http-request', { method: 'POST', path: '/storage-tokens/v1/read-links', responseTimeout: 3000 }),
              step('set-payload', { value: '#[output application/json --- { url: payload.url, expiresAt: payload.expiresAt }]' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { message: "Please try again shortly" }]' }),
        ]),
      ],
    ),
  ),
  description: `
Oakhurst Bank, a fictional bank, keeps customers' monthly statements as PDFs in the Azure Blob Storage container \`statements\`. The table \`statements\` (\`statement_id\`, \`customer_id\`, \`blob_name\`) says whose each one is.

The app used to download statements through Mule, which read each PDF from storage and passed it on. At month end that used most of the Mule workers' memory. The architects decided: Mule hands the app a **short lived read link** to the one blob (a SAS URL), and the app downloads from storage directly.

Links are signed by an internal token service, which holds the storage key. Mule never sees the key: \`POST /storage-tokens/v1/read-links\` with \`{ "container", "blobName", "permissions": "r", "expiresInMinutes" }\` answers \`{ "url", "expiresAt" }\`.

The gateway validates the customer's token, and the flow reads the customer ID as \`authentication.principal\`.

**Requirements**
- \`GET /statements/{statementId}/link\` answers \`{ url, expiresAt }\` for the signed-in customer's own statement.
- Links are read only and last **15 minutes**.
- A statement that is not the customer's, or does not exist, gets **404**. Do not tell the two apart.
- If the token service cannot be reached, answer **503**.

**Design the flow.**
`,
  answerTemplate: `## Whose statement is it?

## Asking for the link

## What the app receives

## Failures
`,
  keyPoints: [
    'A shared access signature (SAS) is a URL with a signature that grants limited rights to a resource for a limited time. Anyone holding the URL has those rights until it expires.',
    'So the owner check comes first, with the customer ID from the verified token, never from the request.',
    'Asking for the statement and the owner in one query means a wrong owner looks the same as a missing statement: 404 either way, which tells an attacker nothing.',
    'Read only, one blob, short life: the link grants the least it can.',
    'The PDF goes from storage to the app. Mule handles a few hundred bytes per request instead of megabytes.',
    'The storage key stays in the token service. A user delegation SAS, signed with Microsoft Entra ID credentials, avoids sharing the account key at all.',
  ],
  solution: `
1. **HTTP Listener** \`GET /statements/{statementId}/link\`.
2. **Database Select**, Target \`statement\`: \`SELECT blob_name FROM statements WHERE statement_id = :statementId AND customer_id = :customerId\`, with \`customerId: authentication.principal\`.
3. **Choice**:
   - \`#[isEmpty(vars.statement)]\`: \`404\`, "Statement not found".
   - Otherwise: **Set Payload** \`{ container: "statements", blobName, permissions: "r", expiresInMinutes: 15 }\`, **HTTP Request** \`POST /storage-tokens/v1/read-links\` with a short timeout, then answer \`{ url, expiresAt }\`.
4. Error handler **On Error Propagate** for the token service's connectivity and timeout errors: \`503\`.

**Logging.** Log the statement ID and customer ID for each link, never the URL. The signature in it is a credential until it expires.

**Caching.** Do not cache links between customers. A link for the same statement can be reused for a few minutes, but making a new one is cheap.
`,
  followUps: [
    {
      q: 'Why 15 minutes and not 24 hours?',
      a: 'A link copied into an email or a browser history keeps working until it expires. A short life limits the harm. The app asks for a new one each time the customer taps the statement.',
    },
    {
      q: 'Can a link be withdrawn before it expires?',
      a: 'An ad hoc SAS cannot be revoked one by one. Rotating the key that signed it, or using a stored access policy and changing it, ends many links at once. Short lives are the practical answer.',
    },
  ],
}
