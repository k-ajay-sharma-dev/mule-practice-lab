import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-095',
  category: 'flows',
  title: 'Object-Level Authorisation from JWT Claims: Stop One Tenant Reading Another Tenant\'s Account',
  level: 'ADVANCED',
  tags: ['security', 'jwt', 'authorization', 'policies', 'multi-tenant', 'database', 'http'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Statements are served by an HTTP Listener with the account in the path', rule: { type: 'source', component: 'http-listener', where: { path: '{accountId}' } } },
    { label: 'The tenant comes from the validated claims', rule: { type: 'exists', component: 'set-variable', where: { value: 'authentication.properties.claims' }, min: 2 } },
    { label: 'A request with no tenant claim is refused', rule: { type: 'exists', component: 'validation', where: { check: 'is-not-blank-string' } } },
    { label: 'The required scope is checked', rule: { type: 'exists', component: 'validation', where: { check: 'is-true', expression: 'statements:read' } } },
    { label: 'Account ownership is checked before statements are read', rule: { type: 'before', first: 'choice', then: 'transform' } },
    { label: 'An account of another tenant is reported as not found', rule: { type: 'inside', component: 'raise-error', within: 'choice', where: { type: 'APP:ACCOUNT_NOT_FOUND' } } },
    { label: 'Not found returns 404', rule: { type: 'handler', component: 'on-error-propagate', errorType: 'APP:ACCOUNT_NOT_FOUND' } },
    { label: 'A missing scope returns 403', rule: { type: 'handler', component: 'on-error-propagate', errorType: 'VALIDATION:INVALID_BOOLEAN' } },
    { label: 'A missing tenant claim returns 401', rule: { type: 'handler', component: 'on-error-propagate', errorType: 'VALIDATION:BLANK_STRING' } },
  ],
  referenceFlow: design(
    flow(
      'get-account-statements',
      source('http-listener', { path: '/api/v1/accounts/{accountId}/statements', allowedMethods: 'GET' }),
      [
        // The JWT Validation policy has already checked the signature and claims.
        step('set-variable', { variableName: 'tenantId', value: '#[authentication.properties.claims.tenant_id default ""]' }),
        step('set-variable', { variableName: 'scopes', value: '#[(authentication.properties.claims.scope default "") splitBy " "]' }),
        // Saved now: the database calls below replace attributes.
        step('set-variable', { variableName: 'accountId', value: '#[attributes.uriParams.accountId]' }),
        // Fails closed if the policy was removed, or if the token has no tenant.
        step('validation', { check: 'is-not-blank-string', expression: '#[vars.tenantId]', message: 'No tenant in token' }),
        step('validation', { check: 'is-true', expression: '#[vars.scopes contains "statements:read"]', message: 'Missing scope statements:read' }),
        step('db-select', { database: 'accounts-db', sql: 'SELECT tenant_id FROM accounts WHERE account_id = :accountId' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload) or payload[0].tenant_id != vars.tenantId]' }, [
              step('raise-error', { type: 'APP:ACCOUNT_NOT_FOUND', description: 'Account not found' }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["Ownership confirmed for account " ++ vars.accountId]' })] },
        ),
        step('db-select', {
          database: 'accounts-db',
          sql: 'SELECT statement_id, period, closing_balance FROM statements WHERE account_id = :accountId AND tenant_id = :tenantId ORDER BY period DESC',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ accountId: vars.accountId, statements: payload map (s) -> { statementId: s.statement_id, period: s.period, closingBalance: s.closing_balance } }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:BLANK_STRING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[401]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "UNAUTHENTICATED", correlationId: correlationId }' }),
        ]),
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[403]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "FORBIDDEN", correlationId: correlationId }' }),
        ]),
        handler('on-error-propagate', { type: 'APP:ACCOUNT_NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[404]' }),
          step('logger', { level: 'WARN', message: '#["Account " ++ vars.accountId ++ " not found for tenant " ++ vars.tenantId]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "NOT_FOUND", correlationId: correlationId }' }),
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
A payments company offers a multi-tenant **Statements API**: \`GET /api/v1/accounts/{accountId}/statements\`. Around 300 corporate customers use it. A **JWT Validation** policy on Mule Gateway checks each token's signature, expiry and audience.

A security review found a classic hole: any valid token can read **any** account by changing \`accountId\` in the URL. The policy proves that the token is genuine, but it knows nothing about who owns which account.

Tokens carry these claims:
\`\`\`json
{ "sub": "svc-acme-erp", "tenant_id": "T-77", "scope": "profile statements:read", "aud": "statements-api" }
\`\`\`

**Requirements**
- Read the tenant and scope from the claims the policy validated, not from anything else in the request.
- No tenant claim: **401**. Missing scope \`statements:read\`: **403**.
- The account must belong to the token's tenant. If it does not, the caller must not be able to tell whether the account exists: answer **404** in both cases.
- Fail safely if the policy is ever removed by mistake.
- Log refused attempts, so that probing can be spotted.

**Design the flow.**
`,
  answerTemplate: `## Reading the claims

## Scope check

## Ownership check

## Reading the statements

## Error mapping
`,
  keyPoints: [
    'A gateway policy authenticates the token. Whether this caller may use this object is an application decision.',
    'After JWT Validation, claims are available in the flow as authentication.properties.claims.<name>.',
    'Fail closed: default the tenant to an empty string and refuse it with is-not-blank-string, which raises VALIDATION:BLANK_STRING.',
    'scope is usually a space-separated String, so split it before contains.',
    'Save uriParams in a variable before the Database Select, as it replaces attributes.',
    'Return the same 404 for "not yours" and "does not exist", so account numbers cannot be enumerated.',
    'Filter the statement query by tenant as well: a second layer if the check is ever changed.',
    'Log refused attempts with tenant and account, and alert on repeats.',
  ],
  solution: `
1. **HTTP Listener** \`GET /api/v1/accounts/{accountId}/statements\`, linked to the API instance with Autodiscovery so that the policy applies.
2. **Set Variable** \`tenantId\` from \`authentication.properties.claims.tenant_id default ""\`, and \`scopes\` by splitting the \`scope\` claim. **Set Variable** \`accountId\` from \`attributes.uriParams.accountId\`, which must be read before the database call replaces \`attributes\`.
3. **Validate** (is-not-blank-string) on \`vars.tenantId\`. If the policy is removed or the claim is missing, the value is blank and the flow stops.
4. **Validate** (is-true) that \`vars.scopes\` contains \`statements:read\`.
5. **Database Select** the owner of the account.
6. **Choice:** if the result is empty, or \`tenant_id\` differs from \`vars.tenantId\`, **Raise Error** \`APP:ACCOUNT_NOT_FOUND\`.
7. **Database Select** statements with both \`account_id\` and \`tenant_id\` as input parameters.
8. **Transform** to the response.

**Errors.**
- \`VALIDATION:BLANK_STRING\` → 401.
- \`VALIDATION:INVALID_BOOLEAN\` → 403.
- \`APP:ACCOUNT_NOT_FOUND\` → 404, and the same body in both cases. The log records the tenant and account.
- Anything else → 500.

**Why 404 and not 403.** A 403 for existing accounts and a 404 for others lets an attacker find valid account numbers.

**Where this belongs.** The policy handles what is the same for every request: signature, expiry, audience, and a client contract. Ownership needs data, so it belongs in the application, ideally in the System API or Process API that owns this data, so every consumer gets the same rule.
`,
  followUps: [
    {
      q: 'Could a custom claim validation in the policy do this?',
      a: 'It can check a claim against a fixed value or an expression, for example that region is EU. It cannot look up who owns an account in your database, so ownership stays in the flow.',
    },
    {
      q: 'What is the name of this flaw?',
      a: 'OWASP calls it Broken Object Level Authorization, the first risk on its API Security Top 10. It is common because tests usually use a valid token with its own data.',
    },
    {
      q: 'How do you test this?',
      a: 'Run behind the policy in an integration test. MUnit Set Event defines the payload, attributes and variables, not the authentication object, so for a unit test move the claim reads into a sub-flow you can mock. Then call with tenant A\'s token and tenant B\'s account. Expect 404, and confirm that the statements query was never called.',
    },
  ],
}
