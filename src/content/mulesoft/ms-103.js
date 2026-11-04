export default {
  id: 'ms-103',
  category: 'mulesoft',
  title: 'Threat Protection, CORS, Header and Credential Policies: What Each One Really Does',
  level: 'INTERMEDIATE',
  tags: ['security', 'policies', 'api-manager', 'threat-protection', 'cors', 'client-id-enforcement', 'basic-auth'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'JSON Threat Protection is applied with all fields left at their defaults. A request with a JSON document nested 5,000 levels deep arrives. What happens?',
      options: [
        'It passes: the default of each limit is -1, which means no limit',
        'It is rejected with 400 by a built-in depth limit',
        'It is rejected with 413',
        'The policy cannot be applied without values',
      ],
      answer: 0,
      explain: 'All five fields default to -1, and -1 means no limit. The policy only protects you once you set values that fit your real payloads.',
    },
    {
      type: 'match',
      prompt: 'Match each attack to the JSON Threat Protection field that limits it.',
      pairs: [
        ['Objects inside arrays inside objects, thousands deep', 'Maximum Container Depth'],
        ['One array with millions of items', 'Maximum Array Element Count'],
        ['An object with very many keys', 'Maximum Object Entry Count'],
        ['A field value of 200 MB', 'Maximum String Value Length'],
        ['Extremely long key names', 'Maximum Object Entry Name Length'],
      ],
      explain: 'A request over a limit gets `400 Bad Request`. Measure real payloads first, so that limits do not reject legitimate traffic.',
    },
    {
      type: 'single',
      prompt: 'Which request is outside what JSON Threat Protection supports, according to its page?',
      options: [
        'A multipart form request, and SOAP APIs in general',
        'A POST with `application/json`',
        'A PUT to a RAML-based API',
        'A request forwarded through an API proxy',
      ],
      answer: 0,
      explain: 'The page has a note for each: no SOAP APIs and no multipart form requests. For XML use the XML Threat Protection policy.',
    },
    {
      type: 'single',
      prompt: 'In XML Threat Protection, you set Maximum Attribute Count Per Element to 3. An element has three normal attributes and two `xmlns` declarations. Is it within the limit?',
      options: [
        'Yes, because attributes that define namespaces are not counted',
        'No, it has five attributes',
        'Only if the namespaces are declared on the root',
        'The policy ignores attributes',
      ],
      answer: 0,
      explain: 'The field description says this directly. The policy also limits node depth, child count, text length, attribute length and comment length.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about the CORS policy on Mule Gateway are correct?',
      options: [
        'Its execution order cannot be configured: it runs before automated and API-level policies',
        'With the policy applied, an OPTIONS request does not reach the protected resource',
        'Testing with curl and no CORS headers shows no CORS response headers, which looks as if the policy is not applied',
        'Applying the policy stops non-browser clients from calling the API from other domains',
      ],
      answer: [0, 1, 2],
      explain: 'CORS is enforced by browsers. The gateway only answers with headers that tell a browser what is allowed, so it is not an access control against other clients. Keep authentication policies as well.',
    },
    {
      type: 'single',
      prompt: 'Header Injection is configured to add `X-Env: prod` inbound, and the caller already sends `X-Env: test`. What happens?',
      options: [
        'A new header is created and the existing one is not overridden, so both are present',
        'The existing value is replaced by `prod`',
        'The policy leaves the caller\'s value alone and adds nothing',
        'The request fails with 500',
      ],
      answer: 0,
      explain: 'To overwrite, remove the header first with Header Removal. Only `access-control-allow-origin`, `content-type`, `content-length` and `transfer-encoding` are overwritten by the configured value.',
    },
    {
      type: 'multi',
      prompt: 'A team wants the Header Removal policy to strip these headers. Which ones may **not** be removed?',
      options: ['host', 'user-agent', 'content-type', 'x-powered-by', 'x-internal-trace'],
      answer: [0, 1, 2],
      explain: 'The note lists user-agent, accept, host, content-type, content-length, date, transfer-encoding and connection. The fields accept names or regular expressions, so check a pattern such as `Access-Control.*` carefully: everything that matches is removed.',
    },
    {
      type: 'single',
      prompt: 'Where should Client ID Enforcement read the credentials from, according to its page?',
      options: [
        'Headers (the default) or the Basic Authorization header; query parameters are supported but pose possible security risks, and the payload is not recommended',
        'Query parameters, because they are the simplest and safest',
        'The request payload, so they are encrypted by TLS',
        'Only a Base64 cookie',
      ],
      answer: 0,
      explain: 'The recommended method is headers. The payload option is harder to reflect in the API specification. Client Secret Expression is optional, so leaving it blank checks the client ID only.',
    },
    {
      type: 'single',
      prompt: 'The operations API needs basic authentication for 300 staff held in Active Directory. Which policy fits?',
      options: [
        'Basic Authentication: LDAP, with a search filter such as `(sAMAccountName={0})`',
        'Basic Authentication: Simple',
        'IP Allowlist',
        'Client ID Enforcement in Basic Auth mode',
      ],
      answer: 0,
      explain: 'Basic Authentication: Simple has a single username and password. The LDAP version checks each user against the directory. Basic credentials are only Base64-encoded, so these APIs must run over HTTPS.',
    },
  ],
  description: `
A retail bank is reviewing the policies on its **Customer Documents API** (a Mule proxy with Mule Gateway). A security review found gaps, and developers disagree about how several policies behave:

- "We applied JSON Threat Protection, so we are safe from deep JSON."
- "CORS is applied, but it is not working: I tested with curl."
- "The Authorization header policy is first in the list, so I expected it to run before CORS."
- "We add \`X-Channel: portal\` with Header Injection, so the backend can trust it."
- "We send \`client_id\` in the URL because it was the fastest to test."
- "We will use Basic Authentication for the staff API."

**Questions**
1. What do JSON and XML Threat Protection really limit, and what are the defaults?
2. How does the CORS policy behave, and how do you test it?
3. How do Header Injection and Header Removal interact?
4. How should Client ID Enforcement and the basic authentication policies be used?
5. Reply to each developer's statement.
`,
  answerTemplate: `## Threat protection

## CORS

## Header Injection and Removal

## Credentials

## Reply to each statement
`,
  keyPoints: [
    'JSON and XML Threat Protection default every limit to -1, meaning no limit. Set values. A violation returns 400.',
    'JSON Threat Protection does not support SOAP APIs or multipart form requests.',
    'XML Threat Protection does not count namespace attributes in the attribute limit.',
    'The CORS policy always runs first and cannot be ordered. OPTIONS requests do not reach the protected resource.',
    'CORS response headers need CORS request headers, so a plain curl shows nothing. CORS is enforced by browsers and is not access control.',
    'Header Injection does not override an existing header, apart from four named headers. Use Header Removal first.',
    'Header Removal accepts names and regular expressions, and cannot remove user-agent, accept, host, content-type, content-length, date, transfer-encoding or connection.',
    'Client ID Enforcement: default is headers, 401 for bad credentials, and it needs an approved contract. Query parameters pose risks.',
    'Basic Authentication: Simple has one user and password. Basic Authentication: LDAP checks a directory.',
  ],
  solution: `
**1. Threat protection.** These policies guard against unusual inflation of elements and nesting, which attackers use to consume memory. Each limit defaults to \`-1\`, so a policy with default values limits nothing.

- **JSON:** Maximum Container Depth, String Value Length, Object Entry Name Length, Object Entry Count, Array Element Count.
- **XML:** Maximum Node Depth, Attribute Count Per Element, Child Count, Text Length, Attribute Length, Comment Length.

The docs also suggest layers of protection in addition to these policies.

**2. CORS.** The policy always comes first and cannot be reordered. All OPTIONS requests are treated as preflight and do not reach the resource. **Public resource** mirrors the preflight data. If that is too open, define groups per list of origins, each with its own methods, headers, preflight cache time and exposed headers. **Support credentials** covers cookies, authorization headers and TLS client certificates. To test, send an \`Origin\` header and the preflight headers, or use a browser. Without proper CORS request headers, the policy adds no response headers.

**3. Headers.** Injection adds headers at the start (inbound map) or end (outbound map) of processing, and values can be DataWeave expressions. An existing header is not replaced, so both values travel on. To enforce a value, apply **Header Removal** inbound for that name, then **Header Injection**, in that order. Both return 500 if a configured expression cannot be evaluated.

**4. Credentials.**
- **Client ID Enforcement** (category Compliance) allows only client applications with an approved contract. Credentials origin is the HTTP Basic Authentication Header or a Custom Expression. A failure returns 401 with a \`WWW-Authenticate\` header.
- **Basic Authentication: Simple** has a single username and password.
- **Basic Authentication: LDAP** takes the server URL, user DN, password, search base and filter, with search scope \`one level\` or \`subtree\`. Subtree is more comprehensive, but it can be slower.

**5. Replies.**
- Deep JSON: set the limits, as the defaults are unlimited.
- curl: send CORS headers, or test from a browser.
- Order: CORS always runs first, whatever the list shows.
- \`X-Channel\`: a caller can still send its own value, so remove it first. See the incident on tenant headers for what this causes.
- \`client_id\` in the URL: move it to a header.
- Basic authentication: LDAP for many staff, always over HTTPS.
`,
  followUps: [
    {
      q: 'What does applying two IP Allowlist policies do?',
      a: 'Mule Gateway supports duplicate policies with labels, but duplicated IP allowlists only allow IPs that are allowed by both policies. The docs suggest configuring the IPs in one policy instead.',
    },
    {
      q: 'Can a CORS setup be done without API Manager?',
      a: 'Yes. For a Mule runtime without gateway capabilities, the HTTP Listener configuration has a CORS Interceptor, http:cors-interceptor, with the same choice of public resource or a list of origins.',
    },
    {
      q: 'How do you tell the Client ID Enforcement mode from a failed response?',
      a: "The WWW-Authenticate header differs: in custom mode it is Client-ID-Enforcement, and in Basic Auth mode it is Basic realm=\"mule-realm\".",
    },
  ],
}
