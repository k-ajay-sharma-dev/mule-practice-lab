// The policies the Platform Lab can apply. Behaviour follows the Mule Gateway policy pages for HTTP APIs;
// anything those pages do not state is marked `basis: 'assumed'` where the engine reports it.
const DOCS = 'https://docs.mulesoft.com/mule-gateway/'

export const IP_EXPRESSIONS = ['#[attributes.remoteAddress]', "#[attributes.headers['x-forwarded-for']]"]
export const CLIENT_ID_EXPRESSIONS = ["#[attributes.headers['client_id']]", '#[authentication.principal]']
export const LOG_MESSAGES = ['#[attributes.method]', '#[attributes.requestPath]', '#[attributes.remoteAddress]', '#[attributes.headers]']
export const LOG_CONDITIONS = ['(not configured)', "#[attributes.method == 'POST']", "#[attributes.method != 'GET']"]
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

export const LEVEL_DOCS = {
  automated: `${DOCS}policies-automated-overview`,
  reorder: `${DOCS}policies-reorder`,
  conditions: `${DOCS}policies-resource-level-overview`,
}

// A sample directory in the OpenLDAP layout. The users are lab data, so the policy has something to search.
export const LDAP_BASE = 'ou=people,dc=lab,dc=example'
export const LDAP_DIRECTORY = [
  { dn: `uid=jane,${LDAP_BASE}`, uid: 'jane', password: 'jane-password' },
  { dn: `uid=paul,${LDAP_BASE}`, uid: 'paul', password: 'paul-password' },
  { dn: `uid=omar,ou=partners,${LDAP_BASE}`, uid: 'omar', password: 'omar-password' },
]

const number = (key, label, value, hint) => ({ key, label, type: 'number', value, hint })
const text = (key, label, value, hint) => ({ key, label, type: 'text', value, hint })
const select = (key, label, options, value) => ({ key, label, type: 'select', options, value: value ?? options[0] })
const onlyGroups = (field) => ({ ...field, when: ['publicResource', 'No'] })
const YES_NO = ['Yes', 'No']
const NO_YES = ['No', 'Yes']

export const POLICIES = [
  {
    type: 'cors',
    name: 'Cross-Origin Resource Sharing (CORS)',
    category: 'Compliance',
    summary: 'Always runs first and cannot be reordered. It answers every OPTIONS request itself. It never rejects: an origin it does not accept gets no CORS headers, and the browser blocks the response.',
    docs: 'policies-included-cors',
    pinned: true,
    resourceLevel: false,
    fields: [
      select('publicResource', 'Public resource', YES_NO),
      onlyGroups(text('origins', 'Origins', 'https://portal.example.com', 'Comma separated. Scheme, host and port must all match. * means any origin')),
      onlyGroups(text('methods', 'Allowed methods', 'GET, POST', 'Comma separated')),
      onlyGroups(text('headers', 'Allowed headers', 'client_id, client_secret', 'Comma separated. * means any header')),
      onlyGroups(text('expose', 'Expose headers', '', 'Comma separated')),
      onlyGroups(number('maxAge', 'Access-Control-Max-Age (seconds)', 30)),
      select('credentials', 'Support credentials', NO_YES),
    ],
  },
  {
    type: 'client-id',
    name: 'Client ID Enforcement',
    category: 'Compliance',
    summary: 'Allows access only to client applications with valid credentials and a contract.',
    docs: 'policies-included-client-id-enforcement',
    fields: [
      select('origin', 'Credentials origin', ['Custom Expression', 'HTTP Basic Authentication Header']),
      select('secret', 'Client secret', ['Required', 'Not checked']),
    ],
  },
  {
    type: 'rate-limit',
    name: 'Rate Limiting',
    category: 'Quality of Service',
    summary: 'Counts requests in a fixed window, per identifier. Over quota returns 429 until the window finishes. With several limits, every limit must have quota left.',
    docs: 'policies-included-rate-limiting',
    fields: [
      number('requests', 'Number of Reqs', 3),
      number('periodMs', 'Time Period (ms)', 10000),
      { key: 'extraLimits', label: 'Further limits', type: 'limits', value: [] },
      select('identifier', 'Identifier', ['(not configured)', '#[attributes.method]', "#[attributes.headers['client_id']]"]),
      select('distributed', 'Distributed', YES_NO), // the Mule 4 overview names sharing as the default for this policy
      select('expose', 'Expose Headers', NO_YES),
    ],
  },
  {
    type: 'rate-limit-sla',
    name: 'Rate Limiting: SLA-Based',
    category: 'Quality of Service',
    summary: 'Limits each client application by the SLA tier on its contract. It also checks the client credentials.',
    docs: 'policies-included-rate-limiting-sla',
    fields: [
      select('clientIdExpression', 'Client ID Expression', CLIENT_ID_EXPRESSIONS),
      select('secret', 'Client secret', ['Required', 'Not checked']),
      select('distributed', 'Distributed', NO_YES),
      select('expose', 'Expose Headers', NO_YES),
    ],
  },
  {
    type: 'spike',
    name: 'Spike Control',
    category: 'Quality of Service',
    summary: 'Sliding window that queues a request and retries it before rejecting with 429.',
    docs: 'policies-included-spike-control',
    fields: [
      number('requests', 'Number of Reqs', 2),
      number('periodMs', 'Time Period (ms)', 1000),
      number('delayMs', 'Delay Time in Milliseconds', 499),
      number('attempts', 'Delay Attempts', 1),
      number('queueLimit', 'Queuing Limit', 5),
    ],
  },
  {
    type: 'ip-allow',
    name: 'IP Allowlist',
    category: 'Security',
    summary: 'Only listed addresses or ranges get through. Anything else returns 403.',
    docs: 'policies-included-ip-allowlist',
    fields: [
      select('expression', 'IP expression', IP_EXPRESSIONS),
      text('list', 'Allowlist', '10.0.0.0/8', 'Comma separated addresses, CIDR ranges, or leading octets such as 192.168'),
    ],
  },
  {
    type: 'ip-block',
    name: 'IP Blocklist',
    category: 'Security',
    summary: 'Listed addresses or ranges return 403. Anything else gets through.',
    docs: 'policies-included-ip-blocklist',
    fields: [
      select('expression', 'IP expression', IP_EXPRESSIONS),
      text('list', 'Blocklist', '203.0.113.0/24', 'Comma separated addresses, CIDR ranges, or leading octets such as 192.168'),
    ],
  },
  {
    type: 'basic-auth',
    name: 'Basic Authentication: Simple',
    category: 'Security',
    summary: 'One username and password, checked against the Authorization header.',
    docs: 'policies-included-basic-auth-simple',
    fields: [text('username', 'User Name', 'lab-user'), text('password', 'User Password', 'lab-password')],
  },
  {
    type: 'basic-ldap',
    name: 'Basic Authentication: LDAP',
    category: 'Security',
    summary: 'Checks the Authorization header against a directory. The lab directory holds jane and paul directly under the search base and omar one level below it, each with the password <name>-password. An error returns 401 with WWW-Authenticate.',
    docs: 'policies-included-basic-auth-ldap',
    fields: [
      text('searchBase', 'LDAP Search Base', LDAP_BASE),
      select('filter', 'LDAP Search Filter', ['(uid={0})', '(sAMAccountName={0})']),
      select('subtree', 'LDAP Search in subtree', NO_YES),
    ],
  },
  {
    type: 'oidc',
    name: 'OpenID Connect OAuth 2.0 Token Enforcement',
    category: 'Security',
    summary: 'Validates the token at the validation endpoint, then checks that its client application has a contract. An invalid token returns 400, an application without access returns 403. It does not generate tokens.',
    docs: 'policies-included-openid-token-enforcement',
    fields: [
      text('scopes', 'Scopes', '', 'Space separated. Empty means scopes are not validated'),
      select('criteria', 'Scope Validation Criteria', ['Contains all scopes', 'Contains any scope']),
      select('expose', 'Expose Headers', NO_YES),
      select('skipClient', 'Skip Client Id Validation', NO_YES),
    ],
  },
  {
    type: 'jwt',
    name: 'JWT Validation',
    category: 'Security',
    summary: 'No token returns 400. A bad signature, a failed claim or an unreadable token returns 401. The lab does not model the settings of this policy or its client ID validation.',
    docs: 'policies-included-jwt-validation',
    fields: [],
  },
  {
    type: 'json-threat',
    name: 'JSON Threat Protection',
    category: 'Security',
    summary: 'Rejects JSON bodies over the configured limits with 400. A limit of -1 means no check.',
    docs: 'policies-included-json-threat-protection',
    fields: [
      number('depth', 'Maximum Container Depth', -1),
      number('stringLength', 'Maximum String Value Length', -1),
      number('nameLength', 'Maximum Object Entry Name Length', -1),
      number('entries', 'Maximum Object Entry Count', -1),
      number('elements', 'Maximum Array Element Count', -1),
    ],
  },
  {
    type: 'xml-threat',
    name: 'XML Threat Protection',
    category: 'Security',
    summary: 'Rejects XML bodies over the configured limits with 400. A limit of -1 means no limit. The page does not define how nodes and text are counted, so the counting at each limit is the lab reading.',
    docs: 'policies-included-xml-threat-protection',
    fields: [
      number('depth', 'Maximum Node Depth', -1),
      number('attributes', 'Maximum Attribute Count Per Element', -1),
      number('children', 'Maximum Child Count', -1),
      number('textLength', 'Maximum Text Length', -1),
      number('attributeLength', 'Maximum Attribute Length', -1),
      number('commentLength', 'Maximum Comment Length', -1),
    ],
  },
  {
    type: 'header-inject',
    name: 'Header Injection',
    category: 'Transformation',
    summary: 'Adds headers to the request or response. An existing header is kept, not overridden, except access-control-allow-origin, content-type, content-length and transfer-encoding, which are overwritten.',
    docs: 'policies-included-header-injection',
    fields: [
      text('inbound', 'Inbound Header Map', 'x-tenant: internal', 'name: value, comma separated'),
      text('outbound', 'Outbound Header Map', '', 'name: value, comma separated'),
    ],
  },
  {
    type: 'header-remove',
    name: 'Header Removal',
    category: 'Transformation',
    summary: 'Removes request headers at the start of processing and response headers at the end. user-agent, accept, host, content-type, content-length, date, transfer-encoding and connection may not be removed.',
    docs: 'policies-included-header-removal',
    fields: [
      text('inbound', 'Inbound Header Map', 'x-tenant', 'Names or regular expressions, comma separated'),
      text('outbound', 'Outbound Header Map', '', 'Names or regular expressions, comma separated'),
    ],
  },
  {
    type: 'message-log',
    name: 'Message Logging',
    category: 'Troubleshooting',
    summary: 'Writes a message to the application log before or after the API call. It never stops a request, but it only logs when the request reaches it, so its place in the order matters.',
    docs: 'policies-included-message-logging',
    fields: [
      select('message', 'Message', LOG_MESSAGES),
      select('conditional', 'Conditional', LOG_CONDITIONS),
      text('category', 'Category', '', 'Optional prefix'),
      select('level', 'Level', ['INFO', 'WARN', 'ERROR', 'DEBUG']),
      select('before', 'Before Calling API', YES_NO),
      select('after', 'After Calling API', NO_YES),
    ],
  },
]

export const policyByType = new Map(POLICIES.map((p) => [p.type, p]))
export const docsUrl = (policy) => `${DOCS}${policy.docs}`

export function defaultSettings(type) {
  return Object.fromEntries(policyByType.get(type).fields.map((f) => [f.key, structuredClone(f.value)]))
}

export const TOKENS = [
  ['none', 'No token'],
  ['valid', 'Valid token'],
  ['expired', 'Expired token'],
  ['bad-signature', 'Wrong signature'],
  ['missing-claim', 'Required claim missing'],
  ['malformed', 'Unreadable token'],
]

export const AUTH_SERVER_STATES = [
  ['ok', 'Responding'],
  ['down', 'Unreachable'],
  ['bad', 'Bad response'],
]
