import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-013',
  category: 'flows',
  title: 'REST Facade over a Legacy SOAP Service',
  level: 'INTERMEDIATE',
  tags: ['soap', 'web-service-consumer', 'rest', 'facade', 'dataweave'],
  estMinutes: 25,
  flowChecks: [
    { label: 'The REST API is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'GetPolicy is invoked with the Web Service Consumer',
      rule: { type: 'exists', component: 'wsc-consume', where: { operation: 'GetPolicy' } },
    },
    {
      label: 'UpdateBeneficiary is invoked with the Web Service Consumer',
      rule: { type: 'exists', component: 'wsc-consume', where: { operation: 'UpdateBeneficiary' } },
    },
    { label: 'DataWeave builds the SOAP request before Consume', rule: { type: 'before', first: 'transform', then: 'wsc-consume' } },
    { label: 'The SOAP response is mapped to the JSON contract after Consume', rule: { type: 'before', first: 'wsc-consume', then: 'transform' } },
    {
      label: 'SOAP Faults are caught and mapped to HTTP statuses',
      rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'WSC:SOAP_FAULT' },
    },
    { label: 'A POLICY_NOT_FOUND fault is mapped to 404', rule: handlerStatus('SOAP_FAULT', '404') },
    { label: 'A POLICY_LOCKED fault is mapped to 409', rule: handlerStatus('SOAP_FAULT', '409') },
    {
      label: 'Backend connectivity failures are mapped to a 5xx',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'WSC:CONNECTIVITY' },
          handlerStatus('WSC:CONNECTIVITY', { oneOf: ['502', '503', '504'] }),
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'policy-api-main',
      source('http-listener', { path: '/api/policies/*', allowedMethods: 'GET, PATCH' }),
      [
        router(
          'choice',
          {},
          [
            route({ expression: '#[attributes.method == "GET"]' }, [step('flow-ref', { name: 'get-policy' })]),
            route({ expression: '#[attributes.method == "PATCH" and (attributes.requestPath endsWith "/beneficiary")]' }, [
              step('flow-ref', { name: 'patch-policy-beneficiary' }),
            ]),
          ],
          { otherwise: [step('raise-error', { type: 'APP:METHOD_NOT_ALLOWED', description: 'Unsupported resource or method' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'WSC:SOAP_FAULT' }, [
          step('transform', {
            target: 'variable',
            variableName: 'httpStatus',
            script:
              '%dw 2.0\noutput application/java\nvar fault = error.description default ""\n---\nif (fault contains "POLICY_NOT_FOUND") 404\nelse if (fault contains "POLICY_LOCKED") 409\nelse 502',
          }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "POLICY_ERROR", message: error.description, correlationId: correlationId }',
          }),
        ]),
        handler('on-error-propagate', { type: 'WSC:CONNECTIVITY, WSC:TIMEOUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[503]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "POLICY_SERVICE_UNAVAILABLE", correlationId: correlationId }',
          }),
        ]),
      ],
    ),
    flow('get-policy', null, [
      // The listener path is a wildcard, so there is no uriParams entry: take the number from the request path.
      step('set-variable', { variableName: 'policyNumber', value: '#[(attributes.requestPath splitBy "/")[3]]' }),
      scope('cache', { cachingStrategy: 'policy-cache-60s' }, [
        step('transform', {
          script:
            '%dw 2.0\noutput application/xml\nns pol http://bank.example/policy\n---\n{ pol#GetPolicyRequest: { pol#policyNumber: vars.policyNumber } }',
        }),
        step('wsc-consume', { operation: 'GetPolicy' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nns pol http://bank.example/policy\nvar p = payload.body.pol#GetPolicyResponse.pol#policy\n---\n{\n  policyNumber: p.pol#number,\n  status: p.pol#status,\n  holder: p.pol#holderName,\n  startDate: p.pol#startDate as Date as String { format: "yyyy-MM-dd" }\n}',
        }),
      ]),
    ]),
    flow('patch-policy-beneficiary', null, [
      step('validation', { check: 'is-not-blank-string', expression: '#[payload.beneficiaryName]', message: 'beneficiaryName is required' }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/xml\nns pol http://bank.example/policy\n---\n{\n  pol#UpdateBeneficiaryRequest: {\n    pol#policyNumber: (attributes.requestPath splitBy "/")[3],\n    pol#beneficiary: { pol#name: payload.beneficiaryName, pol#relationship: payload.relationship }\n  }\n}',
      }),
      step('wsc-consume', { operation: 'UpdateBeneficiary' }),
      step('set-variable', { variableName: 'httpStatus', value: '#[204]' }),
      step('set-payload', { value: '#[null]' }),
    ]),
  ),
  description: `
A bank's **Policy Admin system** exposes only a SOAP 1.1 service (\`PolicyService.wsdl\`) with operations \`GetPolicy\` and \`UpdateBeneficiary\`. It requires a **WS-Security UsernameToken** and returns business errors as **SOAP Faults** (e.g. \`POLICY_NOT_FOUND\`, \`POLICY_LOCKED\`).

Mobile and web teams want a clean JSON REST API:
- \`GET /policies/{policyNumber}\`
- \`PATCH /policies/{policyNumber}/beneficiary\`

SLA: p95 < 800 ms; the SOAP service averages 400 ms.

**Design the flow(s):** API spec, how SOAP is invoked, request/response mapping, SOAP Fault → HTTP status mapping, and security.
`,
  answerTemplate: `## API spec and routing

## Calling the SOAP service

## Request and response mapping

## SOAP Fault to HTTP mapping

## Security

## Performance
`,
  keyPoints: [
    'RAML/OAS spec designed resource-first and implemented with APIkit Router.',
    'Web Service Consumer configured from the WSDL (service, port, address) and Consume operation per SOAP operation.',
    'DataWeave builds the SOAP body XML with correct namespaces and maps the XML response to JSON.',
    'WSC:SOAP_FAULT is caught and the fault code inspected to map POLICY_NOT_FOUND → 404, POLICY_LOCKED → 409, others → 502.',
    'WS-Security UsernameToken configured on the WSC config with credentials from secure properties; the REST side is secured separately (e.g. client ID / OAuth policy).',
  ],
  solution: `
1. **Spec & router:** RAML with \`/policies/{policyNumber}\` (GET) and \`/beneficiary\` (PATCH), JSON examples and error types. APIkit generates \`get:\\policies\\(policyNumber):policy-api-config\` style flows.
2. **WSC config:** **Web Service Consumer** config with \`wsdlLocation\`, \`service\`, \`port\`, \`address\` (externalised per environment). Add **WS-Security** UsernameToken (username/password from secure properties).
3. **GET flow:**
   - Transform Message builds the request: \`%dw 2.0 output application/xml ns pol http://bank.example/policy\` → \`{ pol#GetPolicyRequest: { pol#policyNumber: attributes.uriParams.policyNumber } }\`.
   - **Consume** operation \`GetPolicy\`. Response is in \`payload.body\`.
   - Transform Message maps the XML (namespaced selectors) to the JSON contract — flatten, rename, format dates, drop internal fields.
4. **PATCH flow:** validate the JSON body (APIkit), map to \`UpdateBeneficiaryRequest\`, Consume, return 200/204.
5. **Error handling:** On Error Propagate for \`WSC:SOAP_FAULT\` → DataWeave reads the fault code (the reference flow searches \`error.description\`; check how your connector version exposes the fault detail) and sets \`httpStatus\`: \`POLICY_NOT_FOUND\` → 404, \`POLICY_LOCKED\` → 409, unknown → 502. \`WSC:CONNECTIVITY\`/\`WSC:TIMEOUT\` → 503/504. APIkit errors (bad request, not found) keep their default mappings.
6. **Performance:** connection pooling is handled by the WSC's HTTP transport; optionally a **Cache scope** for GET with a short TTL if the data tolerates staleness. Key the caching strategy on the policy number: the default key is a SHA-256 of the payload, which is the same for every GET.
7. **Security on the REST side:** apply API Manager policies (client ID enforcement or OAuth 2.0) — the mobile app never sees SOAP credentials.
`,
  followUps: [
    { q: 'Why not just convert XML to JSON with output application/json and return it?', a: 'You would leak the SOAP structure, namespaces and internal fields into the public contract. A facade should expose a designed, stable resource model independent of the backend.' },
    { q: 'How would you test this without the real SOAP service?', a: 'Use MUnit with mocks on the Consume operation (mock-when on the processor) returning sample responses and faults, and assert the HTTP status and JSON mapping.' },
    { q: 'The WSDL changes in the backend — what breaks?', a: 'Only the System API mapping; consumers keep the same REST contract. That isolation is the main value of the facade layer.' },
  ],
}
