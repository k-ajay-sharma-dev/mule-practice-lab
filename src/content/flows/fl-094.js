import { design, flow, handler, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-094',
  category: 'flows',
  title: 'Authorising Brokers Behind a Dedicated Load Balancer from X-SSL Client Certificate Headers',
  level: 'INTERMEDIATE',
  tags: ['security', 'tls', 'mtls', 'dedicated-load-balancer', 'authorization', 'database', 'http'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Claims arrive through an HTTP Listener', rule: { type: 'source', component: 'http-listener', where: { path: 'submissions' } } },
    {
      label: 'X-SSL-Client-Verify must be SUCCESS, checked before the broker lookup',
      rule: { type: 'before', first: 'validation', firstWhere: { check: 'is-true', expression: 'SUCCESS' }, then: 'db-select' },
    },
    {
      label: 'The claim and the DN and serial headers are saved in variables before the database call replaces them',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'set-variable', firstWhere: { value: 'payload]' }, then: 'db-select' },
          // Saving all headers, or all attributes, in one variable also keeps them.
          { type: 'before', first: 'set-variable', firstWhere: { value: { oneOf: ['x-ssl-client-dn', 'attributes.headers]', 'attributes]'] } }, then: 'db-select' },
          { type: 'before', first: 'set-variable', firstWhere: { value: { oneOf: ['x-ssl-client-serial', 'attributes.headers]', 'attributes]'] } }, then: 'db-select' },
        ],
      },
    },
    {
      label: 'The lookup matches both the DN and the serial of an active broker',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'db-select', where: { sql: 'cert_serial' } },
          { type: 'exists', component: 'db-select', where: { sql: 'cert_dn' } },
          { type: 'exists', component: 'db-select', where: { sql: 'ACTIVE' } },
        ],
      },
    },
    {
      label: 'An unknown certificate is refused by an empty result check before the claim is published',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-select', then: 'validation', thenWhere: { check: 'is-not-empty-collection' } },
          { type: 'before', first: 'validation', firstWhere: { check: 'is-not-empty-collection' }, then: 'mq-publish' },
        ],
      },
    },
    {
      label: 'An unverified certificate returns 401',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate', errorType: 'VALIDATION:INVALID_BOOLEAN' },
          handlerStatus('VALIDATION:INVALID_BOOLEAN', '401'),
        ],
      },
    },
    {
      label: 'A verified but unauthorised certificate returns 403',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate', errorType: 'VALIDATION:EMPTY_COLLECTION' },
          handlerStatus('VALIDATION:EMPTY_COLLECTION', '403'),
        ],
      },
    },
    {
      label: 'The 403 handler logs the serial for investigation',
      rule: { type: 'inside', component: 'logger', within: HANDLERS, withinWhere: { type: 'VALIDATION:EMPTY_COLLECTION' }, where: { message: 'serial' } },
    },
    { label: 'The original claim is restored before publishing', rule: { type: 'before', first: 'transform', firstWhere: { script: 'vars.claim' }, then: 'mq-publish' } },
    { label: 'Claims are published to claims.submissions', rule: { type: 'exists', component: 'mq-publish', where: { destination: 'claims.submissions' } } },
    {
      // An error handler overrides the status, so the main path may set it at any point.
      label: 'An accepted claim is answered with 202, set on the main path and not in an error handler',
      rule: { type: 'before', first: 'http-listener', then: 'set-variable', thenWhere: { value: '202' }, outside: true },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'claims-submission',
      why: 'The catch-all handler answers 500 and logs the error, which Mule does by default. It only adds a tidier body.',
    },
  ],
  referenceFlow: design(
    flow(
      'claims-submission',
      source('http-listener', { path: '/claims/v1/submissions', allowedMethods: 'POST' }),
      [
        // SUCCESS is the only value that means verified. NONE means no certificate; FAILED means other validation problems.
        step('validation', {
          check: 'is-true',
          expression: '#[(attributes.headers."x-ssl-client-verify" default "") == "SUCCESS"]',
          message: 'Client certificate not verified',
        }),
        // Read these before the database call: it replaces payload and attributes.
        step('set-variable', { variableName: 'clientDn', value: '#[attributes.headers."x-ssl-client-dn" default ""]' }),
        step('set-variable', { variableName: 'clientSerial', value: '#[attributes.headers."x-ssl-client-serial" default ""]' }),
        step('set-variable', { variableName: 'claim', value: '#[payload]' }),
        step('db-select', {
          database: 'partner-db',
          sql: "SELECT broker_id FROM authorised_brokers WHERE cert_dn = :dn AND cert_serial = :serial AND status = 'ACTIVE'",
        }),
        step('validation', { check: 'is-not-empty-collection', expression: '#[payload]', message: 'Certificate is not authorised' }),
        step('set-variable', { variableName: 'brokerId', value: '#[payload[0].broker_id]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\nvars.claim ++ { brokerId: vars.brokerId }',
        }),
        step('mq-publish', { destination: 'claims.submissions' }),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ status: "ACCEPTED", correlationId: correlationId }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[401]' }),
          step('logger', { level: 'WARN', message: '#["Unverified client certificate, correlationId " ++ correlationId]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "UNAUTHENTICATED", correlationId: correlationId }' }),
        ]),
        handler('on-error-propagate', { type: 'VALIDATION:EMPTY_COLLECTION' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[403]' }),
          step('logger', { level: 'WARN', message: '#["Certificate not authorised: DN " ++ (vars.clientDn default "") ++ " serial " ++ (vars.clientSerial default "")]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "FORBIDDEN", correlationId: correlationId }' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[500]' }),
          step('logger', { level: 'ERROR', message: '#[error.errorType.namespace ++ ":" ++ error.errorType.identifier ++ " " ++ error.description]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "INTERNAL_ERROR", correlationId: correlationId }' }),
        ]),
      ],
    ),
  ),
  description: `
An insurer's **Claims API** runs on CloudHub behind a **Dedicated Load Balancer (DLB)** that validates broker client certificates. Because the DLB accepts any certificate chaining to the uploaded CA, a penetration test got in with a certificate belonging to another company.

For each request, the DLB sends these headers to the app:

| Header | Content |
|---|---|
| \`X-SSL-Client-Verify\` | \`SUCCESS\`, \`NONE\` or \`FAILED\` |
| \`X-SSL-Client-DN\` | Full distinguished name of the client certificate |
| \`X-SSL-Issuer\` | Full distinguished name of the issuing certificate |
| \`X-SSL-Client-Serial\` | Serial number |

**Facts**
- The \`authorised_brokers\` table has the columns \`broker_id\`, \`cert_dn\`, \`cert_serial\` and \`status\`. An active broker has the status \`ACTIVE\`.

**Requirements**
- Only \`SUCCESS\` counts as verified. Anything else gets **401**.
- The DN **and** serial must match an active row in the \`authorised_brokers\` table. Otherwise answer **403** and log the DN and serial for investigation.
- Publish the claim with the matched \`brokerId\` added to the queue \`claims.submissions\`, and answer **202**.
- About 45 brokers send 30,000 claims a day. Certificates are renewed every year.

**Design the flow.**
`,
  answerTemplate: `## Verifying the certificate result

## Finding the broker

## Passing the claim on

## Error mapping

## Operations and renewal
`,
  keyPoints: [
    'The client is verified only after X-SSL-Client-Verify is SUCCESS.',
    'The DLB proves that a trusted CA signed the certificate, not who the client is. Identity is checked in the app with the DN and serial headers, as the docs advise.',
    'Save the claim and the header values in variables before the Database Select, because the operation replaces the payload and attributes.',
    'is-not-empty-collection raises VALIDATION:EMPTY_COLLECTION for an empty result, mapped to 403. is-true raises VALIDATION:INVALID_BOOLEAN, mapped to 401.',
    'Restore the claim from the variable, and do not publish the database result by mistake.',
    'Use input parameters in the SQL, as header values come from outside.',
    'A renewed certificate has a new serial, so add the new row before the old certificate expires.',
  ],
  solution: `
1. **HTTP Listener** \`POST /claims/v1/submissions\`.
2. **Validate** (is-true): \`X-SSL-Client-Verify\` equals \`SUCCESS\`. A missing header gives \`""\`, which fails, so the flow fails closed.
3. **Set Variable** \`clientDn\`, \`clientSerial\` and \`claim\`. This must come before the database call, which replaces \`payload\` and \`attributes\`.
4. **Database Select** on \`authorised_brokers\`, with \`vars.clientDn\` and \`vars.clientSerial\` as input parameters \`dn\` and \`serial\`.
5. **Validate** (is-not-empty-collection) on the result.
6. **Set Variable** \`brokerId\`, then **Transform** \`vars.claim ++ { brokerId: vars.brokerId }\`.
7. **MQ Publish** to \`claims.submissions\`. Answer **202**.

**Errors.**
- \`VALIDATION:INVALID_BOOLEAN\` → 401.
- \`VALIDATION:EMPTY_COLLECTION\` → 403, and log DN and serial. Those are not secrets, and they are what an investigator needs.
- Anything else → 500.

**Performance.** 30,000 lookups a day on an indexed table is modest. If it grows, cache the lookup for a short time, and accept that removing a broker then takes up to the cache time to apply.

**Renewal.** A renewed certificate gets a new serial. Let onboarding add the new row before the broker switches, so that both rows are active during the change. Then disable the old row.

**Things to confirm.** Test that a client-supplied \`X-SSL-*\` header cannot reach the app: the DLB pages do not state how one is treated. Also test that no path to the worker avoids the DLB. The Architecture page says the app must listen on port 8091 or 8092 to keep its default domain from public exposure, and it mentions direct \`mule-worker-<app>\` hostnames.
`,
  followUps: [
    {
      q: 'Why 401 for the first check and 403 for the second?',
      a: 'If the certificate was not verified, we do not know who the caller is, so it is an authentication failure. If it was verified but is not on the list, we know who it is and refuse it, which is an authorisation failure.',
    },
    {
      q: 'Should this logic live in every API?',
      a: 'If several APIs behind the DLB need it, move it to a shared sub-flow, or a custom policy so it is enforced consistently. The important part is that it runs before any business processing.',
    },
    {
      q: 'What if the app moves to CloudHub 2.0?',
      a: 'Mutual TLS moves to the private space, with TLS contexts and truststores. If apps need the certificate information through headers, enable Forward SSL Session in the TLS context, then check which headers you receive before reusing this flow.',
    },
  ],
}
