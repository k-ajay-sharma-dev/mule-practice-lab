import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-049',
  category: 'flows',
  title: 'System API Hiding the Quirks of a Legacy SOAP Policy System',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'system-api', 'soap', 'legacy', 'error-handling'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'The policy system is unlocked by its own System API listener (/sys-...)',
      rule: { type: 'source', component: 'http-listener', where: { path: 'sys-' } },
    },
    { label: 'Only the System API speaks SOAP (Web Service Consumer)', rule: { type: 'exists', component: 'wsc-consume' } },
    {
      label: 'In-body result codes (HTTP 200 + ResultCode) are turned into real Mule errors',
      rule: { type: 'before', first: 'wsc-consume', then: 'raise-error' },
    },
    {
      label: 'Legacy dates, amounts and padded strings are normalised in DataWeave',
      rule: { type: 'before', first: 'wsc-consume', then: 'transform' },
    },
    {
      label: 'The legacy session token is reused, not fetched on every call',
      rule: { type: 'exists', component: ['os-retrieve', 'os-store', 'cache'] },
    },
    {
      label: 'An unknown policy becomes a clean 404',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'NOT_FOUND' } },
    },
    {
      label: 'SOAP faults and connectivity problems are mapped to 502/503',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'WSC:' } },
    },
    {
      label: 'The Process API consumes the System API over plain REST',
      rule: { type: 'exists', component: 'http-request', where: { path: 'sys-' } },
    },
  ],
  referenceFlow: design(
    flow(
      'prc-claims-intake',
      source('http-listener', { path: '/prc-claims/v1/claims', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'claim', value: '#[payload]' }),
        step('http-request', { method: 'GET', path: '/sys-policy/v1/policies/{policyNumber}', responseTimeout: 4000 }),
        router(
          'choice',
          {},
          [route({ expression: '#[not payload.active]' }, [step('raise-error', { type: 'APP:POLICY_INACTIVE', description: 'Policy is not active' })])],
          { otherwise: [step('logger', { level: 'INFO', message: '#["Policy " ++ payload.policyNumber ++ " verified"]' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '422' })]),
        handler('on-error-propagate', { type: 'APP:POLICY_INACTIVE' }, [step('set-variable', { variableName: 'httpStatus', value: '422' })]),
      ],
    ),
    flow(
      'sys-policy-get',
      source('http-listener', { path: '/sys-policy/v1/policies/{policyNumber}', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'policyNumber', value: '#[attributes.uriParams.policyNumber]' }),
        // A null default counts as no default (OS:KEY_NOT_FOUND), so use an empty string.
        step('os-retrieve', { key: '#["pas-session"]', defaultValue: '#[""]', objectStore: 'pas-session-store' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload)]' }, [
              step('wsc-consume', { operation: 'Login' }),
              step('set-variable', { variableName: 'sessionId', value: '#[payload.body.LoginResponse.SessionId]' }),
              step('os-store', { key: '#["pas-session"]', value: '#[vars.sessionId]', objectStore: 'pas-session-store' }),
            ]),
          ],
          { otherwise: [step('set-variable', { variableName: 'sessionId', value: '#[payload]' })] },
        ),
        step('wsc-consume', { operation: 'GetPolicyDetails' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.body.GetPolicyDetailsResponse.ResultCode == "E404"]' }, [
              step('raise-error', { type: 'APP:NOT_FOUND', description: 'Policy not found' }),
            ]),
            route({ expression: '#[payload.body.GetPolicyDetailsResponse.ResultCode != "0000"]' }, [
              step('raise-error', { type: 'APP:BACKEND', description: 'Policy system returned an error code' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nns p http://legacy.example.com/policy\nvar r = payload.body.p#GetPolicyDetailsResponse.p#Policy\nfun amount(s) = ((s replace /\\./ with "") replace "," with ".") as Number\n---\n{\n  policyNumber: trim(r.p#PolicyNo),\n  holderName: trim(r.p#HolderNm),\n  startDate: r.p#StartDt as Date { format: "dd/MM/yyyy" },\n  endDate: r.p#EndDt as Date { format: "dd/MM/yyyy" },\n  premium: amount(r.p#Premium),\n  active: r.p#StatusFlg == "Y"\n}',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'APP:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '404' })]),
        handler('on-error-propagate', { type: 'WSC:CONNECTIVITY, WSC:TIMEOUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
        ]),
        handler('on-error-propagate', { type: 'WSC:SOAP_FAULT, APP:BACKEND' }, [
          step('os-remove', { key: '#["pas-session"]', objectStore: 'pas-session-store' }),
          step('set-variable', { variableName: 'httpStatus', value: '502' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '500' })]),
      ],
    ),
  ),
  description: `
An insurer's 20-year-old **Policy Administration System (PAS)** is only reachable through a SOAP service. Every team that has integrated with it has rediscovered its quirks:

- It returns **HTTP 200 for everything** — errors come back as \`<ResultCode>E404</ResultCode>\` (unknown policy) or \`E999\` (internal), success is \`0000\`.
- Dates are \`dd/MM/yyyy\` strings, amounts are \`"1.234,56"\` (European format), names are right-padded with spaces, status is \`Y\`/\`N\`.
- Each call needs a **session id** from a \`Login\` operation; sessions last 20 minutes and the PAS allows only a handful of concurrent sessions.
- It is slow (p95 2.5 s) and goes down for batch runs every night.

A new **Claims Process API** needs policy details for ~3 claims/second. The architecture board wants the quirks hidden **once**, so no Process API ever touches SOAP again.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/sys-policy/v1/policies/{policyNumber}\`), and let layers call each other with HTTP Request pointing at the lower API's path.

**Design the flow(s):** the \`sys-\` policy API (session handling, SOAP call, result-code handling, mapping, error statuses) and the Process API call that consumes it.
`,
  answerTemplate: `## System API contract

## Session handling

## Result codes to errors

## Data normalisation

## Error mapping

## How the Process API uses it
`,
  keyPoints: [
    'A System API is an anti-corruption layer: protocol (SOAP), session handling, result codes and data formats stay inside it; callers get clean REST + JSON.',
    'HTTP 200 with an error code is still an error — check ResultCode right after the call and Raise Error (APP:NOT_FOUND, APP:BACKEND) so normal error handling applies.',
    'Reuse the legacy session (Object Store with a TTL shorter than 20 minutes) and drop it when the backend rejects it; logging in on every call wastes latency and session slots.',
    'Normalise in one place: dd/MM/yyyy → ISO dates, "1.234,56" → 1234.56, trim padded strings, Y/N → boolean.',
    'Map errors to meaningful statuses: unknown policy 404, SOAP fault/backend code 502, connectivity/timeout 503 — the Process API then decides what that means for a claim (here 422).',
  ],
  solution: `
\`\`\`
   prc-claims-intake            PROCESS: business rule "policy must be active"
          |  GET /sys-policy/v1/policies/{policyNumber}   (REST/JSON)
          v
 +-------------------------------------------------+
 | sys-policy-get                         SYSTEM   |
 |  session (Object Store) -> Login if missing     |
 |  WSC GetPolicyDetails                           |
 |  ResultCode E404 -> APP:NOT_FOUND, !0000 -> 502 |
 |  DataWeave: dates, amounts, trim, Y/N           |
 +-------------------------------------------------+
          |  SOAP/XML
          v
       Legacy PAS
\`\`\`

**sys-policy-get** — \`GET /sys-policy/v1/policies/{policyNumber}\`
1. Object Store Retrieve \`pas-session\` (default empty string: a null default counts as no default and raises \`OS:KEY_NOT_FOUND\`). Choice: empty → WSC \`Login\` → Object Store Store (store configured with an entry TTL of ~15 minutes).
2. WSC \`GetPolicyDetails\`.
3. Choice on \`ResultCode\`: \`E404\` → Raise Error \`APP:NOT_FOUND\`; anything other than \`0000\` → \`APP:BACKEND\`; otherwise Transform to \`{ policyNumber, holderName, startDate, endDate, premium, active }\` (parse \`dd/MM/yyyy\`, convert \`"1.234,56"\`, \`trim\`, \`Y\` → true).
4. Error handler: \`APP:NOT_FOUND\` → 404; \`WSC:CONNECTIVITY, WSC:TIMEOUT\` → 503; \`WSC:SOAP_FAULT, APP:BACKEND\` → remove the cached session (it may be the cause) and 502; \`ANY\` → 500.

**prc-claims-intake** — calls \`/sys-policy/...\` over HTTP Request with a 4 s timeout and applies the business rule (inactive policy → \`APP:POLICY_INACTIVE\` → 422). It never sees XML, namespaces or result codes.

Bonus: limit concurrency to the PAS (e.g. \`maxConcurrency\` on the flow / a small HTTP pool) so the Process API cannot exhaust its session slots.
`,
  followUps: [
    {
      q: 'The PAS will be replaced by a SaaS product next year. What changes?',
      a: 'Only the inside of sys-policy (or a new sys-policy implementation behind the same contract). As long as the REST contract stays, prc-claims and every other consumer are unaffected — that is the return on investment of a System API.',
    },
    {
      q: 'Why map an unknown policy to 404 in the System API but to 422 in the Process API?',
      a: 'Each layer speaks its own language: for the System API the resource does not exist (404); for the Claims API the claim request is well-formed but refers to an invalid policy, which is an unprocessable business request (422).',
    },
    {
      q: 'Where would you cache policy data to protect the slow PAS?',
      a: 'Usually in the System API (or the Process API) with a short TTL for read-mostly data, keyed by policy number — never in the Experience layer if several channels need consistent answers. Invalidate on known updates.',
    },
  ],
}
