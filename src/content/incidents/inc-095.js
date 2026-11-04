export default {
  id: 'inc-095',
  category: 'incidents',
  title: 'A Client Reads Another Tenant\'s Data Because Header Injection Did Not Replace Its Own Header',
  level: 'ADVANCED',
  tags: ['security', 'policies', 'api-manager', 'header-injection', 'multi-tenant', 'jwt', 'policy-order'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '11:20:14 INFO  [gw-access] GET /billing/v1/invoices 200 client=acme-erp claims.tenant=acme', relevant: false },
      { text: '11:42:09 INFO  [gw-access] GET /billing/v1/invoices 200 client=acme-erp claims.tenant=acme req.x-tenant-id=globex', relevant: true, why: 'The token says acme, but the caller also sent its own x-tenant-id with the value globex.' },
      { text: '11:42:09 INFO  [billing-svc] incoming headers x-tenant-id: globex, x-tenant-id: acme', relevant: true, why: 'Two values reach the backend: the injected header did not replace the caller\'s header.' },
      { text: '11:42:09 INFO  [billing-svc] tenant resolved to globex, returning 212 invoices', relevant: true, why: 'The backend used the caller\'s value, so data of another tenant was returned.' },
      { text: '11:50:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '11:58:33 INFO  [gw-access] GET /billing/v1/invoices 200 client=globex-sap claims.tenant=globex', relevant: false },
      { text: '12:03:10 INFO  [agent] policies up to date for API 20117342', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'If the injected header already exists, Header Injection creates a new header without overriding the existing one, so the caller\'s value still reaches the backend',
          'The JWT Validation policy accepted a forged token',
          'The policy order put Header Injection after the backend call',
          'The DataWeave expression in the policy returned null',
        ],
        answer: 0,
        explain: 'The Header Injection page says this directly. The token was valid and the claim was right; the problem is what the backend received.',
      },
      {
        type: 'single',
        prompt: 'What is the immediate fix that needs no deployment of the backend?',
        options: [
          'Apply Header Removal inbound for `x-tenant-id`, ordered after JWT Validation and before Header Injection',
          'Add `x-tenant-id` to the JSON Threat Protection policy',
          'Move Header Injection before JWT Validation',
          'Restart the gateway',
        ],
        answer: 0,
        explain: 'The docs say to remove a header before adding yours when you want to overwrite it. Policies can be applied and ordered in API Manager without redeploying.',
      },
      {
        type: 'single',
        prompt: 'Why must Header Injection stay **after** JWT Validation?',
        options: [
          'Its value uses the claim, and claims become available to downstream policies only after JWT Validation parses and validates the token',
          'Header Injection always runs last',
          'CORS requires this order',
          'It does not matter',
        ],
        answer: 0,
        explain: 'After validation, claims are propagated to downstream policies and flows through the authentication object.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'In the backend, take the tenant from one trusted source and reject requests with more than one value',
          'Where the app is a Mule app, read the claim from `authentication.properties.claims` instead of a header',
          'Add a test that sends a forged tenant header',
          'Check other APIs for the same Header Injection pattern',
          'Add `x-tenant-id` to the list of headers that the policy overwrites',
        ],
        answer: [0, 1, 2, 3],
        explain: 'That list is fixed: only `access-control-allow-origin`, `content-type`, `content-length` and `transfer-encoding` are overwritten.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Reproduce with a test client that sends a forged header',
          'Apply Header Removal and reorder the policies',
          'Confirm that the backend now gets a single value',
          'Search the logs for requests where the sent header differs from the claim',
          'Report the exposure to the data protection team with the affected tenants',
        ],
        explain: 'Close the hole first, then measure what was exposed. A cross-tenant read of invoices is a data incident, not only a bug.',
      },
    ],
  },
  description: `
## Symptoms
- A customer, Acme, tells the support team that its developer saw **invoices of another company** when testing the Billing API.
- There are no errors. All requests return 200.

## Change / Context
- \`billing-svc\`, a Java service, sits behind a Mule API proxy with Mule Gateway. It finds the tenant from the \`x-tenant-id\` header.
- The security design says: "The caller cannot choose its tenant, because the gateway sets the header from the token."
- The policies in order: **JWT Validation**, then **Header Injection** with inbound key \`x-tenant-id\` and value \`#[authentication.properties.claims.tenant]\`.
- The Acme developer added \`x-tenant-id: globex\` to a request while copying an example from a Postman collection.

## Logs
\`\`\`
11:42:09 INFO [gw-access] GET /billing/v1/invoices 200 client=acme-erp claims.tenant=acme req.x-tenant-id=globex
11:42:09 INFO [billing-svc] incoming headers x-tenant-id: globex, x-tenant-id: acme
11:42:09 INFO [billing-svc] tenant resolved to globex, returning 212 invoices
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Header Injection does not override an existing header: it creates a new one, so both values travel on.',
    'Only access-control-allow-origin, content-type, content-length and transfer-encoding are overwritten.',
    'To enforce a value, use Header Removal first, then Header Injection.',
    'Order: JWT Validation, then Header Removal, then Header Injection, as the claim must exist before it is used.',
    'A backend that reads one value from a repeated header may take the caller\'s value.',
    'Never let an identity decision depend on a header a caller can also send, unless the gateway removes it first.',
    'Cross-tenant exposure is a data incident: measure it and report it.',
  ],
  solution: `
**Diagnosis.** The token is valid and belongs to Acme, and the injected value is right. But the backend log shows \`x-tenant-id\` twice, and it used the caller's value.

**Immediate mitigation.**
- In API Manager, add **Header Removal** with inbound \`x-tenant-id\`, then **Reorder policies** so the order is JWT Validation, Header Removal, Header Injection. Policies change with no redeploy.
- Repeat the forged request and confirm the backend receives only the claim value.
- Check past requests by comparing the sent header with \`claims.tenant\`, and report the affected tenants to the data protection team.

**Root cause.** The design assumed that "inject" means "set". The policy page says: if the injected header already exists in the message attributes, the policy creates a new header without overriding the value of the existing one. Only four named headers are overwritten. To overwrite any other, the docs say to remove it first with Header Removal.

**Permanent fix.**
- Keep the three policies in that order, and make it the standard for any identity header.
- Change \`billing-svc\` to reject a request that has more than one tenant value.
- For Mule implementations, read \`authentication.properties.claims.tenant\` directly in the flow, so a header is not needed.

**Prevention.**
- Add a security test per API that sends forged identity headers.
- Review all Header Injection policies for headers that a caller can send.
- If the same protection is wanted everywhere, consider an automated policy. Remember that automated policies run before API-level policies, so JWT claims would not be available to them unless JWT Validation also runs first.
`,
  followUps: [
    {
      q: 'Which value would a Mule flow read from a repeated header?',
      a: 'attributes.headers is a multi-value map, so a single-value read returns just one of the values. Do not depend on which one it is. Remove the duplicate at the gateway or read all values and reject.',
    },
    {
      q: 'Could Header Removal be used on Authorization or Host?',
      a: 'Host cannot be removed: the page lists user-agent, accept, host, content-type, content-length, date, transfer-encoding and connection as headers that may not be removed. Authorization is not in that list, and removing it inbound before the policies that need it would break them, so think about order.',
    },
    {
      q: 'Does the header need to be in the policy in lower case?',
      a: 'HTTP header names are not case-sensitive, and Header Removal accepts names or regular expressions. Regular expressions need care, because everything that matches is removed.',
    },
  ],
}
